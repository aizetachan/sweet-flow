/**
 * DataSource over a production folder (docs/ARCHITECTURE.md §2.1, stage A).
 *
 * Every intent becomes events appended to this device's log; the Snapshot is
 * the fold of all devices' logs. Writes apply locally at once and are saved in
 * the background (retrying on failure); changes from other devices arrive
 * through `LogStore.watch` and are merged on top.
 *
 * Structure, takes (cuts) and generation when a provider is given: the job
 * is recorded in the log (requested, rendering, ready) and the file is saved
 * in the node's `_media/` folder. Comments and presence come in later steps.
 */

import {
  foldLog,
  formatStamp,
  hlcObserve,
  hlcTick,
  LOG_VERSION,
  codeOf,
  folderPath,
  logFilePath,
  mediaFileName,
  nextMediaVersion,
  parseLog,
  safeTitle,
  parseStamp,
  planCreateNode,
  planDeleteNode,
  planInsertAfter,
  planMoveNode,
  planMoveNodes,
  planRestoreNode,
  planSetNumber,
  planSplitShot,
  planGroupShots,
  planPlaceInRow,
  planUngroupShots,
  planDissolveGroup,
  planRenameGroup,
  planTrashNode,
  planUnshelveNode,
  splitTrash,
  planUpdateNode,
  serializeEvent,
  ZERO_HLC,
  type Hlc,
  type Id,
  type LevelDef,
  type LogEvent,
  type LogEventBody,
  type LogState,
  type Media,
  type MediaPatch,
  type Member,
  type NodePatch,
  type Plan,
  type ProdNode,
  type Production,
  type RowItem,
  type Segment,
  type StatusDef,
} from "@sweetflow/domain";
import type { DataSource, GenerateArgs, Placement, Snapshot } from "../source";
import type { Generator, GenerationRequest } from "../generation";
import type { ProductionFiles } from "../folder/ProductionFiles";
import type { LogStore } from "./store";

export interface LocalSourceOptions {
  store: LogStore;
  /** Stable per installation; names this device's log files. */
  deviceId: Id;
  me: Member;
  /** Production to create when the folder has none yet. */
  create?: Pick<Production, "id" | "name" | "levels" | "statuses"> & { format?: string };
  /** The production's folders in the team folder (none: browser storage, media stays at the provider). */
  files?: ProductionFiles;
  /** Image and video generation (Magnific) with this person's account. */
  generator?: Generator;
  /** Injectable for tests. */
  now?: () => number;
  newId?: (prefix: string) => Id;
}

const RETRY_MS = 5_000;

export class LocalSource implements DataSource {
  private readonly store: LogStore;
  private readonly deviceId: Id;
  private readonly me: Member;
  private readonly now: () => number;
  private readonly newId: (prefix: string) => Id;

  private events = new Map<string, LogEvent>();
  private clock: Hlc = ZERO_HLC;
  private state: LogState | null = null;
  private unsaved: LogEvent[] = [];
  private saving: Promise<void> = Promise.resolve();
  private saveError = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private snapshot: Snapshot | null = null;
  private listeners = new Set<(s: Snapshot) => void>();
  private unwatch: () => void;
  private readonly files?: ProductionFiles;
  private readonly generator?: Generator;
  /** Folder moves run one after another, in the order the changes were made. */
  private filing: Promise<void> = Promise.resolve();
  /** Generation jobs this window is following. */
  private jobs = new Set<Id>();
  private disposed = false;

  /** Resolves when the folder has been read (and the production created if asked). */
  readonly ready: Promise<void>;

  constructor(opts: LocalSourceOptions) {
    this.store = opts.store;
    this.deviceId = opts.deviceId;
    this.me = opts.me;
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? ((p) => `${p}_${crypto.randomUUID()}`);
    this.files = opts.files;
    this.generator = opts.generator;
    this.unwatch = this.store.watch(() => void this.reload());
    this.ready = this.reload()
      .then(() => this.bootstrap(opts.create))
      .then(() => this.resumeJobs());
  }

  dispose(): void {
    this.disposed = true;
    this.unwatch();
    if (this.retry) clearTimeout(this.retry);
  }

  subscribe(cb: (s: Snapshot) => void): () => void {
    this.listeners.add(cb);
    if (this.snapshot) cb(this.snapshot);
    return () => this.listeners.delete(cb);
  }

