/**
 * Structural operations on the production tree (docs/ARCHITECTURE.md §3.2,
 * §4, §8). They run here, in transactions, so two people creating nodes at
 * once never get the same number, and clients never rewrite hundreds of
 * documents themselves. Numbering comes from @sweetflow/domain.
 */

import {
  childrenOf,
  levelIndex,
  nextNumber,
  numberBetween,
  renumbered,
  type Id,
  type LevelDef,
  type ProdNode,
} from "@sweetflow/domain";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type {
  CreateNodeRequest,
  CreateNodeResponse,
  DeleteSubtreeRequest,
  DeleteSubtreeResponse,
  MoveNodeRequest,
  RenumberSiblingsRequest,
  RenumberSiblingsResponse,
  UpdateLevelsRequest,
} from "./api";
import { refreshDerived } from "./derived";
import { db, loadProduction, nodesCol, prodRef, requireRole, requireString } from "./shared";

async function siblingsOf(prodId: Id, parentId: Id | null): Promise<ProdNode[]> {
  const snap = await nodesCol(prodId).where("parentId", "==", parentId).get();
  return childrenOf(
    snap.docs.map((d) => ({ ...(d.data() as ProdNode), id: d.id })),
    parentId,
  );
}

export const createNode = onCall<CreateNodeRequest, Promise<CreateNodeResponse>>(async (req) => {
  const { productionId, parentId = null, afterId, title = "" } = req.data;
  const uid = await requireRole(req, productionId, "edit");
  const nodeId = requireString(req.data.nodeId, "nodeId");
  const p = await loadProduction(productionId);

  const result = await db.runTransaction(async (tx) => {
    const parent = parentId ? await tx.get(nodesCol(productionId).doc(parentId)) : null;
    if (parentId && !parent?.exists) throw new HttpsError("not-found", "El nodo padre no existe.");
    const li = parent ? levelIndex(p, parent.data() as ProdNode) + 1 : 0;
    const level = p.levels[li];
    if (!level) throw new HttpsError("failed-precondition", "El último nivel no admite hijos.");

    const sibSnap = await tx.get(nodesCol(productionId).where("parentId", "==", parentId));
    let siblings = childrenOf(sibSnap.docs.map((d) => ({ ...(d.data() as ProdNode), id: d.id })), parentId);
    let number = nextNumber(siblings, level.step);

    if (afterId) {
      const at = siblings.findIndex((s) => s.id === afterId);
      if (at < 0) throw new HttpsError("not-found", "El nodo de referencia no es hermano.");
      let n = numberBetween(siblings[at]!, siblings[at + 1], level.step);
      if (n === null) {
        // No gap left between the two: renumber the siblings in this same
        // transaction, then insert in the fresh gap.
        const nums = renumbered(siblings, level.step);
        for (const [id, num] of nums) tx.update(nodesCol(productionId).doc(id), { number: num });
        siblings = siblings.map((s) => ({ ...s, number: nums.get(s.id)! }));
        n = numberBetween(siblings[at]!, siblings[at + 1], level.step)!;
      }
      number = n;
    }

    const node: ProdNode = {
      id: nodeId,
      productionId,
      parentId,
      levelId: level.id,
      number,
      title,
      notes: "",
      statusId: p.statuses[0]?.id ?? "",
      assigneeIds: [],
      assetIds: [],
      updatedAt: Date.now(),
      updatedBy: uid,
    };
    tx.create(nodesCol(productionId).doc(nodeId), node);
    return { nodeId, number };
  });

  await refreshDerived(p);
  return result;
});

export const renumberSiblings = onCall<RenumberSiblingsRequest, Promise<RenumberSiblingsResponse>>(async (req) => {
  const { productionId, parentId = null } = req.data;
  await requireRole(req, productionId, "approve");
  const p = await loadProduction(productionId);
  const siblings = await siblingsOf(productionId, parentId);
  const first = siblings[0];
  if (!first) return { numbers: {} };
  const level = p.levels[levelIndex(p, first)]!;
  const nums = renumbered(siblings, level.step);

  const batch = db.batch();
  for (const [id, number] of nums) batch.update(nodesCol(productionId).doc(id), { number });
  await batch.commit();
  await refreshDerived(p);
  return { numbers: Object.fromEntries(nums) };
});

