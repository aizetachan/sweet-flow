/**
 * Dashboard (docs/INTERFAZ.md §1): the app's home. A side menu (Inicio,
 * Recientes, Papelera, Fijados, Ajustes and the user) and the selected section
 * on the right.
 */

import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import { IconClock, IconUsersGroup, IconFolder, IconHome, IconMovie, IconPin, IconPinnedOff, IconSettings, IconTrash } from "@tabler/icons-react";
import type { Id } from "@sweetflow/domain";
import { Avatar, Button, cx } from "@sweetflow/ui";
import { openTeamFolder, storageStatus } from "../data";
import { reconnectLocalFolder } from "../data/folder/browserFs";
import { isInTrash, pinKey, type LibraryEntry, type LibraryState, type Pin } from "../data/library";
import { useStore, type DashSection } from "../state/store";
import { Browse, DRAG_TYPE, useDropInto } from "./Browse";
import { Settings } from "./Settings";
import { TeamPage } from "./Team";

export function Dashboard() {
  const lib = useStore((s) => s.lib);
  const section = useStore((s) => s.dashSection);
  if (!lib) return <div className="dapp" />;
  return (
    <div className="dapp">
      <Sidebar lib={lib} />
      <main className="dapp__main">
        <ReconnectBar />
        {section === "settings" ? <Settings lib={lib} /> : section === "team" ? <TeamPage lib={lib} /> : <Browse lib={lib} section={section} />}
      </main>
    </div>
  );
}

/** The team folder needs a click to be opened again (browser permission). */
function ReconnectBar() {
  useStore((s) => s.library); // re-render when the storage changes
  const setLibrary = useStore((s) => s.setLibrary);
  const status = storageStatus();
  const [busy, setBusy] = useState(false);
  if (status.status !== "reconnect") return null;
  return (
    <div className="reconnect">
      <IconFolder size={16} stroke={1.6} />
      <span>Para abrir la carpeta del equipo «{status.name}», el navegador necesita tu permiso otra vez. Mientras tanto ves lo guardado en este navegador.</span>
      <Button size="sm" variant="primary" disabled={busy} onClick={async () => {
        setBusy(true);
        const lib = (await reconnectLocalFolder().catch(() => false)) ? await openTeamFolder().catch(() => null) : null;
        if (lib) setLibrary(lib);
        setBusy(false);
      }}>Abrir «{status.name}»</Button>
    </div>
  );
}

const NAV: Array<{ id: Exclude<DashSection, "settings">; label: string; icon: typeof IconHome }> = [
  { id: "home", label: "Inicio", icon: IconHome },
  { id: "recent", label: "Recientes", icon: IconClock },
  { id: "team", label: "Equipo", icon: IconUsersGroup },
  { id: "trash", label: "Papelera", icon: IconTrash },
];

function Sidebar({ lib }: { lib: LibraryState }) {
  const { dashSection, folderId, set } = useStore();
  const byId = useMemo(() => new Map(lib.entries.map((e) => [e.id, e])), [lib.entries]);
  const trashed = lib.entries.filter((e) => e.trashedAt).length;
  const openFolder = (id: Id | null) => set({ dashSection: "home", folderId: id });

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
            count={n.id === "trash" && trashed ? trashed : undefined}
            dropTarget={n.id === "home" ? null : undefined}
            onClick={() => (n.id === "home" ? openFolder(null) : set({ dashSection: n.id }))}
          />
        ))}
      </nav>

      <Pins lib={lib} byId={byId} />

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

const PIN_TYPE = "application/x-sweetflow-pin";

/**
 * Fijados: folders, productions, scenes and shots the user keeps at hand.
 * Drop dashboard entries here to pin them; drag pins to reorder them.
 */
