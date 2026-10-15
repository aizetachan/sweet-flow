import { useState } from "react";
import { Spinner } from "@sweetflow/ui";
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
      <Modals />
    </div>
  );
}

function Notice() {
  const notice = useStore((s) => s.notice);
  return notice ? <div className="notice" role="status">{notice}</div> : null;
}

function PoppedWindow() {
  const snap = useStore((s) => s.snap);
  const nodeId = useStore((s) => s.windowNodeId);
  if (!snap || !nodeId) return <Loading />;
  const node = snap.nodes.find((n) => n.id === nodeId);
  if (node) document.title = `${node.title || "Sin título"} · ${snap.production.name}`;
  return <WindowInspector nodeId={nodeId} />;
}
