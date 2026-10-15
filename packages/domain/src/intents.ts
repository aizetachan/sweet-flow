/**
 * Structural intents → log events. Numbering and ordering rules live here
 * once, so every DataSource that writes an event log (local folder, Dropbox)
 * plans changes the same way. Pure: they read the current state and return
 * events to append.
 *
 * Codes and visual order are independent (docs/INTERFAZ.md §2.1): reordering
 * never changes a code; a code only changes when edited by hand, or when a
 * node moves into a parent where its number is already taken.
 */

import { codeFor } from "./naming";
import type { LogEventBody, NodePatch } from "./log";
import { byNumber, childrenOf, descendantsOf, levelIndex, nextNumber, numberBetween, sortValue } from "./tree";
import type { Id, ProdNode, Production } from "./types";

export interface Plan {
  events: LogEventBody[];
  /** Id of the node the plan creates, if any. */
  nodeId?: Id;
}

const EMPTY: Plan = { events: [] };

/** Visual spacing between neighbours when there is nothing after them. */
const ORDER_STEP = 10;

/** New last child of `parentId` (null = top level), one level below its parent. */
export function planCreateNode(p: Production, nodes: ProdNode[], parentId: Id | null, newId: Id, title = ""): Plan {
  const parent = parentId ? nodes.find((n) => n.id === parentId) : undefined;
  if (parentId && !parent) return EMPTY;
  const level = p.levels[parent ? levelIndex(p, parent) + 1 : 0];
  if (!level) throw new Error("El último nivel no admite hijos");
  const siblings = childrenOf(nodes, parentId);
  const number = nextNumber(siblings, level.step);
  const last = siblings.at(-1);
  // Only needs an explicit order when hand-reordered siblings already sort past the new number.
  const order = last && sortValue(last) >= number ? sortValue(last) + ORDER_STEP : undefined;
  return {
    nodeId: newId,
    events: [{ type: "node.created", node: { id: newId, parentId, levelId: level.id, number, title, statusId: firstStatus(p), ...(order === undefined ? {} : { order }) } }],
  };
}

/** New sibling shown right after `nodeId`, with the first free code after it. */
export function planInsertAfter(p: Production, nodes: ProdNode[], nodeId: Id, newId: Id): Plan {
  const after = nodes.find((n) => n.id === nodeId);
  if (!after) return EMPTY;
  const level = p.levels[levelIndex(p, after)];
  if (!level) return EMPTY;
  const siblings = childrenOf(nodes, after.parentId);
  const next = siblings[siblings.indexOf(after) + 1];
  const order = next ? (sortValue(after) + sortValue(next)) / 2 : sortValue(after) + ORDER_STEP;
  const byCode = [...siblings].sort(byNumber);
  const number = numberBetween(after, byCode[byCode.indexOf(after) + 1], level.step) ?? nextNumber(siblings, level.step);
  return {
    nodeId: newId,
    events: [{ type: "node.created", node: { id: newId, parentId: after.parentId, levelId: after.levelId, number, title: "", statusId: firstStatus(p), order } }],
  };
}

/**
 * Move `ids` (in the given order) under `parentId`, right before `beforeId`
 * (null = at the end). Nodes keep their codes unless the number is taken in
 * the new parent. Ignores nodes that cannot live there: wrong level, or the
 * target being the node itself or one of its descendants.
 */
export function planMoveNodes(p: Production, nodes: ProdNode[], ids: Id[], parentId: Id | null, beforeId: Id | null): Plan {
  const parent = parentId ? nodes.find((n) => n.id === parentId) : undefined;
  if (parentId && !parent) return EMPTY;
  const wantLevel = parent ? levelIndex(p, parent) + 1 : 0;
  const moving = ids
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is ProdNode => !!n && levelIndex(p, n) === wantLevel)
    .filter((n) => !parentId || (n.id !== parentId && !descendantsOf(nodes, n.id).some((d) => d.id === parentId)));
  if (!moving.length) return EMPTY;

  const movingIds = new Set(moving.map((n) => n.id));
  const staying = childrenOf(nodes, parentId).filter((n) => !movingIds.has(n.id));
  const before = beforeId ? staying.find((n) => n.id === beforeId) : undefined;
  const at = before ? staying.indexOf(before) : staying.length;
  const prev = staying[at - 1];
  const next = staying[at];
  const lo = prev ? sortValue(prev) : next ? sortValue(next) - ORDER_STEP * (moving.length + 1) : 0;
  const hi = next ? sortValue(next) : lo + ORDER_STEP * (moving.length + 1);

  const step = p.levels[wantLevel]!.step;
  const taken = new Set(staying.map((n) => n.number));
  const events: LogEventBody[] = moving.map((n, i) => {
    const order = lo + ((hi - lo) * (i + 1)) / (moving.length + 1);
    let number: number | undefined;
    if (n.parentId !== parentId && taken.has(n.number)) {
      number = Math.floor(Math.max(...taken) / step) * step + step;
    }
    taken.add(number ?? n.number);
    return { type: "node.moved", id: n.id, parentId, order, ...(number === undefined ? {} : { number }) };
  });
  return { events };
}

/** Swap places with the previous (-1) or next (1) sibling; codes do not change. */
export function planMoveNode(p: Production, nodes: ProdNode[], nodeId: Id, dir: -1 | 1): Plan {
  const n = nodes.find((x) => x.id === nodeId);
  if (!n) return EMPTY;
  const siblings = childrenOf(nodes, n.parentId);
  const i = siblings.indexOf(n);
  if (!siblings[i + dir]) return EMPTY;
  const before = dir === -1 ? siblings[i - 1]! : siblings[i + 2];
  return planMoveNodes(p, nodes, [nodeId], n.parentId, before?.id ?? null);
}

/**
 * Change the number of a node's code by hand (the level prefix stays).
 * Throws with a message for the UI when the number is not valid or taken.
 */
export function planSetNumber(p: Production, nodes: ProdNode[], nodeId: Id, number: number): Plan {
  const n = nodes.find((x) => x.id === nodeId);
  if (!n) return EMPTY;
  if (number === n.number) return EMPTY;
  const level = p.levels[levelIndex(p, n)];
  if (!level) return EMPTY;
  if (!Number.isInteger(number) || number < 1 || String(number).length > level.pad) {
    throw new Error(`El número debe ser un entero entre 1 y ${"9".repeat(level.pad)}.`);
  }
  const clash = childrenOf(nodes, n.parentId).find((s) => s.id !== n.id && s.number === number);
  if (clash) throw new Error(`${codeFor(level, number)} ya existe aquí.`);
  // Keep its place on screen even if it was ordered by number until now.
  return { events: [{ type: "node.moved", id: n.id, parentId: n.parentId, order: sortValue(n), number }] };
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
