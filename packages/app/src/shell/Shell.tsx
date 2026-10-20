import {
  IconBolt,
  IconCheck,
  IconChevronRight,
  IconHome,
  IconInfoCircle,
  IconFolderShare,
  IconFolder,
  IconFolderOff,
  IconLayoutBoard,
  IconLibraryPhoto,
  IconMovie,
  IconSettings,
  IconTrash,
  IconUsers,
  IconUsersGroup, IconShare } from "@tabler/icons-react";
import { splitTrash } from "@sweetflow/domain";
import { Avatar, AvatarStack, cx, IconButton, Spinner, Button } from "@sweetflow/ui";
import { TABS, useSnap, useStore, type View } from "../state/store";
import { memberName } from "../state/selectors";
import { useLibraryTrail } from "../dashboard/Dashboard";
import { BoardFilters, ProductionInfo } from "../board/Board";
import { useState } from "react";
import { revealEntry } from "../data/reveal";
import { Notifications } from "./Notifications";
import { Popover } from "../components/Popover";
import { useMagnific } from "../integrations/magnific/useMagnific";
import { SignInButton } from "../dashboard/Welcome";

const NAV: Array<{ id: View; label: string; icon: typeof IconLayoutBoard }> = [
  { id: "board", label: "Producción", icon: IconLayoutBoard },
  { id: "library", label: "Biblioteca", icon: IconLibraryPhoto },
  { id: "editor", label: "Editor", icon: IconMovie },
];

/** Production sections, floating at the bottom centre so the board keeps the full width. */
export function Dock() {
  const view = useStore((s) => s.view);
  const trashed = useStore((s) => (s.snap ? splitTrash([...s.snap.nodes, ...s.snap.trash]).roots.length : 0));
  const set = useStore((s) => s.set);
  return (
    <nav className="dock" aria-label="Secciones de la producción">
      {NAV.map((n) => (
        <button key={n.id} className={cx("dock__item", view === n.id && "dock__item--on")} onClick={() => set({ view: n.id })} title={n.label}>
          <n.icon size={17} stroke={1.6} />
          <span>{n.label}</span>
        </button>
      ))}
      <span className="dock__sep" />
      <button className={cx("dock__item dock__item--icon", view === "trash" && "dock__item--on")} aria-label="Papelera" onClick={() => set({ view: "trash" })} title="Papelera de la producción">
        <IconTrash size={17} stroke={1.6} />
        {trashed ? <span className="dock__count">{trashed}</span> : null}
      </button>
      <button className="dock__item dock__item--icon" aria-label="Ajustes" title="Ajustes de la producción" onClick={() => set({ modal: "settings", settingsTab: "levels" })}>
        <IconSettings size={17} stroke={1.6} />
      </button>
    </nav>
  );
}

export function Topbar() {
  const snap = useSnap();
  const { requestLeave, productionId } = useStore.getState();
  const view = useStore((s) => s.view);
  const scopeId = useStore((s) => s.scopeId);
  const trail = useLibraryTrail(productionId);
  const online = snap.presence.filter((p) => p.uid !== snap.me.uid).map((p) => memberName(snap, p.uid));

  const infoButton = (
    <Popover button={({ open, toggle }) => (
      <IconButton label="Información de la producción" className={open ? "is-on" : undefined} onClick={toggle}><IconInfoCircle size={18} stroke={1.6} /></IconButton>
    )}>
      <ProductionInfo scopeId={scopeId} />
    </Popover>
  );
  const format = snap.production.format ? <span className="topbar__format">{snap.production.format}</span> : null;

  return (
    <header className={cx("topbar", TABS && "topbar--tabs")}>
      {/* Desktop app: the tab above already says where you are and holds the name (double click renames). */}
      {TABS ? null : <nav className="crumbs crumbs--top" aria-label="Ubicación">
        {/* Only home and the production: going back lands in the folder it is in, so the folders in between are not needed. */}
        <button className="crumbs__btn" onClick={() => requestLeave(trail.at(-1)?.id ?? null)}
          title={trail.length ? `Volver a «${trail.at(-1)!.name}»` : "Volver al inicio"}><IconHome size={14} /> Inicio</button>
        <span className="crumbs__item">
          <IconChevronRight size={13} className="sf-faint" />
          <ProductionName />
        </span>
        {infoButton}
        {format}
      </nav>}
      {/* Desktop app: the information opens the bar, on the left. */}
      {TABS ? <>{infoButton}{format}</> : null}

      <div className="topbar__spacer" />

      {view === "board" ? <BoardFilters /> : null}

      {online.length ? (
        <div className="topbar__presence" title={`Ahora en la producción: ${online.join(", ")}`}>
          <span className="live-dot" />
          <AvatarStack names={online} size={22} />
        </div>
      ) : null}

      <Button variant="primary" className="topbar__share" onClick={() => useStore.getState().set({ modal: "share" })}>
        <IconShare size={14} /> Compartir
      </Button>
      <Notifications />
      <IconButton label="Mostrar la carpeta de la producción en el ordenador" onClick={() => void revealEntry(productionId)}>
        <IconFolderShare size={17} stroke={1.6} />
      </IconButton>
      <AccountMenu />
    </header>
  );
}

