/**
 * The editor (docs/INTERFAZ.md §4): the montage of a level (a scene, a
 * sequence, the whole production), with its viewer and its timeline. A block
 * opens the same editor on its montage, with the way back on top.
 */

import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconChevronRight, IconLayersSubtract, IconMovie, IconSettings } from "@tabler/icons-react";
import { childrenOf, codeOf, editDuration, isUnit, timecode, type Edit, type EditFormat, type Id, type ProdNode } from "@sweetflow/domain";
import { Button, cx } from "@sweetflow/ui";
import { Popover } from "../components/Popover";
import type { Snapshot } from "../data/source";
import { useStore } from "../state/store";
import { editAt, editName, useCurrentEdit } from "../editor/model";
import { Viewer } from "../editor/Viewer";
import { Timeline } from "../editor/Timeline";
import { assemble, cutAtPlayhead, deleteSelection, groupSelection, setFormat, stepTime, toggleLink, trimToPlayhead, ungroupSelection, usePrefs, ZOOM_MAX, ZOOM_MIN } from "../editor/actions";
import { clipFps, clipUnder, onClipFrame, onTimelineFrame } from "../editor/frames";
import { stop, useTransport } from "../editor/transport";

export function EditorView() {
  const snap = useStore((s) => s.snap)!;
  const { edit, path } = useCurrentEdit();
  const set = useStore((s) => s.set);
  const [split, setSplit] = useState(readSplit);
  const box = useRef<HTMLDivElement>(null);
  useEditorKeys(edit);
  usePlayback(edit);
  // Leaving the editor stops it.
  useEffect(() => () => stop(), []);
  if (!edit) return null;

  const openBlock = (editId: Id) => set({ editorPath: [...path, { editId }], editSel: [], editTime: 0 });
  const openShot = (nodeId: Id) => {
    stop();
    set({ view: "board" });
    useStore.getState().select(nodeId, "produce");
  };
  const step = (dir: -1 | 1, big: boolean) => stepFrame(snap, edit, dir, big);
  // The divider between the viewer and the timeline.
  const resize = (e: React.PointerEvent) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const k = Math.min(0.75, Math.max(0.2, (ev.clientY - r.top) / r.height));
      setSplit(k);
      saveSplit(k);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    e.preventDefault();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <main className="editor">
      <header className="editor__head">
        <LevelPicker snap={snap} />
        <nav className="editor__crumbs" aria-label="Bloques abiertos">
          {path.map((ref, i) => {
            const e = editAt(snap, ref);
            if (!e) return null;
            const last = i === path.length - 1;
            return (
              <span key={i} className="editor__crumb">
                {i > 0 ? <IconChevronRight size={13} className="sf-faint" /> : null}
                {last ? <span className="editor__now">{editName(snap, e)}</span> : (
                  <button className="editor__back" onClick={() => set({ editorPath: path.slice(0, i + 1), editSel: [], editTime: 0 })}>{editName(snap, e)}</button>
                )}
              </span>
            );
          })}
        </nav>
        <span className="grow" />
        <span className="editor__dur sf-faint" title="Duración del montaje">{timecode(editDuration(edit), edit.format.fps)}</span>
        <FormatButton edit={edit} />
        {!edit.group ? (
          <Button onClick={() => assemble(edit)} title="Pone lo que hay dentro de este nivel, en el orden del tablero, desde donde acaba el montaje">
            <IconLayersSubtract size={15} /> Montar
          </Button>
        ) : null}
      </header>
      <div className="editor__body" ref={box} style={{ gridTemplateRows: `${split * 100}% 6px minmax(0, 1fr)` }}>
        <Viewer edit={edit} onStep={step} />
        <div className="editor__split" role="separator" aria-orientation="horizontal" aria-label="Alto del visor" onPointerDown={resize} />
        <Timeline edit={edit} openBlock={openBlock} openShot={openShot} />
      </div>
    </main>
  );
}

/** One frame (ten with ⇧) of the clip under the playhead (its own video's), or of the timeline. */
function stepFrame(snap: Snapshot, edit: Edit, dir: -1 | 1, big: boolean): void {
  const now = useStore.getState().editTime;
  const c = clipUnder(edit, now + dir * 1e-4);
  const fps = c ? clipFps(snap, edit, c) : edit.format.fps;
  stepTime(edit, dir, big, fps, (x) => {
    const under = clipUnder(edit, x);
    return under ? onClipFrame(snap, edit, under, x) : onTimelineFrame(edit, x);
  });
}

