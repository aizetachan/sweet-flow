/**
 * The timeline (docs/INTERFAZ.md §4): video tracks on top (V2 over V1),
 * sound below, as in Premiere. Clips move freely and stick to edges and to
 * the playhead when the magnet is on; they overwrite what they land on.
 * Trims and cuts land on the frames of the clip's own video (any frame of the
 * file can be reached); a line follows the pointer with the exact time and
 * the clip's frame under it.
 */

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  IconBrandAdobePremiere,
  IconCut,
  IconEye,
  IconLink,
  IconLinkOff,
  IconMagnet,
  IconPlus,
  IconPointer,
  IconStack2,
  IconTrash,
  IconVolume,
  IconVolumeOff,
  IconX,
  IconZoomIn,
  IconZoomOut,
  IconFolderOpen,
  IconStackPop,
} from "@tabler/icons-react";
import {
  clipEnd,
  clipLength,
  editDuration,
  flattenEdit,
  moveClips,
  nearest,
  placeSources,
  setTrackMuted,
  slipClip,
  snapPoints,
  t6,
  timecode,
  trackName,
  tracksOf,
  trimClip,
  withLinked,
  type Edit,
  type EditClip,
  type EditTrack,
  type Id,
} from "@sweetflow/domain";
import { cx, IconButton } from "@sweetflow/ui";
import { ContextMenu, type MenuAt } from "../components/ContextMenu";
import type { Snapshot } from "../data/source";
import { useStore } from "../state/store";
import { clipLabel, editLookup, newId, saveEdits, shotPlay, sourceLength, sourcesFor } from "./model";
import { clipFrameAt, edgeOnFrames, onClipFrame, onTimelineFrame } from "./frames";
import { cutAtPlayhead, deleteSelection, dropTrack, groupSelection, newTrack, toggleLink, ungroupSelection, usePrefs, ZOOM_MAX, ZOOM_MIN } from "./actions";
import { dragged, EDIT_DRAG } from "./dnd";
import { stop, useTransport } from "./transport";
import { PEAKS_PER_SEC, usePeaks } from "./waveform";
import { useFramePoster } from "./posters";

const HEAD_W = 92;
const PAD = 12;
const ROW_H = { video: 58, audio: 52 } as const;

type Row = { track: EditTrack; name: string };

/** Video tracks top-down (the highest first), then sound. */
function rowsOf(e: Edit): Row[] {
  const video = tracksOf(e, "video");
  const audio = tracksOf(e, "audio");
  return [...[...video].reverse(), ...audio].map((track) => ({ track, name: trackName(e, track.id) }));
}

