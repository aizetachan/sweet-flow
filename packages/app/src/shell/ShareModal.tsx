/**
 * «Compartir» in the production (docs/USUARIOS.md §4): the team who works on
 * it, and the client. The client never gets the team folder: they will see a
 * review page with only the shots marked «Mostrar al cliente», where they
 * comment and mark «Validado». Nothing is shown to them by default.
 *
 * What the client page needs (a small server) is parked, so the link and the
 * invitation emails show as «Próximamente»; who is invited, how they get in
 * and what they see are kept in the production already.
 */

import { useState } from "react";
import { IconEye, IconLink, IconMail, IconUserPlus, IconX } from "@tabler/icons-react";
import { normEmail, type ClientEntry } from "@sweetflow/domain";
import { AvatarStack, Button, cx, IconButton, Modal } from "@sweetflow/ui";
import { entryWithin } from "../data/folder/folderEntries";
import { useSnap, useStore } from "../state/store";
import { nameOf } from "../state/names";

const ENTRIES: Array<{ id: ClientEntry; title: string; detail: string }> = [
  { id: "invite", title: "Por invitación", detail: "Le llega un correo y solo entra quien está invitado. Lo más seguro, para empresas." },
  { id: "link-name", title: "Con el enlace y su nombre", detail: "Quien tenga el enlace entra y comenta poniendo su nombre." },
  { id: "link-name-email", title: "Con el enlace, su nombre y su correo", detail: "Igual, pero deja también su correo (para avisarle de respuestas)." },
];

export function ShareModal({ onClose }: { onClose: () => void }) {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const set = useStore((s) => s.set);
  const notify = useStore((s) => s.notify);
  const lib = useStore((s) => s.lib);
  const productionId = useStore((s) => s.productionId);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const p = snap.production;
  const client = p.client ?? { entry: "invite" as const, guests: [] };
  const shown = snap.nodes.filter((n) => n.forClient && !n.trashedAt);

  // The team on this production (docs/USUARIOS.md §2).
  const team = lib?.team;
  const entries = lib?.entries ?? [];
  const people = team && productionId
    ? [
        ...(team.owner ? [team.owner.name] : []),
        ...team.members.filter((m) => m.access === "all" || m.access.some((a) => entryWithin(entries, productionId, a))).map((m) => m.name),
      ]
    : snap.members.map((m) => m.displayName);

  const add = () => {
    try {
      source.addClientGuest(email, name);
      setEmail("");
      setName("");
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal title={`Compartir «${p.name}»`} onClose={onClose} width={620}>
      <section className="share__sec">
        <h3>Equipo</h3>
        <div className="share__team">
          <AvatarStack names={people} size={24} max={6} />
          <span className="sf-muted sf-small grow">{people.length === 1 ? "1 persona trabaja" : `${people.length} personas trabajan`} en esta producción, con acceso a su carpeta.</span>
          <Button size="sm" disabled={!team?.canInvite || !productionId} title={!team ? "Necesita una carpeta del equipo" : undefined}
            onClick={() => { onClose(); set({ inviteTo: { access: [productionId!] } }); }}><IconUserPlus size={14} /> Invitar al equipo</Button>
        </div>
      </section>

      <section className="share__sec">
        <h3>Cliente</h3>
        <p className="sf-muted sf-small share__lead">
          El cliente no entra en Dropbox ni Drive: verá una página con lo que tú le muestres, y podrá comentar y marcar «Validado». Por defecto no ve nada.
        </p>

        <div className="share__label">Cómo entra</div>
        <div className="share__entries" role="radiogroup">
          {ENTRIES.map((e) => (
            <button key={e.id} role="radio" aria-checked={client.entry === e.id} className={cx("share__entry", client.entry === e.id && "is-on")} onClick={() => source.setClientEntry(e.id)}>
              <b>{e.title}</b>
              <span className="sf-faint sf-small">{e.detail}</span>
            </button>
          ))}
        </div>

        {client.entry === "invite" ? (
          <>
            <div className="share__label">Invitados</div>
            <div className="share__add">
              <input className="sf-input grow" type="email" placeholder="correo@cliente.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
              <input className="sf-input share__name" placeholder="Nombre (opcional)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
              <Button size="sm" disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} onClick={add}>Añadir</Button>
            </div>
            {client.guests.length ? (
              <div className="share__list">
                {client.guests.map((g) => (
                  <div key={g.email} className="share__row">
                    <IconMail size={14} className="sf-faint" />
                    <span className="grow">{g.name ? <><b>{g.name}</b> <span className="sf-faint">{g.email}</span></> : g.email}</span>
                    <IconButton size="sm" label="Quitar" onClick={() => source.removeClientGuest(normEmail(g.email))}><IconX size={13} /></IconButton>
                  </div>
                ))}
              </div>
            ) : <p className="sf-faint sf-small">Nadie invitado todavía.</p>}
          </>
        ) : null}

        <div className="share__label">Lo que ve</div>
        {shown.length ? (
          <div className="share__list">
            {shown.map((n) => (
              <div key={n.id} className="share__row">
                <IconEye size={14} className="sf-faint" />
                <span className="grow">{nameOf(p, n)}</span>
                <IconButton size="sm" label="Dejar de mostrar al cliente" onClick={() => source.setForClient([n.id], false)}><IconX size={13} /></IconButton>
              </div>
            ))}
          </div>
        ) : <p className="sf-faint sf-small">Nada todavía. Haz clic derecho en un plano (o en un grupo) › Mostrar al cliente.</p>}

        <div className="share__label">Enlace</div>
        <div className="share__link">
          <IconLink size={14} className="sf-faint" />
          <span className="sf-faint sf-small grow">El enlace y el envío de invitaciones llegarán con la página de revisión del cliente.</span>
          <span className="sbadge">Próximamente</span>
        </div>
      </section>
    </Modal>
  );
}
