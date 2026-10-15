import { useStore } from "./state/store";
import { Rail, Topbar } from "./shell/Shell";
import { StructureTree } from "./board/StructureTree";
import { Board } from "./board/Board";
import { Inspector } from "./inspector/Inspector";
import { Modals } from "./settings/Modals";
import { LibraryView, TeamView } from "./views/OtherViews";

export function App() {
  const snap = useStore((s) => s.snap);
  const view = useStore((s) => s.view);
  if (!snap) return null;
  return (
    <div className="app">
      <Rail />
      <div className="app__main">
        <Topbar />
        {view === "board" ? (
          <div className="workspace">
            <StructureTree />
            <Board />
            <Inspector />
          </div>
        ) : view === "library" ? <LibraryView /> : <TeamView />}
      </div>
      <Modals />
    </div>
  );
}
