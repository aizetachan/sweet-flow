import { useEffect, useState } from "react";
import { codeOf, isUnit } from "@sweetflow/domain";
import { Button, cx, Modal, Spinner } from "@sweetflow/ui";
import { useSnap, useStore } from "./state/store";
import { Dock, Topbar } from "./shell/Shell";
import { Splash } from "./shell/Splash";
import { Dashboard } from "./dashboard/Dashboard";
import { StructureTree } from "./board/StructureTree";
import { Board } from "./board/Board";
import { DockedInspector, FloatingInspectors, WindowInspector } from "./inspector/Inspector";
import { Modals } from "./settings/Modals";
import { LibraryView, TeamView } from "./views/OtherViews";
import { TrashView } from "./views/TrashView";

/** Splash → dashboard → production (docs/INTERFAZ.md). Popped-out windows show one node. */
export function App() {
  const phase = useStore((s) => s.phase);
  const lib = useStore((s) => s.lib);
  const [splash, setSplash] = useState(phase !== "window");

  return (
    <>
      {phase === "window" ? <PoppedWindow /> : phase === "production" ? <Production /> : <Dashboard />}
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
        <Topbar />
        {view === "board" ? (
          // Work panel and structure share the left column; the board gets the rest (docs/INTERFAZ.md §2).
          <div className="workspace">
            <SidePanel />
            <Board />
          </div>
        ) : view === "library" ? <LibraryView /> : view === "trash" ? <TrashView /> : <TeamView />}
      </div>
      <Dock />
      <FloatingInspectors />
      <Notice />
      <LeaveConfirm />
      <DeleteKey />
      <Modals />
    </div>
  );
}

function SidePanel() {
  const snap = useSnap();
  const sideTab = useStore((s) => s.sideTab);
  const selectedId = useStore((s) => s.selectedId);
  const set = useStore((s) => s.set);
  const node = snap.nodes.find((n) => n.id === selectedId);
  const units = snap.nodes.filter((n) => isUnit(snap.production, n)).length;
  return (
    <aside className="side">
      <div className="sidetabs" role="tablist">
        <button role="tab" aria-selected={sideTab === "work"} className={cx("sidetabs__tab", sideTab === "work" && "sidetabs__tab--on")} onClick={() => set({ sideTab: "work" })}>
          Producción
          {node ? <span className="sidetabs__badge">{codeOf(snap.production, node)}</span> : null}
        </button>
        <button role="tab" aria-selected={sideTab === "structure"} className={cx("sidetabs__tab", sideTab === "structure" && "sidetabs__tab--on")} onClick={() => set({ sideTab: "structure" })}>
          Estructura
          <span className="sidetabs__count">{units}</span>
        </button>
      </div>
      {sideTab === "work" ? <DockedInspector /> : <StructureTree />}
    </aside>
  );
}

/** Leaving the production closes every floating panel and popped window: ask first. */
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
      <p>Tienes {n === 1 ? "una ventana emergente abierta" : `${n} ventanas emergentes abiertas`}. ¿Estás seguro? Al salir de la producción se cerrarán.</p>
      <div className="modal-actions">
        <Button onClick={() => set({ leaveAsk: null })}>No, quedarme</Button>
        <Button variant="primary" autoFocus onClick={confirmLeave}>Sí, cerrar y salir</Button>
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
