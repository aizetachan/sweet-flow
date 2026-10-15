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
  numberBetween,
  renumbered,
  type Activity,
  type Id,
  type LevelDef,
  type Media,
  type ProdNode,
  type StatusDef,
} from "@sweetflow/domain";
import type { DataSource, GenerateArgs, Placement, Snapshot } from "../source";
import { frame, type Mood } from "./frames";
import { buildSeed, newId } from "./seed";

const MOODS: Mood[] = ["dawn", "noon", "dusk", "night", "storm", "interior"];

export class MockSource implements DataSource {
  private s: Snapshot;
  private listeners = new Set<(s: Snapshot) => void>();
  private moods: Record<Id, Mood>;

  constructor() {
    const { moods, ...seed } = buildSeed();
    this.moods = moods;
    this.s = {
      ...seed,
      presence: [
        { uid: "u_laura", nodeId: seed.nodes.find((n) => n.title === "La linterna se enciende")?.id, at: Date.now() },
        { uid: "u_marc", nodeId: seed.nodes.find((n) => n.title === "Mar abierto")?.id, at: Date.now() },
      ],
      mirror: { status: "synced", rootPath: "~/Producciones/Mareas-Ep01-La-partida", pending: 0 },
    };
    // Resume the seeded in-flight render.
    for (const m of this.s.media) if (m.status === "rendering") this.runJob(m.id, 6000);
    this.simulateTeam();
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
    const { production, nodes } = this.s;
    const parent = parentId ? nodes.find((n) => n.id === parentId) : undefined;
    const li = parent ? levelIndex(production, parent) + 1 : 0;
    const level = production.levels[li];
    if (!level) throw new Error("El último nivel no admite hijos");
    const n: ProdNode = {
      id: newId("n"),
      productionId: production.id,
      parentId,
      levelId: level.id,
      number: nextNumber(childrenOf(nodes, parentId), level.step),
      title,
      notes: "",
      statusId: production.statuses[0]!.id,
      assigneeIds: [],
      assetIds: [],
      updatedAt: Date.now(),
      updatedBy: this.s.me.uid,
    };
    this.commit({ nodes: [...nodes, n], activity: [this.log("structure", `creó ${level.name.toLowerCase()}`, n.id), ...this.s.activity] }, true);
    return n.id;
  }

  insertAfter(nodeId: Id): Id {
    const { production } = this.s;
    let nodes = this.s.nodes;
    const after = nodes.find((n) => n.id === nodeId)!;
    const level = production.levels[levelIndex(production, after)]!;
    let siblings = childrenOf(nodes, after.parentId);
    let num = numberBetween(after, siblings[siblings.findIndex((s) => s.id === nodeId) + 1], level.step);
    if (num === null) {
      const nums = renumbered(siblings, level.step);
      nodes = nodes.map((n) => (nums.has(n.id) ? { ...n, number: nums.get(n.id)! } : n));
      const a2 = nodes.find((n) => n.id === nodeId)!;
      siblings = childrenOf(nodes, after.parentId);
      num = numberBetween(a2, siblings[siblings.findIndex((s) => s.id === nodeId) + 1], level.step)!;
    }
    const n: ProdNode = { ...after, id: newId("n"), number: num, title: "", notes: "", statusId: production.statuses[0]!.id, assigneeIds: [], assetIds: [], selectedTakeId: undefined, updatedAt: Date.now(), updatedBy: this.s.me.uid };
    this.commit({ nodes: [...nodes, n] }, true);
    return n.id;
  }

  moveNode(nodeId: Id, dir: -1 | 1): void {
    const n = this.s.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    const sib = childrenOf(this.s.nodes, n.parentId);
    const i = sib.findIndex((x) => x.id === nodeId);
    const other = sib[i + dir];
    if (!other) return;
    this.commit({ nodes: this.patchNodes((x) => (x.id === n.id ? { ...x, number: other.number } : x.id === other.id ? { ...x, number: n.number } : x)) }, true);
  }

  deleteNode(nodeId: Id): void {
    const ids = new Set([nodeId, ...descendantsOf(this.s.nodes, nodeId).map((d) => d.id)]);
    const mediaIds = new Set(this.s.media.filter((m) => ids.has(m.nodeId)).map((m) => m.id));
    this.commit(
      {
        nodes: this.s.nodes.filter((n) => !ids.has(n.id)),
        media: this.s.media.filter((m) => !mediaIds.has(m.id)),
        takes: this.s.takes.filter((t) => !ids.has(t.nodeId) && !mediaIds.has(t.mediaId)),
        comments: this.s.comments.filter((c) => !ids.has(c.nodeId)),
      },
      true,
    );
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
      durationSec: a.kind === "video" ? a.durationSec ?? 5 : undefined,
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
      activity: [this.log("generate", `lanzó ${a.kind === "video" ? `un vídeo de ${a.durationSec}s` : "una imagen"}`, a.nodeId), ...this.s.activity],
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
          statusId: production.statuses[1]?.id ?? production.statuses[0]!.id,
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

  addComment(nodeId: Id, text: string, mediaId?: Id, atSec?: number): void {
    const c = { id: newId("c"), productionId: this.s.production.id, nodeId, mediaId, atSec, text, authorId: this.s.me.uid, resolved: false, createdAt: Date.now() };
    this.commit({ comments: [...this.s.comments, c] }, true);
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
    setInterval(() => {
      const units = this.s.nodes.filter((n) => ancestorsOf(this.s.nodes, n).length === this.s.production.levels.length);
      if (!units.length) return;
      const who = Math.random() < 0.5 ? "u_laura" : "u_marc";
      const target = units[Math.floor(Math.random() * units.length)]!;
      this.commit({ presence: this.s.presence.map((p) => (p.uid === who ? { ...p, nodeId: target.id, at: Date.now() } : p)) });
    }, 9000);
  }
}
