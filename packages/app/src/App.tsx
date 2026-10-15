import { useEffect, useState } from "react";
import { codeOf, descendantsOf, isUnit, levelOf } from "@sweetflow/domain";
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
        ) : view === "library" ? <LibraryView /> : <TeamView />}
      </div>
      <Dock />
      <FloatingInspectors />
      <Notice />
      <LeaveConfirm />
      <DeleteConfirm />
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
/** What deleting the asked nodes takes with it, and a confirmation (docs/INTERFAZ.md §2.2). */
function DeleteConfirm() {
  const ask = useStore((s) => s.deleteAsk);
  const snap = useStore((s) => s.snap);
  const { set, confirmDelete } = useStore.getState();
  if (!ask || !snap) return null;
  const p = snap.production;
  const nodes = ask.map((id) => snap.nodes.find((n) => n.id === id)).filter((n) => !!n);
  if (!nodes.length) return null;
  const inside = new Map<string, number>();
  const gone = new Set(nodes.map((n) => n.id));
  for (const n of nodes) for (const d of descendantsOf(snap.nodes, n.id)) gone.add(d.id);
  for (const id of gone) {
    if (ask.includes(id)) continue;
    const name = levelOf(p, snap.nodes.find((n) => n.id === id)!).name.toLowerCase();
    inside.set(name, (inside.get(name) ?? 0) + 1);
  }
  const media = snap.media.filter((m) => gone.has(m.nodeId)).length;
  const comments = snap.comments.filter((c) => gone.has(c.nodeId)).length;
  const what = nodes.length === 1 ? `${codeOf(p, nodes[0]!)}${nodes[0]!.title ? ` «${nodes[0]!.title}»` : ""}` : `${nodes.length} elementos (${nodes.map((n) => codeOf(p, n)).join(", ")})`;
  const parts = [...inside].map(([name, n]) => `${n} ${name}${n === 1 ? "" : "s"}`);
  if (media) parts.push(`${media} ${media === 1 ? "imagen o vídeo" : "imágenes y vídeos"}`);
  if (comments) parts.push(`${comments} comentario${comments === 1 ? "" : "s"}`);
  return (
    <Modal title="Eliminar" onClose={() => set({ deleteAsk: null })} width={440}>
      <p>¿Eliminar {what}?</p>
      {parts.length ? <p className="sf-muted">También se eliminará lo que contiene: {parts.join(", ")}.</p> : null}
      <p className="sf-muted sf-small">No se puede deshacer. Los códigos que queden libres se podrán volver a usar.</p>
      <div className="modal-actions">
        <Button onClick={() => set({ deleteAsk: null })}>Cancelar</Button>
        <Button className="danger" autoFocus onClick={confirmDelete}>Eliminar</Button>
      </div>
    </Modal>
  );
}

/** Delete / Backspace on the board asks to delete the selection (never while typing). */
function DeleteKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const { multi, selectedId, deleteAsk, requestDelete } = useStore.getState();
      if (deleteAsk) return;
      const ids = multi.length ? multi : selectedId ? [selectedId] : [];
      if (!ids.length) return;
      e.preventDefault();
      requestDelete(ids);
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
