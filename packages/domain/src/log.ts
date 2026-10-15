/**
 * Production event log (docs/ARCHITECTURE.md §5.0). Each device appends to its
 * own JSONL files inside the production folder and never touches another
 * device's, so a shared Dropbox folder never produces conflicted copies. The
 * production state is the fold of every device's log in stamp order.
 *
 * This module covers structure: the production itself, its levels and
 * statuses, the node tree and who works on it. Media, takes and comments come
 * as new event types in later steps.
 */

import { parseStamp, type Stamp } from "./clock";
import { byNumber, splitTrash } from "./tree";
import type { Id, LevelDef, Member, Millis, ProdNode, Production, StatusDef } from "./types";

/** Bump when an event's shape changes incompatibly. */
export const LOG_VERSION = 1;

/** Node fields that change with last-writer-wins, one field at a time. */
export type NodePatch = Partial<Pick<ProdNode, "title" | "notes" | "statusId" | "assigneeIds" | "assetIds" | "selectedTakeId">>;

export type LogEventBody =
  | {
      type: "production.created";
      production: Pick<Production, "id" | "workspaceId" | "name" | "format" | "levels" | "statuses">;
    }
  | { type: "production.updated"; patch: Partial<Pick<Production, "name" | "format">> }
  /** Who is working on the production; written by each user on first open, and on profile changes. */
  | { type: "member.joined"; member: Pick<Member, "uid" | "displayName" | "email" | "role"> }
  | { type: "levels.set"; levels: LevelDef[] }
  | { type: "statuses.set"; statuses: StatusDef[] }
  | {
      type: "node.created";
      node: Pick<ProdNode, "id" | "parentId" | "levelId" | "number" | "title" | "statusId"> & { order?: number };
    }
  | { type: "node.updated"; id: Id; patch: NodePatch }
  /** New numbers (codes) for existing nodes: making room before an insert. */
  | { type: "node.renumbered"; numbers: Record<Id, number> }
  /**
   * Visual reorder and/or change of parent. `number` is set when the code
   * changes too (edited by hand, or taken in the new parent).
   */
  | { type: "node.moved"; id: Id; parentId: Id | null; order: number; number?: number }
  /** Removes the node and its whole subtree. */
  | { type: "node.trashed"; id: Id }
  /** `number`: a new one when its code was taken while it was in the trash. */
  | { type: "node.restored"; id: Id; number?: number }
  | { type: "node.deleted"; id: Id };

export type LogEvent = LogEventBody & {
  v: number;
  /** Hybrid logical clock stamp; unique, so it is also the event id. */
  at: Stamp;
  userId: Id;
};

export type LogEventType = LogEvent["type"];

/** Numbering clash resolved by the fold (two devices took the same number). */
export interface NumberConflict {
  nodeId: Id;
  /** Number the device chose. */
  wanted: number;
  /** Number the fold gave it. */
  got: number;
}

export interface LogState {
  /** null until a `production.created` event is seen. */
  production: Production | null;
  nodes: ProdNode[];
  members: Member[];
  conflicts: NumberConflict[];
  /** Highest stamp folded; feed it to `hlcObserve` before writing new events. */
  lastStamp: Stamp | null;
}

// ---------- serialization ----------

/**
 * Where a device appends its events, relative to the production folder. One
 * file per device and month keeps files small and never shared between writers.
 */
export function logFilePath(deviceId: Id, at: Millis): string {
  const d = new Date(at);
  const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `.sweetflow/log/${deviceId}/${month}.jsonl`;
}

export function serializeEvent(e: LogEvent): string {
  return JSON.stringify(e);
}

export interface ParseResult {
  events: LogEvent[];
  /** 1-based line numbers that could not be read (e.g. a partially synced last line). */
  badLines: number[];
}

