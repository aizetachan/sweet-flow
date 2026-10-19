/**
 * Undo and redo (docs/INTERFAZ.md §2.9): what a user did is a batch of log
 * events; undoing it writes the events that put things back as they were
 * before it, worked out from the state just before the batch. Redo is the
 * same thing again, from the state before the undo.
 *
 * Only what people do by hand is undone: generations, uploads and progress
 * (they cost credits or time, and live on in the provider) are not, and a
 * shot created is put in the trash, never deleted, so nothing made in it is
 * ever lost.
 */

import type { LogEventBody, LogState, NodePatch, MediaPatch } from "./log";
import type { Id } from "./types";

/** Media fields a person changes (the rest is the generation's own progress). */
const MEDIA_KEYS = ["archived", "chosen", "nodeId", "version", "order"] as const;

/** What a node field was when it had no value: written so the fold clears it. */
const NODE_EMPTY: Record<string, unknown> = { title: "", notes: "", assigneeIds: [], assetIds: [], selectedTakeId: null, groupId: null, forClient: false };

/** The events that undo `events` (in the order to write them), given the state before them. */
export function invertEvents(s: LogState, events: LogEventBody[]): LogEventBody[] {
  const out: LogEventBody[] = [];
  // Things this same batch creates: what it does to them goes with them.
  const created = new Set<Id>();
  for (const e of events) {
    const inv = inverseOf(s, e, created);
    out.unshift(...inv.reverse());
  }
  return out;
}

function inverseOf(s: LogState, e: LogEventBody, created: Set<Id>): LogEventBody[] {
  const node = (id: Id) => s.nodes.find((n) => n.id === id);
  switch (e.type) {
    case "node.created":
      created.add(e.node.id);
      return [{ type: "node.trashed", id: e.node.id }];
    case "node.updated": {
      const n = node(e.id);
      if (!n || created.has(e.id)) return [];
      const patch: Record<string, unknown> = {};
      for (const k of Object.keys(e.patch)) patch[k] = (n as unknown as Record<string, unknown>)[k] ?? NODE_EMPTY[k] ?? null;
      return [{ type: "node.updated", id: e.id, patch: patch as NodePatch }];
    }
    case "node.renumbered": {
      const numbers: Record<Id, number> = {};
      for (const id of Object.keys(e.numbers)) {
        const n = node(id);
        if (n && !created.has(id)) numbers[id] = n.number;
      }
      return Object.keys(numbers).length ? [{ type: "node.renumbered", numbers }] : [];
    }
    case "node.moved": {
      const n = node(e.id);
      if (!n || created.has(e.id)) return [];
      return [{ type: "node.moved", id: e.id, parentId: n.parentId ?? null, order: n.order ?? n.number, number: n.number }];
    }
    case "node.trashed":
      return node(e.id) && !node(e.id)!.trashedAt ? [{ type: "node.restored", id: e.id }] : [];
    case "node.restored":
      return node(e.id)?.trashedAt ? [{ type: "node.trashed", id: e.id }] : [];
    case "node.shelved":
      return node(e.id) ? [{ type: "node.unshelved", id: e.id }] : [];
    case "node.unshelved":
      return node(e.id) ? [{ type: "node.shelved", id: e.id }] : [];
    case "media.updated": {
      const m = s.media.find((x) => x.id === e.id);
      if (!m || created.has(e.id)) return [];
      const patch: Record<string, unknown> = {};
      for (const k of MEDIA_KEYS) if (k in e.patch) patch[k] = m[k] ?? (k === "archived" || k === "chosen" ? false : null);
      return Object.keys(patch).length ? [{ type: "media.updated", id: e.id, patch: patch as MediaPatch }] : [];
    }
    case "take.added":
      created.add(e.take.id);
      return [{ type: "take.removed", id: e.take.id }];
    case "take.removed": {
      const t = s.takes.find((x) => x.id === e.id);
      if (!t) return [];
      const { productionId: _p, thumbUrl: _t, ...take } = t;
      return [{ type: "take.added", take }];
    }
    case "group.created":
      created.add(e.group.id);
      return [{ type: "group.deleted", id: e.group.id }];
    case "group.updated": {
      const g = s.groups.find((x) => x.id === e.id);
      if (!g || created.has(e.id)) return [];
      const patch: Record<string, unknown> = {};
      for (const k of Object.keys(e.patch)) patch[k] = (g as unknown as Record<string, unknown>)[k];
      return [{ type: "group.updated", id: e.id, patch }];
    }
    case "group.deleted": {
      const g = s.groups.find((x) => x.id === e.id);
      if (!g) return [];
      const { productionId: _p, ...group } = g;
      return [{ type: "group.created", group }];
    }
    case "comment.added":
      created.add(e.comment.id);
      return [{ type: "comment.deleted", id: e.comment.id }];
    case "comment.updated": {
      const c = s.comments.find((x) => x.id === e.id);
      if (!c || created.has(e.id)) return [];
      const patch: Record<string, unknown> = {};
      for (const k of Object.keys(e.patch)) patch[k] = (c as unknown as Record<string, unknown>)[k] ?? null;
      return [{ type: "comment.updated", id: e.id, patch }];
    }
    case "comment.deleted": {
      const c = s.comments.find((x) => x.id === e.id);
      if (!c) return [];
      const { productionId: _p, ...comment } = c;
      return [{ type: "comment.added", comment }];
    }
    case "production.updated": {
      const p = s.production;
      if (!p) return [];
      const patch: Record<string, unknown> = {};
      for (const k of Object.keys(e.patch)) patch[k] = (p as unknown as Record<string, unknown>)[k];
      return [{ type: "production.updated", patch }];
    }
    case "levels.set":
      return s.production ? [{ type: "levels.set", levels: s.production.levels }] : [];
    case "statuses.set":
      return s.production ? [{ type: "statuses.set", statuses: s.production.statuses }] : [];
    case "library.shared":
      return s.production ? [{ type: "library.shared", share: s.production.libraryShare ?? null }] : [];
    // Generations, uploads, deletions for good, people and client access: not undone here.
    default:
      return [];
  }
}
