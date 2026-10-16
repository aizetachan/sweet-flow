/**
 * Magnific as Sweet Flow's generator (docs/ARCHITECTURE.md §6), through its
 * MCP tools with this person's account:
 *
 * - Folders: the team folder's tree is mirrored in Magnific down to the node
 *   (project › folders › SQ › SC › SH), created the first time a node
 *   generates. References are remembered in this browser.
 * - Jobs: `images_generate` / `video_generate` straight into that folder, then
 *   `creations_wait` and `creations_get` for the file.
 */

import type { GenerationPoll, GenerationRequest, Generator } from "../../data/generation";
import { isConnected } from "./auth";
import { callTool, fileUrl } from "./mcp";

const IMAGE_MODELS: Record<string, string> = {
  "Nano Banana Pro": "imagen-nano-banana-2",
  "Recraft V4.1": "recraft-v4-1",
  "Seedream 5 Pro": "seedream-5-pro",
};

/** Video models and what each needs (from video_models_list, 16 oct 2026). */
const VIDEO_MODELS: Record<string, { slug: string; resolution: string; durations: number[] }> = {
  "Seedance 2.5": { slug: "bytedance-seedance-pro-2.5", resolution: "720p", durations: range(4, 30) },
  "Kling 2.5": { slug: "kling-25", resolution: "1080p", durations: [5, 10] },
  "Seedance 2.0 Fast": { slug: "bytedance-seedance-fast-2.0", resolution: "720p", durations: range(4, 15) },
};

const DONE = new Set(["completed", "complete", "done", "success", "succeeded", "finished", "ready"]);
const FAILED = new Set(["failed", "error", "errored", "cancelled", "canceled", "rejected"]);

const FOLDERS_KEY = "sweetflow:magnific:folders";

export class MagnificGenerator implements Generator {
  readonly provider = "magnific";

  connected(): boolean {
    return isConnected();
  }

  async estimate(req: GenerationRequest): Promise<number | null> {
    const { tool, args } = this.call(req, undefined);
    const r = await callTool("simulate_cost", { tool, arguments: args });
    const credits = (r.data as { credits?: number } | undefined)?.credits;
    return typeof credits === "number" ? credits : null;
  }

  async start(req: GenerationRequest): Promise<{ id: string; folder?: string }> {
    let folder = await this.folder(req.folderPath);
    try {
      return { id: await this.launch(req, folder), folder };
    } catch (err) {
      // The folder may have been deleted in Magnific: make it again once.
      forgetFolders(req.folderPath);
      folder = await this.folder(req.folderPath);
      return { id: await this.launch(req, folder), folder };
    }
  }

  async poll(id: string): Promise<GenerationPoll> {
    const r = await callTool("creations_wait", { identifiers: [id], timeoutSeconds: 20 });
    const item = findItem(r.data, id) ?? (r.data as Record<string, unknown> | undefined);
    const status = String(item?.status ?? item?.state ?? "").toLowerCase();
    if (FAILED.has(status)) return { status: "failed", error: String(item?.error ?? item?.message ?? "Magnific no ha podido generarlo.") };
    if (!DONE.has(status)) return { status: "pending", progress: num(item?.progress) };
    // Full data and URLs of the finished creation.
    const full = (await callTool("creations_get", { creationIdentifier: id })).data as Record<string, unknown> | undefined;
    const c = { ...(item ?? {}), ...(full ?? {}) };
    const url = str(c.url) ?? str(c.downloadUrl) ?? str(c.previewUrl);
    if (!url) return { status: "failed", error: "Magnific no ha devuelto el archivo." };
    return {
      status: "done",
      url,
      previewUrl: str(c.previewUrl) ?? str(c.thumbnailUrl),
      width: num(c.width),
      height: num(c.height),
      durationSec: num(c.duration) ?? num(c.durationSec),
      credits: num(c.credits) ?? num(c.cost),
    };
  }

  async download(url: string): Promise<Blob> {
    const r = await fetch(fileUrl(url));
    if (!r.ok) throw new Error(`No se ha podido descargar de Magnific (${r.status}).`);
    return r.blob();
  }

  viewUrl(url: string): string {
    // Images and video play straight from Magnific; only downloads need the relay.
    return url;
  }

  // ---------- internals ----------

