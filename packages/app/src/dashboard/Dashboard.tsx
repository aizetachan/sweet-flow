/**
 * Dashboard (docs/INTERFAZ.md §1): the app's home. A side menu (Inicio,
 * Recientes, Favoritos, Papelera, top-level folders, Ajustes and the user) and
 * the selected section on the right.
 */

import { useMemo, type ReactNode } from "react";
import { IconClock, IconFolder, IconHome, IconSettings, IconStar, IconTrash } from "@tabler/icons-react";
import type { Id } from "@sweetflow/domain";
import { Avatar, cx } from "@sweetflow/ui";
import { isInTrash, type LibraryEntry, type LibraryState } from "../data/library";
import { useStore, type DashSection } from "../state/store";
import { Browse, useDropInto } from "./Browse";
import { Settings } from "./Settings";

export function Dashboard() {
  const lib = useStore((s) => s.lib);
  const section = useStore((s) => s.dashSection);
  if (!lib) return <div className="dapp" />;
  return (
    <div className="dapp">
      <Sidebar lib={lib} />
      <main className="dapp__main">{section === "settings" ? <Settings lib={lib} /> : <Browse lib={lib} section={section} />}</main>
    </div>
  );
}

const NAV: Array<{ id: Exclude<DashSection, "settings">; label: string; icon: typeof IconHome }> = [
  { id: "home", label: "Inicio", icon: IconHome },
  { id: "recent", label: "Recientes", icon: IconClock },
  { id: "starred", label: "Favoritos", icon: IconStar },
  { id: "trash", label: "Papelera", icon: IconTrash },
];

function Sidebar({ lib }: { lib: LibraryState }) {
  const { dashSection, folderId, set } = useStore();
  const byId = useMemo(() => new Map(lib.entries.map((e) => [e.id, e])), [lib.entries]);
  const trashed = lib.entries.filter((e) => e.trashedAt).length;
  const folders = lib.entries
    .filter((e) => e.kind === "folder" && e.parentId === null && !e.trashedAt)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const openFolder = (id: Id | null) => set({ dashSection: "home", folderId: id });
  // The top-level folder that contains the folder being browsed.
  const topOfOpen = (() => {
    let cur = folderId ? byId.get(folderId) : undefined;
    while (cur?.parentId) cur = byId.get(cur.parentId);
    return cur?.id;
  })();

  return (
    <aside className="dside">
      <div className="dside__brand">
        <span className="dside__logo">sf</span>
        <span className="dside__name">Sweet Flow</span>
      </div>

      <nav className="dside__nav">
        {NAV.map((n) => (
          <SideItem
            key={n.id}
            icon={<n.icon size={17} stroke={1.6} />}
            label={n.label}
            on={dashSection === n.id && (n.id !== "home" || folderId === null)}
            count={n.id === "trash" && trashed ? trashed : n.id === "starred" ? lib.prefs.starred.filter((id) => byId.has(id) && !isInTrash(byId, byId.get(id)!)).length || undefined : undefined}
            dropTarget={n.id === "home" ? null : undefined}
            onClick={() => (n.id === "home" ? openFolder(null) : set({ dashSection: n.id }))}
          />
        ))}
      </nav>

      {folders.length ? (
        <>
          <div className="dside__title">Carpetas</div>
          <nav className="dside__nav dside__nav--folders">
            {folders.map((f) => (
              <SideItem key={f.id} icon={<IconFolder size={16} stroke={1.6} className="dside__ficon" />} label={f.name} on={dashSection === "home" && topOfOpen === f.id} dropTarget={f.id} onClick={() => openFolder(f.id)} />
            ))}
          </nav>
        </>
      ) : null}

      <div className="dside__spacer" />

      <nav className="dside__nav">
        <SideItem icon={<IconSettings size={17} stroke={1.6} />} label="Ajustes" on={dashSection === "settings"} onClick={() => set({ dashSection: "settings" })} />
      </nav>
      <button className="dside__me" title="Tu perfil" onClick={() => set({ dashSection: "settings", settingsTab: "profile" })}>
        <Avatar name={lib.me.displayName} size={30} />
        <span className="dside__who">
          <span className="dside__who-name">{lib.me.displayName}</span>
          <span className="dside__who-where">{lib.label}</span>
        </span>
      </button>
    </aside>
  );
}

function SideItem({ icon, label, on, count, onClick, dropTarget }: { icon: ReactNode; label: string; on: boolean; count?: number; onClick: () => void; dropTarget?: Id | null }) {
  const drop = useDropInto(dropTarget ?? null);
  const droppable = dropTarget !== undefined;
  return (
    <button className={cx("dside__item", on && "dside__item--on", droppable && drop.over && "is-drop")} onClick={onClick} {...(droppable ? drop.props : {})}>
      {icon}
      <span className="dside__label">{label}</span>
      {count ? <span className="dside__count">{count}</span> : null}
    </button>
  );
}

/** Folder trail of an entry (used by the production's top bar). */
export function useLibraryTrail(entryId: Id | null): LibraryEntry[] {
  const lib = useStore((s) => s.lib);
  if (!lib || !entryId) return [];
  const byId = new Map(lib.entries.map((e) => [e.id, e]));
  const out: LibraryEntry[] = [];
  for (let cur = byId.get(byId.get(entryId)?.parentId ?? ""); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) out.unshift(cur);
  return out;
}