/** Ruler steps: frames when close, then seconds and minutes. */
function rulerStep(pps: number, fps: number): { major: number; minor: number } {
  const steps = [1 / fps, 2 / fps, 5 / fps, 10 / fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const major = steps.find((s) => s * pps >= 80) ?? 600;
  const minor = major <= 1 / fps + 1e-9 ? major : major / (major >= 1 ? 5 : 2);
  return { major, minor: Math.max(minor, 1 / fps) };
}

type Drag =
  | { kind: "move"; base: Edit; ids: Set<Id>; grabbed: EditClip; x0: number; y0: number; moved: boolean }
  | { kind: "trim"; base: Edit; clip: EditClip; side: "left" | "right"; x0: number }
  | { kind: "slip"; base: Edit; clip: EditClip; x0: number }
  | { kind: "scrub" };

export function Timeline({ edit, openBlock, openShot }: { edit: Edit; openBlock: (editId: Id) => void; openShot: (nodeId: Id) => void }) {
  const snap = useStore((s) => s.snap)!;
  const sel = useStore((s) => s.editSel);
  const set = useStore((s) => s.set);
  const { tool, snap: magnet, linked, preview: live, zoom: pps } = usePrefs();
  const setPrefs = usePrefs((s) => s.set);
  const [preview, setPreview] = useState<Edit | null>(null);
  const [hover, setHover] = useState<{ t: number; clip?: EditClip; frame?: number } | null>(null);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ trackId: Id; audioId: Id | null; start: number; length: number } | null>(null);
  const [menu, setMenu] = useState<{ at: MenuAt; clip: EditClip } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<Id, HTMLDivElement>());
  const drag = useRef<Drag | null>(null);
  const shown = preview ?? edit;
  const rows = rowsOf(shown);
  const total = editDuration(shown);
  const width = PAD * 2 + Math.max(total + 20, 60) * pps;
  const length = useMemo(() => (src: Parameters<typeof sourceLength>[1]) => sourceLength(snap, src), [snap]);
  const selSet = useMemo(() => new Set(sel), [sel]);
  const shownSel = useMemo(() => (linked ? withLinked(shown, sel) : selSet), [shown, sel, selSet, linked]);

  /** Time under the pointer. */
  const timeAt = (clientX: number) => {
    const r = ruler.current!.getBoundingClientRect();
    return Math.max(0, (clientX - r.left - PAD) / pps);
  };
  const rowAt = (clientY: number): Row | null => {
    for (const row of rows) {
      const r = rowRefs.current.get(row.track.id)?.getBoundingClientRect();
      if (r && clientY >= r.top && clientY < r.bottom) return row;
    }
    return null;
  };
  const clipAt = (clientX: number, clientY: number): EditClip | undefined => {
    const row = rowAt(clientY);
    if (!row) return undefined;
    const t = timeAt(clientX);
    return shown.clips.find((c) => c.trackId === row.track.id && t >= c.start && t < clipEnd(c));
  };
  const within = 8 / pps;

  // ⌘ + wheel (or a pinch) zooms around the pointer; the rest scrolls.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = ruler.current!.getBoundingClientRect();
      const t = (e.clientX - r.left - PAD) / pps;
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pps * Math.exp(-e.deltaY * 0.01)));
      setPrefs({ zoom: next });
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, PAD + t * next - (e.clientX - el.getBoundingClientRect().left - HEAD_W));
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pps, setPrefs]);

  const fit = () => {
    const el = scroller.current;
    if (!el) return;
    setPrefs({ zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (el.clientWidth - HEAD_W - PAD * 3) / Math.max(total, 1))) });
    el.scrollLeft = 0;
  };

  // ---------- pointer ----------

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".etl__head")) return;
    const onRuler = !!target.closest(".etl__ruler");
    const onPlayhead = !!target.closest(".etl__playgrip");
    const clip = onRuler || onPlayhead ? undefined : clipAt(e.clientX, e.clientY);
    if (onPlayhead) {
      // Grabbing the playhead: it follows the pointer, and the selection stays.
      stop();
      drag.current = { kind: "scrub" };
      document.documentElement.classList.add("etl-grabbing");
    } else if (!clip) {
      // Empty space or the ruler: the playhead goes there (and follows while dragging).
      if (!onRuler && !e.shiftKey && !e.metaKey) set({ editSel: [] });
      stop();
      drag.current = { kind: "scrub" };
      set({ editTime: e.altKey ? t6(timeAt(e.clientX)) : onTimelineFrame(edit, timeAt(e.clientX)) });
    } else {
      const el = target.closest<HTMLElement>("[data-clip]");
      const r = el?.getBoundingClientRect();
      const edge = r && r.width > 14 ? (e.clientX - r.left < 7 ? "left" : r.right - e.clientX < 7 ? "right" : null) : null;
      // Selecting: ⇧ / ⌘ add or take out; a clip already selected keeps the selection to move it.
      const add = e.shiftKey || e.metaKey || e.ctrlKey;
      let next = sel;
      if (add) next = sel.includes(clip.id) ? sel.filter((x) => x !== clip.id) : [...sel, clip.id];
      else if (!sel.includes(clip.id)) next = [clip.id];
      set({ editSel: next, editTab: "clip" });
      if (edge) drag.current = { kind: "trim", base: edit, clip, side: edge, x0: e.clientX };
      else if (e.altKey) drag.current = { kind: "slip", base: edit, clip, x0: e.clientX };
      else drag.current = { kind: "move", base: edit, ids: linked ? withLinked(edit, next) : new Set(next), grabbed: clip, x0: e.clientX, y0: e.clientY, moved: false };
    }
    const move = (ev: PointerEvent) => onDragMove(ev);
    const up = () => {
      document.documentElement.classList.remove("etl-grabbing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onDragEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onDragMove = (ev: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "scrub") return set({ editTime: ev.altKey ? t6(timeAt(ev.clientX)) : onTimelineFrame(edit, timeAt(ev.clientX)) });
    const dx = (ev.clientX - d.x0) / pps;
    const now = useStore.getState().editTime;
    if (d.kind === "move") {
      if (!d.moved && Math.abs(ev.clientX - d.x0) < 3 && Math.abs(ev.clientY - d.y0) < 3) return;
      d.moved = true;
      const moving = d.base.clips.filter((c) => d.ids.has(c.id));
      const from = Math.min(...moving.map((c) => c.start));
      const to = Math.max(...moving.map(clipEnd));
      let dt = dx;
      let line: number | null = null;
      if (magnet) {
        const pts = snapPoints(d.base, d.ids, [now]);
        const a = nearest(pts, from + dx, within), b = nearest(pts, to + dx, within);
        const pick = a !== null && (b === null || Math.abs(a - from - dx) <= Math.abs(b - to - dx)) ? { p: a, edge: from } : b !== null ? { p: b, edge: to } : null;
        if (pick) {
          dt = pick.p - pick.edge;
          line = pick.p;
        }
      }
      if (line === null) dt = onTimelineFrame(d.base, from + dx) - from;
      setSnapLine(line);
      // Up or down, within the grabbed clip's kind.
      const kind = d.base.tracks.find((t) => t.id === d.grabbed.trackId)?.kind ?? "video";
      const list = tracksOf(d.base, kind);
      const startIdx = list.findIndex((t) => t.id === d.grabbed.trackId);
      const row = rowAt(ev.clientY);
      const overIdx = row && row.track.kind === kind ? list.findIndex((t) => t.id === row.track.id) : startIdx;
      const delta = overIdx - startIdx;
      setPreview(moveClips(d.base, d.ids, dt, kind === "video" ? { video: delta, audio: 0 } : { video: 0, audio: delta }, newId));
    } else if (d.kind === "trim") {
      const edgePos = d.side === "left" ? d.clip.start : clipEnd(d.clip);
      let delta = edgeOnFrames(snap, d.base, d.clip, dx, d.side);
      let line: number | null = null;
      if (magnet) {
        const p = nearest(snapPoints(d.base, withLinked(d.base, [d.clip.id]), [now]), edgePos + dx, within);
        if (p !== null) {
          delta = p - edgePos;
          line = p;
        }
      }
      setSnapLine(line);
      setPreview(trimClip(d.base, d.clip.id, d.side, delta, length, linked));
    } else if (d.kind === "slip") {
      setPreview(slipClip(d.base, d.clip.id, edgeOnFrames(snap, d.base, d.clip, -dx, "left"), length, linked));
    }
  };

  const onDragEnd = () => {
    const d = drag.current;
    drag.current = null;
    setSnapLine(null);
    setPreview((p) => {
      if (p && d && d.kind !== "scrub" && (d.kind !== "move" || d.moved)) saveEdits([p]);
      return null;
    });
  };

  const setPeek = useTransport((s) => s.setPeek);
  const onHover = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.kind === "move") return setHover(null);
    const t = timeAt(e.clientX);
    const clip = (e.target as HTMLElement).closest(".etl__head, .etl__rulerrow, .etl__playgrip") ? undefined : clipAt(e.clientX, e.clientY);
    if (!clip) {
      // Off the clips the viewer goes back to the playhead's frame.
      setPeek(null);
      return setHover({ t: e.altKey ? t6(t) : onTimelineFrame(edit, t) });
    }
    const at = onClipFrame(snap, edit, clip, t);
    setHover({ t: at, clip, frame: clipFrameAt(snap, edit, clip, at) });
    // With «Visualización real» on, the viewer shows the frame under the pointer.
    setPeek(live ? at : null);
  };
  // Off (or leaving the editor): the viewer follows the playhead again.
  useEffect(() => {
    if (!live) setPeek(null);
    return () => setPeek(null);
  }, [live, setPeek]);

  // ---------- dropping from the panel ----------

  const ghostFor = (e: ReactDragEvent) => {
    const ids = dragged();
    const row = rowAt(e.clientY);
    if (!ids || !row) return null;
    const length = ids.reduce((acc, id) => acc + guessLength(snap, id), 0);
    let start = onTimelineFrame(edit, timeAt(e.clientX));
    if (magnet) start = nearest(snapPoints(edit, new Set(), [useStore.getState().editTime]), start, within) ?? start;
    const audio = tracksOf(edit, "audio");
    const video = tracksOf(edit, "video");
    const audioId = row.track.kind === "video" ? (audio[Math.min(video.findIndex((t) => t.id === row.track.id), audio.length - 1)]?.id ?? null) : null;
    return { trackId: row.track.id, audioId, start, length };
  };

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(EDIT_DRAG)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setGhost(ghostFor(e));
  };

  const onDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(EDIT_DRAG)) return;
    e.preventDefault();
    const g = ghostFor(e);
    setGhost(null);
    const ids = JSON.parse(e.dataTransfer.getData(EDIT_DRAG) || "[]") as Id[];
    if (!g || !ids.length) return;
    dropInto(snap, edit, ids, { trackId: g.trackId, start: g.start }, g.audioId);
  };

  // ---------- drawing ----------

  const { major, minor } = rulerStep(pps, edit.format.fps);
  const [view, setView] = useState({ left: 0, width: 1200 });
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const upd = () => setView({ left: el.scrollLeft, width: el.clientWidth });
    upd();
    el.addEventListener("scroll", upd);
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", upd);
      ro.disconnect();
    };
  }, []);
  const t0 = Math.max(0, (view.left - HEAD_W - PAD) / pps);
  const t1 = (view.left + view.width) / pps;
  const ticks: Array<{ t: number; major: boolean }> = [];
  for (let k = Math.floor(t0 / minor); k * minor <= t1 + minor; k++) {
    const t = k * minor;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    ticks.push({ t, major: isMajor });
    if (ticks.length > 2000) break;
  }

  return (
    <div className="etl">
      <div className="etl__bar">
        <IconButton label="Selección (V)" on={tool === "select"} onClick={() => setPrefs({ tool: "select" })}><IconPointer size={16} stroke={1.6} /></IconButton>
        <IconButton label="Cortar en el cabezal (C o ⌘K): los clips seleccionados, o todos los que pasan por él" onClick={() => cutAtPlayhead(edit)}><IconCut size={16} stroke={1.6} /></IconButton>
        <span className="etl__sep" />
        <IconButton label={magnet ? "Imán activado (S): los bordes se pegan a los cortes y al cabezal" : "Imán desactivado (S): movimiento libre"} on={magnet} onClick={() => setPrefs({ snap: !magnet })}><IconMagnet size={16} stroke={1.6} /></IconButton>
        <IconButton label={linked ? "Selección enlazada: vídeo y sonido juntos" : "Selección enlazada desactivada: vídeo y sonido por separado"} on={linked} onClick={() => setPrefs({ linked: !linked })}>{linked ? <IconLink size={16} stroke={1.6} /> : <IconLinkOff size={16} stroke={1.6} />}</IconButton>
        <span className="etl__sep" />
        <IconButton label="Agrupar (⌘G)" disabled={!sel.length} onClick={() => groupSelection(edit)}><IconStack2 size={16} stroke={1.6} /></IconButton>
        <IconButton label={live ? "Visualización real activada: el visor muestra lo que hay bajo el ratón al pasar por los clips" : "Visualización real: ver en el visor lo que hay bajo el ratón al pasar por los clips, sin cortar"}
          on={live} onClick={() => setPrefs({ preview: !live })}><IconEye size={16} stroke={1.6} /></IconButton>
        <IconButton label="Eliminar (Supr)" disabled={!sel.length} onClick={() => deleteSelection(edit)}><IconTrash size={16} stroke={1.6} /></IconButton>
        <span className="grow" />
        <button className="etl__add" onClick={() => newTrack(edit, "video")} title="Añadir una pista de vídeo"><IconPlus size={13} /> Vídeo</button>
        <button className="etl__add" onClick={() => newTrack(edit, "audio")} title="Añadir una pista de audio"><IconPlus size={13} /> Audio</button>
        <span className="etl__sep" />
        {/* Placeholder: it will send the whole timeline to Premiere (docs/INTERFAZ.md §4.5). */}
        <IconButton label="Exportar a Premiere (próximamente)" className="etl__export" onClick={() => undefined}><IconBrandAdobePremiere size={17} stroke={1.6} /></IconButton>
        <span className="etl__sep" />
        <IconButton label="Alejar (−)" onClick={() => setPrefs({ zoom: Math.max(ZOOM_MIN, pps / 1.5) })}><IconZoomOut size={16} stroke={1.6} /></IconButton>
        <input className="etl__zoom" type="range" min={0} max={1000} aria-label="Zoom"
          value={Math.round((Math.log(pps / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN)) * 1000)}
          onChange={(e) => setPrefs({ zoom: ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, Number(e.target.value) / 1000) })} />
        <IconButton label="Acercar (+)" onClick={() => setPrefs({ zoom: Math.min(ZOOM_MAX, pps * 1.5) })}><IconZoomIn size={16} stroke={1.6} /></IconButton>
        <button className="etl__add" onClick={fit} title="Ver todo el montaje (\\)">Ajustar</button>
      </div>

      <div className="etl__scroll" ref={scroller}>
        <div className="etl__inner" style={{ width: HEAD_W + width } as CSSProperties}
          onPointerDown={onPointerDown} onPointerMove={onHover} onPointerLeave={() => {
            setHover(null);
            setPeek(null);
          }}
          onDragOver={onDragOver} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setGhost(null)} onDrop={onDrop}>
          <div className="etl__rulerrow">
            <div className="etl__corner" />
            <div className="etl__ruler" ref={ruler} style={{ width }}>
              {ticks.map((k) => (
                <span key={k.t} className={cx("etl__tick", k.major && "etl__tick--major")} style={{ left: PAD + k.t * pps }}>
                  {k.major ? <span className="etl__label">{tickLabel(k.t, major, edit.format.fps)}</span> : null}
                </span>
              ))}
            </div>
          </div>
          {rows.map((row, i) => (
            <Fragment key={row.track.id}>
              {i > 0 && row.track.kind === "audio" && rows[i - 1]!.track.kind === "video" ? <div className="etl__divider" /> : null}
              <div className={cx("etl__row", `etl__row--${row.track.kind}`)} style={{ height: ROW_H[row.track.kind] }} ref={(el) => (el ? rowRefs.current.set(row.track.id, el) : rowRefs.current.delete(row.track.id))}>
                <div className="etl__head">
                  <span>{row.name}</span>
                  <span className="grow" />
                  {tracksOf(shown, row.track.kind).length > 1 ? (
                    <button className="etl__drop" title={`Quitar la pista ${row.name} (con lo que tenga)`} onClick={() => dropTrack(edit, row.track.id)}><IconX size={12} /></button>
                  ) : null}
                  {row.track.kind === "audio" ? (
                    <button className={cx("etl__mute", row.track.muted && "is-on")} aria-pressed={!!row.track.muted}
                      title={row.track.muted ? `${row.name} silenciada: clic para oírla` : `Silenciar ${row.name}`}
                      onClick={() => saveEdits([setTrackMuted(edit, row.track.id, !row.track.muted)])}>
                      {row.track.muted ? <IconVolumeOff size={15} stroke={1.7} /> : <IconVolume size={15} stroke={1.7} />}
                    </button>
                  ) : null}
                </div>
                <div className={cx("etl__lane", row.track.muted && "etl__lane--muted")} style={{ width }}>
                  {shown.clips.filter((c) => c.trackId === row.track.id).map((c) => (
                    <Clip key={c.id} snap={snap} edit={shown} clip={c} kind={row.track.kind} pps={pps} on={shownSel.has(c.id)}
                      visible={[view.left - HEAD_W - 200, view.left + view.width - HEAD_W + 200]}
                      onDouble={() => (c.source.kind === "edit" ? openBlock(c.source.editId) : openShot(c.source.nodeId))}
                      onMenu={(at) => {
                        if (!sel.includes(c.id)) set({ editSel: [c.id] });
                        setMenu({ at, clip: c });
                      }} />
                  ))}
                  {ghost && (ghost.trackId === row.track.id || ghost.audioId === row.track.id) ? (
                    <span className="etl__ghost" style={{ left: PAD + ghost.start * pps, width: Math.max(4, ghost.length * pps) }} />
                  ) : null}
                </div>
              </div>
            </Fragment>
          ))}
          <Playhead pps={pps} scroller={scroller} />
          {hover && !drag.current ? (
            <div className={cx("etl__hover", live && hover.clip && "etl__hover--live")} style={{ left: HEAD_W + PAD + hover.t * pps }}>
              <span className="etl__hovertag">
                {timecode(hover.t, edit.format.fps)}
                {hover.clip && hover.frame !== undefined ? <span className="sf-faint"> · fot. {hover.frame}</span> : null}
              </span>
            </div>
          ) : null}
          {snapLine !== null ? <div className="etl__snap" style={{ left: HEAD_W + PAD + snapLine * pps }} /> : null}
          {!shown.clips.length ? <div className="etl__empty">Arrastra aquí planos, escenas o secuencias desde el panel, o usa «Montar».</div> : null}
        </div>
      </div>

      {menu ? (
        <ContextMenu at={menu.at} onClose={() => setMenu(null)}>
          <ClipMenu edit={edit} clip={menu.clip} onDone={() => setMenu(null)} openBlock={openBlock} openShot={openShot} />
        </ContextMenu>
      ) : null}
    </div>
  );
}