/** Parse one JSONL log file. Unreadable lines are reported, never thrown. */
export function parseLog(text: string): ParseResult {
  const events: LogEvent[] = [];
  const badLines: number[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    try {
      const e: unknown = JSON.parse(line);
      if (isLogEvent(e)) events.push(e);
      else badLines.push(i + 1);
    } catch {
      badLines.push(i + 1);
    }
  });
  return { events, badLines };
}

const TYPES = new Set<string>([
  "production.created",
  "production.updated",
  "member.joined",
  "levels.set",
  "statuses.set",
  "node.created",
  "node.updated",
  "node.renumbered",
  "node.moved",
  "node.trashed",
  "node.restored",
  "node.deleted",
]);

function isLogEvent(e: unknown): e is LogEvent {
  if (typeof e !== "object" || e === null) return false;
  const x = e as Record<string, unknown>;
  return (
    typeof x.v === "number" &&
    x.v <= LOG_VERSION &&
    typeof x.at === "string" &&
    parseStamp(x.at) !== null &&
    typeof x.userId === "string" &&
    typeof x.type === "string" &&
    TYPES.has(x.type)
  );
}

// ---------- fold ----------

const wallOf = (s: Stamp): Millis => parseStamp(s)?.clock.wall ?? 0;

/**
 * Production state from events of any number of devices, in any order.
 * Deterministic: the same set of events always gives the same state.
 *
 * - Events apply in stamp order; per field, the last write wins.
 * - A trashed node keeps its place and number but takes no part in number
 *   clashes until it is restored.
 * - A deleted node ignores later events, and its subtree disappears (also
 *   children another device created concurrently).
 * - Siblings that end up with the same number are separated: the node whose
 *   number was set first keeps it, the other moves to the next free gap.
 */
export function foldLog(events: LogEvent[]): LogState {
  const seen = new Set<Stamp>();
  const sorted = events
    .filter((e) => (seen.has(e.at) ? false : (seen.add(e.at), true)))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  // Widened on purpose: assignments happen inside the switch below.
  let production = null as Production | null;
  const nodes = new Map<Id, ProdNode>();
  /** Stamp of the last number assignment, to decide who keeps a clashing number. */
  const numberAt = new Map<Id, Stamp>();
  const deleted = new Set<Id>();
  const members = new Map<Id, Member>();

  for (const e of sorted) {
    const at = wallOf(e.at);
    switch (e.type) {
      case "production.created":
        if (!production) {
          production = { ...e.production, createdAt: at, updatedAt: at };
        }
        break;
      case "production.updated":
        if (production) production = { ...production, ...e.patch, updatedAt: at };
        break;
      case "member.joined":
        members.set(e.member.uid, { ...members.get(e.member.uid), ...e.member, magnificConnected: false });
        break;
      case "levels.set":
        if (production) production = { ...production, levels: e.levels, updatedAt: at };
        break;
      case "statuses.set":
        if (production) production = { ...production, statuses: e.statuses, updatedAt: at };
        break;
      case "node.created":
        if (!nodes.has(e.node.id) && !deleted.has(e.node.id)) {
          nodes.set(e.node.id, {
            ...e.node,
            productionId: production?.id ?? "",
            notes: "",
            assigneeIds: [],
            assetIds: [],
            updatedAt: at,
            updatedBy: e.userId,
          });
          numberAt.set(e.node.id, e.at);
        }
        break;
      case "node.updated": {
        const n = nodes.get(e.id);
        if (n) nodes.set(e.id, { ...n, ...e.patch, updatedAt: at, updatedBy: e.userId });
        break;
      }
      case "node.renumbered":
        for (const [id, number] of Object.entries(e.numbers)) {
          const n = nodes.get(id);
          if (!n) continue;
          nodes.set(id, { ...n, number, updatedAt: at, updatedBy: e.userId });
          numberAt.set(id, e.at);
        }
        break;
      case "node.moved": {
        const n = nodes.get(e.id);
        if (!n) break;
        const reparented = n.parentId !== e.parentId;
        nodes.set(e.id, { ...n, parentId: e.parentId, order: e.order, number: e.number ?? n.number, updatedAt: at, updatedBy: e.userId });
        // A node arriving in a new parent yields its number to the ones already there.
        if (reparented || e.number !== undefined) numberAt.set(e.id, e.at);
        break;
      }
      case "node.trashed": {
        const n = nodes.get(e.id);
        if (n) nodes.set(e.id, { ...n, trashedAt: at, updatedAt: at, updatedBy: e.userId });
        break;
      }
      case "node.restored": {
        const n = nodes.get(e.id);
        if (!n) break;
        const { trashedAt: _gone, ...rest } = n;
        nodes.set(e.id, { ...rest, number: e.number ?? n.number, updatedAt: at, updatedBy: e.userId });
        // Back on the board it competes for its number like a node arriving there.
        numberAt.set(e.id, e.at);
        break;
      }
      case "node.deleted":
        deleted.add(e.id);
        nodes.delete(e.id);
        break;
    }
  }

  const productionId = production?.id ?? "";
  const live = pruneOrphans([...nodes.values()].map((n) => ({ ...n, productionId })));
  // Codes only clash on the board: what is in the trash keeps its number untouched.
  const conflicts = production ? separateClashes(production, splitTrash(live).live, numberAt) : [];

  return { production, nodes: live, members: [...members.values()], conflicts, lastStamp: sorted.at(-1)?.at ?? null };
}

