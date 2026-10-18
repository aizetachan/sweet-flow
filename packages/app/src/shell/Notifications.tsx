/**
 * Notifications of the open production (docs/INTERFAZ.md §2.6): comments that
 * mention you and replies to your comments, written by someone else. They
 * arrive with the team folder's sync. Read ones are remembered on this
 * computer; opening one goes to its shot, version and moment.
 */

import { useState } from "react";
import { IconBell } from "@tabler/icons-react";
import { formatTc, type Comment, type Id } from "@sweetflow/domain";
import { Avatar, cx, IconButton } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { memberName } from "../state/selectors";
import { Popover } from "../components/Popover";
import { nameOf } from "../state/names";

const KEY = (productionId: Id) => `sweetflow:read:${productionId}`;

function readSet(productionId: Id): Set<Id> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY(productionId)) ?? "[]") as Id[]);
  } catch {
    return new Set();
  }
}

function saveRead(productionId: Id, ids: Set<Id>): void {
  try {
    localStorage.setItem(KEY(productionId), JSON.stringify([...ids].slice(-2000)));
  } catch {
    // Only a convenience: they would show as unread again.
  }
}

/** What concerns me: mentioned, or answered on a thread I wrote. */
export function notificationsFor(comments: Comment[], me: Id): Comment[] {
  const authors = new Map(comments.map((c) => [c.id, c.authorId]));
  return comments
    .filter((c) => c.authorId !== me && (c.mentions?.includes(me) || (!!c.parentId && authors.get(c.parentId) === me)))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function Notifications() {
  const snap = useSnap();
  const productionId = useStore((s) => s.productionId);
  const [read, setRead] = useState(() => (productionId ? readSet(productionId) : new Set<Id>()));
  if (!productionId) return null;
  const items = notificationsFor(snap.comments, snap.me.uid);
  const unread = items.filter((c) => !read.has(c.id)).length;
  const mark = (ids: Id[]) => {
    const next = new Set([...read, ...ids]);
    setRead(next);
    saveRead(productionId, next);
  };
  const open = (c: Comment) => {
    mark([c.id]);
    const st = useStore.getState();
    st.select(c.nodeId, "review");
    st.set({ activeMediaId: c.mediaId ?? null, ...(c.atSec !== undefined ? { playhead: c.atSec, playing: false } : {}) });
  };

  return (
    <Popover align="right" className="notif" button={({ open: isOpen, toggle }) => (
      <span className="notif__btn">
        <IconButton label={unread ? `${unread} aviso${unread === 1 ? "" : "s"} sin leer` : "Avisos"} on={isOpen} onClick={toggle}>
          <IconBell size={17} stroke={1.6} />
        </IconButton>
        {unread ? <span className="notif__count">{unread > 9 ? "9+" : unread}</span> : null}
      </span>
    )}>
      <div className="notif__head">
        <span className="menu__title">Avisos</span>
        {unread ? <button className="link sf-small" onClick={() => mark(items.map((c) => c.id))}>Marcar todo como leído</button> : null}
      </div>
      {items.length ? (
        <div className="notif__list">
          {items.slice(0, 40).map((c) => {
            const node = snap.nodes.find((n) => n.id === c.nodeId);
            const isReply = !!c.parentId && !c.mentions?.includes(snap.me.uid);
            return (
              <button key={c.id} className={cx("menu__item notif__item", !read.has(c.id) && "notif__item--new")} onClick={() => open(c)}>
                <Avatar name={memberName(snap, c.authorId)} size={22} />
                <span className="notif__body">
                  <span className="sf-small">
                    <b>{memberName(snap, c.authorId)}</b> {isReply ? "respondió a tu comentario" : "te mencionó"}
                    {node ? <> en <b>{nameOf(snap.production, node)}</b></> : null}
                    {c.atSec !== undefined ? <span className="sf-faint"> · {formatTc(c.atSec)}</span> : null}
                  </span>
                  <span className="notif__text">{c.text}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="sf-faint sf-small notif__empty">Aquí verás cuando alguien te mencione con @ o responda a tus comentarios.</p>
      )}
    </Popover>
  );
}
