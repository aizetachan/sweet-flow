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

export const versionTag = (v: number) => `v${String(v).padStart(3, "0")}`;

const KIND_TAG = { image: "img", video: "vid", audio: "aud" } as const;

/** Media file name — code-based so renaming a title never renames files. */
export function mediaFileName(code: string, kind: keyof typeof KIND_TAG, version: number, ext: string): string {
  return `${code}_${KIND_TAG[kind]}_${versionTag(version)}.${ext.replace(/^\./, "")}`;
}