  /** Resolves once every event written so far is on disk (or failed to save). */
  flushed(): Promise<void> {
    return this.saving;
  }

  // ---------- loading ----------

  private async reload(): Promise<void> {
    const files = await this.store.readAll();
    let bad = 0;
    for (const text of files) {
      const { events, badLines } = parseLog(text);
      bad += badLines.length;
      for (const e of events) this.events.set(e.at, e);
    }
    // A half-synced last line is normal while Dropbox is still copying a file.
    if (bad) console.warn(`[local] ${bad} línea(s) del registro no se pudieron leer; se reintentará al sincronizar`);
    this.refold();
  }

  private bootstrap(create: LocalSourceOptions["create"]): void {
    if (!this.state?.production) {
      if (!create) throw new Error("La carpeta no contiene ninguna producción.");
      this.write([{ type: "production.created", production: { workspaceId: "local", ...create } }]);
    }
    const known = this.state?.members.find((m) => m.uid === this.me.uid);
    const { uid, displayName, email, role } = this.me;
    if (!known || known.displayName !== displayName || known.email !== email || known.role !== role) {
      this.write([{ type: "member.joined", member: { uid, displayName, email, role } }]);
    }
  }

  private refold(): void {
    this.state = foldLog([...this.events.values()]);
    const last = this.state.lastStamp ? parseStamp(this.state.lastStamp) : null;
    if (last) this.clock = hlcObserve(this.clock, last.clock, this.now());
    this.emit();
  }

  // ---------- writing ----------

  private write(bodies: LogEventBody[]): void {
    if (!bodies.length) return;
    const before = this.state?.nodes ?? [];
    const groupsBefore = this.state?.groups ?? [];
    for (const body of bodies) {
      this.clock = hlcTick(this.clock, this.now());
      const e = { ...body, v: LOG_VERSION, at: formatStamp(this.clock, this.deviceId), userId: this.me.uid } as LogEvent;
      this.events.set(e.at, e);
      this.unsaved.push(e);
    }
    this.refold();
    this.save();
    // This device changed the tree: its folders on disk follow.
    const p = this.state?.production;
    if (this.files && p && bodies.some((b) => b.type.startsWith("node.") || b.type.startsWith("group.") || b.type === "levels.set")) {
      const after = this.state!.nodes;
      const files = this.files;
      this.filing = this.filing.then(() => files.follow(p, before, after, groupsBefore, this.state!.groups)).catch((err) => console.error("[carpeta] no se pudieron mover las carpetas", err));
    }
  }

  private save(): void {
    this.saving = this.saving.then(async () => {
      const batch = this.unsaved;
      if (!batch.length) return;
      this.unsaved = [];
      try {
        await this.store.append(logFilePath(this.deviceId, this.now()), batch.map((e) => serializeEvent(e) + "\n").join(""));
        this.saveError = false;
      } catch (err) {
        console.error("[local] no se pudo guardar el registro; se reintentará", err);
        this.unsaved = [...batch, ...this.unsaved];
        this.saveError = true;
        this.retry ??= setTimeout(() => {
          this.retry = null;
          this.save();
        }, RETRY_MS);
      }
      this.emit();
    });
  }

  private apply(plan: Plan): Id | undefined {
    this.write(plan.events);
    return plan.nodeId;
  }

  /** Nodes on the board: what structure intents work on (the trash keeps its codes aside). */
  private board(): ProdNode[] {
    return splitTrash(this.loaded().nodes).live;
  }

  private loaded(): LogState & { production: Production } {
    if (!this.state?.production) throw new Error("La producción aún se está cargando.");
    return this.state as LogState & { production: Production };
  }

  // ---------- snapshot ----------

  private emit(): void {
    const s = this.state;
    if (!s?.production) return;
    const members = s.members.some((m) => m.uid === this.me.uid) ? s.members : [this.me, ...s.members];
    const pending = this.unsaved.length;
    const split = splitTrash(s.nodes);
    this.snapshot = {
      workspace: { id: "local", name: this.store.label, createdAt: s.production.createdAt },
      me: { ...this.me, magnificConnected: !!this.generator?.connected() },
      members,
      productions: [s.production],
      production: s.production,
      nodes: split.live,
      trash: split.trash,
      shelf: split.shelf,
      groups: s.groups,
      media: s.media.map((m) => this.withUrl(m, s)),
      takes: s.takes,
      comments: [],
      assets: [],
      activity: [],
      presence: [],
      mirror: { status: this.saveError ? "offline" : pending ? "syncing" : "synced", rootPath: this.store.label, pending },
      features: { generation: !!this.generator, review: false, presence: false, team: false, takes: true },
    };
    for (const l of this.listeners) l(this.snapshot);
  }

