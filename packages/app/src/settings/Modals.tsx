import { IconArrowDown, IconArrowUp, IconArchive, IconBolt, IconCircleDot, IconCpu, IconEye, IconPlugConnected, IconPlus, IconStack2, IconUser } from "@tabler/icons-react";
import { codeFor, folderName, normEmail, safeTitle, type LevelDef, type StatusCategory, type StatusDef } from "@sweetflow/domain";
import { Avatar, Button, cx, IconButton, Modal } from "@sweetflow/ui";
import { Integrations, ModelsSettings, Profile } from "../dashboard/Settings";
import { ShareModal } from "../shell/ShareModal";
import { entryWithin } from "../data/folder/folderEntries";
import { uidForEmail } from "../integrations/magnific/identity";
import { useMagnific } from "../integrations/magnific/useMagnific";
import { useSnap, useStore, type SettingsTab } from "../state/store";
import { newId } from "../data/mock/seed";

export function Modals() {
  const modal = useStore((s) => s.modal);
  const set = useStore((s) => s.set);
  const close = () => set({ modal: null });
  if (modal === "settings") return <ProductionSettings onClose={close} />;
  if (modal === "share") return <ShareModal onClose={close} />;
  if (modal === "team") return <TeamModal onClose={close} />;
  if (modal === "notes") return <NotesModal onClose={close} />;
  return null;
}

/**
 * Ajustes inside the production (docs/INTERFAZ.md §1.1): this production's
 * own settings, and the general ones that don't need to leave it (profile,
 * models, integrations). The team folder and «Acerca de» stay in the
 * dashboard: changing the folder closes the production.
 */
const PROD_TABS: Array<{ group: string; tabs: Array<{ id: SettingsTab; label: string; icon: typeof IconUser }> }> = [
  { group: "Esta producción", tabs: [
    { id: "levels", label: "Niveles", icon: IconStack2 },
    { id: "statuses", label: "Estados", icon: IconCircleDot },
    { id: "view", label: "Vista", icon: IconEye },
  ] },
  { group: "General", tabs: [
    { id: "profile", label: "Perfil", icon: IconUser },
    { id: "models", label: "Modelos", icon: IconCpu },
    { id: "integrations", label: "Integraciones", icon: IconPlugConnected },
  ] },
];

function ProductionSettings({ onClose }: { onClose: () => void }) {
  const tab = useStore((s) => s.settingsTab);
  const lib = useStore((s) => s.lib);
  const set = useStore((s) => s.set);
  const known = PROD_TABS.flatMap((g) => g.tabs).some((t) => t.id === tab);
  const on = known ? tab : "levels";
  return (
    <Modal title="Ajustes" onClose={onClose} width={1000}>
      <div className="psettings">
        <nav className="psettings__nav">
          {PROD_TABS.map((g) => (
            <div key={g.group} className="psettings__group">
              <div className="psettings__label">{g.group}</div>
              {g.tabs.map((t) => (
                <button key={t.id} className={cx("settings__tab", on === t.id && "settings__tab--on")} onClick={() => set({ settingsTab: t.id })}>
                  <t.icon size={16} stroke={1.6} /> {t.label}
                </button>
              ))}
            </div>
          ))}
          <button className="psettings__more link" onClick={() => { onClose(); set({ dashSection: "settings", settingsTab: "storage" }); useStore.getState().requestLeave(); }}>
            Carpeta del equipo y más ajustes en el inicio →
          </button>
        </nav>
        <div className="psettings__body">
          {on === "levels" ? <><h2 className="psettings__title">Niveles</h2><LevelsBody /></> : null}
          {on === "statuses" ? <><h2 className="psettings__title">Estados</h2><StatusesBody /></> : null}
          {on === "view" ? <><h2 className="psettings__title">Vista</h2><ShowCodesSetting /></> : null}
          {on === "profile" && lib ? <Profile lib={lib} /> : null}
          {on === "models" ? <ModelsSettings /> : null}
          {on === "integrations" ? <Integrations /> : null}
        </div>
      </div>
    </Modal>
  );
}

