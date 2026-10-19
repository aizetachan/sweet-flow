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
import type { BrowsePage, BrowseQuery, RemoteCreation, RemoteFolder } from "../../data/source";
import type { MediaKind } from "@sweetflow/domain";
import { isConnected } from "./auth";
import { callTool, fileUrl } from "./mcp";
import { nearest, specOf } from "../../data/models";


const DONE = new Set(["completed", "complete", "done", "success", "succeeded", "finished", "ready"]);
const FAILED = new Set(["failed", "error", "errored", "cancelled", "canceled", "rejected"]);

const FOLDERS_KEY = "sweetflow:magnific:folders";
const LIBRARY_KEY = "sweetflow:magnific:library";

/** A library group as an asset of this account's Magnific library. */
interface Asset {
  id: number;
  name: string;
  kind: "character" | "product" | "locations";
  /** The images it was made with, to know when to update it. */
  images: string;
}

function readAssets(): Record<string, Asset> {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? "{}") as Record<string, Asset>;
  } catch {
    return {};
  }
}

/**
 * The Magnific library asset of a group, in this account: made the first time
 * (its name is the group's tag, «Casa_de_Robida»; «_2»… if taken) and updated
 * when its images or its name change. Up to 6 images, the first is the cover.
 */
async function ensureAsset(m: { key: string; tag: string; kind: Asset["kind"]; description?: string; ids: string[] }): Promise<Asset> {
  const known = readAssets();
  const images = m.ids.slice(0, 6);
  const sig = images.join(",");
  const save = (a: Asset) => {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify({ ...readAssets(), [m.key]: a }));
    return a;
  };
  const cur = known[m.key];
  if (cur && cur.kind === m.kind) {
    if (cur.images === sig && cur.name === m.tag) return cur;
    try {
      await callTool("library_edit", {
        id: cur.id,
        ...(cur.images !== sig ? { images: images.map((c) => ({ creationIdentifier: c })) } : {}),
        ...(cur.name !== m.tag ? { name: m.tag } : {}),
      });
      return save({ ...cur, images: sig, name: m.tag });
    } catch (e) {
      // The new name is taken: keep the old one, with the new images.
      if (cur.name !== m.tag && cur.images !== sig) {
        await callTool("library_edit", { id: cur.id, images: images.map((c) => ({ creationIdentifier: c })) }).catch(() => undefined);
        return save({ ...cur, images: sig });
      }
      if (cur.name !== m.tag) return cur;
      throw e;
    }
  }
  let lastError: unknown;
  for (let n = 1; n <= 5; n++) {
    const name = n === 1 ? m.tag : `${m.tag}_${n}`.slice(0, 50);
    try {
      const r = await callTool("library_create", {
        name,
        type: m.kind,
        images: images.map((c) => ({ creationIdentifier: c })),
        ...(m.description ? { description: m.description.slice(0, 1000) } : {}),
      });
      const id = Number(findNumber(r.data, "id") ?? /"?id"?\s*[:=]\s*(\d+)/.exec(r.text)?.[1]);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Magnific no ha devuelto el recurso de la biblioteca.");
      return save({ id, name, kind: m.kind, images: sig });
    } catch (e) {
      lastError = e;
      // Try the next name only when this one is taken.
      if (!/name|exist|unique|taken|ya/i.test(e instanceof Error ? e.message : String(e))) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Magnific no ha podido crear el recurso de la biblioteca.");
}

/** First number under `key`, searching nested objects and arrays. */
function findNumber(data: unknown, key: string, depth = 0): number | undefined {
  if (!data || typeof data !== "object" || depth > 6) return undefined;
  if (Array.isArray(data)) {
    for (const x of data) {
      const v = findNumber(x, key, depth + 1);
      if (v !== undefined) return v;
    }
    return undefined;
  }
  const d = data as Record<string, unknown>;
  if (typeof d[key] === "number") return d[key] as number;
  if (typeof d[key] === "string" && /^\d+$/.test(d[key] as string)) return Number(d[key]);
  for (const v of Object.values(d)) {
    const n = findNumber(v, key, depth + 1);
    if (n !== undefined) return n;
  }
  return undefined;
}

/** What creations_request_upload takes. */
const UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/flac"]);

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

  /**
   * A file of this computer as a creation in the node's folder, to use as a
   * reference: ask for an upload target, send the bytes there, then turn it
   * into a creation (creations_request_upload / creations_finalize_upload).
   */
  async upload(file: File, folderPath: string[]): Promise<{ id: string }> {
    const type = file.type === "image/jpg" ? "image/jpeg" : file.type;
    if (!UPLOAD_TYPES.has(type)) throw new Error(`Magnific no acepta este tipo de archivo (${file.name}).`);
    const folder = await this.folder(folderPath);
    const target = (await callTool("creations_request_upload", { mimeType: type })).data as { proxyUploadUrl?: string; uploadUrl?: string; path?: string } | undefined;
    const url = target?.proxyUploadUrl ?? target?.uploadUrl;
    if (!url || !target?.path) throw new Error("Magnific no ha dado dónde subir el archivo.");
    const put = await fetch(url, { method: "PUT", headers: { "Content-Type": type }, body: file });
    if (!put.ok) throw new Error(`No se ha podido subir ${file.name} a Magnific (${put.status}).`);
    const done = await callTool("creations_finalize_upload", { path: target.path, fileName: file.name, folderReference: folder });
    const id = firstIdentifier(done.data) ?? /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(done.text)?.[0];
    if (!id) throw new Error("Magnific no ha devuelto el archivo subido.");
    return { id };
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

  /** Creations (newest first) and folders, to import (docs/INTERFAZ.md §2.0). Reading costs no credits. */
  async browse(q: BrowseQuery): Promise<BrowsePage> {
    const page = q.page ?? 1;
    const perPage = 24;
    const found = await callTool("creations_search", {
      full: true,
      perPage,
      page,
      // Everything inside the folder, its subfolders too.
      ...(q.folder ? { from: "folder", reference: q.folder, includeSubfolders: true } : {}),
      ...(q.kind ? { fileType: q.kind } : {}),
      ...(q.search?.trim() ? { query: q.search.trim() } : {}),
    });
    const d = (found.data ?? {}) as { items?: Array<Record<string, unknown>>; pagination?: { currentPage?: number; lastPage?: number } };
    const items = (d.items ?? []).flatMap((c): RemoteCreation[] => {
      const kind = kindOf(c);
      const url = str(c.url);
      const id = str(c.identifier);
      if (!kind || !url || !id || String(c.status ?? "completed") !== "completed") return [];
      const meta = (c.metadata ?? {}) as Record<string, unknown>;
      const created = str(c.createdAt);
      return [{
        provider: this.provider,
        id,
        name: str(c.name) ?? str(meta.prompt) ?? id,
        kind,
        url,
        thumbUrl: str(c.thumbnailUrl) ?? str(c.previewUrl) ?? (kind === "image" ? url : undefined),
        durationSec: num(meta.duration),
        width: num(meta.width),
        height: num(meta.height),
        folder: str(c.folderReference),
        createdAt: created ? Date.parse(created) : undefined,
      }];
    });
    return { items, more: (d.pagination?.currentPage ?? page) < (d.pagination?.lastPage ?? page) };
  }

  /** Projects (top level) or the folders inside one, all pages. */
  async folders(parent: string | null): Promise<RemoteFolder[]> {
    const out: RemoteFolder[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await callTool("folders_list", parent ? { parentReference: parent, page } : { page });
      const items = ((r.data as { items?: Array<{ reference?: string; name?: string }> } | undefined)?.items ?? []);
      for (const f of items) if (f.reference) out.push({ id: f.reference, name: f.name ?? "Carpeta" });
      const pg = (r.data as { pagination?: { currentPage?: number; lastPage?: number } } | undefined)?.pagination;
      if (pg ? (pg.currentPage ?? page) >= (pg.lastPage ?? page) : items.length < 20) break;
    }
    return out;
  }

  // ---------- internals ----------

  private async launch(req: GenerationRequest, folder: string): Promise<string> {
    const { tool, args } = this.call(req, folder, await this.assets(req));
    const r = await callTool(tool, args);
    const id = firstIdentifier(r.data) ?? /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(r.text)?.[0];
    if (!id) throw new Error("Magnific no ha devuelto la generación.");
    return id;
  }

  /**
   * The library groups called in the prompt as Magnific library assets of
   * this account (docs/INTERFAZ.md §2.8), made the first time and updated
   * when their name or images change. Only what the model takes by name.
   */
  private async assets(req: GenerationRequest): Promise<Map<string, Asset>> {
    const out = new Map<string, Asset>();
    const m = specOf(req.kind === "video" ? "video" : "image", req.model);
    for (const mention of req.mentions ?? []) {
      const kind = mention.kind;
      if (kind !== "character" && kind !== "product" && kind !== "locations") continue;
      if (!m.library?.includes(kind)) continue;
      out.set(mention.key, await ensureAsset({ ...mention, kind }));
    }
    return out;
  }

  /** The tool and its arguments, with only what the model allows (data/models.ts). */
  private call(req: GenerationRequest, folder: string | undefined, assets = new Map<string, Asset>()): { tool: string; args: Record<string, unknown> } {
    const at = folder ? { folderReference: folder } : {};
    const m = specOf(req.kind === "audio" ? "audio" : req.kind === "video" ? "video" : "image", req.model);
    const ratio = req.aspectRatio && m.aspectRatios.includes(req.aspectRatio) ? req.aspectRatio : m.aspectRatios[0];
    const resolution = m.resolutions ? (req.resolution && m.resolutions.includes(req.resolution) ? req.resolution : m.resolutions[0]) : undefined;
    const duration = m.durations ? nearest(m.durations, req.durationSec ?? m.durations[0]!) : undefined;
    const refs = m.references ? (req.references ?? []).filter((r) => m.references!.types.includes(r.type)).slice(0, m.references.max) : [];
    // Groups called in the prompt: as library assets by name, or their images as references.
    let prompt = req.prompt;
    const named: Array<{ type: string; id: string; name: string }> = [];
    for (const mention of req.mentions ?? []) {
      const asset = assets.get(mention.key);
      if (asset) {
        if (asset.name !== mention.tag) prompt = prompt.split(`@${mention.tag}`).join(`@${asset.name}`);
        named.push({ type: asset.kind, id: String(asset.id), name: asset.name });
        continue;
      }
      if (!m.references) continue;
      const room = m.references.max - refs.length - named.length;
      if (room <= 0) continue;
      if (mention.kind === "style" && m.references.types.includes("style")) refs.push({ type: "style", id: mention.ids[0]! });
      else if (m.references.types.includes("image")) for (const id of mention.ids.slice(0, room)) refs.push({ type: "image", id });
    }

    if (req.kind === "audio") {
      if (m.audio === "sfx") return { tool: "audio_sfx_generate", args: { prompt: req.prompt, durationSeconds: duration ?? 5, ...(m.loop && req.loop ? { loop: true } : {}), ...at } };
      return {
        tool: "audio_music_generate",
        args: { prompt: req.prompt, model: m.slug, ...(m.durations && m.durations.length > 1 ? { durationSeconds: duration } : {}), ...(m.instrumental && req.instrumental ? { instrumental: true } : {}), ...at },
      };
    }

    if (req.kind === "video") {
      // Start/end frames and references exclude each other.
      const frames = !refs.length && m.startFrame && req.startFrom
        ? { keyframes: { start: { type: "image", url: req.startFrom }, ...(m.endFrame && req.endOn ? { end: { type: "image", url: req.endOn } } : {}) } }
        : {};
      return {
        tool: "video_generate",
        args: {
          prompt,
          aspectRatio: ratio,
          ...(m.slug ? { slug: m.slug, duration } : duration ? { duration } : {}),
          ...(resolution ? { resolution } : {}),
          ...(m.sound ? { withSoundEffects: !!req.sound } : {}),
          ...frames,
          ...(refs.length || named.length ? { references: [...refs.map((r) => ({ type: r.type, url: r.id })), ...named.map((a) => ({ type: a.type, custom_model_id: a.id, name: a.name }))] } : {}),
          ...at,
        },
      };
    }

    return {
      tool: "images_generate",
      args: {
        prompt,
        mode: m.slug ?? "auto",
        aspectRatio: ratio,
        count: 1,
        ...(resolution ? { resolution } : {}),
        ...(refs.length || named.length ? { references: [...refs.map((r) => ({ type: r.type, identifier: r.id })), ...named.map((a) => ({ type: a.type, identifier: a.id }))] } : {}),
        ...at,
      },
    };
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

function kindOf(c: Record<string, unknown>): MediaKind | undefined {
  const k = String(c.kind ?? c.type ?? "").toLowerCase();
  if (k.includes("video")) return "video";
  if (k.includes("audio") || k.includes("music") || k.includes("sound")) return "audio";
  if (k.includes("image")) return "image";
  return undefined;
}

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
