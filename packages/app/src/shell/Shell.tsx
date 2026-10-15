import {
  IconBolt,
  IconChevronRight,
  IconHome,
  IconCloudUpload,
  IconFolder,
  IconFolderOff,
  IconLayoutBoard,
  IconLibraryPhoto,
  IconSettings,
  IconUsers,
} from "@tabler/icons-react";
import { Avatar, AvatarStack, cx, IconButton, Spinner } from "@sweetflow/ui";
import { useSnap, useStore, type View } from "../state/store";
import { memberName } from "../state/selectors";
import { useLibraryTrail } from "../dashboard/Dashboard";

const NAV: Array<{ id: View; label: string; icon: typeof IconLayoutBoard }> = [
  { id: "board", label: "Producción", icon: IconLayoutBoard },
  { id: "library", label: "Biblioteca", icon: IconLibraryPhoto },
  { id: "team", label: "Equipo", icon: IconUsers },
];

/** Production sections, floating at the bottom centre so the board keeps the full width. */
export function Dock() {
  const view = useStore((s) => s.view);
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
      <button className="dock__item" title="Ajustes de la producción" onClick={() => set({ modal: "levels" })}>
        <IconSettings size={17} stroke={1.6} />
        <span>Ajustes</span>
      </button>
    </nav>
  );
}

export function Topbar() {
  const snap = useSnap();
  const { source, set, requestLeave, productionId } = useStore.getState();
  const trail = useLibraryTrail(productionId);
  const online = snap.presence.filter((p) => p.uid !== snap.me.uid).map((p) => memberName(snap, p.uid));
  const m = snap.mirror;
  const team = snap.features.team;

  return (
    <header className="topbar">
      <button className="topbar__logo" title="Volver al inicio" onClick={() => requestLeave()}>sf</button>
      <nav className="crumbs crumbs--top" aria-label="Ubicación">
        <button className="crumbs__btn" onClick={() => requestLeave(null)} title="Volver al inicio"><IconHome size={14} /> Inicio</button>
        {trail.map((f) => (
          <span key={f.id} className="crumbs__item">
            <IconChevronRight size={13} className="sf-faint" />
            <button className="crumbs__btn" onClick={() => requestLeave(f.id)}>{f.name}</button>
          </span>
        ))}
        <span className="crumbs__item">
          <IconChevronRight size={13} className="sf-faint" />
          <span className="crumbs__here">{snap.production.name}</span>
        </span>
        {snap.production.format ? <span className="topbar__format">{snap.production.format}</span> : null}
      </nav>

      <div className="topbar__spacer" />

      {online.length ? (
        <div className="topbar__presence" title={`Ahora en la producción: ${online.join(", ")}`}>
          <span className="live-dot" />
          <AvatarStack names={online} size={22} />
        </div>
      ) : null}

      <button className={cx("chip", m.status === "unlinked" && "chip--warn")} onClick={() => source.linkFolder()} title={m.rootPath ? `Carpeta: ${m.rootPath}` : "Vincular la carpeta del escritorio"}>
        {m.status === "unlinked" ? <IconFolderOff size={14} /> : m.status === "syncing" ? <Spinner /> : <IconFolder size={14} />}
        {m.status === "unlinked" ? "Vincular carpeta" : m.status === "syncing" ? `Sincronizando ${m.pending}…` : "Carpeta al día"}
        {m.status === "synced" ? <IconCloudUpload size={13} className="sf-faint" /> : null}
      </button>

      <button
        className="chip"
        disabled={!team}
        title={!team ? "Conectar Magnific: próximamente en modo local" : snap.me.magnificConnected ? "Tu cuenta de Magnific: tus generaciones usan tus créditos" : "Conecta tu cuenta de Magnific para generar"}
        onClick={() => set({ view: "team" })}
      >
        <IconBolt size={14} className={snap.me.magnificConnected ? "accent" : ""} />
        {!team ? "Magnific · próximamente" : snap.me.magnificConnected ? `${(snap.me.magnificCredits ?? 0).toLocaleString("es-ES")} créditos` : "Conectar Magnific"}
      </button>

      <IconButton label={team ? "Invitar al equipo" : "Invitar: próximamente en modo local"} disabled={!team} onClick={() => set({ modal: "invite" })}><IconUsers size={16} /></IconButton>
      <span className="topbar__me" title={snap.me.displayName}><Avatar name={snap.me.displayName} size={28} /></span>
    </header>
  );
}
