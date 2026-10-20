import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ImportDialog } from "./components/ImportDialog";
import { InviteDialog } from "./dashboard/Team";
import { DelayedTip } from "./components/DelayedTip";
import { Button, cx, Modal, Spinner } from "@sweetflow/ui";
import { TABS, useStore } from "./state/store";
import { TabBar } from "./shell/TabBar";
import { Dock, Topbar } from "./shell/Shell";
import { Splash } from "./shell/Splash";
import { Dashboard } from "./dashboard/Dashboard";
import { StructureTree } from "./board/StructureTree";
import { Board } from "./board/Board";
import { DockedInspector, FloatingInspectors, WindowInspector } from "./inspector/Inspector";
import { Modals } from "./settings/Modals";
import { LibraryBoard, LibraryTree } from "./library/LibraryBoard";
import { EditorView } from "./views/EditorView";
import { TrashView } from "./views/TrashView";

/** Splash → dashboard → production (docs/INTERFAZ.md). Popped-out windows show one node. */
export function App() {
  const phase = useStore((s) => s.phase);
  const lib = useStore((s) => s.lib);
  const [splash, setSplash] = useState(phase !== "window");

  const screen = phase === "window" ? <PoppedWindow /> : phase === "production" ? <Production /> : <Dashboard />;
  return (
    <>
      {TABS ? (
        // Desktop app: the title bar holds the tabs; the screen goes under it.
        <div className="frame">
          <TabBar />
          <div className="frame__body">{screen}</div>
        </div>
      ) : screen}
      {/* Notices show everywhere: in the dashboard too. */}
      {phase !== "window" ? <Notice /> : null}
      {phase !== "window" ? <InviteDialog /> : null}
      <DelayedTip />
      {splash ? <Splash ready={!!lib} onDone={() => setSplash(false)} /> : null}
    </>
  );
}

function Loading() {
  return <div className="loading"><Spinner /> Abriendo la producción…</div>;
}

function Production() {
  const snap = useStore((s) => s.snap);
  const view = useStore((s) => s.view);
  if (!snap) return <Loading />;
  return (
    <div className="app">
      <div className="app__main">
        {/* Desktop app: the left column reaches the top and the top bar spans only the board's width. */}
        {TABS && (view === "board" || view === "library") ? null : <Topbar />}
        {view === "board" ? (
          // Work panel and structure share the left column; the board gets the rest (docs/INTERFAZ.md §2).
          <Workspace>
            <SidePanel />
            {TABS ? <div className="workcol"><Topbar /><Board /></div> : <Board />}
          </Workspace>
        ) : view === "library" ? (
          // The library has the same layout: the panel generates into the desk or the selected card (§2.8).
          <Workspace>
            <SidePanel />
            {TABS ? <div className="workcol"><Topbar /><LibraryBoard /></div> : <LibraryBoard />}
          </Workspace>
        ) : view === "editor" ? <EditorView /> : <TrashView />}
      </div>
      <Dock />
      <FloatingInspectors />
      <LeaveConfirm />
      <DeleteKey />
      <UndoKeys />
      <Modals />
      <ImportDialog />
    </div>
  );
}

/**
 * How much of the left panel's width is kept (docs/INTERFAZ.md §2): 60–100 %
 * (never under what its tabs need),
 * remembered on this computer. Dragging its right edge sets it; a click on
 * the edge snaps it: from full to the narrowest and back, and in between to
 * whichever end is closer.
 */
const SIDE_KEY = "sweetflow:side-k";
const MIN_K = 0.6;
/** Never narrower than this: the panel's tabs (Producir · Editar · Revisión · Actividad) and its header must fit. */
const MIN_PX = 330;
function readK(): number {
  try {
    const v = Number(localStorage.getItem(SIDE_KEY));
    return v >= MIN_K && v <= 1 ? v : 1;
  } catch {
    return 1;
  }
}
function saveK(k: number): void {
  try {
    localStorage.setItem(SIDE_KEY, String(Math.round(k * 1000) / 1000));
  } catch {
    // Only a convenience.
  }
}

function Workspace({ children }: { children: ReactNode }) {
  const [k, setK] = useState(readK);
  const [dragging, setDragging] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // The narrowest it can go here: 60 %, or what its contents need if that is more.
  const minK = () => {
    const ws = box.current;
    const max = ws ? parseFloat(getComputedStyle(ws).getPropertyValue("--side-max")) || 440 : 440;
    return Math.min(1, Math.max(MIN_K, MIN_PX / max));
  };
  const snapTo = (to: number) => {
    setSnapping(true);
    setK(to);
    saveK(to);
    setTimeout(() => setSnapping(false), 260);
  };
  const resize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const ws = box.current;
    if (!ws) return;
    e.preventDefault();
    const max = parseFloat(getComputedStyle(ws).getPropertyValue("--side-max")) || 440;
    const left = ws.getBoundingClientRect().left;
    const startX = e.clientX;
    const startK = k;
    let moved = false;
    let last = k;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 4) return;
      if (!moved) setDragging(true);
      moved = true;
      last = Math.min(1, Math.max(minK(), (ev.clientX - left) / max));
      setK(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDragging(false);
      if (moved) return saveK(last);
      // A click: full → narrowest, narrowest → full; in between, to the closer end.
      const lo = minK();
      snapTo(startK >= 0.999 ? lo : startK <= lo + 0.001 ? 1 : startK - lo < 1 - startK ? lo : 1);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div ref={box} className={cx("workspace", dragging && "workspace--resizing", snapping && "workspace--snapping")} style={{ "--side-k": k, "--side-min": `${MIN_PX}px` } as CSSProperties}>
      {children}
      <div className={cx("side__resize", dragging && "is-on")} role="separator" aria-orientation="vertical" aria-label="Ancho del panel"
        title="Arrastra para cambiar el ancho del panel · clic: al mínimo o al máximo" onPointerDown={resize} />
    </div>
  );
}

