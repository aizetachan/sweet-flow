/**
 * The team (docs/USUARIOS.md §2): who owns the team folder, who is in it and
 * what each one has. People are their Magnific account; the folders they get
 * are shared with their Dropbox or Drive, which may use another email.
 */

import { useMemo, useState } from "react";
import { IconCrown, IconFolder, IconMovie, IconUserPlus, IconUsersGroup } from "@tabler/icons-react";
import { normEmail, type Access, type Id, type TeamMember } from "@sweetflow/domain";
import { Avatar, Button, cx, Modal } from "@sweetflow/ui";
import { entryWithin } from "../data/folder/folderEntries";
import type { LibraryEntry, LibraryState, ShareResult } from "../data/library";
import { useStore } from "../state/store";

/** Names of what an access gives, for the UI. */
export function accessLabel(lib: LibraryState, access: Access): string {
  if (access === "all") return "Todo el equipo";
  const names = access.map((id) => lib.entries.find((e) => e.id === id)?.name).filter(Boolean);
  return names.length ? names.join(" · ") : "—";
}

function storageName(lib: LibraryState): string | null {
  if (lib.storage.kind !== "folder") return null;
  return lib.storage.provider === "dropbox" ? "Dropbox" : lib.storage.provider === "drive" ? "Google Drive" : null;
}

/** What to tell after sharing at the service. */
export function shareMessage(r: ShareResult, lib: LibraryState, email: string, verb: "compartido" | "quitado" = "compartido"): string {
  if (lib.mode === "demo") return "En la demo no se comparte nada en el almacenamiento.";
  if (r.manual) return `La carpeta del equipo está en este ordenador: compártela tú en Dropbox o Drive con ${email}.`;
  if (!r.ok) return `Guardado en el equipo, pero ${storageName(lib) ?? "el almacenamiento"} ha fallado: ${r.error ?? "error desconocido"}`;
  return verb === "compartido" ? `Listo: ${storageName(lib)} le ha compartido las carpetas a ${email} y le avisará.` : `Listo: ya no tiene esas carpetas en ${storageName(lib)}.`;
}