  /** Where to show a media from: its file in the team folder, or the provider's copy. */
  private withUrl(m: Media, s: LogState): Media {
    const node = s.nodes.find((n) => n.id === m.nodeId);
    let url: string | undefined;
    if (m.file && this.files && node && s.production) {
      const path = this.files.mediaPath(s.production, s.nodes, node, m.file, s.groups);
      if (path) url = this.files.url(path, () => this.emit());
    }
    const remote = m.remote?.url ?? m.remote?.previewUrl;
    url ??= remote && this.generator ? this.generator.viewUrl(remote) : undefined;
    const preview = m.remote?.previewUrl && this.generator ? this.generator.viewUrl(m.remote.previewUrl) : undefined;
    return { ...m, url, thumbUrl: m.kind === "image" ? url : preview };
  }

  // ---------- structure ----------

  createNode(parentId: Id | null, title?: string): Id {
    const s = this.loaded();
    return this.apply(planCreateNode(s.production, this.board(), parentId, this.newId("n"), title))!;
  }

  insertAfter(nodeId: Id): Id {
    const s = this.loaded();
    return this.apply(planInsertAfter(s.production, this.board(), nodeId, this.newId("n")))!;
  }

  moveNode(nodeId: Id, dir: -1 | 1): void {
    const s = this.loaded();
    this.apply(planMoveNode(s.production, this.board(), nodeId, dir));
  }

  moveNodes(ids: Id[], parentId: Id | null, beforeId: Id | null): void {
    const s = this.loaded();
    this.apply(planMoveNodes(s.production, this.board(), ids, parentId, beforeId));
  }

  setNodeNumber(nodeId: Id, number: number): void {
    const s = this.loaded();
    this.apply(planSetNumber(s.production, this.board(), nodeId, number));
  }

  trashNode(nodeId: Id): void {
    this.apply(planTrashNode(this.loaded().nodes, nodeId));
  }

  restoreNode(nodeId: Id): number | undefined {
    const s = this.loaded();
    const plan = planRestoreNode(s.production, s.nodes, nodeId);
    this.apply(plan);
    return plan.renumbered;
  }

  deleteNode(nodeId: Id): void {
    this.apply(planDeleteNode(this.loaded().nodes, nodeId));
  }

  groupShots(ids: Id[], target: { shotId: Id } | { groupId: Id }): Id | undefined {
    const s = this.loaded();
    const plan = planGroupShots(s.production, this.board(), s.groups, ids, target, this.newId("g"), this.now());
    this.apply(plan);
    return plan.groupId;
  }

  placeInRow(moving: RowItem[], rowId: Id, before: RowItem | null, groupId: Id | null): void {
    const s = this.loaded();
    this.apply(planPlaceInRow(s.production, this.board(), s.groups, moving, rowId, before, groupId));
  }

  ungroupShots(ids: Id[]): void {
    this.apply(planUngroupShots(this.board(), this.loaded().groups, ids));
  }

  dissolveGroup(groupId: Id): void {
    this.apply(planDissolveGroup(this.board(), this.loaded().groups, groupId));
  }

  renameGroup(groupId: Id, name: string): void {
    this.apply(planRenameGroup(this.loaded().groups, groupId, name));
  }

  updateNode(nodeId: Id, patch: Partial<Pick<ProdNode, "title" | "notes" | "statusId" | "assigneeIds" | "assetIds">>): void {
    this.apply(planUpdateNode(this.loaded().nodes, nodeId, patch as NodePatch));
  }

  /** Rename the production itself (used by the dashboard). */
  renameProduction(name: string): void {
    if (this.loaded().production.name === name) return;
    this.write([{ type: "production.updated", patch: { name } }]);
  }

  // ---------- configuration ----------

  updateLevels(levels: LevelDef[]): void {
    this.write([{ type: "levels.set", levels }]);
  }

  updateStatuses(statuses: StatusDef[]): void {
    this.write([{ type: "statuses.set", statuses }]);
  }