const SPLIT_KEY = "sweetflow:editor-split";
function readSplit(): number {
  try {
    const v = Number(localStorage.getItem(SPLIT_KEY));
    return v >= 0.2 && v <= 0.75 ? v : 0.5;
  } catch {
    return 0.5;
  }
}
function saveSplit(k: number): void {
  try {
    localStorage.setItem(SPLIT_KEY, String(Math.round(k * 1000) / 1000));
  } catch {
    // Only a convenience.
  }
}

/** Which montage to edit: the whole production, a sequence, a scene… */
function LevelPicker({ snap }: { snap: Snapshot }) {
  const set = useStore((s) => s.set);
  const go = (nodeId: Id | null) => set({ editorPath: [{ nodeId }], editSel: [], editTime: 0 });
  const levels = (parentId: Id | null, depth: number): Array<{ n: ProdNode; depth: number }> =>
    childrenOf(snap.nodes, parentId).filter((n) => !isUnit(snap.production, n)).flatMap((n) => [{ n, depth }, ...levels(n.id, depth + 1)]);
  const all = levels(null, 0);
  return (
    <Popover className="editor__levels" button={({ open, toggle }) => (
      <button className={cx("editor__level", open && "is-on")} onClick={toggle} title="Elegir qué montaje editar">
        <IconMovie size={15} stroke={1.6} /> Montaje <IconChevronDown size={13} />
      </button>
    )}>
      <div className="menu__title">Montaje de</div>
      <button className="menu__item" data-close onClick={() => go(null)}><span className="menu__label">Toda la producción</span><Has snap={snap} nodeId={null} /></button>
      {all.map(({ n, depth }) => (
        <button key={n.id} className="menu__item" data-close style={{ paddingLeft: 8 + depth * 14 }} onClick={() => go(n.id)}>
          <b>{codeOf(snap.production, n)}</b> <span className="menu__label">{n.title}</span><Has snap={snap} nodeId={n.id} />
        </button>
      ))}
    </Popover>
  );
}

/** Whether a level has a montage already (and how long). */
function Has({ snap, nodeId }: { snap: Snapshot; nodeId: Id | null }) {
  const e = snap.edits.find((x) => !x.group && x.nodeId === nodeId);
  return e?.clips.length ? <span className="menu__hint">{timecode(editDuration(e), e.format.fps).slice(3)}</span> : null;
}

const SIZES: Array<{ w: number; h: number; name: string }> = [
  { w: 3840, h: 2160, name: "4K UHD" },
  { w: 2560, h: 1440, name: "QHD" },
  { w: 1920, h: 1080, name: "Full HD" },
  { w: 1280, h: 720, name: "HD" },
  { w: 1080, h: 1920, name: "Vertical 9:16" },
  { w: 1080, h: 1350, name: "Retrato 4:5" },
  { w: 1080, h: 1080, name: "Cuadrado 1:1" },
  { w: 2048, h: 858, name: "Panorámico 2.39" },
];
const RATES = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];