function tickLabel(t: number, major: number, fps: number): string {
  if (major < 1) {
    const f = Math.round(t * fps);
    const sec = Math.floor(f / Math.round(fps));
    return `${sec}s+${f % Math.round(fps)}f`;
  }
  const m = Math.floor(t / 60), s = Math.round(t - m * 60);
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

/** About how long dragged items would be (the drop works it out exactly). */
function guessLength(s: Snapshot, nodeId: Id): number {
  const play = shotPlay(s, nodeId);
  const n = s.nodes.find((x) => x.id === nodeId);
  if (!n) return 0;
  if (play && play.length > 0 && !s.nodes.some((x) => x.parentId === nodeId)) return play.length;
  const own = s.edits.find((e) => !e.group && e.nodeId === nodeId);
  if (own) return editDuration(own);
  return s.nodes.filter((x) => x.parentId === nodeId).reduce((acc, x) => acc + guessLength(s, x.id), 0);
}

/** Dropped items placed on a montage (and their montages saved when made now). */
export function dropInto(snap: Snapshot, edit: Edit, ids: Id[], at: { trackId: Id; start: number }, audioId: Id | null): void {
  const { notify, set } = useStore.getState();
  const { sources, save, skipped } = sourcesFor(snap, edit, ids);
  if (!sources.length) return notify(skipped ? "Eso no tiene vídeo que montar todavía (o acabaría dentro de sí mismo)." : "Nada que montar.");
  const wasEmpty = !edit.clips.length;
  const { edit: next, placed } = placeSources(edit, sources, at, newId, audioId);
  saveEdits([...save, next]);
  set({ editSel: placed, editTab: "clip" });
  if (skipped) notify(`${skipped === 1 ? "Uno no tenía" : `${skipped} no tenían`} vídeo (o acabarían dentro de sí mismos) y no se han colocado.`);
  // The first clip in: the montage can take its size and rate (as Premiere offers).
  const first = sources[0]!.source;
  const m = wasEmpty && first.kind === "shot" ? shotPlay(snap, first.nodeId)?.media : undefined;
  if (m?.width && m.height) {
    const fps = m.fps ?? edit.format.fps;
    const f = edit.format;
    if (m.width !== f.width || m.height !== f.height || fps !== f.fps) {
      notify(`El clip es ${m.width}×${m.height}${m.fps ? ` · ${m.fps} fps` : ""}; el montaje, ${f.width}×${f.height} · ${f.fps} fps.`, {
        label: "Ajustar el montaje al clip",
        run: () => {
          const cur = useStore.getState().snap?.edits.find((x) => x.id === next.id);
          if (cur) saveEdits([{ ...cur, format: { width: m.width!, height: m.height!, fps } }]);
        },
      });
    }
  }
}

function Clip({ snap, edit, clip, kind, pps, on, visible, onDouble, onMenu }: { snap: Snapshot; edit: Edit; clip: EditClip; kind: "video" | "audio"; pps: number; on: boolean; visible: [number, number]; onDouble: () => void; onMenu: (at: MenuAt) => void }) {
  const label = clipLabel(snap, clip);
  const block = clip.source.kind === "edit";
  const node = clip.source.kind === "shot" ? snap.nodes.find((n) => n.id === (clip.source as { nodeId: Id }).nodeId) : undefined;
  const status = node ? snap.production.statuses.find((s) => s.id === node.statusId) : undefined;
  const still = kind === "video" ? posterOf(snap, clip) : undefined;
  // A real video without a poster: its frame at the clip's start, taken from the file.
  const grabbed = useFramePoster(still?.video ? still.url : undefined, still?.at ?? 0);
  const poster = still?.video ? grabbed ?? undefined : still?.url;
  const w = Math.max(2, clipLength(clip) * pps);
  return (
    <div data-clip={clip.id}
      className={cx("etlc", `etlc--${kind}`, block && "etlc--block", label.missing && "etlc--missing", on && "is-on", clip.linkId && "etlc--linked")}
      style={{ left: PAD + clip.start * pps, width: w, ...(poster ? { backgroundImage: `url("${poster}")` } : {}), ...(status ? { ["--st" as string]: status.color } : {}) } as CSSProperties}
      title={`${label.code} ${label.title}`.trim()}
      onDoubleClick={onDouble}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu({ x: e.clientX, y: e.clientY });
      }}>
      {w > 26 ? (
        <span className="etlc__label">
          {block ? <IconStack2 size={12} /> : null}
          {label.code ? <b>{label.code}</b> : null} {label.title}
        </span>
      ) : null}
      {kind === "audio" ? <Wave snap={snap} edit={edit} clip={clip} pps={pps} visible={visible} /> : null}
    </div>
  );
}

