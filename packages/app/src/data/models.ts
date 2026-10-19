/**
 * What each generation model allows (docs/INTERFAZ.md §2.5), so the generate
 * box only offers what the chosen model can do. The catalog is read live from
 * the provider when it is connected (integrations/magnific/catalog.ts) and
 * kept on this computer; until then, a copy of Magnific's catalog taken on
 * 18 oct 2026 stands in. Which models show in the generate box is chosen in
 * Ajustes › Modelos. `slug` is the model's id at the provider.
 */

import { useSyncExternalStore } from "react";

export type GenKind = "image" | "video" | "audio";

/** What a reference is for, as the provider names it. */
export type RefType = "image" | "style" | "video" | "audio";

/** Library assets the provider can be given by name («@Elena» in the prompt): docs/INTERFAZ.md §2.8. */
export type LibAssetType = "character" | "product" | "locations";

export interface ModelSpec {
  kind: GenKind;
  /** Name shown in the UI (and kept in the log). */
  name: string;
  /** Provider id; undefined: the provider picks ("Auto"). */
  slug?: string;
  aspectRatios: string[];
  resolutions?: string[];
  /** Allowed lengths in seconds (video, audio); one value: fixed. */
  durations?: number[];
  /** Up to how many results one click asks for. */
  maxCount: number;
  /** Reference types it takes, and how many in total. */
  references?: { types: RefType[]; max: number };
  /** Library assets it takes by name (characters, products, places). */
  library?: LibAssetType[];
  /** Start / end frame (video); exclusive with `references`. */
  startFrame?: boolean;
  endFrame?: boolean;
  /** Generated sound on the video. */
  sound?: boolean;
  /** Audio: music (with an instrumental switch) or sound effects (loopable). */
  audio?: "music" | "sfx";
  instrumental?: boolean;
  loop?: boolean;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const IMG_REFS: RefType[] = ["style", "image"];
const VID_6 = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

/** The copy used until the live catalog arrives; audio always comes from here (the provider does not list it). */
export const STATIC_CATALOG: ModelSpec[] = [
  // ---------- image ----------
  { kind: "image", name: "Nano Banana Pro", slug: "imagen-nano-banana-2", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "4:5", "5:4", "3:2", "2:3", "21:9"], resolutions: ["1k", "2k", "4k"], maxCount: 8, references: { types: IMG_REFS, max: 12 } },
  { kind: "image", name: "Seedream 5 Pro", slug: "seedream-5-pro", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"], resolutions: ["1.5k", "2k"], maxCount: 8, references: { types: IMG_REFS, max: 12 } },
  { kind: "image", name: "Recraft V4.1", slug: "recraft-v4-1", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "2:1", "1:2"], maxCount: 8, references: { types: ["style"], max: 1 } },
  { kind: "image", name: "Nano Banana 2 Lite", slug: "imagen-nano-banana-2-lite", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9"], maxCount: 8, references: { types: IMG_REFS, max: 12 } },
  { kind: "image", name: "GPT 2", slug: "gpt-2", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "2:1", "3:1", "21:9"], resolutions: ["1k", "2k", "4k"], maxCount: 8, references: { types: IMG_REFS, max: 12 } },
  { kind: "image", name: "Auto (Magnific elige)", aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"], maxCount: 8, references: { types: IMG_REFS, max: 12 } },
  // ---------- video ----------
  { kind: "video", name: "Auto (Magnific elige)", aspectRatios: ["16:9", "9:16", "1:1"], durations: [5, 10], maxCount: 4, startFrame: true },
  { kind: "video", name: "Seedance 2.5", slug: "bytedance-seedance-pro-2.5", aspectRatios: VID_6, resolutions: ["1080p", "720p", "480p"], durations: range(4, 30), maxCount: 4, references: { types: ["image", "video", "audio"], max: 30 }, startFrame: true, endFrame: true, sound: true },
  { kind: "video", name: "Seedance 2.0", slug: "bytedance-seedance-pro-2.0", aspectRatios: VID_6, resolutions: ["4K", "1080p", "720p", "480p"], durations: range(4, 15), maxCount: 4, references: { types: ["image", "video", "audio"], max: 9 }, startFrame: true, endFrame: true, sound: true },
  { kind: "video", name: "Seedance 2.0 Fast", slug: "bytedance-seedance-fast-2.0", aspectRatios: VID_6, resolutions: ["720p", "480p"], durations: range(4, 15), maxCount: 4, references: { types: ["image", "video", "audio"], max: 9 }, startFrame: true, endFrame: true, sound: true },
  { kind: "video", name: "Kling 2.5", slug: "kling-25", aspectRatios: ["16:9", "9:16", "1:1"], resolutions: ["1080p", "720p"], durations: [5, 10], maxCount: 4, startFrame: true, endFrame: true },
  { kind: "video", name: "MiniMax H3 Max", slug: "minimax-video-3_0-max", aspectRatios: VID_6, resolutions: ["768p", "480p"], durations: range(5, 15), maxCount: 4, references: { types: ["image", "video", "audio"], max: 9 }, startFrame: true, endFrame: true },
  { kind: "video", name: "MiniMax H3 Max Turbo", slug: "minimax-video-3_0-max-turbo", aspectRatios: VID_6, resolutions: ["768p", "480p"], durations: range(5, 15), maxCount: 4, startFrame: true, endFrame: true },
  // ---------- audio ----------
  { kind: "audio", name: "ElevenLabs Music v2", slug: "elevenlabs-music-generation-v2", audio: "music", aspectRatios: [], durations: range(10, 300), maxCount: 4, instrumental: true },
  { kind: "audio", name: "ElevenLabs Music", slug: "elevenlabs-music-generation", audio: "music", aspectRatios: [], durations: range(10, 300), maxCount: 4, instrumental: true },
  { kind: "audio", name: "Google Lyria 3 Pro", slug: "google-lyria-3-pro", audio: "music", aspectRatios: [], durations: range(30, 180), maxCount: 4 },
  { kind: "audio", name: "Google Lyria 3", slug: "google-lyria-3", audio: "music", aspectRatios: [], durations: [30], maxCount: 4 },
  { kind: "audio", name: "Efectos de sonido (ElevenLabs)", slug: "elevenlabs-sfx", audio: "sfx", aspectRatios: [], durations: range(1, 30), maxCount: 4, loop: true },
];

// ---------- live catalog and the models chosen to show ----------

// v2: models say which library assets they take.
const LIVE_KEY = "sweetflow:models-live:v2";
const SHOWN_KEY = "sweetflow:models-shown";

/** Identity of a model across catalogs: its kind and provider id. */
export const modelKey = (m: Pick<ModelSpec, "kind" | "slug">) => `${m.kind}:${m.slug ?? "auto"}`;

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Only a convenience: the copy and the defaults still work.
  }
}

