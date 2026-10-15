/**
 * Server-maintained, denormalized node fields (code, folder, path, sortKey,
 * ancestorIds — docs/ARCHITECTURE.md §3.2), always computed with the same
 * @sweetflow/domain functions the app and the mirror use.
 */

import {
  ancestorsOf,
  codeOf,
  folderOf,
  folderPath,
  sortKey,
  type ProdNode,
  type Production,
} from "@sweetflow/domain";
import type { NodeDerived } from "./api";
import { db, nodesCol } from "./shared";

export function deriveNode(p: Production, nodes: ProdNode[], n: ProdNode): NodeDerived {
  const chain = ancestorsOf(nodes, n);
  return {
    depth: chain.length - 1,
    code: codeOf(p, n),
    folderName: folderOf(p, n),
    path: folderPath(p, nodes, n),
    ancestorIds: chain.slice(0, -1).map((a) => a.id),
    sortKey: sortKey(nodes, n),
  };
}

function sameDerived(a: Partial<NodeDerived>, b: NodeDerived): boolean {
  return (
    a.depth === b.depth &&
    a.code === b.code &&
    a.folderName === b.folderName &&
    a.path === b.path &&
    a.sortKey === b.sortKey &&
    a.ancestorIds?.join("/") === b.ancestorIds.join("/")
  );
}

/**
 * Recomputes derived fields for the whole production and writes only the
 * nodes that changed. O(nodes) — fine for thousands of nodes; restrict to
 * the touched subtree if it ever shows up in latency.
 */
export async function refreshDerived(p: Production): Promise<number> {
  const snap = await nodesCol(p.id).get();
  const docs = snap.docs.map((d) => ({ ...(d.data() as ProdNode & Partial<NodeDerived>), id: d.id }));
  const writer = db.bulkWriter();
  let changed = 0;
  for (const n of docs) {
    const next = deriveNode(p, docs, n);
    if (sameDerived(n, next)) continue;
    changed++;
    void writer.update(nodesCol(p.id).doc(n.id), { ...next });
  }
  await writer.close();
  return changed;
}
