import { useState } from "react";
import { IconCheck, IconClock, IconSend } from "@tabler/icons-react";
import { formatTc, versionTag, type ProdNode } from "@sweetflow/domain";
import { Avatar, Button, cx, IconButton } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { memberName } from "../state/selectors";

export function ReviewTab({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { source, set, playhead, activeMediaId } = useStore();
  const [text, setText] = useState("");
  const [atTime, setAtTime] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const own = snap.media.filter((m) => m.nodeId === node.id && !m.archived).sort((a, b) => b.createdAt - a.createdAt);
  const take = node.selectedTakeId ? snap.takes.find((t) => t.id === node.selectedTakeId) : undefined;
  const target = own.find((m) => m.id === activeMediaId) ?? (take ? snap.media.find((m) => m.id === take.mediaId) : undefined) ?? own[0];
  const list = snap.comments.filter((c) => c.nodeId === node.id && (showResolved || !c.resolved)).sort((a, b) => a.createdAt - b.createdAt);
  const resolved = snap.comments.filter((c) => c.nodeId === node.id && c.resolved).length;

  const send = () => {
    if (!text.trim()) return;
    source.addComment(node.id, text.trim(), target?.id, atTime && target?.kind === "video" ? Math.round(playhead * 10) / 10 : undefined);
    setText("");
  };

  return (
    <div className="tab">
      <div className="comments">
        {list.length === 0 ? <p className="note">Sin comentarios abiertos. Lo que escribas aquí lo verá todo el equipo al momento.</p> : null}
        {list.map((c) => {
          const m = c.mediaId ? snap.media.find((x) => x.id === c.mediaId) : undefined;
          return (
            <div key={c.id} className={cx("comment", c.resolved && "comment--resolved")}>
              <Avatar name={memberName(snap, c.authorId)} size={24} />
              <div className="comment__body">
                <div className="comment__head">
                  <b>{memberName(snap, c.authorId)}</b>
                  <span className="sf-faint sf-small">{new Date(c.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  {m ? <span className="sf-faint sf-small">· {versionTag(m.version)}</span> : null}
                  {c.atSec !== undefined ? (
                    <button className="tc" onClick={() => set({ panelTab: "cut", activeMediaId: c.mediaId ?? null, playhead: c.atSec!, playing: false })}>
                      <IconClock size={11} /> {formatTc(c.atSec)}
                    </button>
                  ) : null}
                </div>
                <div className="comment__text">{c.text}</div>
              </div>
              <IconButton size="sm" label={c.resolved ? "Reabrir" : "Resolver"} onClick={() => source.setCommentResolved(c.id, !c.resolved)}><IconCheck size={13} /></IconButton>
            </div>
          );
        })}
        {resolved ? <button className="link sf-small" onClick={() => setShowResolved(!showResolved)}>{showResolved ? "Ocultar resueltos" : `Ver ${resolved} resuelto${resolved > 1 ? "s" : ""}`}</button> : null}
      </div>
      <div className="composer">
        <textarea className="sf-textarea" rows={2} placeholder={target ? `Comentar ${versionTag(target.version)}…` : "Comentar…"} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
        <div className="composer__row">
          {target?.kind === "video" ? (
            <label className="sf-small sf-muted composer__tc">
              <input type="checkbox" checked={atTime} onChange={(e) => setAtTime(e.target.checked)} /> en {formatTc(playhead)}
            </label>
          ) : <span />}
          <Button size="sm" variant="primary" onClick={send}><IconSend size={13} /> Enviar</Button>
        </div>
      </div>
    </div>
  );
}
