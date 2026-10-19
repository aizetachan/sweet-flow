/**
 * Magnific's model catalog, read live (images_models_list, video_models_list)
 * and turned into what the generate box needs (data/models.ts). Audio models
 * are not listed by the provider: they keep the built-in copy. Only models
 * that work from a prompt (with optional frames and references) are kept;
 * internal ones (`private`) and the ones that need inputs the box does not
 * have (a driving video, a voice track…) are left out.
 */

import { catalogReadAt, setLiveCatalog, STATIC_CATALOG, type LibAssetType, type ModelSpec, type RefType } from "../../data/models";
import { isConnected } from "./auth";
import { callTool } from "./mcp";

/** Re-read at most this often on its own; «Actualizar» in Ajustes always does. */
const MAX_AGE = 12 * 3600_000;
const AUTO = "Auto (Magnific elige)";
const PROMPT_INPUTS = new Set(["prompt", "duration", "aspectRatio", "resolution"]);
const OUR_REFS: RefType[] = ["image", "style", "video", "audio"];

type Raw = Record<string, unknown>;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).map(String);
const numbers = (v: unknown): number[] => list(v).map(Number).filter((n) => Number.isFinite(n));

function imageModel(m: Raw): ModelSpec | null {
  if (m.private || (m.tool && m.tool !== "text-to-image")) return null;
  const slug = String(m.slug ?? "");
  const types = strings(m.referenceTypes).filter((t): t is RefType => OUR_REFS.includes(t as RefType));
  return {
    kind: "image",
    name: slug === "auto" ? AUTO : String(m.name ?? slug),
    ...(slug && slug !== "auto" ? { slug } : {}),
    aspectRatios: strings(m.aspectRatios).filter((r) => r !== "auto"),
    ...(strings(m.resolutions).length ? { resolutions: strings(m.resolutions) } : {}),
    maxCount: 8,
    ...(m.supportsReferences && types.length ? { references: { types, max: 12 } } : {}),
    ...libraryOf(strings(m.referenceTypes)),
  };
}

const LIB_TYPES: LibAssetType[] = ["character", "product", "locations"];
function libraryOf(types: string[]): { library?: LibAssetType[] } {
  const lib = types.filter((t): t is LibAssetType => LIB_TYPES.includes(t as LibAssetType));
  return lib.length ? { library: lib } : {};
}

function videoModel(m: Raw): ModelSpec | null {
  if (m.private || (m.tool && m.tool !== "video-generator")) return null;
  if (strings(m.requiredInputs).some((i) => !PROMPT_INPUTS.has(i))) return null;
  const refs = list(m.references) as Raw[];
  const types = new Set(refs.map((r) => String(r.type)).filter((t): t is RefType => OUR_REFS.includes(t as RefType)));
  if ((m.audioReferences as Raw | undefined)?.allowed) types.add("audio");
  const limits = refs.filter((r) => types.has(String(r.type) as RefType)).map((r) => Number(r.limit)).filter((n) => n > 0);
  const durations = numbers(m.durations);
  const resolutions = strings(m.resolutions).filter((r) => !/draft/i.test(r));
  return {
    kind: "video",
    name: String(m.name ?? m.slug),
    slug: String(m.slug),
    aspectRatios: strings(m.aspectRatios).filter((r) => r !== "auto"),
    ...(resolutions.length ? { resolutions } : {}),
    ...(durations.length ? { durations } : {}),
    maxCount: 4,
    ...(types.size ? { references: { types: [...types], max: limits.length ? limits.reduce((a, b) => a + b, 0) : 9 } } : {}),
    ...(m.supportsStartFrame ? { startFrame: true } : {}),
    ...(m.supportsEndFrame ? { endFrame: true } : {}),
    ...(m.supportsSoundEffects ? { sound: true } : {}),
    // Video takes characters and products from the library (places go as images).
    ...libraryOf(refs.map((r) => String(r.type)).filter((t) => t !== "locations")),
  };
}

const models = (data: unknown): Raw[] => list((data as { models?: unknown } | undefined)?.models) as Raw[];

/** Reads both catalogs; throws if the provider does not answer. */
export async function fetchCatalog(): Promise<ModelSpec[]> {
  const [img, vid] = await Promise.all([callTool("images_models_list"), callTool("video_models_list")]);
  const images = models(img.data).map(imageModel).filter((m): m is ModelSpec => !!m);
  const videos = models(vid.data).map(videoModel).filter((m): m is ModelSpec => !!m);
  if (!images.length && !videos.length) throw new Error("Magnific no ha devuelto su catálogo de modelos.");
  // «Auto» first, as in Magnific; video has no auto entry in the list.
  const autoFirst = (a: ModelSpec, b: ModelSpec) => Number(b.name === AUTO) - Number(a.name === AUTO);
  const autoVideo = STATIC_CATALOG.find((m) => m.kind === "video" && !m.slug)!;
  return [...images.sort(autoFirst), autoVideo, ...videos, ...STATIC_CATALOG.filter((m) => m.kind === "audio")];
}

let running: Promise<void> | null = null;

/** Refresh the live catalog when Magnific is connected and the copy is old (or `force`). */
export function refreshCatalog(force = false): Promise<void> {
  if (!isConnected()) return Promise.resolve();
  const at = catalogReadAt();
  if (!force && at && Date.now() - at < MAX_AGE) return Promise.resolve();
  running ??= fetchCatalog()
    .then((list) => setLiveCatalog(list))
    .finally(() => {
      running = null;
    });
  return running;
}
