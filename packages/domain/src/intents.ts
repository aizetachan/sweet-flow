/**
 * Structural intents → log events. Numbering rules live here once, so every
 * DataSource that writes an event log (local folder, Dropbox) plans changes
 * the same way. Pure: they read the current state and return events to append.
 */

import type { LogEventBody, NodePatch } from "./log";
import { childrenOf, levelIndex, nextNumber, numberBetween, renumbered } from "./tree";
import type { Id, ProdNode, Production } from "./types";

export interface Plan {
  events: LogEventBody[];
  /** Id of the node the plan creates, if any. */
  nodeId?: Id;
}

const EMPTY: Plan = { events: [] };

/** New last child of `parentId` (null = top level), one level below its parent. */
export function planCreateNode(p: Production, nodes: ProdNode[], parentId: Id | null, newId: Id, title = ""): Plan {
  const parent = parentId ? nodes.find((n) => n.id === parentId) : undefined;
  if (parentId && !parent) return EMPTY;
  const level = p.levels[parent ? levelIndex(p, parent) + 1 : 0];
  if (!level) throw new Error("El último nivel no admite hijos");
  const number = nextNumber(childrenOf(nodes, parentId), level.step);
  return {
    nodeId: newId,
    events: [{ type: "node.created", node: { id: newId, parentId, levelId: level.id, number, title, statusId: firstStatus(p) } }],
  };
}

/** New sibling right after `nodeId`, in the numbering gap (renumbering siblings first if there is none). */
export function planInsertAfter(p: Production, nodes: ProdNode[], nodeId: Id, newId: Id): Plan {
  const after = nodes.find((n) => n.id === nodeId);
  if (!after) return EMPTY;
  const level = p.levels[levelIndex(p, after)];
  if (!level) return EMPTY;

  const events: LogEventBody[] = [];
  let siblings = childrenOf(nodes, after.parentId);
  let anchor = after;
  let number = numberBetween(anchor, siblings[siblings.indexOf(anchor) + 1], level.step);
  if (number === null) {
    const numbers = renumbered(siblings, level.step);
    events.push({ type: "node.renumbered", numbers: Object.fromEntries(numbers) });
    siblings = siblings.map((s) => ({ ...s, number: numbers.get(s.id)! }));
    anchor = siblings.find((s) => s.id === nodeId)!;
    number = numberBetween(anchor, siblings[siblings.indexOf(anchor) + 1], level.step)!;
  }
  events.push({
    type: "node.created",
    node: { id: newId, parentId: after.parentId, levelId: after.levelId, number, title: "", statusId: firstStatus(p) },
  });
  return { nodeId: newId, events };
}

/** Swap places with the previous (-1) or next (1) sibling. */
export function planMoveNode(nodes: ProdNode[], nodeId: Id, dir: -1 | 1): Plan {
  const n = nodes.find((x) => x.id === nodeId);
  if (!n) return EMPTY;
  const siblings = childrenOf(nodes, n.parentId);
  const other = siblings[siblings.indexOf(n) + dir];
  if (!other) return EMPTY;
  return { events: [{ type: "node.renumbered", numbers: { [n.id]: other.number, [other.id]: n.number } }] };
}

export function planDeleteNode(nodes: ProdNode[], nodeId: Id): Plan {
  return nodes.some((n) => n.id === nodeId) ? { events: [{ type: "node.deleted", id: nodeId }] } : EMPTY;
}

/** Only the fields that actually change, so concurrent edits of other fields survive. */
export function planUpdateNode(nodes: ProdNode[], nodeId: Id, patch: NodePatch): Plan {
  const n = nodes.find((x) => x.id === nodeId);
  if (!n) return EMPTY;
  const changed = Object.fromEntries(
    Object.entries(patch).filter(([k, v]) => JSON.stringify(n[k as keyof NodePatch]) !== JSON.stringify(v)),
  ) as NodePatch;
  return Object.keys(changed).length ? { events: [{ type: "node.updated", id: nodeId, patch: changed }] } : EMPTY;
}

function firstStatus(p: Production): Id {
  const s = [...p.statuses].filter((x) => !x.archived).sort((a, b) => a.order - b.order)[0];
  if (!s) throw new Error("La producción no tiene estados");
  return s.id;
}
