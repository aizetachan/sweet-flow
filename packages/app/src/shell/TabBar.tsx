/**
 * Desktop title bar (docs/INTERFAZ.md §0.1): the system's window buttons, a
 * Home button and one tab per open production, as browser tabs. The empty
 * space drags the window.
 */

import { useMemo, type MouseEvent } from "react";
import { IconHome, IconMovie, IconX } from "@tabler/icons-react";
import { cx } from "@sweetflow/ui";
import { useStore } from "../state/store";

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const lib = useStore((s) => s.lib);
  const phase = useStore((s) => s.phase);
  const productionId = useStore((s) => s.productionId);
  const { openTab, closeTab, requestLeave } = useStore.getState();
  const names = useMemo(() => new Map((lib?.entries ?? []).map((e) => [e.id, e.name])), [lib]);
  const mac = window.sweetflow?.platform === "darwin";

  return (
    <div className={cx("tabbar", mac ? "tabbar--mac" : "tabbar--win")}>
      <button className={cx("tabbar__home", phase === "dashboard" && "is-on")} title="Inicio" aria-label="Inicio"
        onClick={() => (phase === "production" ? requestLeave() : undefined)}>
        <IconHome size={17} stroke={1.6} />
      </button>
      <div className="tabbar__tabs" role="tablist" aria-label="Producciones abiertas">
        {tabs.map((id) => {
          const name = names.get(id);
          if (name === undefined) return null;
          const on = phase === "production" && productionId === id;
          const close = (e: MouseEvent) => {
            e.stopPropagation();
            closeTab(id);
          };
          return (
            <div key={id} role="tab" aria-selected={on} tabIndex={0} title={name} className={cx("tabbar__tab", on && "is-on")}
              onClick={() => openTab(id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openTab(id)}
              // Middle click closes, as in a browser.
              onAuxClick={(e) => e.button === 1 && close(e)}>
              <IconMovie size={15} stroke={1.6} className="tabbar__icon" />
              <span className="tabbar__name">{name || "Sin título"}</span>
              <button className="tabbar__close" aria-label={`Cerrar ${name}`} title="Cerrar" onClick={close}>
                <IconX size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
