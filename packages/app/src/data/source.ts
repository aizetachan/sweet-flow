/**
 * DataSource — the only door between the UI and the backend.
 *
 * The UI never talks to Firebase directly: it renders a Snapshot and calls
 * intent methods. `MockSource` (in-memory demo) implements it today; a
 * `FirebaseSource` (Firestore listeners + callable Functions) will implement
 * the same contract, so screens don't change when the backend lands.
 */

import type {
  Activity,
  Asset,
  Comment,
  Id,
  LevelDef,
  Media,
  MediaKind,
  Member,
  Presence,
  ProdNode,
  Production,
  Segment,
  StatusDef,
  Take,
  Workspace,
} from "@sweetflow/domain";

export interface Snapshot {
  workspace: Workspace;
  me: Member;
  members: Member[];
  productions: Production[];
  /** The open production and its collections. */
  production: Production;
  nodes: ProdNode[];
  media: Media[];
  takes: Take[];
  comments: Comment[];
  assets: Asset[];
  activity: Activity[];
  presence: Presence[];
  /** Linked desktop folder (mirror) state. */
  mirror: MirrorState;
}

export interface MirrorState {
  status: "unlinked" | "syncing" | "synced" | "offline";
  rootPath?: string;
  pending: number;
}

export interface GenerateArgs {
  nodeId: Id;
  kind: MediaKind;
  prompt: string;
  model: string;
  durationSec?: number;
  sourceMediaId?: Id;
}

/** Where a cut segment goes: an existing node, a new child, or stays here. */
export interface Placement {
  segment: Segment;
  target: { nodeId: Id } | { newChildOf: Id };
}

export interface DataSource {
  subscribe(cb: (s: Snapshot) => void): () => void;

  // structure
  createNode(parentId: Id | null, title?: string): Id;
  insertAfter(nodeId: Id): Id;
  moveNode(nodeId: Id, dir: -1 | 1): void;
  deleteNode(nodeId: Id): void;
  updateNode(nodeId: Id, patch: Partial<Pick<ProdNode, "title" | "notes" | "statusId" | "assigneeIds" | "assetIds">>): void;

  // configuration
  updateLevels(levels: LevelDef[]): void;
  updateStatuses(statuses: StatusDef[]): void;
  openProduction(productionId: Id): void;

  // production
  generate(args: GenerateArgs): void;
  setArchived(mediaId: Id, archived: boolean): void;
  placeTakes(mediaId: Id, placements: Placement[]): void;
  selectTake(nodeId: Id, takeId: Id): void;
  removeTake(takeId: Id): void;

  // review
  addComment(nodeId: Id, text: string, mediaId?: Id, atSec?: number): void;
  setCommentResolved(commentId: Id, resolved: boolean): void;

  // collaboration & mirror
  setPresence(nodeId: Id | undefined): void;
  linkFolder(): void;
}