/** The montage's resolution and frame rate, and the production's default for new ones. */
function FormatButton({ edit }: { edit: Edit }) {
  const source = useStore((s) => s.source);
  const notify = useStore((s) => s.notify);
  const f = edit.format;
  const [w, setW] = useState(String(f.width));
  const [h, setH] = useState(String(f.height));
  useEffect(() => {
    setW(String(f.width));
    setH(String(f.height));
  }, [f.width, f.height]);
  const apply = (next: EditFormat) => setFormat(edit, next);
  return (
    <Popover align="right" float className="editor__format" button={({ open, toggle }) => (
      <button className={cx("editor__fmt", open && "is-on")} onClick={toggle} title="Resolución y fotogramas por segundo del montaje">
        <IconSettings size={14} stroke={1.6} /> {f.width}×{f.height} · {f.fps} fps
      </button>
    )}>
      <div className="menu__title">Resolución</div>
      <div className="efmt__grid">
        {SIZES.map((s) => (
          <button key={s.name} className={cx("efmt__opt", f.width === s.w && f.height === s.h && "is-on")} onClick={() => apply({ ...f, width: s.w, height: s.h })}>
            <b>{s.w}×{s.h}</b><span className="sf-faint">{s.name}</span>
          </button>
        ))}
      </div>
      <div className="efmt__custom">
        <input className="sf-input" inputMode="numeric" value={w} aria-label="Ancho" onChange={(e) => setW(e.target.value.replace(/\D/g, ""))} />
        <span className="sf-faint">×</span>
        <input className="sf-input" inputMode="numeric" value={h} aria-label="Alto" onChange={(e) => setH(e.target.value.replace(/\D/g, ""))} />
        <Button disabled={!(Number(w) >= 16 && Number(h) >= 16) || (Number(w) === f.width && Number(h) === f.height)} onClick={() => apply({ ...f, width: Number(w), height: Number(h) })}>Usar</Button>
      </div>
      <div className="menu__title">Fotogramas por segundo</div>
      <div className="efmt__rates">
        {RATES.map((r) => (
          <button key={r} className={cx("efmt__rate", f.fps === r && "is-on")} onClick={() => apply({ ...f, fps: r })}>{r}</button>
        ))}
      </div>
      <div className="menu__sep" />
      <button className="menu__item" onClick={() => {
        source.setEditFormat(f);
        notify(`Los montajes nuevos de esta producción empezarán en ${f.width}×${f.height} · ${f.fps} fps.`);
      }}>
        <span className="menu__label">Usar en los montajes nuevos de esta producción</span>
      </button>
    </Popover>
  );
}

/** The transport: the playhead moves while playing (forwards or backwards), stopping at the ends. */
function usePlayback(edit: Edit | null) {
  const rate = useTransport((s) => s.rate);
  const total = edit ? editDuration(edit) : 0;
  useEffect(() => {
    if (!rate) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const t = useStore.getState().editTime + dt * rate;
      if (t >= total || t <= 0) {
        useStore.getState().set({ editTime: Math.max(0, Math.min(total, t)) });
        return stop();
      }
      useStore.getState().set({ editTime: t });
      raf = requestAnimationFrame(tick);
    };
    // At the end, playing starts over from the beginning.
    if (rate > 0 && useStore.getState().editTime >= total - 1e-3) useStore.getState().set({ editTime: 0 });
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rate, total]);
}

/** The editor's keys, as in Premiere (never while typing). */
function useEditorKeys(edit: Edit | null) {
  const ref = useRef(edit);
  ref.current = edit;
  const snap = useStore((s) => s.snap);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ed = ref.current;
      const s = snapRef.current;
      if (!ed || !s || useStore.getState().view !== "editor") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const tr = useTransport.getState();
      const prefs = usePrefs.getState();
      const handled = () => e.preventDefault();
      if (mod && k === "k") return handled(), cutAtPlayhead(ed);
      if (mod && k === "g") return handled(), e.shiftKey ? ungroupSelection(ed) : groupSelection(ed);
      if (mod && k === "l") return handled(), toggleLink(ed);
      if (mod) return;
      switch (e.key) {
        case " ":
          handled();
          return tr.set(tr.rate ? 0 : 1);
        case "Delete":
        case "Backspace":
          handled();
          return deleteSelection(ed);
        case "Home":
          handled();
          return useStore.getState().set({ editTime: 0 });
        case "End":
          handled();
          return useStore.getState().set({ editTime: editDuration(ed) });
        case "ArrowLeft":
        case "ArrowRight": {
          handled();
          stop();
          return stepFrame(s, ed, e.key === "ArrowLeft" ? -1 : 1, e.shiftKey);
        }
        case "Escape":
          return useStore.getState().set({ editSel: [] });
        case "+":
        case "=":
          return prefs.set({ zoom: Math.min(ZOOM_MAX, prefs.zoom * 1.5) });
        case "-":
          return prefs.set({ zoom: Math.max(ZOOM_MIN, prefs.zoom / 1.5) });
      }
      switch (k) {
        case "k":
          return tr.set(0);
        case "l":
          return tr.set(tr.rate > 0 ? Math.min(4, tr.rate * 2) : 1);
        case "j":
          return tr.set(tr.rate < 0 ? Math.max(-4, tr.rate * 2) : -1);
        case "v":
          return prefs.set({ tool: "select" });
        case "c":
          return cutAtPlayhead(ed);
        case "s":
          return prefs.set({ snap: !prefs.snap });
        case "i":
          return trimToPlayhead(ed, "left");
        case "o":
          return trimToPlayhead(ed, "right");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
