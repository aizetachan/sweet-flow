/**
 * Review (docs/INTERFAZ.md §2.6): comments on a shot's versions, at a moment
 * of a video (marked on its timeline) or at a point of the picture (a
 * numbered pin), in threads with replies, resolved when done. @ mentions
 * someone of the production: they get it in their notifications.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconArrowBackUp, IconArrowForwardUp, IconCheck, IconClock, IconMapPin, IconSend, IconTrash, IconX } from "@tabler/icons-react";
import { codeOf, formatTc, versionTag, type Comment, type Id, type Media, type Member, type ProdNode } from "@sweetflow/domain";
import { Avatar, avatarColor, Button, cx, IconButton, Modal } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { coverOf, memberName } from "../state/selectors";
import { usePanel } from "./panel";
import { OnStage } from "./stage";
import { Player, Thumb } from "../components/media";
import type { Mark } from "../components/marks";

export function ReviewTab({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { source } = useStore();
  const { setPanel, playhead, playing, activeMediaId } = usePanel();
  const [showResolved, setShowResolved] = useState(false);
  // A click on the picture marks a point, a drag an area: always on, the fewest clicks.
  const [mark, setMark] = useState<Mark | null>(null);
  const [focus, setFocus] = useState<Id | null>(null);

  // What is reviewed: the version open in the panel, else what the shot is now.
  const versions = snap.media.filter((m) => m.nodeId === node.id && !m.archived && m.status === "ready").sort((a, b) => b.createdAt - a.createdAt);
  const cover = coverOf(snap, node);
  const target = versions.find((m) => m.id === activeMediaId) ?? cover.media ?? versions[0];
  const range = target && cover.take && cover.media?.id === target.id && target.nodeId !== node.id ? cover.take : undefined;
  // The moment on screen (a stretch of another video starts at its in-point).
  const time = range ? Math.min(Math.max(playhead, range.inSec), range.outSec) : playhead;

  const all = snap.comments.filter((c) => c.nodeId === node.id);
  const roots = all.filter((c) => !c.parentId);
  // Marks carry who left them (initial and colour), not numbers that go out of order.
  const who = (uid: Id) => memberName(snap, uid);
  const onTarget = roots.filter((c) => c.mediaId === target?.id);
  const visible = roots
    .filter((c) => showResolved || !c.resolved)
    // In the order they were written, always: they never change places.
    .sort((a, b) => a.createdAt - b.createdAt);
  const resolvedCount = roots.filter((c) => c.resolved).length;

  useEffect(() => setMark(null), [node.id, target?.id]);

  const goTo = (c: Comment) => {
    setFocus(c.id);
    setPanel({ activeMediaId: c.mediaId ?? null, ...(c.atSec !== undefined ? { playhead: c.atSec, playing: false } : {}) });
  };

  return (
    <div className="tab">
      {target ? (
        <OnStage>
          <section className="sec sec--viewer">
            <Player media={target} time={time} playing={playing} range={range}
              onTime={(t) => setPanel({ playhead: t })} onPlaying={(v) => setPanel({ playing: v })}
              markers={target.kind === "video" ? onTarget.filter((c) => c.atSec !== undefined && (showResolved || !c.resolved)).map((c) => ({
                id: c.id, atSec: c.atSec!, color: avatarColor(who(c.authorId)), title: `${who(c.authorId)}: ${c.text.slice(0, 60)}`, on: focus === c.id, onClick: () => setFocus(c.id), resolved: c.resolved,
              })) : undefined}
              pins={[
                ...onTarget
                  .filter((c) => (c.point || c.area) && (showResolved || !c.resolved))
                  // On a video, a pin shows around its moment.
                  .filter((c) => target.kind !== "video" || c.atSec === undefined || Math.abs(c.atSec - time) < 0.6)
                  .map((c) => ({
                    id: c.id,
                    ...(c.area ?? c.point!),
                    label: initial(who(c.authorId)),
                    color: avatarColor(who(c.authorId)),
                    on: focus === c.id,
                    onClick: () => goTo(c),
                    // The author can drag it to a better place.
                    ...(c.authorId === snap.me.uid ? { onMove: (m: Mark) => source.moveCommentMark(c.id, markOf(m)) } : {}),
                  })),
                ...(mark ? [{ id: "new", ...mark, label: initial(snap.me.displayName), on: true, onMove: setMark }] : []),
              ]}
              onPoint={target.kind !== "audio" ? setMark : undefined} />
            {versions.length > 1 ? (
              <div className="review__versions">
                <span className="sf-faint sf-small">Revisando</span>
                <select className="sf-select" value={target.id} onChange={(e) => setPanel({ activeMediaId: e.target.value, playhead: 0, playing: false })}>
                  {versions.map((m) => <option key={m.id} value={m.id}>{mediaLabel(m)}{m.id === cover.media?.id ? " · elegida" : ""}</option>)}
                </select>
              </div>
            ) : null}
          </section>
        </OnStage>
      ) : null}

      <Composer node={node} mediaId={target?.id} isVideo={target?.kind === "video"} playhead={time} onTyping={() => setPanel({ playing: false })}
        mark={mark} onClearMark={() => setMark(null)} canMark={!!target && target.kind !== "audio"}
        onSent={() => setMark(null)} onCancel={() => setMark(null)} />

      <section className="sec">
        <div className="sec__head">
          <h4>Comentarios{roots.length ? ` · ${roots.length - resolvedCount} abiertos` : ""}</h4>
          {resolvedCount ? <button className="link sf-small" onClick={() => setShowResolved(!showResolved)}>{showResolved ? "Ocultar resueltos" : `Ver resueltos (${resolvedCount})`}</button> : null}
        </div>
        {visible.length === 0 ? <p className="note">Sin comentarios abiertos. Lo que escribas lo verá el equipo; con @ avisas a alguien.</p> : null}
        <div className="threads">
          {visible.map((c) => (
            <Thread key={c.id} c={c} replies={all.filter((r) => r.parentId === c.id).sort((a, b) => a.createdAt - b.createdAt)}
              node={node} on={focus === c.id} other={c.mediaId !== target?.id} onGo={() => goTo(c)} onDelete={(id) => source.deleteComment(id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Thread({ c, replies, node, on, other, onGo, onDelete }: {
  c: Comment;
  replies: Comment[];
  node: ProdNode;
  on: boolean;
  other: boolean;
  onGo: () => void;
  onDelete: (id: Id) => void;
}) {
  const snap = useSnap();
  const { source } = useStore();
  const [replying, setReplying] = useState(false);
  const m = c.mediaId ? snap.media.find((x) => x.id === c.mediaId) : undefined;
  // Newer versions of this shot it can be taken to (worked on there).
  const newer = m ? snap.media.filter((x) => x.nodeId === node.id && x.id !== m.id && !x.archived && x.status === "ready" && x.createdAt > m.createdAt).sort((a, b) => b.createdAt - a.createdAt) : [];
  const trail = (c.history ?? []).map((h) => snap.media.find((x) => x.id === h.mediaId)).filter((x): x is Media => !!x);
  /** Opens that version in the viewer. */
  const { setPanel } = usePanel();
  const show = (id: Id) => setPanel({ activeMediaId: id, playing: false, ...(c.atSec !== undefined ? { playhead: c.atSec } : {}) });
  const takeTo = (id: Id) => {
    const to = snap.media.find((x) => x.id === id);
    source.moveCommentToVersion(c.id, id);
    setPanel({ activeMediaId: id });
    useStore.getState().notify(`Comentario llevado a ${to ? versionTag(to.version) : "la nueva versión"}: la conversación sigue ahí.`);
  };
  return (
    // A click anywhere on it (not on its buttons) goes to its frame and lights its mark.
    <div className={cx("thread", c.resolved && "thread--resolved", on && "thread--on")}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button, textarea, input, a")) onGo(); }}>
      <CommentLine c={c} onDelete={onDelete} head={
        <>
          {/* Where it has been: v001 → v002 when it was worked on in a newer version. */}
          {/* Each version a link: a click opens it in the viewer (the current one stands out). */}
          {trail.length && m ? (
            <span className="vtrail" title="Versiones por las que ha pasado: clic para verla">
              {[...trail, m].map((v, i, all) => (
                <span key={v.id + i} className="vtrail__step">
                  {i ? <span className="vtrail__arrow">→</span> : null}
                  <button className={cx("vtrail__v", i === all.length - 1 && "vtrail__v--now")} onClick={(e) => { e.stopPropagation(); show(v.id); }}>{mediaLabel(v)}</button>
                </span>
              ))}
            </span>
          ) : m && other ? (
            <button className="vtrail__v" title="Ver esta versión" onClick={(e) => { e.stopPropagation(); show(m.id); }}>{mediaLabel(m)}</button>
          ) : null}
          {c.atSec !== undefined ? <button className="tc" onClick={onGo}><IconClock size={11} /> {formatTc(c.atSec)}</button> : null}
          {c.point || c.area ? <span className="tc tc--plain" title={c.area ? "Área señalada en la imagen" : "Punto señalado en la imagen"}><IconMapPin size={11} /></span> : null}
        </>
      } />
      {replies.map((r) => <CommentLine key={r.id} c={r} reply onDelete={onDelete} />)}
      <div className="thread__acts">
        <button className="link sf-small" onClick={() => setReplying(!replying)}><IconArrowBackUp size={12} /> Responder</button>
        <button className="link sf-small" onClick={() => source.setCommentResolved(c.id, !c.resolved)}>
          <IconCheck size={12} /> {c.resolved ? "Reabrir" : "Resolver"}
        </button>
      </div>
      {replying ? (
        <Composer node={node} parentId={c.id} mediaId={c.mediaId} compact autoFocus onSent={() => setReplying(false)} onCancel={() => setReplying(false)}
          versions={m && newer.length ? [m, ...[...newer].reverse()] : undefined} onVersion={(id) => { if (id !== c.mediaId) takeTo(id); }} />
      ) : null}
    </div>
  );
}

