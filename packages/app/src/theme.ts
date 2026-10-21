/**
 * The theme (docs/INTERFAZ.md §1.4): the accent that replaces the corporate
 * blue. Each person sets their own on their computer; the team's owner sets
 * the team's, and whether members may use their own (rules in
 * `@sweetflow/domain` team.ts). The desktop app recolours its icon's frame
 * with it.
 */

import { useEffect, useSyncExternalStore } from "react";
import { accentVars, normHex } from "@sweetflow/ui/color";
import type { Theme } from "@sweetflow/domain";
import type { LibraryState } from "./data/library";

const OWN_KEY = "sf.theme";
/** The last one shown, to start with it before the team folder is read. */
const SHOWN_KEY = "sf.theme.shown";

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    // Storage blocked: it lasts this session only.
  }
};

let own: Theme | null = parseOwn(read(OWN_KEY));
const listeners = new Set<() => void>();

function parseOwn(raw: string | null): Theme | null {
  try {
    const accent = raw ? normHex((JSON.parse(raw) as Theme).accent) : null;
    return accent ? { accent } : null;
  } catch {
    return null;
  }
}

/** My own theme, on this computer; null: none (the team's, or the corporate blue). */
export const ownTheme = (): Theme | null => own;

export function setOwnTheme(theme: Theme | null): void {
  const accent = theme ? normHex(theme.accent) : null;
  own = accent ? { accent } : null;
  write(OWN_KEY, own ? JSON.stringify(own) : null);
  for (const cb of listeners) cb();
}

// Another window of the app (a popped-out one) changed it.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== OWN_KEY) return;
    own = parseOwn(e.newValue);
    for (const cb of listeners) cb();
  });
}

export function useOwnTheme(): Theme | null {
  return useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), ownTheme);
}

/** What I see: my own if I may have one, else the team's; null: the corporate blue. */
export function shownTheme(lib: LibraryState | null, mine: Theme | null): Theme | null {
  const team = lib?.team;
  if (!team) return mine;
  return mine && team.canPersonalizeTheme ? mine : team.theme;
}

let applied: string | null | undefined;
let appliedVars: string[] = [];

/** Paints the app with an accent (null: the corporate blue) and tells the desktop shell. */
export function applyAccent(accent: string | null): void {
  const hex = accent ? normHex(accent) : null;
  if (hex === applied) return;
  applied = hex;
  const root = document.documentElement.style;
  for (const k of appliedVars) root.removeProperty(k);
  const vars = accentVars(hex);
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
  appliedVars = Object.keys(vars);
  write(SHOWN_KEY, hex);
  void window.sweetflow?.setAccent?.(hex)?.catch(() => undefined);
}

/** Before the first paint: the last theme shown (the splash already has it). */
export function startTheme(): void {
  applyAccent(read(SHOWN_KEY));
}

/** Keeps the app painted with the theme I see. */
export function useThemeApplied(lib: LibraryState | null): void {
  const mine = useOwnTheme();
  const accent = lib ? (shownTheme(lib, mine)?.accent ?? null) : undefined;
  useEffect(() => {
    // Until the library is read, keep what startTheme() painted.
    if (accent !== undefined) applyAccent(accent);
  }, [accent]);
}
