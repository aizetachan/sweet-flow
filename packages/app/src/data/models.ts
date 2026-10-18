/**
 * What each generation model allows (docs/INTERFAZ.md §2.5), so the generate
 * box only offers what the chosen model can do. Taken from Magnific's own
 * catalog (images_models_list, video_models_list, audio_music_generate,
 * audio_sfx_generate) on 18 oct 2026; `slug` is the model's id there.
 */

export type GenKind = "image" | "video" | "audio";

/** What a reference is for, as the provider names it. */
export type RefType = "image" | "style" | "video" | "audio";

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

export const MODEL_CATALOG: ModelSpec[] = [
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

export const modelsFor = (kind: GenKind) => MODEL_CATALOG.filter((m) => m.kind === kind);

/** The spec of a model by its UI name (what the log keeps); the first of its kind otherwise. */
export function specOf(kind: GenKind, name: string): ModelSpec {
  return MODEL_CATALOG.find((m) => m.kind === kind && m.name === name) ?? modelsFor(kind)[0]!;
}

/** Nearest allowed value (durations). */
export const nearest = (list: number[], v: number) => list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]!);

/** How a reference type is called in the UI. */
export const REF_LABEL: Record<RefType, string> = { image: "Imagen", style: "Estilo", video: "Vídeo", audio: "Audio" };
