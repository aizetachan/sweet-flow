/**
 * Desktop title bar (docs/INTERFAZ.md §0.1): the system's window buttons, a
 * Home button and one tab per open production, as browser tabs. The empty
 * space drags the window, and a square at the right end always does (even with
 * the bar full of tabs). Tabs are dragged along the bar to reorder them. A
 * double click on a tab's name renames the production.
 */

import { useMemo, useState, type DragEvent, type MouseEvent } from "react";
import { IconHome, IconMovie, IconX } from "@tabler/icons-react";
import { cx } from "@sweetflow/ui";
import { useStore } from "../state/store";

const TAB_TYPE = "application/x-sweetflow-tab";

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const lib = useStore((s) => s.lib);
  const phase = useStore((s) => s.phase);
  const productionId = useStore((s) => s.productionId);
  const { openTab, closeTab, requestLeave } = useStore.getState();
  const names = useMemo(() => new Map((lib?.entries ?? []).map((e) => [e.id, e.name])), [lib]);
  const mac = window.sweetflow?.platform === "darwin";
  const [renaming, setRenaming] = useState<{ id: string; draft: string } | null>(null);
  // Reordering: the tab being dragged, and where it would land (before that index).
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const shown = tabs.filter((id) => names.has(id));
  /** Before which tab it would land: this one, or the next if over its right half. */
  const landing = (e: DragEvent<HTMLDivElement>, i: number) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? i : i + 1;
  };
  const overTab = (e: DragEvent<HTMLDivElement>, i: number) => {
    if (!e.dataTransfer.types.includes(TAB_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropAt(landing(e, i));
  };
  const drop = (e: DragEvent<HTMLDivElement>, i: number) => {
    const id = e.dataTransfer.getData(TAB_TYPE);
    if (id) {
      e.preventDefault();
      const dropAt = landing(e, i);
      // `dropAt` counts the dragged tab itself; once it is taken out, everything after it moves back one.
      const from = shown.indexOf(id);
      const to = dropAt > from ? dropAt - 1 : dropAt;
      // Positions among the visible tabs map onto the whole list (tabs of productions not loaded yet stay put).
      const target = shown.filter((t) => t !== id)[to];
      const all = tabs.filter((t) => t !== id);
      useStore.getState().moveTab(id, target ? all.indexOf(target) : all.length);
    }
    setDragging(null);
    setDropAt(null);
  };
  const saveName = () => {
    if (renaming && renaming.draft.trim() && renaming.draft.trim() !== names.get(renaming.id)) useStore.getState().library.rename(renaming.id, renaming.draft.trim());
    setRenaming(null);
  };

  return (
    <div className={cx("tabbar", mac ? "tabbar--mac" : "tabbar--win")}>
      <button className={cx("tabbar__home", phase === "dashboard" && "is-on")} title="Inicio" aria-label="Inicio"
        onClick={() => (phase === "production" ? requestLeave() : undefined)}>
        <IconHome size={17} stroke={1.6} />
      </button>
      <div className="tabbar__tabs" role="tablist" aria-label="Producciones abiertas" style={{ ["--tabs" as string]: shown.length }}>
        {shown.map((id, i) => {
          const name = names.get(id)!;
          const on = phase === "production" && productionId === id;
          const close = (e: MouseEvent) => {
            e.stopPropagation();
            closeTab(id);
          };
          return (
            <div key={id} role="tab" aria-selected={on} tabIndex={0} title={name}
              className={cx("tabbar__tab", on && "is-on", dragging === id && "is-dragging", dropAt === i && "drop-before", dropAt === i + 1 && i === shown.length - 1 && "drop-after")}
              draggable={renaming?.id !== id}
              onDragStart={(e) => {
                e.dataTransfer.setData(TAB_TYPE, id);
                e.dataTransfer.effectAllowed = "move";
                setDragging(id);
              }}
              onDragOver={(e) => overTab(e, i)}
              onDrop={(e) => drop(e, i)}
              onDragEnd={() => {
                setDragging(null);
                setDropAt(null);
              }}
              onClick={() => openTab(id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openTab(id)}
              // Middle click closes, as in a browser.
              onAuxClick={(e) => e.button === 1 && close(e)}>
              <IconMovie size={15} stroke={1.6} className="tabbar__icon" />
              {renaming?.id === id ? (
                <input className="tabbar__rename" autoFocus value={renaming.draft} aria-label="Nombre de la producción"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setRenaming({ id, draft: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={saveName}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") setRenaming(null);
                  }} />
              ) : (
                <span className="tabbar__name" onDoubleClick={() => setRenaming({ id, draft: name })}>{name || "Sin título"}</span>
              )}
              <button className="tabbar__close" aria-label={`Cerrar ${name}`} title="Cerrar" onClick={close}>
                <IconX size={13} />
              </button>
            </div>
          );
        })}
      </div>
      {/* Always there, at the right end: grab it to move the window. */}
      <div className="tabbar__grip" title="Arrastra para mover la ventana" />
    </div>
  );
}
