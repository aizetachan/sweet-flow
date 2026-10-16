/**
 * Popped-out windows (docs/INTERFAZ.md §3). The main window opens them with
 * window.open and keeps the references, so it knows how many are open and can
 * close them when it leaves the production. A popped window works on the very
 * same DataSource as its opener (shared through `window.opener`), so it stays
 * in sync in every mode — demo, local or desktop — without saving anything.
 */

import type { Id } from "@sweetflow/domain";
import type { DataSource } from "../data/source";

/** What a main window lends to the windows it pops out. */
export interface WindowShare {
  productionId(): Id | null;
  source(): DataSource;
}

const SHARE_KEY = "__sweetflowShare";
/** Message from the main window: "show yourself" (focus + glow). */
const FLASH = "sf-flash";

export interface PoppedWindow {
  name: string;
  nodeId: Id;
}

/** Size a popped window opens at: a 13–14" laptop screen. The user can make it bigger. */
export const POPPED_SIZE = { width: 1440, height: 900 };

const children = new Map<string, { win: Window; nodeId: Id }>();
let onChildren: (list: PoppedWindow[]) => void = () => undefined;

function report(): void {
  for (const [name, c] of children) if (c.win.closed) children.delete(name);
  onChildren([...children].map(([name, c]) => ({ name, nodeId: c.nodeId })));
}

/** Main window: lend the open production to popped windows and track them. */
export function hostWindows(share: WindowShare, onChange: (list: PoppedWindow[]) => void): void {
  (window as unknown as Record<string, unknown>)[SHARE_KEY] = share;
  onChildren = onChange;
  // A closed window doesn't tell its opener: check now and then.
  setInterval(report, 700);
  // Reloading or closing the main window leaves no popped window behind.
  window.addEventListener("pagehide", closePoppedWindows);
}

/** Main window: open (or bring forward) the window of a node. */
export function popOutWindow(url: string, productionId: Id, nodeId: Id): void {
  const name = `sf-${productionId}-${nodeId}`;
  // A 13–14" laptop screen (1440×900), centred; smaller if the screen is (docs/INTERFAZ.md §3).
  const sc = window.screen as Screen & { availLeft?: number; availTop?: number };
  const w = Math.min(POPPED_SIZE.width, sc.availWidth);
  const h = Math.min(POPPED_SIZE.height, sc.availHeight);
  const left = (sc.availLeft ?? 0) + Math.round((sc.availWidth - w) / 2);
  const top = (sc.availTop ?? 0) + Math.round((sc.availHeight - h) / 2);
  const win = window.open(url, name, `popup,left=${left},top=${top},width=${w},height=${h}`);
  if (!win) return;
  win.focus();
  children.set(name, { win, nodeId });
  report();
}

/** Main window: bring a node's window to the front and make it glow so it is easy to spot. */
export function focusPoppedWindow(nodeId: Id): void {
  for (const c of children.values()) {
    if (c.nodeId !== nodeId || c.win.closed) continue;
    c.win.focus();
    c.win.postMessage({ type: FLASH }, "*");
  }
}

/** Main window: close the window of one node (e.g. to work on it in the side panel again). */
export function closePoppedWindow(nodeId: Id): void {
  for (const [name, c] of children) {
    if (c.nodeId !== nodeId) continue;
    c.win.close();
    children.delete(name);
  }
  report();
}

/** Popped window: run `onFlash` when the main window asks it to show itself. */
export function onFlashRequest(onFlash: () => void): void {
  window.addEventListener("message", (e: MessageEvent<{ type?: string }>) => {
    if (e.source === window.opener && e.data?.type === FLASH) onFlash();
  });
}

/** Main window: close every popped window. */
export function closePoppedWindows(): void {
  for (const c of children.values()) c.win.close();
  children.clear();
  report();
}

/** Popped window: what the opener shares, if it is reachable and still on `productionId`. */
export function openerShare(productionId: Id): WindowShare | null {
  try {
    const share = (window.opener as Record<string, unknown> | null)?.[SHARE_KEY] as WindowShare | undefined;
    return share && share.productionId() === productionId ? share : null;
  } catch {
    // Cross-origin opener (e.g. file:// in some shells): fall back to own data.
    return null;
  }
}

/** Popped window: calls `onGone` once the opener closes or leaves the production. */
export function watchOpener(productionId: Id, onGone: () => void): void {
  const t = setInterval(() => {
    let gone = true;
    try {
      gone = !window.opener || window.opener.closed || !openerShare(productionId);
    } catch {
      gone = true;
    }
    if (gone) {
      clearInterval(t);
      onGone();
    }
  }, 700);
}