  openProduction(_productionId: Id): void {
    // One production per folder for now (phase 1, step 6 adds the list).
  }

  // ---------- generation ----------

  async estimate(args: GenerateArgs): Promise<number | null> {
    if (!this.generator) return null;
    try {
      return await this.generator.estimate(this.request(args));
    } catch {
      return null;
    }
  }

  generate(args: GenerateArgs): void {
    if (!this.generator) return notYet("generar");
    const s = this.loaded();
    if (!s.nodes.some((n) => n.id === args.nodeId)) return;
    const id = this.newId("m");
    const now = this.now();
    this.write([
      {
        type: "media.added",
        media: {
          id,
          nodeId: args.nodeId,
          kind: args.kind,
          version: nextMediaVersion(s.media, args.nodeId, args.kind),
          origin: "generated",
          status: "queued",
          progress: 0,
          archived: false,
          generation: {
            provider: this.generator.provider,
            model: args.model,
            prompt: args.prompt,
            params: { durationSec: args.durationSec, deviceId: this.deviceId },
            sourceMediaId: args.sourceMediaId,
            launchedBy: this.me.uid,
          },
          createdBy: this.me.uid,
          createdAt: now,
        },
      },
    ]);
    void this.runJob(id);
  }

  private request(args: Pick<GenerateArgs, "nodeId" | "kind" | "prompt" | "model" | "durationSec" | "sourceMediaId">): GenerationRequest {
    const s = this.loaded();
    const node = s.nodes.find((n) => n.id === args.nodeId)!;
    // The provider's folders mirror the team folder down to the node.
    const inTeam = this.files?.nodeDir(s.production, s.nodes, node, s.groups);
    const segments = (inTeam ?? [safeTitle(s.production.name) || "Sweet-Flow", folderPath(s.production, s.nodes, node, s.groups)].join("/")).split("/");
    const source = args.sourceMediaId ? s.media.find((m) => m.id === args.sourceMediaId) : undefined;
    return { kind: args.kind, prompt: args.prompt, model: args.model, durationSec: args.durationSec, startFrom: source?.remote?.id, folderPath: segments };
  }

  private updateMedia(id: Id, patch: MediaPatch): void {
    this.write([{ type: "media.updated", id, patch }]);
  }