/**
 * The production's name, the same one its card has in the dashboard: it
 * comes from there, and a double click renames both.
 */
function ProductionName() {
  const snap = useSnap();
  const productionId = useStore((s) => s.productionId);
  const entry = useStore((s) => s.lib?.entries.find((e) => e.id === productionId));
  const name = entry?.name ?? snap.production.name;
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft !== null && draft.trim() && productionId) useStore.getState().library.rename(productionId, draft.trim());
    setDraft(null);
  };
  if (draft === null) {
    return <span className="crumbs__here" title="Doble clic para cambiar el nombre" onDoubleClick={() => entry && setDraft(name)}>{name}</span>;
  }
  return (
    <input className="sf-input crumbs__rename" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setDraft(null); }} />
  );
}

/**
 * The avatar opens a small menu with what used to sit in the top bar: the
 * team folder, Magnific, inviting, and the way to Settings.
 */
function AccountMenu() {
  const snap = useSnap();
  const lib = useStore((s) => s.lib);
  const { set, requestLeave, source } = useStore.getState();
  const real = useMagnific();
  const demo = lib?.mode === "demo";
  // The demo shows its pretend account; elsewhere, the real connection.
  const mag = demo ? { connected: snap.me.magnificConnected, credits: snap.me.magnificCredits } : real;
  const m = snap.mirror;
  const canInvite = !!lib?.team?.canInvite;
  const productionId = useStore((s) => s.productionId);
  const folder = lib?.storage.kind === "folder" ? lib.storage.name : m.rootPath || null;
  // Profile and integrations open in the production's Ajustes; the team folder is in the dashboard's.
  const toSettings = (tab: "storage" | "integrations" | "profile") => {
    if (tab !== "storage") return set({ modal: "settings", settingsTab: tab });
    set({ dashSection: "settings", settingsTab: tab });
    requestLeave();
  };
  return (
    // No Magnific account yet: no avatar, «Conectarse» (docs/INTERFAZ.md §1.0a).
    !demo && !snap.me.email ? <SignInButton className="topbar__signin" /> :
    <Popover align="right" className="amenu" button={({ open, toggle }) => (
      <button className={cx("topbar__me", open && "topbar__me--on")} title={snap.me.displayName} aria-label="Tu cuenta" onClick={toggle}>
        <Avatar name={snap.me.displayName} size={28} />
        {mag.connected ? <span className="topbar__me-dot" title="Magnific conectada" /> : null}
      </button>
    )}>
      <div className="amenu__who">
        <Avatar name={snap.me.displayName} size={32} />
        <span className="amenu__name">
          <strong>{snap.me.displayName}</strong>
          <span className="sf-faint sf-small">{snap.me.email || lib?.label}</span>
        </span>
      </div>
      <div className="menu__sep" />
      <button className="menu__item" onClick={() => (demo ? source.linkFolder() : toSettings("storage"))}>
        {m.status === "unlinked" && !folder ? <IconFolderOff size={15} /> : m.status === "syncing" ? <Spinner /> : <IconFolder size={15} />}
        <span className="menu__label">
          {folder ? `Carpeta «${folder.split("/").pop()}»` : "Carpeta del equipo"}
          <span className="menu__hint">{m.status === "syncing" ? `Guardando ${m.pending}…` : folder ? "Al día" : "Sin carpeta: se guarda en este navegador"}</span>
        </span>
      </button>
      <button className="menu__item" onClick={() => (demo ? set({ modal: "team" }) : toSettings("integrations"))}>
        <IconBolt size={15} className={mag.connected ? "accent" : ""} />
        <span className="menu__label">
          Magnific
          <span className="menu__hint">{mag.connected ? (mag.credits !== undefined ? `${mag.credits.toLocaleString("es-ES")} créditos` : "Conectada") : "Conectar tu cuenta"}</span>
        </span>
        {mag.connected ? <span className="sok"><IconCheck size={10} stroke={3} /></span> : null}
      </button>
      <button className="menu__item" onClick={() => set({ modal: "team" })}>
        <IconUsersGroup size={15} />
        <span className="menu__label">Equipo<span className="menu__hint">{snap.members.length} {snap.members.length === 1 ? "persona" : "personas"} en la producción</span></span>
      </button>
      <button className="menu__item" disabled={!canInvite} onClick={() => productionId && set({ inviteTo: { access: [productionId] } })}>
        <IconUsers size={15} />
        <span className="menu__label">Invitar a esta producción{!lib?.team ? <span className="menu__hint">Necesita una carpeta del equipo</span> : !canInvite ? <span className="menu__hint">El propietario no deja invitar</span> : null}</span>
      </button>
      <div className="menu__sep" />
      <button className="menu__item" onClick={() => toSettings("profile")}>
        <IconSettings size={15} /> <span className="menu__label">Ajustes</span>
      </button>
      <button className="menu__item" onClick={() => requestLeave(null)}>
        <IconHome size={15} /> <span className="menu__label">Volver al inicio</span>
      </button>
    </Popover>
  );
}
