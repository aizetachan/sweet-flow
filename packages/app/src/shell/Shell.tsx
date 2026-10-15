import { useState } from "react";
import {
  IconBolt,
  IconCheck,
  IconChevronDown,
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

const NAV: Array<{ id: View; label: string; icon: typeof IconLayoutBoard }> = [
  { id: "board", label: "Producción", icon: IconLayoutBoard },
  { id: "library", label: "Biblioteca", icon: IconLibraryPhoto },
  { id: "team", label: "Equipo", icon: IconUsers },
];

export function Rail() {
  const view = useStore((s) => s.view);
  const set = useStore((s) => s.set);
  const snap = useSnap();
  return (
    <nav className="rail">
      <div className="rail__logo" title={snap.workspace.name}>sf</div>
      {NAV.map((n) => (
        <button key={n.id} className={cx("rail__item", view === n.id && "rail__item--on")} onClick={() => set({ view: n.id })} title={n.label}>
          <n.icon size={19} stroke={1.6} />
          <span>{n.label}</span>
        </button>
      ))}
      <div className="rail__spacer" />
      <button className="rail__item" title="Ajustes de la producción" onClick={() => set({ modal: "levels" })}>
        <IconSettings size={19} stroke={1.6} />
        <span>Ajustes</span>
      </button>
      <div className="rail__me"><Avatar name={snap.me.displayName} size={28} /></div>
    </nav>
  );
}

export function Topbar() {
  const snap = useSnap();
  const { source, set } = useStore.getState();
  const [open, setOpen] = useState(false);
  const online = snap.presence.filter((p) => p.uid !== snap.me.uid).map((p) => memberName(snap, p.uid));
  const m = snap.mirror;

  return (
    <header className="topbar">
      <div className="prodswitch">
        <button className="prodswitch__btn" onClick={() => setOpen(!open)}>
          <span className="prodswitch__ws">{snap.workspace.name}</span>
          <span className="prodswitch__sep">/</span>
          <span className="prodswitch__name">{snap.production.name}</span>
          <IconChevronDown size={14} />
        </button>
        {open ? (
          <div className="menu menu--wide" onMouseLeave={() => setOpen(false)}>
            <div className="menu__title">Producciones de {snap.workspace.name}</div>
            {snap.productions.map((p) => (
              <button key={p.id} className="menu__item" onClick={() => { source.openProduction(p.id); setOpen(false); }}>
                <span className="menu__label">{p.name}</span>
                <span className="sf-faint sf-small">{p.format}</span>
                {p.id === snap.production.id ? <IconCheck size={13} /> : null}
              </button>
            ))}
          </div>
        ) : null}
        {snap.production.format ? <span className="topbar__format">{snap.production.format}</span> : null}
      </div>

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

      <button className="chip" title={snap.me.magnificConnected ? "Tu cuenta de Magnific: tus generaciones usan tus créditos" : "Conecta tu cuenta de Magnific para generar"} onClick={() => set({ view: "team" })}>
        <IconBolt size={14} className={snap.me.magnificConnected ? "accent" : ""} />
        {snap.me.magnificConnected ? `${(snap.me.magnificCredits ?? 0).toLocaleString("es-ES")} créditos` : "Conectar Magnific"}
      </button>

      <IconButton label="Invitar al equipo" onClick={() => set({ modal: "invite" })}><IconUsers size={16} /></IconButton>
    </header>
  );
}