function CommentLine({ c, head, reply, onDelete }: { c: Comment; head?: ReactNode; reply?: boolean; onDelete: (id: Id) => void }) {
  const snap = useSnap();
  const mine = c.authorId === snap.me.uid;
  return (
    <div className={cx("comment", reply && "comment--reply")}>
      <CommentPin name={memberName(snap, c.authorId)} size={reply ? 20 : 24} />
      <div className="comment__body">
        <div className="comment__head">
          <b>{memberName(snap, c.authorId)}</b>
          {head}
          <span className="sf-faint sf-small">{ago(c.createdAt)}</span>
        </div>
        <div className="comment__text"><MentionText text={c.text} members={snap.members} /></div>
      </div>
      {mine ? <IconButton size="sm" className="comment__del" label="Borrar" onClick={() => onDelete(c.id)}><IconTrash size={12} /></IconButton> : null}
    </div>
  );
}

/** «Imagen v001», «Vídeo v002»: versions count per kind, so the kind tells two v001 apart. */
function mediaLabel(m?: Media): string {
  if (!m) return "—";
  return `${m.kind === "video" ? "Vídeo" : m.kind === "audio" ? "Audio" : "Imagen"} ${versionTag(m.version)}`;
}

/**
 * Which version the thread goes on: the shot's versions in a medium-size
 * window, as a gallery, to pick the right one seeing it.
 */
