/**
 * Who this person is in Sweet Flow: their Magnific account (docs/USUARIOS.md
 * §1). `account_profile` gives name, email and avatar; it is kept in this
 * browser so the person stays the same while Magnific is offline or
 * disconnected. The Dropbox or Drive account used to reach the team folder is
 * a separate thing and is never compared with it.
 */

import { isConnected, onConnectionChange } from "./auth";
import { callTool } from "./mcp";

export interface Identity {
  email: string;
  name: string;
  avatarUrl?: string;
}

const KEY = "sweetflow:identity";
/** Fired on this window when the identity changes (other windows get a storage event). */
export const IDENTITY_EVENT = "sweetflow:identity";
export const IDENTITY_KEY = KEY;

export function readIdentity(): Identity | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Identity | null;
    return v?.email ? v : null;
  } catch {
    return null;
  }
}

/**
 * The same person on every computer gets the same id: it comes from their
 * Magnific email (a short hash, so the email itself isn't spread in ids).
 */
export function uidForEmail(email: string): string {
  const s = email.trim().toLowerCase();
  // Two FNV-1a passes with different seeds: 64 bits, as 12 hex characters.
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return `u_${(fnv(0x811c9dc5) + fnv(0x01000193)).slice(0, 12)}`;
}

/** Reads the Magnific profile and keeps it; null when not connected or no email came back. */
export async function refreshIdentity(): Promise<Identity | null> {
  if (!isConnected()) return readIdentity();
  const p = (await callTool("account_profile")).data as { displayName?: string; name?: string; email?: string; avatarUrl?: string } | undefined;
  const email = p?.email?.trim().toLowerCase();
  if (!email) return readIdentity();
  const next: Identity = { email, name: p?.displayName || p?.name || email.split("@")[0]!, ...(p?.avatarUrl ? { avatarUrl: p.avatarUrl } : {}) };
  const prev = readIdentity();
  if (!prev || prev.email !== next.email || prev.name !== next.name || prev.avatarUrl !== next.avatarUrl) {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(IDENTITY_EVENT));
  }
  return next;
}

let watching = false;

/** Keep the identity up to date: now, and whenever Magnific gets connected. */
export async function initIdentity(waitMs = 2500): Promise<void> {
  if (!watching) {
    watching = true;
    onConnectionChange(() => void refreshIdentity().catch((e: unknown) => console.warn("[identidad]", e)));
  }
  // Don't hold the app back if Magnific is slow: the identity kept here is enough.
  await Promise.race([refreshIdentity().catch((e: unknown) => console.warn("[identidad]", e)), new Promise((r) => setTimeout(r, waitMs))]);
}