/** Swaps the number of a node with its previous/next sibling. */
export const moveNode = onCall<MoveNodeRequest, Promise<void>>(async (req) => {
  const { productionId, dir } = req.data;
  await requireRole(req, productionId, "edit");
  const nodeId = requireString(req.data.nodeId, "nodeId");
  if (dir !== 1 && dir !== -1) throw new HttpsError("invalid-argument", "dir debe ser -1 o 1.");
  const p = await loadProduction(productionId);

  const moved = await db.runTransaction(async (tx) => {
    const snap = await tx.get(nodesCol(productionId).doc(nodeId));
    if (!snap.exists) throw new HttpsError("not-found", "El nodo no existe.");
    const node = { ...(snap.data() as ProdNode), id: snap.id };
    const sibSnap = await tx.get(nodesCol(productionId).where("parentId", "==", node.parentId));
    const siblings = childrenOf(sibSnap.docs.map((d) => ({ ...(d.data() as ProdNode), id: d.id })), node.parentId);
    const other = siblings[siblings.findIndex((s) => s.id === nodeId) + dir];
    if (!other) return false;
    tx.update(nodesCol(productionId).doc(node.id), { number: other.number });
    tx.update(nodesCol(productionId).doc(other.id), { number: node.number });
    return true;
  });

  if (moved) await refreshDerived(p);
});

/**
 * Deletes a node and everything below it. Takes and comments go with the
 * nodes; media is archived, never deleted (§5.1): files stay in Storage.
 */
export const deleteSubtree = onCall<DeleteSubtreeRequest, Promise<DeleteSubtreeResponse>>(async (req) => {
  const { productionId } = req.data;
  await requireRole(req, productionId, "approve");
  const nodeId = requireString(req.data.nodeId, "nodeId");
  const prod = prodRef(productionId);

  const below = await nodesCol(productionId).where("ancestorIds", "array-contains", nodeId).get();
  const nodeIds = [nodeId, ...below.docs.map((d) => d.id)];

  const writer = db.bulkWriter();
  let archivedMedia = 0;
  // Firestore "in" filters take up to 30 values.
  for (let i = 0; i < nodeIds.length; i += 30) {
    const chunk = nodeIds.slice(i, i + 30);
    const [takes, comments, media] = await Promise.all([
      prod.collection("takes").where("nodeId", "in", chunk).get(),
      prod.collection("comments").where("nodeId", "in", chunk).get(),
      prod.collection("media").where("nodeId", "in", chunk).get(),
    ]);
    for (const d of [...takes.docs, ...comments.docs]) void writer.delete(d.ref);
    for (const d of media.docs) {
      archivedMedia++;
      void writer.update(d.ref, { archived: true });
    }
    for (const id of chunk) void writer.delete(nodesCol(productionId).doc(id));
  }
  await writer.close();

  // TODO: drop takes placed elsewhere that point at the archived media, and
  // log a "structure" activity event.
  return { deletedNodes: nodeIds.length, archivedMedia };
});

/**
 * Replaces the level definitions. Renaming prefixes or steps changes every
 * code, folder and path, so derived fields are recomputed for all nodes.
 * Adding or removing a level (restructuring the tree without losing nodes,
 * §3.1) is not implemented yet.
 */
export const updateLevels = onCall<UpdateLevelsRequest, Promise<void>>(async (req) => {
  const { productionId, levels } = req.data;
  await requireRole(req, productionId, "manage");
  if (!Array.isArray(levels) || !levels.every(isLevelDef)) throw new HttpsError("invalid-argument", "Niveles no válidos.");
  const p = await loadProduction(productionId);

  const sameShape = levels.length === p.levels.length && levels.every((l, i) => l.id === p.levels[i]!.id);
  if (!sameShape) {
    // TODO(fase 1): add/remove levels in a transaction, re-parenting nodes.
    throw new HttpsError("unimplemented", "Añadir o quitar niveles aún no está disponible.");
  }

  await prodRef(productionId).update({ levels, updatedAt: Date.now() });
  await refreshDerived({ ...p, levels });
});

function isLevelDef(l: unknown): l is LevelDef {
  const x = l as Partial<LevelDef>;
  return (
    typeof x?.id === "string" &&
    typeof x.name === "string" &&
    typeof x.prefix === "string" &&
    Number.isInteger(x.step) && x.step! > 0 &&
    Number.isInteger(x.pad) && x.pad! > 0 &&
    typeof x.canGenerate === "boolean" &&
    typeof x.maxVideoSec === "number"
  );
}