/**
 * A clip's picture on the timeline: its shot's poster, or the first one
 * inside its block; `at`, where in the file (for videos without a poster).
 */
function posterOf(s: Snapshot, c: EditClip, depth = 0): { url: string; at: number; video: boolean } | undefined {
  // The video file itself (no poster of its own): a frame is taken from it.
  const of = (play: ReturnType<typeof shotPlay>, at: number) =>
    play?.poster ? { url: play.poster, at, video: play.poster === play.media?.url && play.media?.kind === "video" && !play.poster.startsWith("data:image") } : undefined;
  if (c.source.kind === "shot") {
    const play = shotPlay(s, c.source.nodeId);
    return of(play, (play?.fileIn ?? 0) + c.inSec);
  }
  const inner = editLookup(s)(c.source.editId);
  if (!inner || depth > 4) return undefined;
  const first = flattenEdit(inner, editLookup(s)).video[0];
  const play = first ? shotPlay(s, first.nodeId) : null;
  return first ? of(play, (play?.fileIn ?? 0) + first.srcIn) : undefined;
}

function ClipMenu({ edit, clip, onDone, openBlock, openShot }: { edit: Edit; clip: EditClip; onDone: () => void; openBlock: (id: Id) => void; openShot: (id: Id) => void }) {
  const snap = useStore((s) => s.snap)!;
  const inner = clip.source.kind === "edit" ? editLookup(snap)(clip.source.editId) : undefined;
  const run = (f: () => void) => () => {
    f();
    onDone();
  };
  return (
    <>
      {clip.source.kind === "edit" ? (
        <button className="menu__item" onClick={run(() => openBlock((clip.source as { editId: Id }).editId))}><IconFolderOpen size={14} /> <span className="menu__label">Abrir el bloque</span></button>
      ) : (
        <button className="menu__item" onClick={run(() => openShot((clip.source as { nodeId: Id }).nodeId))}><IconFolderOpen size={14} /> <span className="menu__label">Abrir el plano en Producción</span></button>
      )}
      <button className="menu__item" onClick={run(() => cutAtPlayhead(edit))}><IconCut size={14} /> <span className="menu__label">Cortar en el cabezal</span><span className="menu__hint">C · ⌘K</span></button>
      <button className="menu__item" onClick={run(() => toggleLink(edit))}>
        {clip.linkId ? <IconLinkOff size={14} /> : <IconLink size={14} />} <span className="menu__label">{clip.linkId ? "Desenlazar vídeo y sonido" : "Enlazar"}</span><span className="menu__hint">⌘L</span>
      </button>
      <button className="menu__item" onClick={run(() => groupSelection(edit))}><IconStack2 size={14} /> <span className="menu__label">Agrupar</span><span className="menu__hint">⌘G</span></button>
      {inner?.group ? (
        <button className="menu__item" onClick={run(() => ungroupSelection(edit))}><IconStackPop size={14} /> <span className="menu__label">Desagrupar</span><span className="menu__hint">⌘⇧G</span></button>
      ) : null}
      <div className="menu__sep" />
      <button className="menu__item menu__item--danger" onClick={run(() => deleteSelection(edit))}><IconTrash size={14} /> <span className="menu__label">Eliminar</span><span className="menu__hint">Supr</span></button>
    </>
  );
}