let live = read<{ at: number; models: ModelSpec[] }>(LIVE_KEY);
/** Keys chosen in Ajustes › Modelos; null: the defaults (the ones of the built-in copy). */
let shown = read<string[]>(SHOWN_KEY);
let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
  version++;
  for (const l of listeners) l();
};

/** Every model the provider offers (or the built-in copy). */
export function catalog(): ModelSpec[] {
  return live?.models.length ? live.models : STATIC_CATALOG;
}

/** When the live catalog was read; null: still the built-in copy. */
export const catalogReadAt = (): number | null => (live?.models.length ? live.at : null);

export function setLiveCatalog(models: ModelSpec[], at = Date.now()): void {
  live = { at, models };
  write(LIVE_KEY, live);
  changed();
}

const DEFAULT_SHOWN = new Set(STATIC_CATALOG.map(modelKey));

export function isShown(m: ModelSpec): boolean {
  return shown ? shown.includes(modelKey(m)) : DEFAULT_SHOWN.has(modelKey(m));
}

export function setShown(m: ModelSpec, on: boolean): void {
  const now = new Set(shown ?? catalog().filter(isShown).map(modelKey));
  if (on) now.add(modelKey(m));
  else now.delete(modelKey(m));
  shown = [...now];
  write(SHOWN_KEY, shown);
  changed();
}

/** Back to the models shown by default. */
export function resetShown(): void {
  shown = null;
  write(SHOWN_KEY, null);
  changed();
}

/** Every model of a kind, shown or not (Ajustes › Modelos). */
export const allModelsFor = (kind: GenKind) => catalog().filter((m) => m.kind === kind);

/** The models of a kind that show in the generate box; never none. */
export function modelsFor(kind: GenKind): ModelSpec[] {
  const all = allModelsFor(kind);
  const list = all.filter(isShown);
  return list.length ? list : all.slice(0, 1);
}

/** Re-render when the catalog or the chosen models change. */
export function useModelsVersion(): number {
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }, () => version);
}

/**
 * The spec of a model by its UI name (what the log keeps). Old names from the
 * built-in copy are found through their provider id; the first shown model of
 * its kind otherwise.
 */
export function specOf(kind: GenKind, name: string): ModelSpec {
  const all = allModelsFor(kind);
  const byName = all.find((m) => m.name === name);
  if (byName) return byName;
  const old = STATIC_CATALOG.find((m) => m.kind === kind && m.name === name);
  if (old) return all.find((m) => modelKey(m) === modelKey(old)) ?? old;
  return modelsFor(kind)[0]!;
}

/** Nearest allowed value (durations). */
export const nearest = (list: number[], v: number) => list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]!);

/** How a reference type is called in the UI. */
export const REF_LABEL: Record<RefType, string> = { image: "Imagen", style: "Estilo", video: "Vídeo", audio: "Audio" };