function Pins({ lib, byId }: { lib: LibraryState; byId: Map<Id, LibraryEntry> }) {
  const { library, dashSection, folderId, openPin } = useStore();
  const [over, setOver] = useState<number | null>(null);
  const pins = lib.prefs.pins.filter((p) => {
    const e = byId.get(p.entryId);
    return e && !isInTrash(byId, e);
  });

  const dragOver = (e: DragEvent, index: number) => {
    const types = e.dataTransfer.types;
    if (!types.includes(PIN_TYPE) && !types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(index);
  };
  const drop = (e: DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    const key = e.dataTransfer.getData(PIN_TYPE);
    // Reorder among visible pins: translate to the full list (hidden pins keep their place).
    const target = pins[index] ? lib.prefs.pins.findIndex((p) => pinKey(p) === pinKey(pins[index]!)) : lib.prefs.pins.length;
    if (key) return library.movePin(key, target);
    const ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || "[]") as Id[];
    for (const id of ids) library.setPinned({ entryId: id }, true);
  };

  return (
    <div className={cx("dpins", over !== null && "dpins--over")} onDragOver={(e) => dragOver(e, pins.length)} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, pins.length)}>
      <div className="dside__title">Fijados</div>
      {pins.length ? (
        <nav className="dside__nav dside__nav--pins">
          {pins.map((p, i) => {
            const entry = byId.get(p.entryId)!;
            const on = !p.nodeId && entry.kind === "folder" && dashSection === "home" && folderId === entry.id;
            return (
              <PinItem
                key={pinKey(p)}
                pin={p}
                entry={entry}
                on={on}
                dropBefore={over === i}
                onOpen={() => openPin(p)}
                onUnpin={() => library.setPinned(p, false)}
                onDragOver={(e) => dragOver(e, i)}
                onDrop={(e) => drop(e, i)}
              />
            );
          })}
        </nav>
      ) : (
        <p className="dpins__empty">Fija carpetas, producciones, escenas o planos con <IconPin size={12} /> para tenerlos siempre a mano. También puedes arrastrarlos aquí.</p>
      )}
    </div>
  );
}

function PinItem({ pin, entry, on, dropBefore, onOpen, onUnpin, onDragOver, onDrop }: {
  pin: Pin;
  entry: LibraryEntry;
  on: boolean;
  dropBefore: boolean;
  onOpen: () => void;
  onUnpin: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  // A pinned folder still takes entries dropped on it (moves them in), like any folder.
  const into = useDropInto(entry.kind === "folder" && !pin.nodeId ? entry.id : null);
  const isFolder = entry.kind === "folder" && !pin.nodeId;
  const icon = pin.nodeId ? <span className="dpin__code">{pin.code ?? "·"}</span> : isFolder ? <IconFolder size={16} stroke={1.6} className="dside__ficon" /> : <IconMovie size={16} stroke={1.6} className="sf-faint" />;
  const label = pin.nodeId ? pin.title || pin.level || pin.code || "Sin título" : entry.name;
  const sub = pin.nodeId ? entry.name : null;
  return (
    <div
      className={cx("dpin", dropBefore && "dpin--before")}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(PIN_TYPE, pinKey(pin));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (isFolder && e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.stopPropagation();
          return into.props.onDragOver(e);
        }
        onDragOver(e);
      }}
      onDragLeave={into.props.onDragLeave}
      onDrop={(e) => {
        if (isFolder && e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.stopPropagation();
          return into.props.onDrop(e);
        }
        onDrop(e);
      }}
    >
      <button className={cx("dside__item", "dpin__btn", on && "dside__item--on", into.over && "is-drop")} onClick={onOpen} title={sub ? `${pin.code ?? ""} ${label} · ${sub}` : label}>
        {icon}
        <span className="dpin__text">
          <span className="dside__label">{label}</span>
          {sub ? <span className="dpin__sub">{sub}</span> : null}
        </span>
      </button>
      <button className="dpin__off" title="Quitar de Fijados" aria-label="Quitar de Fijados" onClick={onUnpin}><IconPinnedOff size={13} /></button>
    </div>
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