  /** Follows a job to the end: queued → rendering → file saved (or failed). */
  private async runJob(id: Id): Promise<void> {
    const gen = this.generator;
    if (!gen || this.jobs.has(id)) return;
    this.jobs.add(id);
    const media = () => this.state?.media.find((m) => m.id === id);
    try {
      let m = media();
      if (!m) return;
      if (!m.remote) {
        const g = m.generation!;
        const started = await gen.start(this.request({ nodeId: m.nodeId, kind: m.kind, prompt: g.prompt, model: g.model, durationSec: g.params?.durationSec as number | undefined, sourceMediaId: g.sourceMediaId }));
        this.updateMedia(id, { status: "rendering", progress: 5, remote: { provider: gen.provider, id: started.id, folder: started.folder } });
      }
      for (;;) {
        if (this.disposed) return;
        m = media();
        if (!m?.remote) return;
        const poll = await gen.poll(m.remote.id);
        if (poll.status === "failed") return this.updateMedia(id, { status: "failed", error: poll.error });
        if (poll.status === "pending") {
          if (poll.progress !== undefined && Math.round(poll.progress) > m.progress) this.updateMedia(id, { progress: Math.round(poll.progress) });
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        const remote = { ...m.remote, url: poll.url, previewUrl: poll.previewUrl };
        const dims = { width: poll.width, height: poll.height, durationSec: poll.durationSec };
        const file = await this.saveFile(m, poll.url);
        return this.updateMedia(id, { status: "ready", progress: 100, remote, ...dims, ...(file ? { file } : {}) });
      }
    } catch (err) {
      console.error("[generar] ha fallado", err);
      this.updateMedia(id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.jobs.delete(id);
    }
  }

  /** Downloads the result into the node's `_media/`; returns its file name (none without a team folder). */
  private async saveFile(m: Media, url: string): Promise<string | null> {
    const s = this.loaded();
    const node = s.nodes.find((n) => n.id === m.nodeId);
    if (!this.files || !this.generator || !node) return null;
    const blob = await this.generator.download(url);
    const file = mediaFileName(codeOf(s.production, node), m.kind, m.version, extensionOf(blob.type, url, m.kind));
    const path = this.files.mediaPath(s.production, s.nodes, node, file, s.groups);
    if (!path) return null;
    await this.files.saveMedia(path, blob);
    return file;
  }

  /** After a reload: pick up the jobs this device left running. */
  private resumeJobs(): void {
    if (!this.generator) return;
    for (const m of this.state?.media ?? []) {
      if (m.status !== "queued" && m.status !== "rendering") continue;
      if (m.generation?.params?.deviceId !== this.deviceId) continue;
      if (m.remote) void this.runJob(m.id);
      // Never reached the provider: it can't be picked up.
      else this.updateMedia(m.id, { status: "failed", error: "Se interrumpió antes de llegar a Magnific." });
    }
  }

  setArchived(mediaId: Id, archived: boolean): void {
    // Protected while a take uses it.
    if (archived && this.loaded().takes.some((t) => t.mediaId === mediaId)) return;
    this.updateMedia(mediaId, { archived });
  }

  // ---------- takes ----------

  placeTakes(mediaId: Id, placements: Placement[]): void {
    if (!this.loaded().media.some((m) => m.id === mediaId)) return;
    for (const pl of placements) {
      const s = this.loaded();
      let nodeId: Id | undefined;
      if ("nodeId" in pl.target) nodeId = pl.target.nodeId;
      else nodeId = this.apply(planCreateNode(s.production, this.board(), pl.target.newChildOf, this.newId("n"), `Corte ${pl.segment.inSec}–${pl.segment.outSec}s`));
      const node = nodeId ? this.loaded().nodes.find((n) => n.id === nodeId) : undefined;
      if (!node) continue;
      const take = { id: this.newId("tk"), nodeId: node.id, mediaId, inSec: pl.segment.inSec, outSec: pl.segment.outSec, createdBy: this.me.uid, createdAt: this.now() };
      this.write([
        { type: "take.added", take },
        ...(node.selectedTakeId ? [] : [{ type: "node.updated" as const, id: node.id, patch: { selectedTakeId: take.id } }]),
      ]);
    }
  }

  selectTake(nodeId: Id, takeId: Id): void {
    this.apply(planUpdateNode(this.loaded().nodes, nodeId, { selectedTakeId: takeId }));
  }

  removeTake(takeId: Id): void {
    const s = this.loaded();
    const t = s.takes.find((x) => x.id === takeId);
    if (!t) return;
    const node = s.nodes.find((n) => n.id === t.nodeId);
    // The node falls back to another of its takes, if any.
    const next = s.takes.find((x) => x.nodeId === t.nodeId && x.id !== takeId)?.id;
    this.write([
      { type: "take.removed", id: takeId },
      ...(node?.selectedTakeId === takeId ? [{ type: "node.updated" as const, id: node.id, patch: { selectedTakeId: next } }] : []),
    ]);
  }

  splitIntoShots(mediaId: Id, segments: Segment[]): Id[] {
    const s = this.loaded();
    const media = s.media.find((m) => m.id === mediaId);
    if (!media) return [];
    const plan = planSplitShot(s.production, s.nodes, media, segments, this.newId, this.me.uid, this.now());
    this.apply(plan);
    return plan.nodeIds;
  }

  unshelveNode(nodeId: Id): number | undefined {
    const s = this.loaded();
    const plan = planUnshelveNode(s.production, s.nodes, nodeId);
    this.apply(plan);
    return plan.renumbered;
  }

  // ---------- not available yet in local mode ----------

  addComment(_nodeId: Id, _text: string, _mediaId?: Id, _atSec?: number): void {
    notYet("comentar");
  }
  setCommentResolved(_commentId: Id, _resolved: boolean): void {
    notYet("resolver comentarios");
  }
  setPresence(_nodeId: Id | undefined): void {
    // Presence needs real time (stage C).
  }
  linkFolder(): void {
    notYet("cambiar de carpeta");
  }
}

function notYet(what: string): void {
  console.warn(`[local] Todavía no se puede ${what} en modo local.`);
}

function extensionOf(type: string, url: string, kind: Media["kind"]): string {
  const known: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
  if (known[type]) return known[type]!;
  const m = /\.([a-z0-9]{3,4})(?:[?#]|$)/i.exec(url);
  return m ? m[1]!.toLowerCase() : kind === "video" ? "mp4" : "png";
}