function VersionPicker({ versions, current, picked, onPick, onClose }: { versions: Media[]; current?: Id; picked?: Id; onPick: (id: Id) => void; onClose: () => void }) {
  const snap = useSnap();
  return (
    <Modal title="¿En qué versión sigue este comentario?" onClose={onClose} width={720}>
      <p className="sf-muted modal-lead">Si se ha trabajado en una versión nueva, elígela: al enviar, el comentario y su conversación pasan a ella.</p>
      <div className="vpick">
        {[...versions].sort((a, b) => b.createdAt - a.createdAt).map((v) => (
          <button key={v.id} className={cx("vpick__item", v.id === picked && "vpick__item--on")} onClick={() => onPick(v.id)}>
            <Thumb media={v} preview badge={false} />
            <span className="vpick__meta">
              <b>{mediaLabel(v)}</b>
              {v.id === current ? <span className="vpick__tag">La de este comentario</span> : null}
            </span>
            <span className="sf-faint sf-small">
              {v.generation?.model ?? "Subido"} · {memberName(snap, v.createdBy)} · {new Date(v.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** The comment mark (three round corners, the bottom left one a point) with who left it: the same as on the picture. */
function CommentPin({ name, size }: { name: string; size: number }) {
  return <span className="cpin" title={name} style={{ width: size, height: size, fontSize: size * 0.46, background: avatarColor(name) }}>{initial(name)}</span>;
}

/** The text with each @Name of someone in the production highlighted. */
function MentionText({ text, members }: { text: string; members: Member[] }) {
  const names = members.map((m) => m.displayName).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return <>{text}</>;
  const re = new RegExp(`(@(?:${names.map(escapeRe).join("|")}))`, "g");
  return <>{text.split(re).map((part, i) => (part.startsWith("@") && names.includes(part.slice(1)) ? <span key={i} className="mention">{part}</span> : part))}</>;
}

/**
 * Writing a comment or a reply. «@» opens the people of the production to
 * mention; on a video it is tied to the current moment (switchable); «Marcar
 * punto» then a click on the picture ties it to that point.
 */
export function Composer({ node, mediaId, parentId, isVideo, playhead = 0, mark, onClearMark, canMark, compact, onSent, autoFocus, onTyping, onCancel, versions, onVersion }: {
  node: ProdNode;
  mediaId?: Id;
  parentId?: Id;
  isVideo?: boolean;
  playhead?: number;
  /** The point or area marked on the viewer, if any. */
  mark?: Mark | null;
  onClearMark?: () => void;
  /** Says how to mark (the viewer takes the clicks). */
  canMark?: boolean;
  compact?: boolean;
  onSent: () => void;
  autoFocus?: boolean;
  /** Called on the first key: the viewer pauses so the moment stays put. */
  onTyping?: () => void;
  /** Esc. */
  onCancel?: () => void;
  /**
   * Replying, when the shot has newer versions: which one the thread goes on
   * in. Picking a newer one takes the comment there when the reply is sent.
   */
  versions?: Media[];
  onVersion?: (mediaId: Id) => void;
}) {
  const snap = useSnap();
  const { source } = useStore();
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [onMedia, setOnMedia] = useState(mediaId);
  const [choosing, setChoosing] = useState(false);
  const [pick, setPick] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Who can be mentioned: everyone who works on this production (they have its folder).
  const people = snap.members.filter((m) => m.uid !== snap.me.uid);
  const query = /(^|\s)@([\p{L}\p{N}._-]*)$/u.exec(text.slice(0, caret))?.[2];
  const matches = query === undefined ? [] : people.filter((m) => m.displayName.toLowerCase().includes(query.toLowerCase())).slice(0, 6);
  useEffect(() => setPick(0), [query]);

  const mention = (m: Member) => {
    const before = text.slice(0, caret).replace(/@([\p{L}\p{N}._-]*)$/u, `@${m.displayName} `);
    const next = before + text.slice(caret);
    setText(next);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(before.length, before.length);
      setCaret(before.length);
    });
  };

  const send = () => {
    const body = text.trim();
    if (!body) return;
    const mentions = snap.members.filter((m) => m.uid !== snap.me.uid && body.includes(`@${m.displayName}`)).map((m) => m.uid);
    // Worked on in a newer version: the thread goes there first, and the reply with it.
    if (onMedia && onMedia !== mediaId) onVersion?.(onMedia);
    source.addComment({
      nodeId: node.id,
      text: body,
      mediaId: onMedia,
      parentId,
      mentions,
      // On a video it is always tied to the moment on screen.
      ...(!parentId && isVideo ? { atSec: Math.round(playhead * 10) / 10 } : {}),
      ...(!parentId && mark ? markOf(mark) : {}),
    });
    setText("");
    onSent();
  };

  return (
    <div className={cx("composer", compact && "composer--compact")}>
      <div className="composer__field">
        <textarea ref={ref} className="sf-textarea" rows={compact ? 1 : 2} autoFocus={autoFocus}
          placeholder={parentId ? "Responder… (@ para avisar a alguien)" : `Comentar ${codeOf(snap.production, node)}… (@ para avisar a alguien)`}
          value={text}
          onChange={(e) => { if (!text) onTyping?.(); setText(e.target.value); setCaret(e.target.selectionStart); }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (matches.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); return setPick((pick + 1) % matches.length); }
              if (e.key === "ArrowUp") { e.preventDefault(); return setPick((pick - 1 + matches.length) % matches.length); }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); return mention(matches[pick]!); }
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            if (e.key === "Escape") { setText(""); onCancel?.(); }
          }} />
        {matches.length ? (
          <div className="menu mentions">
            {matches.map((m, i) => (
              <button key={m.uid} className={cx("menu__item", i === pick && "is-active")} onMouseDown={(e) => { e.preventDefault(); mention(m); }}>
                <Avatar name={m.displayName} size={18} /> <span className="menu__label">{m.displayName}<span className="menu__hint">{m.email}</span></span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="composer__row">
        {versions?.length ? (
          <button className={cx("composer__ver sf-small", onMedia !== mediaId && "is-on")} title="¿Se ha trabajado en una versión nueva? Elígela: el comentario y su conversación pasan a ella al enviar"
            onClick={() => setChoosing(true)}>
            <IconArrowForwardUp size={12} /> En {mediaLabel(versions.find((v) => v.id === onMedia))}{onMedia !== mediaId ? " (nueva)" : ""}
          </button>
        ) : null}
        {choosing && versions ? (
          <VersionPicker versions={versions} current={mediaId} picked={onMedia} onPick={(id) => { setOnMedia(id); setChoosing(false); }} onClose={() => setChoosing(false)} />
        ) : null}
        {!parentId && isVideo ? (
          <span className="sf-small sf-muted composer__tc" title="Queda en este momento del vídeo"><IconClock size={12} /> {formatTc(playhead)}</span>
        ) : null}
        {!parentId && mark ? (
          <span className="composer__point sf-small">
            <IconMapPin size={12} /> {mark.w ? "Área marcada" : "Punto marcado"}
            <button aria-label="Quitar la marca" onClick={onClearMark}><IconX size={11} /></button>
          </span>
        ) : !parentId && canMark ? (
          <span className="sf-faint sf-small">Clic o arrastra sobre la imagen para señalar</span>
        ) : null}
        <span className="composer__spacer" />
        {/* Changed your mind: nothing is kept, neither the text nor the mark. */}
        {text.trim() || mark || compact ? (
          <Button size="sm" variant="ghost" title="Descartar (Esc)" onClick={() => { setText(""); onCancel?.(); }}>Cancelar</Button>
        ) : null}
        <Button size="sm" variant="primary" onClick={send} disabled={!text.trim()} title="Enviar (⌘↵)"><IconSend size={13} /> Enviar</Button>
      </div>
    </div>
  );
}

/** A mark as a comment keeps it: a point, or an area (with its size). */
function markOf(m: Mark): Pick<Comment, "point" | "area"> {
  return m.w && m.h ? { area: { x: m.x, y: m.y, w: m.w, h: m.h } } : { point: { x: m.x, y: m.y } };
}

const initial = (name: string) => name.trim().slice(0, 1).toUpperCase() || "·";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(t).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}
