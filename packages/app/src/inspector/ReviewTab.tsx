/**
 * Review (docs/INTERFAZ.md §2.6): comments on a shot's versions, at a moment
 * of a video (marked on its timeline) or at a point of the picture (a
 * numbered pin), in threads with replies, resolved when done. @ mentions
 * someone of the production: they get it in their notifications.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IconArrowBackUp, IconCheck, IconClock, IconMapPin, IconSend, IconTrash, IconX } from "@tabler/icons-react";
import { codeOf, formatTc, versionTag, type Comment, type Id, type Member, type ProdNode } from "@sweetflow/domain";
import { Avatar, Button, cx, IconButton } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { coverOf, memberName } from "../state/selectors";
import { usePanel } from "./panel";
import { OnStage } from "./stage";
import { Player } from "../components/media";

export function ReviewTab({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { source } = useStore();
  const { setPanel, playhead, playing, activeMediaId } = usePanel();
  const [showResolved, setShowResolved] = useState(false);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [picking, setPicking] = useState(false);
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
  // Numbers per version, in the order they were written: they label pins and timeline marks.
  const numbered = useMemo(() => {
    const map = new Map<Id, number>();
    const byMedia = new Map<string, Comment[]>();
    for (const c of [...roots].sort((a, b) => a.createdAt - b.createdAt)) {
      const k = c.mediaId ?? "";
      byMedia.set(k, [...(byMedia.get(k) ?? []), c]);
    }
    for (const list of byMedia.values()) list.forEach((c, i) => map.set(c.id, i + 1));
    return map;
  }, [roots]);
  const onTarget = roots.filter((c) => c.mediaId === target?.id);
  const visible = roots
    .filter((c) => showResolved || !c.resolved)
    .sort((a, b) => (a.mediaId === target?.id ? 0 : 1) - (b.mediaId === target?.id ? 0 : 1) || (a.atSec ?? 1e9) - (b.atSec ?? 1e9) || a.createdAt - b.createdAt);
  const resolvedCount = roots.filter((c) => c.resolved).length;

  useEffect(() => { setPoint(null); setPicking(false); }, [node.id, target?.id]);

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
              markers={target.kind === "video" ? onTarget.filter((c) => c.atSec !== undefined && (showResolved || !c.resolved)).map((c) => ({ id: c.id, atSec: c.atSec!, n: numbered.get(c.id)!, resolved: c.resolved })) : undefined}
              pins={[
                ...onTarget
                  .filter((c) => c.point && (showResolved || !c.resolved))
                  // On a video, a pin shows around its moment.
                  .filter((c) => target.kind !== "video" || c.atSec === undefined || Math.abs(c.atSec - time) < 0.6)
                  .map((c) => ({ id: c.id, x: c.point!.x, y: c.point!.y, n: numbered.get(c.id)!, on: focus === c.id, onClick: () => goTo(c) })),
                ...(point ? [{ id: "new", x: point.x, y: point.y, n: onTarget.length + 1, on: true }] : []),
              ]}
              onPoint={picking ? (x, y) => { setPoint({ x, y }); setPicking(false); } : undefined} />
            {versions.length > 1 ? (
              <div className="review__versions">
                <span className="sf-faint sf-small">Revisando</span>
                <select className="sf-select" value={target.id} onChange={(e) => setPanel({ activeMediaId: e.target.value, playhead: 0, playing: false })}>
                  {versions.map((m) => <option key={m.id} value={m.id}>{versionTag(m.version)}{m.id === cover.media?.id ? " · elegida" : ""}</option>)}
                </select>
              </div>
            ) : null}
          </section>
        </OnStage>
      ) : null}

      <Composer node={node} mediaId={target?.id} isVideo={target?.kind === "video"} playhead={time}
        point={point} picking={picking} onPick={() => setPicking(!picking)} onClearPoint={() => setPoint(null)} canPoint={!!target && target.kind !== "audio"}
        onSent={() => setPoint(null)} />

      <section className="sec">
        <div className="sec__head">
          <h4>Comentarios{roots.length ? ` · ${roots.length - resolvedCount} abiertos` : ""}</h4>
          {resolvedCount ? <button className="link sf-small" onClick={() => setShowResolved(!showResolved)}>{showResolved ? "Ocultar resueltos" : `Ver resueltos (${resolvedCount})`}</button> : null}
        </div>
        {visible.length === 0 ? <p className="note">Sin comentarios abiertos. Lo que escribas lo verá el equipo; con @ avisas a alguien.</p> : null}
        <div className="threads">
          {visible.map((c) => (
            <Thread key={c.id} c={c} n={numbered.get(c.id)!} replies={all.filter((r) => r.parentId === c.id).sort((a, b) => a.createdAt - b.createdAt)}
              node={node} on={focus === c.id} other={c.mediaId !== target?.id} onGo={() => goTo(c)} onDelete={(id) => source.deleteComment(id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Thread({ c, n, replies, node, on, other, onGo, onDelete }: {
  c: Comment;
  n: number;
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
  return (
    <div className={cx("thread", c.resolved && "thread--resolved", on && "thread--on")}>
      <CommentLine c={c} onDelete={onDelete} head={
        <>
          <button className="thread__n" title="Ir al comentario" onClick={onGo}>{n}</button>
          {m && other ? <span className="sf-faint sf-small">{versionTag(m.version)}</span> : null}
          {c.atSec !== undefined ? <button className="tc" onClick={onGo}><IconClock size={11} /> {formatTc(c.atSec)}</button> : null}
          {c.point ? <span className="tc tc--plain" title="Señalado en la imagen"><IconMapPin size={11} /></span> : null}
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
        <Composer node={node} parentId={c.id} mediaId={c.mediaId} compact onSent={() => setReplying(false)} />
      ) : null}
    </div>
  );
}

function CommentLine({ c, head, reply, onDelete }: { c: Comment; head?: ReactNode; reply?: boolean; onDelete: (id: Id) => void }) {
  const snap = useSnap();
  const mine = c.authorId === snap.me.uid;
  return (
    <div className={cx("comment", reply && "comment--reply")}>
      <Avatar name={memberName(snap, c.authorId)} size={reply ? 20 : 24} />
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
function Composer({ node, mediaId, parentId, isVideo, playhead = 0, point, picking, onPick, onClearPoint, canPoint, compact, onSent }: {
  node: ProdNode;
  mediaId?: Id;
  parentId?: Id;
  isVideo?: boolean;
  playhead?: number;
  point?: { x: number; y: number } | null;
  picking?: boolean;
  onPick?: () => void;
  onClearPoint?: () => void;
  canPoint?: boolean;
  compact?: boolean;
  onSent: () => void;
}) {
  const snap = useSnap();
  const { source } = useStore();
  const [text, setText] = useState("");
  const [atTime, setAtTime] = useState(true);
  const [caret, setCaret] = useState(0);
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
    source.addComment({
      nodeId: node.id,
      text: body,
      mediaId,
      parentId,
      mentions,
      ...(!parentId && isVideo && atTime ? { atSec: Math.round(playhead * 10) / 10 } : {}),
      ...(!parentId && point ? { point } : {}),
    });
    setText("");
    onSent();
  };

  return (
    <div className={cx("composer", compact && "composer--compact")}>
      <div className="composer__field">
        <textarea ref={ref} className="sf-textarea" rows={compact ? 1 : 2}
          placeholder={parentId ? "Responder… (@ para avisar a alguien)" : `Comentar ${codeOf(snap.production, node)}… (@ para avisar a alguien)`}
          value={text}
          onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart); }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (matches.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); return setPick((pick + 1) % matches.length); }
              if (e.key === "ArrowUp") { e.preventDefault(); return setPick((pick - 1 + matches.length) % matches.length); }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); return mention(matches[pick]!); }
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
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
        {!parentId && isVideo ? (
          <label className="sf-small sf-muted composer__tc" title="Atar el comentario a este momento del vídeo">
            <input type="checkbox" checked={atTime} onChange={(e) => setAtTime(e.target.checked)} /> <IconClock size={12} /> {formatTc(playhead)}
          </label>
        ) : null}
        {!parentId && canPoint ? (
          point ? (
            <span className="composer__point sf-small">
              <IconMapPin size={12} /> Punto marcado
              <button aria-label="Quitar el punto" onClick={onClearPoint}><IconX size={11} /></button>
            </span>
          ) : (
            <button className={cx("composer__pickbtn sf-small", picking && "is-on")} onClick={onPick} title="Señalar un punto de la imagen">
              <IconMapPin size={12} /> {picking ? "Clic en la imagen…" : "Marcar punto"}
            </button>
          )
        ) : null}
        <span className="composer__spacer" />
        <Button size="sm" variant="primary" onClick={send} disabled={!text.trim()} title="Enviar (⌘↵)"><IconSend size={13} /> Enviar</Button>
      </div>
    </div>
  );
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function ago(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Date(t).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}
