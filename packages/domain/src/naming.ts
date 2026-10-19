/**
 * Codes and folder names — the SINGLE source for how a node is named in the
 * app and on disk (docs/ARCHITECTURE.md §5.3). Folder names must be valid and
 * identical on macOS and Windows.
 */

import type { LevelDef } from "./types";

export function codeFor(level: LevelDef, number: number): string {
  return `${level.prefix}${String(number).padStart(level.pad, "0")}`;
}

/** Max title length inside a folder name (Windows 260-char path budget). */
export const FOLDER_TITLE_MAX = 32;

const WIN_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * Filesystem-safe, cross-platform version of a human title:
 * transliterated to ASCII (avoids macOS NFD vs Windows NFC mismatches),
 * spaces → "-", forbidden characters removed, trimmed to FOLDER_TITLE_MAX.
 */
export function safeTitle(title: string, max = FOLDER_TITLE_MAX): string {
  const ascii = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/æ/gi, "ae")
    .replace(/ø/gi, "o")
    .replace(/[^\x20-\x7e]/g, "");
  const cleaned = ascii
    .replace(WIN_FORBIDDEN, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^A-Za-z0-9\-.()&+,'!]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return cleaned.slice(0, max).replace(/[-.]+$/g, "");
}

/** "SC010" + "Persecución en el puerto" → "SC010_Persecucion-en-el-puerto". */
export function folderName(code: string, title: string): string {
  const t = safeTitle(title);
  return t ? `${code}_${t}` : code;
}

/** Folder inside a scene with the originals cut into shots («Vídeos editados»). */
export const SHELF_DIR = "_editados";

export const versionTag =(v: number) => `v${String(v).padStart(3, "0")}`;

const KIND_TAG = { image: "img", video: "vid", audio: "aud" } as const;

/** Media file name — code-based so renaming a title never renames files. */
export function mediaFileName(code: string, kind: keyof typeof KIND_TAG, version: number, ext: string): string {
  return `${code}_${KIND_TAG[kind]}_${versionTag(version)}.${ext.replace(/^\./, "")}`;
}

/** Max length of a dashboard folder or production folder name on disk. */
export const ENTRY_NAME_MAX = 64;

/**
 * Disk names for dashboard entries (folders and productions) under one parent:
 * `safeTitle` of each name, and a "-2", "-3"… suffix when two names clash
 * (case-insensitive, as on macOS and Windows). Deterministic: the older entry
 * (then the smaller id) keeps the plain name, so every device agrees.
 */
export function entryFolderNames(siblings: Array<{ id: string; name: string; createdAt: number }>): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  const sorted = [...siblings].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  for (const e of sorted) {
    const base = safeTitle(e.name, ENTRY_NAME_MAX) || "Sin-nombre";
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base}-${n}`;
    used.add(name.toLowerCase());
    out.set(e.id, name);
  }
  return out;
}

/** Next version (v001, v002…) of a node's media of one kind: one more than the highest so far. */
export function nextMediaVersion(media: Array<{ nodeId: string; kind: string; version: number }>, nodeId: string, kind: string): number {
  return Math.max(0, ...media.filter((m) => m.nodeId === nodeId && m.kind === kind).map((m) => m.version)) + 1;
}

/**
 * Disk names of a scene's groups of shots: `safeTitle` of each name, "-2",
 * "-3"… on case-insensitive clashes (older group first), never one that looks
 * like a node's code folder or the shelf.
 */
export function groupFolderNames(groups: Array<{ id: string; name: string; createdAt: number }>): Map<string, string> {
  const named = groups.map((g) => {
    const t = safeTitle(g.name) || "Grupo";
    return { ...g, name: /^[A-Za-z]{2}\d/.test(t) ? `Grupo-${t}` : t };
  });
  return entryFolderNames(named);
}

/**
 * A library group's tag (docs/INTERFAZ.md §2.8): how it is called in a prompt,
 * «@Casa_de_Robida». What Magnific accepts as a library name: letters,
 * digits, «_» and «-», up to 50.
 */
export function libTag(title: string): string {
  const ascii = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/æ/gi, "ae").replace(/ø/gi, "o");
  return ascii.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_").replace(/^[_-]+|[_-]+$/g, "").slice(0, 50) || "Grupo";
}