/**
 * «Mostrar códigos» (docs/INTERFAZ.md §2): off by default, things go by their
 * title; on, the codes (SQ010, SH0010…) show next to them. On disk the folders
 * always carry their code. A setting of this computer.
 */
function ShowCodesSetting() {
  const showCodes = useStore((s) => s.showCodes);
  const set = useStore((s) => s.set);
  return (
    <label className="setting">
      <input type="checkbox" checked={showCodes} onChange={(e) => set({ showCodes: e.target.checked })} />
      <span>
        <b>Mostrar códigos</b>
        <span className="sf-faint sf-small"> · SQ010, SC010, SH0010… junto a los títulos. En el disco las carpetas siempre llevan su código.</span>
      </span>
    </label>
  );
}

/**
 * A scene's or shot's notes (docs/INTERFAZ.md §2): action, dialogue, direction
 * — the base of its prompt. Opened from «Notas» in the panel or the note icon
 * of a card; saved as you type.
 */
function NotesModal({ onClose }: { onClose: () => void }) {
  const snap = useSnap();
  const { source, notesFor } = useStore();
  const node = snap.nodes.find((n) => n.id === notesFor) ?? snap.library.find((n) => n.id === notesFor);
  if (!node) return null;
  return (
    <Modal title={node.lib ? <>Descripción · {node.title}</> : <>Notas · {codeFor(snap.production.levels.find((l) => l.id === node.levelId)!, node.number)}{node.title ? ` · ${node.title}` : ""}</>} onClose={onClose} width={560}>
      <textarea className="sf-textarea notes__area" autoFocus rows={10} placeholder={node.lib ? "Cómo es: rasgos, ropa, materiales, luz… (base del prompt al usar la ficha)" : "Acción, diálogo, notas de dirección… (base del prompt)"}
        value={node.notes} onChange={(e) => source.updateNode(node.id, { notes: e.target.value })} />
      <div className="modal-foot"><span className="sf-faint sf-small notes__hint">Se guarda al escribir.</span><Button variant="primary" onClick={onClose}>Listo</Button></div>
    </Modal>
  );
}

/**
 * Who works on the production (docs/INTERFAZ.md §2): a modal from the avatar
 * menu, since it is a quick look. Your Magnific account is the real one
 * (the example account in the demo).
 */
