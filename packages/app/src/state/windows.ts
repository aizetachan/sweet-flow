/**
 * Popped-out windows (docs/INTERFAZ.md §3) and the window that opened them
 * talk over a BroadcastChannel: a popped window says hello/bye to its owner,
 * and the owner closes them all when it leaves the production. Popped windows
 * only exist while their owner is in the production screen.
 */

import type { Id } from "@sweetflow/domain";

type Msg =
  | { type: "hello"; owner: string; key: string; nodeId: Id }
  | { type: "bye"; owner: string; key: string }
  | { type: "who"; owner: string }
  | { type: "close"; owner: string };

const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("sweetflow-windows") : null;

/** This window, as owner of the windows it pops out. */
export const WINDOW_ID = crypto.randomUUID().slice(0, 8);

export interface PoppedWindow {
  key: string;
  nodeId: Id;
}

/** Owner side: keeps `onChange` up to date with this window's popped windows. */
export function trackPoppedWindows(onChange: (list: PoppedWindow[]) => void): () => void {
  if (!channel) return () => undefined;
  const open = new Map<string, PoppedWindow>();
  const handler = (e: MessageEvent<Msg>) => {
    const m = e.data;
    if (m.owner !== WINDOW_ID) return;
    if (m.type === "hello") open.set(m.key, { key: m.key, nodeId: m.nodeId });
    else if (m.type === "bye") open.delete(m.key);
    else return;
    onChange([...open.values()]);
  };
  channel.addEventListener("message", handler);
  // Windows still open from before (e.g. after a hot reload) answer this.
  channel.postMessage({ type: "who", owner: WINDOW_ID } satisfies Msg);
  // Leaving the app (reload, close) leaves no orphan windows behind.
  const bye = () => closePoppedWindows();
  window.addEventListener("pagehide", bye);
  return () => {
    channel.removeEventListener("message", handler);
    window.removeEventListener("pagehide", bye);
  };
}

/** Owner side: ask every window this one popped out to close. */
export function closePoppedWindows(): void {
  channel?.postMessage({ type: "close", owner: WINDOW_ID } satisfies Msg);
}

/**
 * Popped side: announce this window to its owner and close when told to.
 * Browsers only let a page close windows a script opened; if closing fails,
 * `onOrphaned` lets the window stop showing the production.
 */
export function joinOwner(owner: string, nodeId: Id, onOrphaned: () => void): void {
  if (!channel) return;
  const key = WINDOW_ID;
  let active = true;
  const hello = () => channel.postMessage({ type: "hello", owner, key, nodeId } satisfies Msg);
  const bye = () => channel.postMessage({ type: "bye", owner, key } satisfies Msg);
  channel.addEventListener("message", (e: MessageEvent<Msg>) => {
    if (!active || e.data.owner !== owner) return;
    if (e.data.type === "close") {
      window.close();
      setTimeout(() => {
        if (window.closed) return;
        // Could not close: stop counting as open and stop showing the production.
        active = false;
        bye();
        onOrphaned();
      }, 150);
    }
    if (e.data.type === "who") hello();
  });
  window.addEventListener("pagehide", () => active && bye());
  hello();
}
