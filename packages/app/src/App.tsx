import { useState } from "react";
import { Button, Modal, Spinner } from "@sweetflow/ui";
import { useStore } from "./state/store";
import { Rail, Topbar } from "./shell/Shell";
import { Splash } from "./shell/Splash";
import { Dashboard } from "./dashboard/Dashboard";
import { StructureTree } from "./board/StructureTree";
import { Board } from "./board/Board";
import { DockedInspector, FloatingInspectors, WindowInspector } from "./inspector/Inspector";
import { Modals } from "./settings/Modals";
import { LibraryView, TeamView } from "./views/OtherViews";

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
      <Rail />
      <div className="app__main">
        <Topbar />
        {view === "board" ? (
          // Work panel on the left, structure on the right (docs/INTERFAZ.md §2).
          <div className="workspace">
            <DockedInspector />
            <Board />
            <StructureTree />
          </div>
        ) : view === "library" ? <LibraryView /> : <TeamView />}
      </div>
      <FloatingInspectors />
      <Notice />
      <LeaveConfirm />
      <Modals />
    </div>
  );
}

/** Leaving the production closes every floating panel and popped window: ask first. */
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
  return notice ? <div className="notice" role="status">{notice}</div> : null;
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
  return <WindowInspector nodeId={nodeId} />;
}