/** The playhead: follows the time on its own (the rest of the timeline doesn't redraw), and keeps itself in view while playing. */
function Playhead({ pps, scroller }: { pps: number; scroller: React.RefObject<HTMLDivElement | null> }) {
  const time = useStore((s) => s.editTime);
  const rate = useTransport((s) => s.rate);
  const x = HEAD_W + PAD + time * pps;
  useEffect(() => {
    const el = scroller.current;
    if (!el || !rate) return;
    if (x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - HEAD_W - 40;
    else if (x < el.scrollLeft + HEAD_W) el.scrollLeft = Math.max(0, x - el.clientWidth + 80);
  }, [x, rate, scroller]);
  // The line and its knob are the playhead's grip: drag it to move it (and mark where to cut).
  return (
    <div className="etl__playhead" style={{ left: x }}>
      <span className="etl__playgrip" title="Cabezal: arrástralo, o muévelo con las flechas; las tijeras cortan aquí" />
      <span className="etl__playknob" />
    </div>
  );
}

/**
 * The real wave of a clip's sound: the stretch of each file it plays (a
 * block's, from the clips inside it), drawn only where the timeline shows it.
 */
function Wave({ snap, edit, clip, pps, visible }: { snap: Snapshot; edit: Edit; clip: EditClip; pps: number; visible: [number, number] }) {
  const parts = useMemo(() => {
    // The clip alone, from 0: what it plays and where.
    const alone: Edit = { ...edit, clips: [{ ...clip, start: 0 }] };
    return flattenEdit(alone, editLookup(snap)).audio.flatMap((p) => {
      const play = shotPlay(snap, p.nodeId);
      const url = play?.media?.url;
      return url && !url.startsWith("data:image") ? [{ url, fileStart: (play?.fileIn ?? 0) + p.srcIn, offset: p.start, dur: p.end - p.start }] : [];
    });
  }, [snap, edit, clip]);
  if (!parts.length) return <span className="etlc__flat" title="Sin sonido que mostrar" />;
  const clipX = PAD + clip.start * pps;
  return (
    <>
      {parts.map((p, i) => (
        <WavePart key={i} url={p.url} fileStart={p.fileStart} dur={p.dur} pps={pps}
          // Where it is in the clip, and the part of it on screen (lane pixels → clip pixels).
          left={p.offset * pps} from={Math.max(0, visible[0] - clipX - p.offset * pps)} to={Math.min(p.dur * pps, visible[1] - clipX - p.offset * pps)} />
      ))}
    </>
  );
}

function WavePart({ url, fileStart, dur, pps, left, from, to }: { url: string; fileStart: number; dur: number; pps: number; left: number; from: number; to: number }) {
  const peaks = usePeaks(url);
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(0, Math.floor(to - from));
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || !(peaks instanceof Float32Array) || !w) return;
    const dpr = window.devicePixelRatio || 1;
    const h = cv.getBoundingClientRect().height || 14;
    cv.width = Math.ceil(w * dpr);
    cv.height = Math.ceil(h * dpr);
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = getComputedStyle(cv).color;
    const mid = h / 2;
    for (let x = 0; x < w; x++) {
      // The loudest moment under this pixel.
      const t0 = fileStart + (from + x) / pps, t1 = fileStart + (from + x + 1) / pps;
      const b0 = Math.floor(t0 * PEAKS_PER_SEC), b1 = Math.max(b0 + 1, Math.ceil(t1 * PEAKS_PER_SEC));
      let v = 0;
      for (let b = b0; b < b1 && b < peaks.length; b++) if (peaks[b]! > v) v = peaks[b]!;
      // In decibels, from −48 dB to full scale, as editors draw it: quiet passages still show.
      const db = v > 0 ? 1 + (20 * Math.log10(v)) / 48 : 0;
      const bar = Math.max(0.5, Math.max(0, db) * (h - 1) / 2);
      g.fillRect(x, mid - bar, 1, bar * 2);
    }
  }, [peaks, fileStart, pps, from, w]);
  if (peaks === "none") return <span className="etlc__flat" style={{ left, width: dur * pps }} title="Este vídeo no tiene sonido" />;
  return <canvas ref={ref} className="etlc__wave" style={{ left: left + from, width: w }} />;
}
