/**
 * Wire contract between clients and the Functions: callable payloads and the
 * Firestore-only fields the server maintains. Type-only, so the renderer can
 * import it (`@sweetflow/functions/api`) without pulling server code.
 *
 * TODO: move to @sweetflow/domain (or packages/data) once the data layer is
 * split out (docs/ARCHITECTURE.md §9).
 */

import type { Id, LevelDef, MediaKind, Millis, ProdNode } from "@sweetflow/domain";

/** Fields derived by the server and denormalized on each node (§3.2). */
export interface NodeDerived {
  depth: number;
  code: string;
  folderName: string;
  path: string;
  ancestorIds: Id[];
  sortKey: string;
}

export type NodeDoc = ProdNode & NodeDerived;

export type JobStatus = "requested" | "queued" | "running" | "done" | "failed" | "cancelled";

/** productions/{prodId}/jobs/{jobId} — generation / render queue (§6). */
export interface JobDoc {
  id: Id;
  productionId: Id;
  nodeId: Id;
  type: "generate" | "render";
  status: JobStatus;
  /** Media document the worker fills in; pre-allocated by the client. */
  mediaId: Id;
  input: {
    kind: MediaKind;
    prompt: string;
    model: string;
    durationSec?: number;
    sourceMediaId?: Id;
  };
  /** uid whose Magnific account pays; must equal the requester. */
  createdBy: Id;
  createdAt: Millis;
  queuedAt?: Millis;
  error?: string;
}

// ---------- callables ----------

export interface CreateNodeRequest {
  productionId: Id;
  /** Client-allocated id, so the UI can select the node before the call returns. */
  nodeId: Id;
  parentId: Id | null;
  /** Insert right after this sibling (010 → 015) instead of at the end. */
  afterId?: Id;
  title?: string;
}
export interface CreateNodeResponse {
  nodeId: Id;
  number: number;
}

export interface RenumberSiblingsRequest {
  productionId: Id;
  parentId: Id | null;
}
export interface RenumberSiblingsResponse {
  numbers: Record<Id, number>;
}

export interface MoveNodeRequest {
  productionId: Id;
  nodeId: Id;
  dir: -1 | 1;
}

export interface DeleteSubtreeRequest {
  productionId: Id;
  nodeId: Id;
}
export interface DeleteSubtreeResponse {
  deletedNodes: number;
  archivedMedia: number;
}

export interface UpdateLevelsRequest {
  productionId: Id;
  levels: LevelDef[];
}

export interface MagnificAuthStartResponse {
  /** URL to open in the system browser to grant access. */
  authorizeUrl: string;
}

export const CALLABLES = {
  createNode: "createNode",
  renumberSiblings: "renumberSiblings",
  moveNode: "moveNode",
  deleteSubtree: "deleteSubtree",
  updateLevels: "updateLevels",
  magnificAuthStart: "magnificAuthStart",
} as const;

/** Region of every Function; the client must use the same one. */
export const FUNCTIONS_REGION = "europe-west1";