export function TeamPage({ lib }: { lib: LibraryState }) {
  const library = useStore((s) => s.library);
  const set = useStore((s) => s.set);
  const notify = useStore((s) => s.notify);
  const team = lib.team;
  const me = normEmail(lib.me.email);
  if (!team) {
    return (
      <div className="dash">
        <header className="dash__head"><h1 className="dash__title">Equipo</h1></header>
        <p className="sf-muted">El equipo vive en la carpeta del equipo. Elige una en Ajustes › Almacenamiento (de este ordenador, Dropbox o Google Drive) para invitar a más gente.</p>
        <Button onClick={() => set({ dashSection: "settings", settingsTab: "storage" })}>Ir a Almacenamiento</Button>
      </div>
    );
  }
  const isOwner = team.owner?.email === me;
  const remove = async (m: TeamMember) => {
    const r = await library.team!.remove(m.email);
    notify(shareMessage(r, lib, m.storageEmail ?? m.email, "quitado"));
  };
  return (
    <div className="dash">
      <header className="dash__head">
        <h1 className="dash__title">Equipo</h1>
        <span className="grow" />
        {team.canInvite ? <Button variant="primary" onClick={() => set({ inviteTo: { access: [] } })}><IconUserPlus size={15} /> Invitar</Button> : null}
      </header>
      <p className="sf-muted team__lead">
        Cada persona entra con su cuenta de Magnific. Lo que le das aquí es lo que ve en Sweet Flow y lo que se le comparte en {storageName(lib) ?? "Dropbox o Google Drive"}: nada más.
        {team.mounted ? ` Estás en «${team.mounted.name}», una carpeta compartida contigo.` : ""}
      </p>
      {!lib.me.email ? <p className="note">Conecta Magnific (Ajustes › Integraciones): tu cuenta de Magnific es quien eres en el equipo.</p> : null}
      {team.myAccess === null ? <p className="note">No estás en el equipo de esta carpeta. Pide a {team.owner?.name ?? "su propietario"} que te invite.</p> : null}

      <div className="team__list">
        {team.owner ? (
          <div className="team__row">
            <Avatar name={team.owner.name} size={32} />
            <div className="team__who"><b>{team.owner.name}{team.owner.email === me && team.owner.name !== "Tú" ? " (tú)" : ""}</b><span className="sf-faint sf-small">{team.owner.email}</span></div>
            <span className="team__access"><IconCrown size={14} /> Propietario · todo</span>
            <span className="team__acts" />
          </div>
        ) : (
          <p className="sf-faint sf-small">Nadie es propietario todavía: lo será el primero que abra la carpeta con Magnific conectada.</p>
        )}
        {team.members.map((m) => {
          const mine = isOwner || m.invitedBy === me;
          return (
            <div key={m.email} className="team__row">
              <Avatar name={m.name} size={32} />
              <div className="team__who">
                <b>{m.name}{m.email === me ? " (tú)" : ""}</b>
                <span className="sf-faint sf-small">{m.email}{m.storageEmail ? ` · ${storageName(lib) ?? "almacenamiento"}: ${m.storageEmail}` : ""}</span>
              </div>
              <span className="team__access" title={accessLabel(lib, m.access)}>{m.access === "all" ? <IconUsersGroup size={14} /> : <IconFolder size={14} />} {accessLabel(lib, m.access)}</span>
              <span className="team__acts">
                {mine ? (
                  <>
                    <Button size="sm" onClick={() => set({ inviteTo: { member: m.email } })}>Cambiar acceso</Button>
                    <Button size="sm" variant="ghost" onClick={() => void remove(m)}>Quitar</Button>
                  </>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>

      {isOwner ? (
        <label className="setting team__setting">
          <input type="checkbox" checked={team.membersCanInvite} onChange={(e) => library.team!.setMembersCanInvite(e.target.checked)} />
          <span><b>Los miembros pueden invitar</b><span className="sf-faint sf-small"> · a lo que tienen ellos. Si lo quitas, solo invitas tú.</span></span>
        </label>
      ) : null}
    </div>
  );
}

/**
 * Invite someone (or change what a member has): their Magnific email, their
 * Dropbox/Drive account if it is another one, and the folders or productions.
 * Opened from Equipo, «Compartir…» on a folder or production, and the team
 * window inside a production.
 */
export function InviteDialog() {
  const target = useStore((s) => s.inviteTo);
  // A fresh form each time it opens.
  return target ? <InviteForm key={JSON.stringify(target)} /> : null;
}

function InviteForm() {
  const target = useStore((s) => s.inviteTo);
  const lib = useStore((s) => s.lib);
  const library = useStore((s) => s.library);
  const set = useStore((s) => s.set);
  const notify = useStore((s) => s.notify);
  const member = target && "member" in target ? lib?.team?.members.find((m) => m.email === target.member) : undefined;
  const [email, setEmail] = useState(member?.email ?? "");
  const [name, setName] = useState(member?.name ?? "");
  const [other, setOther] = useState(!!member?.storageEmail);
  const [storageEmail, setStorageEmail] = useState(member?.storageEmail ?? "");
  const [access, setAccess] = useState<Access>(member?.access ?? (target && "access" in target ? target.access : []));
  const [busy, setBusy] = useState(false);
  if (!target || !lib?.team || !library.team) return null;
  const team = lib.team;
  const close = () => set({ inviteTo: null });
  const valid = (member || /^\S+@\S+\.\S+$/.test(email.trim())) && (access === "all" || access.length > 0) && (!other || /^\S+@\S+\.\S+$/.test(storageEmail.trim()));
  const submit = async () => {
    setBusy(true);
    const to = other ? storageEmail.trim() : email.trim();
    const r = member
      ? await library.team!.setAccess(member.email, access)
      : await library.team!.invite({ email: email.trim(), ...(name.trim() ? { name: name.trim() } : {}), ...(other ? { storageEmail: storageEmail.trim() } : {}), access });
    setBusy(false);
    close();
    notify(shareMessage(r, lib, to));
  };
  const where = lib.storage.kind === "folder" ? storageName(lib) : null;
  return (
    <Modal title={member ? `Acceso de ${member.name}` : "Invitar al equipo"} onClose={close} width={560}>
      {!member ? (
        <div className="sform invite__form">
          <label className="sfield">
            <span>Email de su cuenta de Magnific</span>
            <input className="sf-input" type="email" autoFocus placeholder="nombre@estudio.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="sfield">
            <span>Nombre <span className="sf-faint">(opcional)</span></span>
            <input className="sf-input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="setting">
            <input type="checkbox" checked={other} onChange={(e) => setOther(e.target.checked)} />
            <span>Su {where ?? "Dropbox o Drive"} usa otro email</span>
          </label>
          {other ? (
            <label className="sfield">
              <span>Email de su {where ?? "Dropbox o Drive"}</span>
              <input className="sf-input" type="email" placeholder="nombre@gmail.com" value={storageEmail} onChange={(e) => setStorageEmail(e.target.value)} />
            </label>
          ) : null}
        </div>
      ) : null}
      <div className="sfield"><span>Qué tiene</span></div>
      <AccessPicker lib={lib} value={access} onChange={setAccess} canAll={team.myAccess === "all"} limit={team.myAccess} />
      <p className="sf-faint sf-small invite__note">
        {lib.mode === "demo"
          ? "En la demo se apunta en el equipo, pero no se comparte nada."
          : where
            ? `${where} le compartirá esas carpetas a ${other && storageEmail ? storageEmail : email || "esa persona"} y le avisará. Verá en Sweet Flow y en ${where} solo eso.`
            : "La carpeta del equipo está en este ordenador: tendrás que compartir tú esas carpetas en Dropbox o Drive."}
      </p>
      <div className="modal-foot">
        <Button onClick={close}>Cancelar</Button>
        <Button variant="primary" disabled={!valid || busy} onClick={() => void submit()}>{busy ? "Compartiendo…" : member ? "Guardar" : "Invitar"}</Button>
      </div>
    </Modal>
  );
}

/**
 * Pick folders and productions (a folder gives what is inside it) or the
 * whole team. Only what I have myself.
 */
function AccessPicker({ lib, value, onChange, canAll, limit }: { lib: LibraryState; value: Access; onChange: (a: Access) => void; canAll: boolean; limit: Access | null }) {
  const entries = useMemo(() => lib.entries.filter((e) => !e.trashedAt), [lib.entries]);
  const rows = useMemo(() => {
    const out: Array<{ e: LibraryEntry; depth: number }> = [];
    const walk = (parentId: Id | null, depth: number) => {
      for (const e of entries.filter((x) => x.parentId === parentId).sort((a, b) => Number(a.kind === "production") - Number(b.kind === "production") || a.name.localeCompare(b.name, "es"))) {
        out.push({ e, depth });
        if (e.kind === "folder") walk(e.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [entries]);
  const list = value === "all" ? [] : value;
  const coveredBy = (id: Id) => list.find((o) => o !== id && entryWithin(entries, id, o));
  const toggle = (id: Id) => onChange(list.includes(id) ? list.filter((x) => x !== id) : [...list.filter((x) => !entryWithin(entries, x, id)), id]);
  const allowed = (id: Id) => limit === "all" || (!!limit && limit.some((o) => entryWithin(entries, id, o)));
  return (
    <div className="apick">
      {canAll ? (
        <label className={cx("apick__row", value === "all" && "is-on")}>
          <input type="checkbox" checked={value === "all"} onChange={(e) => onChange(e.target.checked ? "all" : [])} />
          <IconUsersGroup size={15} /> <b>Todo el equipo</b> <span className="sf-faint sf-small">todas las carpetas y producciones</span>
        </label>
      ) : null}
      <div className={cx("apick__list", value === "all" && "is-off")}>
        {rows.length ? rows.map(({ e, depth }) => {
          const inherited = !!coveredBy(e.id);
          return (
            <label key={e.id} className={cx("apick__row", list.includes(e.id) && "is-on")} style={{ paddingLeft: 8 + depth * 18 }}>
              <input type="checkbox" disabled={value === "all" || inherited || !allowed(e.id)} checked={value === "all" || list.includes(e.id) || inherited} onChange={() => toggle(e.id)} />
              {e.kind === "folder" ? <IconFolder size={15} /> : <IconMovie size={15} />} {e.name}
            </label>
          );
        }) : <p className="sf-faint sf-small">Aún no hay carpetas ni producciones.</p>}
      </div>
    </div>
  );
}