function TeamModal({ onClose }: { onClose: () => void }) {
  const snap = useSnap();
  const { set } = useStore();
  const demo = useStore((s) => s.lib?.mode === "demo");
  const real = useMagnific();
  const mag = demo ? { connected: snap.me.magnificConnected, credits: snap.me.magnificCredits } : real;
  const online = new Set(snap.presence.map((p) => p.uid));
  // Who has this production (docs/USUARIOS.md §2): the owner, and members given it or a folder above it.
  const lib = useStore((s) => s.lib);
  const productionId = useStore((s) => s.productionId);
  const team = lib?.team;
  const entries = lib?.entries ?? [];
  const people = team && productionId ? [
    ...(team.owner ? [{ email: team.owner.email, name: team.owner.name, how: "Propietario" }] : []),
    ...team.members.flatMap((m) => {
      if (m.role === "admin") return [{ email: m.email, name: m.name, how: "Administrador" }];
      if (m.access === "all") return [{ email: m.email, name: m.name, how: "Todo el equipo" }];
      const via = m.access.find((a) => entryWithin(entries, productionId, a));
      if (!via) return [];
      return [{ email: m.email, name: m.name, how: via === productionId ? "Esta producción" : `Desde «${entries.find((e) => e.id === via)?.name ?? "una carpeta"}»` }];
    }),
  ] : [];
  return (
    <Modal title="Equipo" onClose={onClose} width={680}>
      <p className="sf-muted modal-lead">Todos ven la misma producción. Cada uno genera con su propia cuenta de Magnific y sus créditos.</p>
      <div className="mycard">
        <Avatar name={snap.me.displayName} src={snap.me.photoUrl} size={36} />
        <div className="grow">
          <b>Tu cuenta de Magnific</b>
          <div className="sf-muted sf-small">{mag.connected ? "Conectada · tus generaciones gastan tus créditos" : "Sin conectar · puedes ver, cortar y aprobar, pero no generar"}</div>
        </div>
        {mag.connected && mag.credits !== undefined ? <span className="credits"><IconBolt size={15} /> {mag.credits.toLocaleString("es-ES")}</span> : null}
        {!demo ? (
          <Button onClick={() => set({ modal: "settings", settingsTab: "integrations" })}>
            <IconPlugConnected size={14} /> {mag.connected ? "Gestionar" : "Conectar Magnific"}
          </Button>
        ) : null}
      </div>
      {team ? (
        <table className="team">
          <thead><tr><th>Persona</th><th>Acceso</th><th>Asignados</th><th /></tr></thead>
          <tbody>
            {people.map((m) => {
              // The person in this production's log: by email (their id may come from another computer).
              const uid = snap.members.find((x) => normEmail(x.email) === m.email)?.uid ?? uidForEmail(m.email);
              return (
                <tr key={m.email}>
                  <td><div className="team__who"><Avatar name={m.name} size={26} /><div><b>{m.name}{m.email === normEmail(snap.me.email) && m.name !== "Tú" ? " (tú)" : ""}</b><div className="sf-faint sf-small">{m.email}</div></div></div></td>
                  <td className="sf-muted sf-small">{m.how}</td>
                  <td className="sf-muted">{snap.nodes.filter((n) => n.assigneeIds.includes(uid)).length}</td>
                  <td>{online.has(uid) && uid !== snap.me.uid ? <span className="sf-small online"><span className="live-dot" /> En línea</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <table className="team">
          <thead><tr><th>Miembro</th><th>Asignados</th><th /></tr></thead>
          <tbody>
            {snap.members.map((m) => (
              <tr key={m.uid}>
                <td><div className="team__who"><Avatar name={m.displayName} src={m.uid === snap.me.uid ? (snap.me.photoUrl ?? m.photoUrl) : m.photoUrl} size={26} /><div><b>{m.displayName}</b><div className="sf-faint sf-small">{m.email}</div></div></div></td>
                <td className="sf-muted">{snap.nodes.filter((n) => n.assigneeIds.includes(m.uid)).length}</td>
                <td>{online.has(m.uid) && m.uid !== snap.me.uid ? <span className="sf-small online"><span className="live-dot" /> En línea</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="modal-foot">
        {!team ? <span className="sf-faint sf-small grow">Para invitar, guarda las producciones en una carpeta del equipo (Ajustes › Almacenamiento, en el inicio).</span> : null}
        <Button variant="primary" disabled={!team?.canInvite || !productionId} title={team && !team.canInvite ? "El propietario no deja invitar a los miembros" : undefined}
          onClick={() => { onClose(); set({ inviteTo: { access: [productionId!] } }); }}><IconPlus size={15} /> Invitar a esta producción</Button>
      </div>
    </Modal>
  );
}

function LevelsBody() {
  const snap = useSnap();
  const { source, set } = useStore();
  const levels = snap.production.levels;
  const patch = (i: number, p: Partial<LevelDef>) => source.updateLevels(levels.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const sample = levels.map((l, i) => folderName(codeFor(l, l.step), ["Apertura", "Persecución en el puerto", "Plano general", "Detalle"][i] ?? l.name)).join("/");

  return (
    <>
      <p className="sf-muted modal-lead">
        Cada nivel es una carpeta, en la app y en el disco. El último es la unidad de trabajo (las cards).
        Los niveles que <b>generan</b> son puntos de producción: una escena puede producir 30 s, cortarlos y repartirlos a sus planos.
      </p>
      <table className="ltable">
        <thead><tr><th>Nivel</th><th>Prefijo</th><th>Salto</th><th>Dígitos</th><th>Genera</th><th>Máx. vídeo</th><th>Ejemplo</th></tr></thead>
        <tbody>
          {levels.map((l, i) => (
            <tr key={l.id}>
              <td><input className="sf-input" value={l.name} onChange={(e) => patch(i, { name: e.target.value })} /></td>
              <td><input className="sf-input w-xs" value={l.prefix} onChange={(e) => patch(i, { prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) })} /></td>
              <td><input className="sf-input w-xs" type="number" min={1} value={l.step} onChange={(e) => patch(i, { step: Math.max(1, +e.target.value) })} /></td>
              <td><input className="sf-input w-xs" type="number" min={1} max={6} value={l.pad} onChange={(e) => patch(i, { pad: Math.min(6, Math.max(1, +e.target.value)) })} /></td>
              <td><input type="checkbox" checked={l.canGenerate} onChange={(e) => patch(i, { canGenerate: e.target.checked })} /></td>
              <td><input className="sf-input w-xs" type="number" min={2} max={120} value={l.maxVideoSec} onChange={(e) => patch(i, { maxVideoSec: +e.target.value })} /> s</td>
              <td className="sf-mono sf-faint">{codeFor(l, l.step)}{i === levels.length - 1 ? " · unidad" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="modal-row">
        <Button onClick={() => source.updateLevels([{ id: newId("lv"), name: "Episodio", prefix: "EP", step: 1, pad: 2, canGenerate: false, maxVideoSec: 30 }, ...levels])}>
          <IconPlus size={13} /> Añadir nivel arriba (p. ej. Episodio)
        </Button>
        <span className="modal-row__spacer" />
        <Button variant="ghost" onClick={() => set({ settingsTab: "statuses" })}>Editar estados →</Button>
      </div>
      <div className="pathpreview">
        <span className="sf-faint sf-small">Así se verá en la carpeta del escritorio (macOS y Windows):</span>
        <code>…/{safeTitle(snap.production.name, 60)}/{sample}/</code>
      </div>
    </>
  );
}

const CATS: Array<{ id: StatusCategory; label: string }> = [
  { id: "todo", label: "Por hacer" },
  { id: "active", label: "En marcha" },
  { id: "review", label: "Revisión" },
  { id: "done", label: "Terminado" },
];

function StatusesBody() {
  const snap = useSnap();
  const { source } = useStore();
  const list = [...snap.production.statuses].sort((a, b) => a.order - b.order);
  const save = (next: StatusDef[]) => source.updateStatuses(next.map((s, i) => ({ ...s, order: i })));
  const patch = (id: string, p: Partial<StatusDef>) => save(list.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) => {
    const n = [...list];
    const j = i + d;
    if (!n[j]) return;
    [n[i], n[j]] = [n[j]!, n[i]!];
    save(n);
  };
  const inUse = (id: string) => snap.nodes.filter((n) => n.statusId === id).length;

  return (
    <>
      <p className="sf-muted modal-lead">
        El orden es solo visual: cualquier plano puede pasar de un estado a otro, también hacia atrás (p. ej. de Aprobado a Retake). Cada cambio queda en la actividad.
      </p>
      <div className="slist">
        {list.map((s, i) => (
          <div key={s.id} className={s.archived ? "srow srow--archived" : "srow"}>
            <input type="color" value={s.color} onChange={(e) => patch(s.id, { color: e.target.value })} />
            <input className="sf-input" value={s.name} onChange={(e) => patch(s.id, { name: e.target.value })} />
            <select className="sf-select" value={s.category} onChange={(e) => patch(s.id, { category: e.target.value as StatusCategory })} title="Cuenta para el progreso y los filtros">
              {CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <span className="sf-faint sf-small srow__use">{inUse(s.id)} nodos</span>
            <IconButton size="sm" label="Subir" onClick={() => move(i, -1)}><IconArrowUp size={13} /></IconButton>
            <IconButton size="sm" label="Bajar" onClick={() => move(i, 1)}><IconArrowDown size={13} /></IconButton>
            <IconButton size="sm" label={s.archived ? "Recuperar" : "Archivar (los nodos lo conservan)"} onClick={() => patch(s.id, { archived: !s.archived })}><IconArchive size={13} /></IconButton>
          </div>
        ))}
      </div>
      <Button onClick={() => save([...list, { id: newId("st"), name: "Nuevo estado", color: "#9c82e5", category: "active", order: list.length }])}>
        <IconPlus size={13} /> Añadir estado
      </Button>
    </>
  );
}