function SidePanel() {
  const sideTab = useStore((s) => s.sideTab);
  const view = useStore((s) => s.view);
  const set = useStore((s) => s.set);
  return (
    <aside className="side">
      <div className="sidetabs" role="tablist">
        <button role="tab" aria-selected={sideTab === "work"} className={cx("sidetabs__tab", sideTab === "work" && "sidetabs__tab--on")} onClick={() => set({ sideTab: "work" })}>
          Producción
        </button>
        <button role="tab" aria-selected={sideTab === "structure"} className={cx("sidetabs__tab", sideTab === "structure" && "sidetabs__tab--on")} onClick={() => set({ sideTab: "structure" })}>
          Explorer
        </button>
      </div>
      {sideTab === "work" ? <DockedInspector /> : view === "library" ? <LibraryTree /> : <StructureTree />}
    </aside>
  );
}

/** Leaving the production closes every floating panel and popped window: ask first. */
/**
 * ⌘Z / Ctrl+Z undoes the last thing done by hand; ⌘⇧Z, Ctrl+Y redo it
 * (docs/INTERFAZ.md §2.9). While typing, the text's own undo works instead.
 */
function UndoKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const redo = (k === "z" && e.shiftKey) || (k === "y" && e.ctrlKey && !e.metaKey);
      if (k !== "z" && !redo) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true]")) return;
      const { source, productionId, notify } = useStore.getState();
      if (!productionId) return;
      e.preventDefault();
      const done = redo ? source.redo() : source.undo();
      notify(done ? `${redo ? "Rehecho" : "Deshecho"}: ${done}.` : redo ? "No hay nada que rehacer." : "No hay nada que deshacer.");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

/** Delete / Backspace on the board moves the selection to the trash (never while typing). */
function DeleteKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const { multi, selectedId, trashNodes, view } = useStore.getState();
      if (view !== "board") return;
      const ids = multi.length ? multi : selectedId ? [selectedId] : [];
      if (!ids.length) return;
      e.preventDefault();
      trashNodes(ids);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

function LeaveConfirm() {
  const ask = useStore((s) => s.leaveAsk);
  const floating = useStore((s) => s.floating.length);
  const popped = useStore((s) => s.popped.length);
  const { set, confirmLeave } = useStore.getState();
  if (!ask) return null;
  const n = floating + popped;
  return (
    <Modal title="Ventanas emergentes abiertas" onClose={() => set({ leaveAsk: null })} width={420}>
      <p>
        Tienes {n === 1 ? "una ventana emergente abierta" : `${n} ventanas emergentes abiertas`}. ¿Estás seguro?{" "}
        {ask.closeId ? "Al cerrar la pestaña se cerrarán." : "Al salir de la producción se cerrarán."}
        {TABS && !ask.closeId ? " La producción sigue abierta en su pestaña." : null}
      </p>
      <div className="modal-actions">
        <Button onClick={() => set({ leaveAsk: null })}>No, quedarme</Button>
        <Button variant="primary" autoFocus onClick={confirmLeave}>{ask.closeId ? "Sí, cerrar" : "Sí, cerrar y salir"}</Button>
      </div>
    </Modal>
  );
}

function Notice() {
  const notice = useStore((s) => s.notice);
  if (!notice) return null;
  return (
    <div className="notice" role="status">
      {notice.text}
      {notice.action ? <button className="notice__action" onClick={notice.action.run}>{notice.action.label}</button> : null}
    </div>
  );
}

function PoppedWindow() {
  const snap = useStore((s) => s.snap);
  const nodeId = useStore((s) => s.windowNodeId);
  if (!nodeId) {
    // Its main window left the production (and the browser would not let us close this one).
    return (
      <div className="loading loading--col">
        <strong>Esta ventana ya no está activa</strong>
        <span className="sf-muted">Se salió de la producción en la ventana principal. Puedes cerrarla.</span>
      </div>
    );
  }
  if (!snap) return <Loading />;
  const node = snap.nodes.find((n) => n.id === nodeId);
  if (node) document.title = `${node.title || "Sin título"} · ${snap.production.name}`;
  return (
    <>
      <WindowInspector nodeId={nodeId} />
      <FlashFrame />
    </>
  );
}

/** Glowing frame when the main window points at this one ("Ir a la ventana"). */
function FlashFrame() {
  const flash = useStore((s) => s.flash);
  return flash ? <div key={flash} className="flashframe" aria-hidden /> : null;
}