/** Drop nodes whose parent is missing (deleted, or never synced). */
function pruneOrphans(nodes: ProdNode[]): ProdNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const alive = new Map<Id, boolean>();
  const isAlive = (n: ProdNode, depth = 0): boolean => {
    const known = alive.get(n.id);
    if (known !== undefined) return known;
    if (n.parentId === null) return true;
    const parent = byId.get(n.parentId);
    // depth guard: a parent cycle can only come from corrupt data
    const ok = parent !== undefined && depth < 64 && isAlive(parent, depth + 1);
    alive.set(n.id, ok);
    return ok;
  };
  return nodes.filter((n) => isAlive(n));
}

function separateClashes(p: Production, nodes: ProdNode[], numberAt: Map<Id, Stamp>): NumberConflict[] {
  const conflicts: NumberConflict[] = [];
  const groups = new Map<Id | null, ProdNode[]>();
  for (const n of nodes) groups.set(n.parentId, [...(groups.get(n.parentId) ?? []), n]);

  for (const siblings of groups.values()) {
    // Earlier assignment first, so it keeps the number.
    siblings.sort((a, b) => byNumber(a, b) || cmp(numberAt.get(a.id), numberAt.get(b.id)) || cmp(a.id, b.id));
    const used = new Set<number>();
    for (let i = 0; i < siblings.length; i++) {
      const n = siblings[i]!;
      if (!used.has(n.number)) {
        used.add(n.number);
        continue;
      }
      const nextTaken = siblings.slice(i + 1).find((s) => s.number > n.number)?.number;
      const step = p.levels.find((l) => l.id === n.levelId)?.step ?? 10;
      const highest = Math.max(...siblings.map((s) => s.number));
      const got = freeNumber(n.number, nextTaken, highest, used, step);
      conflicts.push({ nodeId: n.id, wanted: n.number, got });
      n.number = got;
      used.add(got);
    }
  }
  return conflicts;
}

/** Midpoint of the gap after `taken`; past the last sibling when there is no gap. */
function freeNumber(taken: number, nextTaken: number | undefined, highest: number, used: Set<number>, step: number): number {
  if (nextTaken !== undefined) {
    for (let c = taken + Math.max(1, Math.floor((nextTaken - taken) / 2)); c < nextTaken; c++) {
      if (!used.has(c)) return c;
    }
  }
  return Math.floor(Math.max(highest, ...used) / step) * step + step;
}

function cmp(a: string | undefined, b: string | undefined): number {
  return (a ?? "") < (b ?? "") ? -1 : (a ?? "") > (b ?? "") ? 1 : 0;
}
