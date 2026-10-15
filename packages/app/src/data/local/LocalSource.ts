/**
 * DataSource over a production folder (docs/ARCHITECTURE.md §2.1, stage A).
 *
 * Every intent becomes events appended to this device's log; the Snapshot is
 * the fold of all devices' logs. Writes apply locally at once and are saved in
 * the background (retrying on failure); changes from other devices arrive
 * through `LogStore.watch` and are merged on top.
 *
 * Structure only for now: production, levels, statuses, nodes and members.
 * Generation, takes, comments and presence come in later steps.
 */

import {
  foldLog,
  formatStamp,
  hlcObserve,
  hlcTick,
  LOG_VERSION,
  logFilePath,
  parseLog,
  parseStamp,
  planCreateNode,
  planDeleteNode,
  planInsertAfter,
  planMoveNode,
  planMoveNodes,
  planRestoreNode,
  planSetNumber,
  planTrashNode,
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
  type Member,
  type NodePatch,
  type Plan,
  type ProdNode,
  type Production,
  type StatusDef,
} from "@sweetflow/domain";
import type { DataSource, GenerateArgs, Placement, Snapshot } from "../source";
import type { LogStore } from "./store";

export interface LocalSourceOptions {
  store: LogStore;
  /** Stable per installation; names this device's log files. */
  deviceId: Id;
  me: Member;
  /** Production to create when the folder has none yet. */
  create?: Pick<Production, "id" | "name" | "levels" | "statuses"> & { format?: string };
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

  /** Resolves when the folder has been read (and the production created if asked). */
  readonly ready: Promise<void>;

  constructor(opts: LocalSourceOptions) {
    this.store = opts.store;
    this.deviceId = opts.deviceId;
    this.me = opts.me;
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? ((p) => `${p}_${crypto.randomUUID()}`);
    this.unwatch = this.store.watch(() => void this.reload());
    this.ready = this.reload().then(() => this.bootstrap(opts.create));
  }

  dispose(): void {
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
    for (const body of bodies) {
      this.clock = hlcTick(this.clock, this.now());
      const e = { ...body, v: LOG_VERSION, at: formatStamp(this.clock, this.deviceId), userId: this.me.uid } as LogEvent;
      this.events.set(e.at, e);
      this.unsaved.push(e);
    }
    this.refold();
    this.save();
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
      me: this.me,
      members,
      productions: [s.production],
      production: s.production,
      nodes: split.live,
      trash: split.trash,
      media: [],
      takes: [],
      comments: [],
      assets: [],
      activity: [],
      presence: [],
      mirror: { status: this.saveError ? "offline" : pending ? "syncing" : "synced", rootPath: this.store.label, pending },
      features: { generation: false, review: false, presence: false, team: false },
    };
    for (const l of this.listeners) l(this.snapshot);
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

  updateNode(nodeId: Id, patch: Partial<Pick<ProdNode, "title" | "notes" | "statusId" | "assigneeIds" | "assetIds">>): void {
    this.apply(planUpdateNode(this.loaded().nodes, nodeId, patch as NodePatch));
  }

  /** Rename the production itself (used by the dashboard). */
  renameProduction(name: string): void {
    this.loaded();
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

  // ---------- not available yet in local mode ----------

  generate(_args: GenerateArgs): void {
    notYet("generar");
  }
  setArchived(_mediaId: Id, _archived: boolean): void {
    notYet("archivar media");
  }
  placeTakes(_mediaId: Id, _placements: Placement[]): void {
    notYet("colocar tomas");
  }
  selectTake(_nodeId: Id, _takeId: Id): void {
    notYet("elegir toma");
  }
  removeTake(_takeId: Id): void {
    notYet("quitar tomas");
  }
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
