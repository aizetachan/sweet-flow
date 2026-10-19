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
  invertEvents,
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
  planExtractVersion,
  planSplitTakeShot,
  planGroupShots,
  planPlaceInRow,
  planCreateInRow,
  planShotsFromEdited,
  lastMadeFrom,
  planUngroupShots,
  planDissolveGroup,
  planRenameGroup,
  planTrashNode,
  planUnshelveNode,
  splitTrash,
  planUpdateNode,
  serializeEvent,
  ZERO_HLC,
  type Activity,
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
  type ClientEntry,
  type AssetType,
  planCreateLibNode,
  planMoveToLib,
  planPlaceLibMedia,
  type LibraryShare,
} from "@sweetflow/domain";
import { History, recordIntents } from "../history";
import { assetsFromLibrary } from "../libraryCards";
import { importKind, type BrowsePage, type BrowseQuery, type DataSource, type GenerateArgs, type ImportItem, type NewComment, type Placement, type RemoteFolder, type Snapshot, type UploadedRef } from "../source";
import type { Generator, GenerationRequest } from "../generation";
import type { ProductionFiles } from "../folder/ProductionFiles";
import type { LogStore } from "./store";
import { activityFrom } from "./activity";

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
  /**
   * Only to read it (another production's shared library, docs/INTERFAZ.md
   * §2.8.1): writes nothing, not even who opened it, and resumes no jobs.
   */
  readOnly?: boolean;
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
  /** Undo and redo (data/history.ts): the inverse events of each intent done here. */
  private history = new History<LogEventBody[]>();
  private recording: { undo: LogEventBody[]; label: string } | null = null;
  private replaying = false;
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
    recordIntents(
      this,
      (label) => (this.recording = { undo: [], label }),
      () => {
        const r = this.recording;
        this.recording = null;
        if (r?.undo.length) this.history.push({ undo: r.undo, label: r.label });
      },
    );
    this.store = opts.store;
    this.deviceId = opts.deviceId;
    this.me = opts.me;
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? ((p) => `${p}_${crypto.randomUUID()}`);
    this.files = opts.files;
    this.generator = opts.generator;
    this.unwatch = this.store.watch(() => void this.reload());
    this.ready = opts.readOnly
      ? this.reload()
      : this.reload()
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

  undo(): string | null {
    return this.history.undo((s) => this.replay(s));
  }

  redo(): string | null {
    return this.history.redo((s) => this.replay(s));
  }

  /** Writes a step's events; returns the step that reverses them. */
  private replay(s: { undo: LogEventBody[]; label: string }): { undo: LogEventBody[]; label: string } {
    const back = this.state ? invertEvents(this.state, s.undo) : [];
    this.replaying = true;
    try {
      this.write(s.undo);
    } finally {
      this.replaying = false;
    }
    return { undo: back, label: s.label };
  }

  private write(bodies: LogEventBody[]): void {
    if (!bodies.length) return;
    // Done by hand (inside an intent): how to undo it, from the state right before.
    if (this.recording && !this.replaying && this.state) {
      this.recording.undo.unshift(...invertEvents(this.state, bodies));
    }
    const before = this.state?.nodes ?? [];
    const groupsBefore = this.state?.groups ?? [];
    const mediaBefore = this.state?.media ?? [];
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
      const groupsAfter = this.state!.groups;
      this.filing = this.filing
        .then(() => files.follow(p, before, after, groupsBefore, groupsAfter))
        .catch((err) => console.error("[carpeta] no se pudieron mover las carpetas", err))
        // Files read while their folder was moving are found now.
        .then(() => this.emit());
    }
    // Media moved to another node (library): its file goes along.
    const moved = bodies.flatMap((b) => (b.type === "media.updated" && b.patch.nodeId ? [b.id] : []));
    if (this.files && p && moved.length) {
      const files = this.files;
      const after = this.state!.nodes;
      const groupsAfter = this.state!.groups;
      this.filing = this.filing
        .then(async () => {
          for (const id of moved) {
            const old = mediaBefore.find((m) => m.id === id);
            const from = old && before.find((n) => n.id === old.nodeId);
            const now = this.state?.media.find((m) => m.id === id);
            const to = now && after.find((n) => n.id === now.nodeId);
            if (!old?.file || !from || !to) continue;
            const a = files.mediaPath(p, before, from, old.file, groupsBefore);
            const b = files.mediaPath(p, after, to, old.file, groupsAfter);
            if (a && b) await files.moveFile(a, b);
          }
        })
        .catch((err) => console.error("[carpeta] no se pudieron mover los archivos", err))
        .then(() => this.emit());
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
      library: split.library,
      groups: s.groups,
      media: s.media.map((m) => this.withUrl(m, s)),
      takes: s.takes,
      comments: s.comments,
      assets: assetsFromLibrary(split.library, s.media.map((m) => this.withUrl(m, s))),
      activity: this.activity(s),
      presence: [],
      mirror: { status: this.saveError ? "offline" : pending ? "syncing" : "synced", rootPath: this.store.label, pending },
      features: { generation: !!this.generator, review: true, presence: false, team: false, takes: true },
    };
    for (const l of this.listeners) l(this.snapshot);
  }

  /** The history of every node, from the log (recomputed only when events change). */
  private activityCache: { count: number; list: Activity[] } = { count: -1, list: [] };
  private activity(s: LogState): Activity[] {
    if (this.activityCache.count !== this.events.size) this.activityCache = { count: this.events.size, list: activityFrom([...this.events.values()], s) };
    return this.activityCache.list;
  }

  /** Where to show a media from: its file in the team folder, or the provider's copy. */
  private withUrl(m: Media, s: LogState): Media {
    const node = s.nodes.find((n) => n.id === m.nodeId);
    let url: string | undefined;
    if (m.file && this.files && node && s.production) {
      const path = this.files.mediaPath(s.production, s.nodes, node, m.file, s.groups);
      if (path) url = this.files.url(path, () => this.emit(), `${m.id}/${m.file}`);
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

  // ---------- library (docs/INTERFAZ.md §2.8) ----------

  libraryDesk(): Id {
    const s = this.loaded();
    const desk = s.nodes.find((n) => n.lib?.kind === "desk" && !n.trashedAt);
    return desk?.id ?? this.apply(planCreateLibNode(s.production, { kind: "desk" }, "", this.newId("n"), s.nodes.filter((n) => n.lib)))!;
  }

  createLibGroup(name: string | null, mediaIds: Id[] = []): Id {
    const s = this.loaded();
    const id = this.apply(planCreateLibNode(s.production, { kind: "card" }, name ?? "", this.newId("n"), s.nodes.filter((n) => n.lib && !n.trashedAt)))!;
    if (mediaIds.length) this.placeLibMedia(mediaIds, id, null);
    return id;
  }

  placeLibMedia(mediaIds: Id[], toNodeId: Id, beforeId: Id | null): void {
    const s = this.loaded();
    this.apply(planPlaceLibMedia(s.media, s.nodes, mediaIds, toNodeId, beforeId));
  }

  moveToLib(mediaIds: Id[], toNodeId: Id, chosen?: boolean): void {
    const s = this.loaded();
    this.apply(planMoveToLib(s.media, s.nodes, mediaIds, toNodeId, chosen));
  }

  setChosen(mediaIds: Id[], chosen: boolean): void {
    const s = this.loaded();
    this.write(mediaIds.filter((id) => s.media.some((m) => m.id === id && !!m.chosen !== chosen)).map((id) => ({ type: "media.updated" as const, id, patch: { chosen } })));
  }

  setLibType(nodeId: Id, type: AssetType): void {
    const n = this.loaded().nodes.find((x) => x.id === nodeId);
    if (n?.lib?.kind !== "card" || n.lib.type === type) return;
    this.write([{ type: "node.updated", id: nodeId, patch: { lib: { kind: "card", type } } }]);
  }

  retryMedia(mediaId: Id): void {
    const m = this.loaded().media.find((x) => x.id === mediaId);
    const g = m?.generation;
    if (!m || !g || m.status !== "failed") return;
    const { deviceId: _d, ...settings } = (g.params ?? {}) as Record<string, unknown>;
    this.generate({ ...(settings as Partial<GenerateArgs>), nodeId: m.nodeId, kind: m.kind, prompt: g.prompt, model: g.model, ...(g.sourceMediaId ? { sourceMediaId: g.sourceMediaId } : {}), count: 1 });
    this.setArchived(mediaId, true);
  }

  setLibraryShare(share: LibraryShare | null): void {
    const cur = this.loaded().production.libraryShare ?? null;
    if (JSON.stringify(cur) === JSON.stringify(share)) return;
    this.write([{ type: "library.shared", share }]);
  }

  setForClient(nodeIds: Id[], on: boolean): void {
    const s = this.loaded();
    this.write(nodeIds.filter((id) => s.nodes.some((n) => n.id === id && !!n.forClient !== on)).map((id) => ({ type: "node.updated" as const, id, patch: { forClient: on } })));
  }

  setClientEntry(entry: ClientEntry): void {
    if ((this.loaded().production.client?.entry ?? "invite") === entry) return;
    this.write([{ type: "client.entry", entry }]);
  }

  addClientGuest(email: string, name?: string): void {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error("Escribe un email válido.");
    this.write([{ type: "client.guest.added", guest: { email: e, ...(name?.trim() ? { name: name.trim() } : {}) } }]);
  }

  removeClientGuest(email: string): void {
    this.write([{ type: "client.guest.removed", email }]);
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
    const now = this.now();
    // The model's settings travel with each version, to resume it after a reload.
    const { nodeId: _n, kind: _k, prompt: _p, model: _m, sourceMediaId: _s, count, ...settings } = args;
    const first = nextMediaVersion(s.media, args.nodeId, args.kind);
    // One version per result asked for (one job each).
    const ids = Array.from({ length: Math.max(1, Math.min(8, count ?? 1)) }, () => this.newId("m"));
    this.write(ids.map((id, i) => ({
      type: "media.added" as const,
      media: {
        id,
        nodeId: args.nodeId,
        kind: args.kind,
        version: first + i,
        origin: "generated" as const,
        status: "queued" as const,
        progress: 0,
        archived: false,
        generation: {
          provider: this.generator!.provider,
          model: args.model,
          prompt: args.prompt,
          params: { ...settings, deviceId: this.deviceId },
          sourceMediaId: args.sourceMediaId,
          launchedBy: this.me.uid,
        },
        createdBy: this.me.uid,
        createdAt: now,
      },
    })));
    for (const id of ids) void this.runJob(id);
  }

  /** The provider's folders mirror the team folder down to the node. */
  private providerPath(node: ProdNode): string[] {
    const s = this.loaded();
    const inTeam = this.files?.nodeDir(s.production, s.nodes, node, s.groups);
    return (inTeam ?? [safeTitle(s.production.name) || "Sweet-Flow", folderPath(s.production, s.nodes, node, s.groups)].join("/")).split("/");
  }

  private request(args: GenerateArgs): GenerationRequest {
    const s = this.loaded();
    const node = s.nodes.find((n) => n.id === args.nodeId)!;
    const segments = this.providerPath(node);
    // What the provider knows our media by (only what it generated has an id there).
    const remote = (id?: Id) => (id ? s.media.find((m) => m.id === id)?.remote?.id : undefined);
    const references = (args.references ?? []).flatMap((r) => {
      const id = r.ref ?? remote(r.mediaId);
      return id ? [{ type: r.type, id }] : [];
    });
    return {
      kind: args.kind,
      prompt: args.prompt,
      model: args.model,
      durationSec: args.durationSec,
      startFrom: args.sourceRef ?? remote(args.sourceMediaId),
      endOn: args.endRef ?? remote(args.endMediaId),
      references,
      mentions: (args.mentions ?? []).flatMap((m) => {
        const group = s.nodes.find((n) => n.id === m.groupId);
        // A group of another production's shared library comes already resolved (§2.8.1).
        if (!group && m.remote?.ids.length) {
          const t = m.remote.kind;
          const kind = t === "cast" ? "character" : t === "prop" ? "product" : t === "location" ? "locations" : t === "style" ? "style" : null;
          return [{ key: m.groupId, tag: m.tag, kind, ...(m.remote.description ? { description: m.remote.description } : {}), ids: m.remote.ids }];
        }
        const ids = m.mediaIds.map((id) => remote(id)).filter((x): x is string => !!x);
        if (!group || !ids.length) return [];
        const t = group.lib?.kind === "card" ? group.lib.type : undefined;
        const kind = t === "cast" ? "character" : t === "prop" ? "product" : t === "location" ? "locations" : t === "style" ? "style" : null;
        return [{ key: group.id, tag: m.tag, kind, ...(group.notes.trim() ? { description: group.notes.trim() } : {}), ids }];
      }),
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      sound: args.sound,
      instrumental: args.instrumental,
      loop: args.loop,
      folderPath: segments,
    };
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
        const settings = (g.params ?? {}) as Partial<GenerateArgs>;
        const started = await gen.start(this.request({ ...settings, nodeId: m.nodeId, kind: m.kind, prompt: g.prompt, model: g.model, sourceMediaId: g.sourceMediaId }));
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
    await this.files.saveMedia(path, blob, `${m.id}/${file}`);
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

  noteDuration(mediaId: Id, durationSec: number): void {
    const m = this.state?.media.find((x) => x.id === mediaId);
    if (m && !m.durationSec && durationSec > 0) this.updateMedia(mediaId, { durationSec });
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

  extractToRow(nodeId: Id, mediaId: Id, segment?: Segment): Id | undefined {
    const s = this.loaded();
    const media = s.media.find((m) => m.id === mediaId);
    if (!media) return undefined;
    return this.apply(planExtractVersion(s.production, this.board(), nodeId, media, this.newId, this.me.uid, this.now(), segment, { media: s.media, takes: s.takes, chosenBefore: this.chosenHistory(nodeId) }));
  }

  /** The takes a node has had chosen, newest first, from the log. */
  private chosenHistory(nodeId: Id): Id[] {
    const seen: Id[] = [];
    const events = [...this.events.values()].sort((x, y) => (x.at < y.at ? 1 : -1));
    for (const e of events) {
      if (e.type !== "node.updated" || e.id !== nodeId || !e.patch.selectedTakeId) continue;
      if (!seen.includes(e.patch.selectedTakeId)) seen.push(e.patch.selectedTakeId);
    }
    return seen;
  }

  splitTakeShot(nodeId: Id, segments: Segment[]): Id[] {
    const s = this.loaded();
    const node = s.nodes.find((n) => n.id === nodeId);
    const take = node?.selectedTakeId ? s.takes.find((t) => t.id === node.selectedTakeId) : undefined;
    if (!take) return [];
    const plan = planSplitTakeShot(s.production, this.board(), nodeId, take, segments, this.newId, this.me.uid, this.now());
    this.apply(plan);
    return plan.nodeIds;
  }

  shotsFromEdited(nodeId: Id, mediaId: Id, segments: Segment[]): Id[] {
    const s = this.loaded();
    const original = s.nodes.find((n) => n.id === nodeId && n.shelvedAt !== undefined);
    if (!original) return [];
    const live = this.board();
    const plan = planShotsFromEdited(s.production, live, original, lastMadeFrom(live, s.takes, original, mediaId), { id: mediaId }, segments, this.newId, this.me.uid, this.now());
    this.apply(plan);
    return plan.nodeIds;
  }

  unshelveNode(nodeId: Id): number | undefined {
    const s = this.loaded();
    const plan = planUnshelveNode(s.production, s.nodes, nodeId);
    this.apply(plan);
    return plan.renumbered;
  }

  // ---------- importing ----------

  importMedia(nodeId: Id, item: ImportItem): Id {
    const s = this.loaded();
    const kind = importKind(item);
    if (!kind) throw new Error("Solo se pueden importar imágenes, vídeos y audios.");
    if (!s.nodes.some((n) => n.id === nodeId)) throw new Error("Ese plano ya no existe.");
    const id = this.newId("m");
    const c = "creation" in item ? item.creation : undefined;
    this.write([{
      type: "media.added",
      media: {
        id,
        nodeId,
        kind,
        version: nextMediaVersion(s.media, nodeId, kind),
        origin: "uploaded",
        // Being copied into the shot's folder.
        status: "rendering",
        progress: 10,
        archived: false,
        ...(c ? { remote: { provider: c.provider, id: c.id, url: c.url, previewUrl: c.thumbUrl, folder: c.folder }, durationSec: c.durationSec, width: c.width, height: c.height } : {}),
        createdBy: this.me.uid,
        createdAt: this.now(),
      },
    }]);
    void this.copyIn(id, item);
    return id;
  }

  /** Copies an imported file into the node's `_media/` (from the computer, or downloaded from the provider). */
  private async copyIn(id: Id, item: ImportItem): Promise<void> {
    try {
      const m = this.loaded().media.find((x) => x.id === id);
      if (!m) return;
      if ("creation" in item) {
        // Without a team folder it is shown from the provider.
        const file = this.files && this.generator ? await this.saveFile(m, item.creation.url) : null;
        return this.updateMedia(id, { status: "ready", progress: 100, ...(file ? { file } : {}) });
      }
      const s = this.loaded();
      const node = s.nodes.find((n) => n.id === m.nodeId);
      if (!this.files || !node) return this.updateMedia(id, { status: "failed", error: "Hace falta la carpeta del equipo para guardar el archivo." });
      const file = mediaFileName(codeOf(s.production, node), m.kind, m.version, extensionOf(item.file.type, item.file.name, m.kind));
      const path = this.files.mediaPath(s.production, s.nodes, node, file, s.groups);
      if (!path) return this.updateMedia(id, { status: "failed", error: "Hace falta la carpeta del equipo para guardar el archivo." });
      await this.files.saveMedia(path, item.file, `${id}/${file}`);
      this.updateMedia(id, { status: "ready", progress: 100, file });
    } catch (err) {
      console.error("[importar] ha fallado", err);
      this.updateMedia(id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  }

  importShots(rowId: Id, items: ImportItem[], before: RowItem | null, groupId: Id | null): Id[] {
    const ids: Id[] = [];
    for (const item of items) {
      if (!importKind(item)) continue;
      const s = this.loaded();
      const id = this.apply(planCreateInRow(s.production, this.board(), s.groups, rowId, before, groupId, this.newId("n")))!;
      this.importMedia(id, item);
      ids.push(id);
    }
    return ids;
  }

  async uploadReference(nodeId: Id, from: File | { mediaId: Id }): Promise<UploadedRef> {
    const gen = this.generator;
    if (!gen?.upload) throw new Error("Conecta Magnific para usar archivos como referencia.");
    const s = this.loaded();
    const node = s.nodes.find((n) => n.id === nodeId);
    if (!node) throw new Error("Ese plano ya no existe.");
    const folder = this.providerPath(node);
    if (from instanceof File) return { ref: (await gen.upload(from, folder)).id };
    // Media of the production: once uploaded it keeps the provider's id.
    const m = s.media.find((x) => x.id === from.mediaId);
    if (!m) throw new Error("Esa versión ya no existe.");
    if (m.remote?.id && m.remote.provider === gen.provider) return { ref: m.remote.id };
    const url = this.withUrl(m, s).url;
    if (!url) throw new Error("No se encuentra el archivo de esa versión.");
    const blob = await (await fetch(url)).blob();
    const ext = (m.file?.split(".").pop() ?? blob.type.split("/")[1] ?? "bin").toLowerCase();
    const file = new File([blob], m.file ?? `${m.id}.${ext}`, { type: blob.type || (m.kind === "image" ? "image/png" : m.kind === "video" ? "video/mp4" : "audio/mpeg") });
    const { id } = await gen.upload(file, folder);
    this.updateMedia(m.id, { remote: { provider: gen.provider, id } });
    return { ref: id };
  }

  async browseCreations(q: BrowseQuery): Promise<BrowsePage> {
    if (!this.generator?.browse) throw new Error("No hay ninguna cuenta de Magnific conectada.");
    return this.generator.browse(q);
  }

  async browseFolders(parent: string | null): Promise<RemoteFolder[]> {
    if (!this.generator?.folders) throw new Error("No hay ninguna cuenta de Magnific conectada.");
    return this.generator.folders(parent);
  }

  // ---------- not available yet in local mode ----------

  // ---------- review ----------

  addComment(n: NewComment): Id {
    const id = this.newId("c");
    const clean = Object.fromEntries(Object.entries(n).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) as NewComment;
    this.write([{ type: "comment.added", comment: { ...clean, id, authorId: this.me.uid, resolved: false, createdAt: this.now() } }]);
    return id;
  }

  setCommentResolved(commentId: Id, resolved: boolean): void {
    const c = this.loaded().comments.find((x) => x.id === commentId);
    if (c && c.resolved !== resolved) this.write([{ type: "comment.updated", id: commentId, patch: { resolved } }]);
  }

  moveCommentToVersion(commentId: Id, mediaId: Id): void {
    const c = this.loaded().comments.find((x) => x.id === commentId);
    if (!c || c.mediaId === mediaId) return;
    const history = [...(c.history ?? []), ...(c.mediaId ? [{ mediaId: c.mediaId, at: this.now(), by: this.me.uid }] : [])];
    this.write([{ type: "comment.updated", id: commentId, patch: { mediaId, history } }]);
  }

  moveCommentMark(commentId: Id, mark: { point?: { x: number; y: number }; area?: { x: number; y: number; w: number; h: number } }): void {
    if (this.loaded().comments.some((x) => x.id === commentId && x.authorId === this.me.uid)) this.write([{ type: "comment.updated", id: commentId, patch: mark }]);
  }

  deleteComment(commentId: Id): void {
    if (this.loaded().comments.some((x) => x.id === commentId)) this.write([{ type: "comment.deleted", id: commentId }]);
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
  const known: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg" };
  if (known[type]) return known[type]!;
  const m = /\.([a-z0-9]{3,4})(?:[?#]|$)/i.exec(url);
  return m ? m[1]!.toLowerCase() : kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "png";
}
