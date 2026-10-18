/**
 * In-memory DataSource for UI validation. Behaves like the real backend from
 * the UI's point of view: async generation jobs with progress, numbering and
 * version allocation, teammates' presence moving around, and a folder mirror
 * that catches up after each change.
 */

import {
  ancestorsOf,
  childrenOf,
  descendantsOf,
  levelIndex,
  nextNumber,
  planCreateNode,
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
  type Activity,
  type Id,
  type LevelDef,
  type Media,
  type Plan,
  type ProdNode,
  type RowItem,
  type Segment,
  type StatusDef,
  type Take,
} from "@sweetflow/domain";
import { ALL_FEATURES, type DataSource, type GenerateArgs, type NewComment, type Placement, type Snapshot } from "../source";
import { frame, type Mood } from "./frames";
import { buildSeed, newId } from "./seed";

const MOODS: Mood[] = ["dawn", "noon", "dusk", "night", "storm", "interior"];

export class MockSource implements DataSource {
  private s: Snapshot;
  private listeners = new Set<(s: Snapshot) => void>();
  private moods: Record<Id, Mood>;
  private teamTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const { moods, ...seed } = buildSeed();
    this.moods = moods;
    this.s = {
      ...seed,
      trash: [],
      shelf: [],
      groups: [],
      presence: [
        { uid: "u_laura", nodeId: seed.nodes.find((n) => n.title === "La linterna se enciende")?.id, at: Date.now() },
        { uid: "u_marc", nodeId: seed.nodes.find((n) => n.title === "Mar abierto")?.id, at: Date.now() },
      ],
      mirror: { status: "synced", rootPath: "~/Producciones/Mareas-Ep01-La-partida", pending: 0 },
      features: ALL_FEATURES,
    };
    // Resume the seeded in-flight render.
    for (const m of this.s.media) if (m.status === "rendering") this.runJob(m.id, 6000);
    this.simulateTeam();
  }

  dispose(): void {
    if (this.teamTimer) clearInterval(this.teamTimer);
    this.listeners.clear();
  }

  subscribe(cb: (s: Snapshot) => void): () => void {
    this.listeners.add(cb);
    cb(this.s);
    return () => this.listeners.delete(cb);
  }

  private commit(next: Partial<Snapshot>, touchesFiles = false): void {
    this.s = { ...this.s, ...next };
    if (touchesFiles && this.s.mirror.status !== "unlinked") this.bumpMirror();
    for (const l of this.listeners) l(this.s);
  }

  private bumpMirror(): void {
    const pending = this.s.mirror.pending + 1;
    this.s = { ...this.s, mirror: { ...this.s.mirror, status: "syncing", pending } };
    setTimeout(() => {
      const left = Math.max(0, this.s.mirror.pending - 1);
      this.commit({ mirror: { ...this.s.mirror, pending: left, status: left ? "syncing" : "synced" } });
    }, 900 + Math.random() * 900);
  }

  private log(kind: Activity["kind"], text: string, nodeId?: Id): Activity {
    return { id: newId("ac"), productionId: this.s.production.id, nodeId, kind, actorId: this.s.me.uid, text, at: Date.now() };
  }

  private patchNodes(fn: (n: ProdNode) => ProdNode | null): ProdNode[] {
    return this.s.nodes.flatMap((n) => {
      const r = fn(n);
      return r ? [r] : [];
    });
  }

  // ---------- structure ----------

  createNode(parentId: Id | null, title = ""): Id {
    const id = this.applyPlan(planCreateNode(this.s.production, this.s.nodes, parentId, newId("n"), title))!;
    const n = this.s.nodes.find((x) => x.id === id)!;
    const level = this.s.production.levels.find((l) => l.id === n.levelId)!;
    this.commit({ activity: [this.log("structure", `creó ${level.name.toLowerCase()}`, id), ...this.s.activity] });
    return id;
  }

  insertAfter(nodeId: Id): Id {
    return this.applyPlan(planInsertAfter(this.s.production, this.s.nodes, nodeId, newId("n")))!;
  }

  moveNode(nodeId: Id, dir: -1 | 1): void {
    this.applyPlan(planMoveNode(this.s.production, this.s.nodes, nodeId, dir));
  }

  moveNodes(ids: Id[], parentId: Id | null, beforeId: Id | null): void {
    this.applyPlan(planMoveNodes(this.s.production, this.s.nodes, ids, parentId, beforeId));
  }

  setNodeNumber(nodeId: Id, number: number): void {
    this.applyPlan(planSetNumber(this.s.production, this.s.nodes, nodeId, number));
  }

  /** Applies the structural events a domain planner returns (the demo keeps no log). */
  private applyPlan(plan: Plan): Id | undefined {
    if (!plan.events.length) return plan.nodeId;
    let nodes = this.s.nodes;
    let groups = this.s.groups;
    const stamp = { updatedAt: Date.now(), updatedBy: this.s.me.uid };
    for (const e of plan.events) {
      if (e.type === "node.created") {
        nodes = [...nodes, { ...e.node, productionId: this.s.production.id, notes: "", assigneeIds: [], assetIds: [], ...stamp }];
      } else if (e.type === "node.moved") {
        nodes = nodes.map((n) => (n.id === e.id ? { ...n, parentId: e.parentId, order: e.order, number: e.number ?? n.number, ...stamp } : n));
      } else if (e.type === "node.renumbered") {
        nodes = nodes.map((n) => (e.numbers[n.id] === undefined ? n : { ...n, number: e.numbers[n.id]!, ...stamp }));
      } else if (e.type === "node.updated") {
        nodes = nodes.map((n) => (n.id === e.id ? { ...n, ...e.patch, ...stamp } : n));
      } else if (e.type === "group.created") {
        groups = [...groups, { ...e.group, productionId: this.s.production.id }];
      } else if (e.type === "group.updated") {
        groups = groups.map((g) => (g.id === e.id ? { ...g, ...e.patch } : g));
      } else if (e.type === "group.deleted") {
        groups = groups.filter((g) => g.id !== e.id);
      }
    }
    this.commit({ nodes, groups }, true);
    return plan.nodeId;
  }

  trashNode(nodeId: Id): void {
    const all = this.all();
    if (!planTrashNode(all, nodeId).events.length) return;
    this.setAll(all.map((n) => (n.id === nodeId ? { ...n, trashedAt: Date.now() } : n)));
  }

  restoreNode(nodeId: Id): number | undefined {
    const all = this.all();
    const plan = planRestoreNode(this.s.production, all, nodeId);
    if (!plan.events.length) return undefined;
    this.setAll(all.map((n) => {
      if (n.id !== nodeId) return n;
      const { trashedAt: _gone, ...rest } = n;
      return { ...rest, number: plan.renumbered ?? n.number, updatedAt: Date.now(), updatedBy: this.s.me.uid };
    }));
    return plan.renumbered;
  }

  /** Board, trash and «Vídeos editados» in one list. */
  private all(): ProdNode[] {
    return [...this.s.nodes, ...this.s.trash, ...this.s.shelf];
  }

  /** Board, trash and «Vídeos editados» from one list. */
  private setAll(all: ProdNode[], extra: Partial<Snapshot> = {}): void {
    const { live, trash, shelf } = splitTrash(all);
    this.commit({ ...extra, nodes: live, trash, shelf }, true);
  }

  deleteNode(nodeId: Id): void {
    const all = this.all();
    const ids = new Set([nodeId, ...descendantsOf(all, nodeId).map((d) => d.id)]);
    const mediaIds = new Set(this.s.media.filter((m) => ids.has(m.nodeId)).map((m) => m.id));
    const { live, trash, shelf } = splitTrash(all.filter((n) => !ids.has(n.id)));
    this.commit(
      {
        nodes: live,
        trash,
        shelf,
        media: this.s.media.filter((m) => !mediaIds.has(m.id)),
        takes: this.s.takes.filter((t) => !ids.has(t.nodeId) && !mediaIds.has(t.mediaId)),
        comments: this.s.comments.filter((c) => !ids.has(c.nodeId)),
      },
      true,
    );
  }

  groupShots(ids: Id[], target: { shotId: Id } | { groupId: Id }): Id | undefined {
    const plan = planGroupShots(this.s.production, this.s.nodes, this.s.groups, ids, target, newId("g"), Date.now());
    this.applyPlan(plan);
    return plan.groupId;
  }

  placeInRow(moving: RowItem[], rowId: Id, before: RowItem | null, groupId: Id | null): void {
    this.applyPlan(planPlaceInRow(this.s.production, this.s.nodes, this.s.groups, moving, rowId, before, groupId));
  }

  ungroupShots(ids: Id[]): void {
    this.applyPlan(planUngroupShots(this.s.nodes, this.s.groups, ids));
  }

  dissolveGroup(groupId: Id): void {
    this.applyPlan(planDissolveGroup(this.s.nodes, this.s.groups, groupId));
  }

  renameGroup(groupId: Id, name: string): void {
    this.applyPlan(planRenameGroup(this.s.groups, groupId, name));
  }

  updateNode(nodeId: Id, patch: Partial<ProdNode>): void {
    const prev = this.s.nodes.find((n) => n.id === nodeId);
    if (!prev) return;
    const activity = [...this.s.activity];
    if (patch.statusId && patch.statusId !== prev.statusId) {
      const name = (id: Id) => this.s.production.statuses.find((s) => s.id === id)?.name ?? "?";
      activity.unshift(this.log("status", `cambió el estado de ${name(prev.statusId)} a ${name(patch.statusId)}`, nodeId));
    }
    this.commit(
      { nodes: this.patchNodes((n) => (n.id === nodeId ? { ...n, ...patch, updatedAt: Date.now(), updatedBy: this.s.me.uid } : n)), activity },
      "title" in patch || "statusId" in patch,
    );
  }

  // ---------- configuration ----------

  updateLevels(levels: LevelDef[]): void {
    this.commit({ production: { ...this.s.production, levels } }, true);
  }

  updateStatuses(statuses: StatusDef[]): void {
    this.commit({ production: { ...this.s.production, statuses } });
  }

  openProduction(productionId: Id): void {
    const p = this.s.productions.find((x) => x.id === productionId);
    // The demo only ships one populated production; the others open empty-named.
    if (p && p.id === this.s.production.id) this.commit({});
  }

  // ---------- production ----------

  generate(a: GenerateArgs): void {
    // One version per result asked for.
    for (let i = 0; i < Math.max(1, Math.min(8, a.count ?? 1)); i++) this.generateOne(a);
  }

  private generateOne(a: GenerateArgs): void {
    const version = Math.max(0, ...this.s.media.filter((m) => m.nodeId === a.nodeId && m.kind === a.kind).map((m) => m.version)) + 1;
    const m: Media = {
      id: newId("m"),
      productionId: this.s.production.id,
      nodeId: a.nodeId,
      kind: a.kind,
      version,
      origin: "generated",
      status: "queued",
      progress: 3,
      durationSec: a.kind !== "image" ? a.durationSec ?? 5 : undefined,
      archived: false,
      generation: { provider: "magnific", model: a.model, prompt: a.prompt, sourceMediaId: a.sourceMediaId, launchedBy: this.s.me.uid, credits: a.kind === "video" ? 45 : 8 },
      createdBy: this.s.me.uid,
      createdAt: Date.now(),
    };
    const me = { ...this.s.me, magnificCredits: (this.s.me.magnificCredits ?? 0) - (m.generation!.credits ?? 0) };
    this.commit({
      media: [...this.s.media, m],
      me,
      members: this.s.members.map((x) => (x.uid === me.uid ? me : x)),
      activity: [this.log("generate", `lanzó ${a.kind === "video" ? `un vídeo de ${a.durationSec}s` : a.kind === "audio" ? `un audio de ${a.durationSec}s` : "una imagen"}`, a.nodeId), ...this.s.activity],
    });
    this.runJob(m.id, a.kind === "video" ? 7000 : 3500);
  }

  private runJob(mediaId: Id, totalMs: number): void {
    const started = Date.now();
    const tick = () => {
      const m = this.s.media.find((x) => x.id === mediaId);
      if (!m) return;
      const p = Math.min(100, Math.max(m.progress, Math.round(((Date.now() - started) / totalMs) * 100)));
      if (p < 100) {
        this.commit({ media: this.s.media.map((x) => (x.id === mediaId ? { ...x, status: "rendering", progress: p } : x)) });
        setTimeout(tick, 400);
        return;
      }
      const node = this.s.nodes.find((n) => n.id === m.nodeId);
      const mood = MOODS[Math.abs([...(node?.id ?? "x")].reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % MOODS.length]!;
      this.moods[mediaId] = mood;
      const url = frame(`${mediaId}-gen`, mood);
      this.commit({ media: this.s.media.map((x) => (x.id === mediaId ? { ...x, status: "ready", progress: 100, url, thumbUrl: url, width: 1920, height: 1080 } : x)) }, true);
    };
    setTimeout(tick, 500);
  }

  setArchived(mediaId: Id, archived: boolean): void {
    if (archived && this.s.takes.some((t) => t.mediaId === mediaId)) return; // protected: in use
    this.commit({ media: this.s.media.map((m) => (m.id === mediaId ? { ...m, archived } : m)) }, true);
  }

  placeTakes(mediaId: Id, placements: Placement[]): void {
    let nodes = this.s.nodes;
    const takes = [...this.s.takes];
    const { production } = this.s;
    for (const pl of placements) {
      let targetId: Id;
      if ("nodeId" in pl.target) targetId = pl.target.nodeId;
      else {
        const parent = nodes.find((n) => n.id === (pl.target as { newChildOf: Id }).newChildOf)!;
        const level = production.levels[levelIndex(production, parent) + 1]!;
        const n: ProdNode = {
          id: newId("n"), productionId: production.id, parentId: parent.id, levelId: level.id,
          number: nextNumber(childrenOf(nodes, parent.id), level.step),
          title: `Corte ${pl.segment.inSec}–${pl.segment.outSec}s`, notes: "",
          statusId: production.statuses[0]!.id,
          assigneeIds: [this.s.me.uid], assetIds: [], updatedAt: Date.now(), updatedBy: this.s.me.uid,
        };
        nodes = [...nodes, n];
        targetId = n.id;
      }
      const t = { id: newId("tk"), productionId: production.id, nodeId: targetId, mediaId, inSec: pl.segment.inSec, outSec: pl.segment.outSec, thumbUrl: frame(`${mediaId}@${pl.segment.inSec}`, this.moods[mediaId] ?? "noon"), createdBy: this.s.me.uid, createdAt: Date.now() };
      takes.push(t);
      nodes = nodes.map((n) => (n.id === targetId && !n.selectedTakeId ? { ...n, selectedTakeId: t.id } : n));
    }
    const m = this.s.media.find((x) => x.id === mediaId);
    this.commit({ nodes, takes, activity: [this.log("take", `colocó ${placements.length} tramo${placements.length > 1 ? "s" : ""}`, m?.nodeId), ...this.s.activity] }, true);
  }

  splitIntoShots(mediaId: Id, segments: Segment[]): Id[] {
    const media = this.s.media.find((m) => m.id === mediaId);
    if (!media) return [];
    const now = Date.now();
    const plan = planSplitShot(this.s.production, this.all(), media, segments, newId, this.s.me.uid, now);
    if (!plan.events.length) return [];
    let all = this.all();
    const takes: Take[] = [...this.s.takes];
    const stamp = { updatedAt: now, updatedBy: this.s.me.uid };
    for (const e of plan.events) {
      if (e.type === "node.created") all = [...all, { ...e.node, productionId: this.s.production.id, notes: "", assigneeIds: [], assetIds: [], ...stamp }];
      else if (e.type === "take.added") takes.push({ ...e.take, productionId: this.s.production.id, thumbUrl: frame(`${mediaId}@${e.take.inSec}`, this.moods[mediaId] ?? "noon") });
      else if (e.type === "node.updated") all = all.map((n) => (n.id === e.id ? { ...n, ...e.patch } : n));
      else if (e.type === "node.shelved") all = all.map((n) => (n.id === e.id ? { ...n, shelvedAt: now, ...stamp } : n));
    }
    this.setAll(all, { takes, activity: [this.log("take", `cortó en ${plan.nodeIds.length} plano${plan.nodeIds.length > 1 ? "s" : ""}`, plan.nodeIds[0]), ...this.s.activity] });
    return plan.nodeIds;
  }

  unshelveNode(nodeId: Id): number | undefined {
    const plan = planUnshelveNode(this.s.production, this.all(), nodeId);
    if (!plan.events.length) return undefined;
    this.setAll(this.all().map((n) => {
      if (n.id !== nodeId) return n;
      const { shelvedAt: _gone, ...rest } = n;
      return { ...rest, number: plan.renumbered ?? n.number, updatedAt: Date.now(), updatedBy: this.s.me.uid };
    }));
    return plan.renumbered;
  }

  selectTake(nodeId: Id, takeId: Id): void {
    this.commit({ nodes: this.patchNodes((n) => (n.id === nodeId ? { ...n, selectedTakeId: takeId } : n)) }, true);
  }

  removeTake(takeId: Id): void {
    const t = this.s.takes.find((x) => x.id === takeId);
    if (!t) return;
    const takes = this.s.takes.filter((x) => x.id !== takeId);
    this.commit({
      takes,
      nodes: this.patchNodes((n) => (n.selectedTakeId === takeId ? { ...n, selectedTakeId: takes.find((x) => x.nodeId === n.id)?.id } : n)),
    }, true);
  }

  // ---------- review ----------

  addComment(n: NewComment): Id {
    const c = { ...n, id: newId("c"), productionId: this.s.production.id, authorId: this.s.me.uid, resolved: false, createdAt: Date.now() };
    this.commit({ comments: [...this.s.comments, c], activity: [this.log("comment", n.parentId ? "respondió a un comentario" : "comentó", n.nodeId), ...this.s.activity] }, true);
    return c.id;
  }

  deleteComment(commentId: Id): void {
    this.commit({ comments: this.s.comments.filter((c) => c.id !== commentId && c.parentId !== commentId) });
  }

  setCommentResolved(commentId: Id, resolved: boolean): void {
    this.commit({ comments: this.s.comments.map((c) => (c.id === commentId ? { ...c, resolved } : c)) });
  }

  // ---------- collaboration & mirror ----------

  setPresence(nodeId: Id | undefined): void {
    const others = this.s.presence.filter((p) => p.uid !== this.s.me.uid);
    this.commit({ presence: [...others, { uid: this.s.me.uid, nodeId, at: Date.now() }] });
  }

  linkFolder(): void {
    if (this.s.mirror.status === "unlinked") {
      this.commit({ mirror: { status: "syncing", rootPath: "~/Producciones/Mareas-Ep01-La-partida", pending: 1 } });
      setTimeout(() => this.commit({ mirror: { ...this.s.mirror, status: "synced", pending: 0 } }), 1500);
    } else {
      this.commit({ mirror: { status: "unlinked", pending: 0 } });
    }
  }

  /** Teammates wander between nodes so presence is visible in the demo. */
  private simulateTeam(): void {
    this.teamTimer = setInterval(() => {
      const units = this.s.nodes.filter((n) => ancestorsOf(this.s.nodes, n).length === this.s.production.levels.length);
      if (!units.length) return;
      const who = Math.random() < 0.5 ? "u_laura" : "u_marc";
      const target = units[Math.floor(Math.random() * units.length)]!;
      this.commit({ presence: this.s.presence.map((p) => (p.uid === who ? { ...p, nodeId: target.id, at: Date.now() } : p)) });
    }, 9000);
  }
}