  private async launch(req: GenerationRequest, folder: string): Promise<string> {
    const { tool, args } = this.call(req, folder);
    const r = await callTool(tool, args);
    const id = firstIdentifier(r.data) ?? /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(r.text)?.[0];
    if (!id) throw new Error("Magnific no ha devuelto la generación.");
    return id;
  }

  private call(req: GenerationRequest, folder: string | undefined): { tool: string; args: Record<string, unknown> } {
    const at = folder ? { folderReference: folder } : {};
    if (req.kind === "video") {
      const m = VIDEO_MODELS[req.model];
      const duration = m ? nearest(m.durations, req.durationSec ?? 5) : req.durationSec;
      return {
        tool: "video_generate",
        args: {
          prompt: req.prompt,
          aspectRatio: "16:9",
          ...(m ? { slug: m.slug, resolution: m.resolution, duration } : duration ? { duration } : {}),
          ...(req.startFrom ? { keyframes: { start: { type: "image", url: req.startFrom } } } : {}),
          ...at,
        },
      };
    }
    return { tool: "images_generate", args: { prompt: req.prompt, mode: IMAGE_MODELS[req.model] ?? "auto", aspectRatio: "16:9", count: 1, ...at } };
  }

  /** Reference of the Magnific folder for `path`, creating what is missing. */
  private async folder(path: string[]): Promise<string> {
    const known = readFolders();
    let parent: string | null = null;
    for (let i = 0; i < path.length; i++) {
      const key = path.slice(0, i + 1).join("/");
      let ref: string | undefined = known[key];
      if (!ref) {
        ref = (await this.findChild(parent, path[i]!)) ?? (await this.create(parent, path[i]!));
        known[key] = ref;
        writeFolders(known);
      }
      parent = ref;
    }
    return parent!;
  }

  private async findChild(parent: string | null, name: string): Promise<string | undefined> {
    for (let page = 1; page <= 10; page++) {
      const r = await callTool("folders_list", parent ? { parentReference: parent, page } : { onlyProjects: true, page });
      const items = ((r.data as { items?: Array<{ reference?: string; name?: string }> } | undefined)?.items ?? []);
      const hit = items.find((f) => f.name === name);
      if (hit?.reference) return hit.reference;
      if (items.length < 20) return undefined;
    }
    return undefined;
  }

  private async create(parent: string | null, name: string): Promise<string> {
    const r = await callTool("folders_create", parent ? { name, parentReference: parent } : { name });
    const ref = findString(r.data, "reference") ?? findString(r.data, "id");
    if (!ref) throw new Error(`Magnific no ha creado la carpeta «${name}».`);
    return ref;
  }
}

// ---------- reading Magnific's answers ----------

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
const nearest = (list: number[], v: number) => list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0]!);
const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() && !isNaN(+v) ? +v : undefined);

/** First creation id in a generate answer: `identifiers[0]`, or the first `identifier` anywhere. */
function firstIdentifier(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.identifiers) && typeof d.identifiers[0] === "string") return d.identifiers[0];
  return findString(data, "identifier") ?? findString(data, "creationIdentifier");
}

/** First string value under `key`, searching nested objects and arrays. */
function findString(data: unknown, key: string, depth = 0): string | undefined {
  if (!data || typeof data !== "object" || depth > 6) return undefined;
  if (Array.isArray(data)) {
    for (const x of data) {
      const v = findString(x, key, depth + 1);
      if (v) return v;
    }
    return undefined;
  }
  const d = data as Record<string, unknown>;
  if (typeof d[key] === "string") return d[key] as string;
  for (const v of Object.values(d)) {
    const found = findString(v, key, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** The object describing creation `id` in a wait answer. */
function findItem(data: unknown, id: string, depth = 0): Record<string, unknown> | undefined {
  if (!data || typeof data !== "object" || depth > 6) return undefined;
  if (Array.isArray(data)) {
    for (const x of data) {
      const v = findItem(x, id, depth + 1);
      if (v) return v;
    }
    return undefined;
  }
  const d = data as Record<string, unknown>;
  if (d.identifier === id || d.id === id || d.creationIdentifier === id) return d;
  for (const v of Object.values(d)) {
    const found = findItem(v, id, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function readFolders(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(FOLDERS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function writeFolders(v: Record<string, string>): void {
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(v));
}
function forgetFolders(path: string[]): void {
  const known = readFolders();
  for (let i = 0; i < path.length; i++) delete known[path.slice(0, i + 1).join("/")];
  writeFolders(known);
}
