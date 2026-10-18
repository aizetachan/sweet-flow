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
  RowItem,
  Segment,
  ShotGroup,
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
  /** Nodes on the board (not in the trash). */
  nodes: ProdNode[];
  /** Nodes in the production's trash (with their subtrees); roots carry `trashedAt`. */
  trash: ProdNode[];
  /** Shots set aside in their scene's «Vídeos editados» (docs/INTERFAZ.md §2.3). */
  shelf: ProdNode[];
  /** Groups of shots inside each scene (docs/INTERFAZ.md §2.4). */
  groups: ShotGroup[];
  media: Media[];
  takes: Take[];
  comments: Comment[];
  assets: Asset[];
  activity: Activity[];
  presence: Presence[];
  /** Linked desktop folder (mirror) state. */
  mirror: MirrorState;
  /** What this backend supports; the UI shows the rest as "Próximamente". */
  features: Features;
}

export interface Features {
  /** Generate, archive versions, cut and place takes. */
  generation: boolean;
  /** Comments and their resolution. */
  review: boolean;
  /** Live presence of teammates. */
  presence: boolean;
  /** Invite people and link provider accounts. */
  team: boolean;
  /** Place, choose and remove takes (and cut videos into them). */
  takes: boolean;
}

export const ALL_FEATURES: Features = { generation: true, review: true, presence: true, team: true, takes: true };

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
  /** Stop listeners and timers when the production is closed. */
  dispose?(): void;

  // structure
  createNode(parentId: Id | null, title?: string): Id;
  insertAfter(nodeId: Id): Id;
  /** Swap with the previous/next sibling. Visual only: codes do not change. */
  moveNode(nodeId: Id, dir: -1 | 1): void;
  /** Drag and drop: move `ids` under `parentId`, before `beforeId` (null = at the end). */
  moveNodes(ids: Id[], parentId: Id | null, beforeId: Id | null): void;
  /** Change the number of a node's code by hand. Throws with a UI message if invalid or taken. */
  setNodeNumber(nodeId: Id, number: number): void;
  /** Credits a generation would cost, when the backend can tell (null: unknown). */
  estimate?(args: GenerateArgs): Promise<number | null>;
  /** Move to the production's trash, with everything inside (docs/INTERFAZ.md §2.2). */
  trashNode(nodeId: Id): void;
  /** Back from the trash to where it was; returns the new number if its code was taken meanwhile. */
  restoreNode(nodeId: Id): number | undefined;
  /** Delete for good (from the trash), with everything inside. */
  deleteNode(nodeId: Id): void;
  /**
   * Put shots together: onto a shot (a new group with both, in its place) or
   * into a group. Shots from another scene move into it. Returns the group id.
   */
  groupShots(ids: Id[], target: { shotId: Id } | { groupId: Id }): Id | undefined;
  /** Out of their group, right after it in the row (an emptied group goes). */
  ungroupShots(ids: Id[]): void;
  /**
   * Drag and drop in a row of the board: shots and groups go right before
   * `before` (null: at the end), loose in the row or inside the open group.
   */
  placeInRow(moving: RowItem[], rowId: Id, before: RowItem | null, groupId: Id | null): void;
  /** Undo a group: its shots back on the row. */
  dissolveGroup(groupId: Id): void;
  renameGroup(groupId: Id, name: string): void;
  updateNode(nodeId: Id, patch: Partial<Pick<ProdNode, "title" | "notes" | "statusId" | "assigneeIds" | "assetIds">>): void;

  // configuration
  updateLevels(levels: LevelDef[]): void;
  updateStatuses(statuses: StatusDef[]): void;
  openProduction(productionId: Id): void;

  // production
  generate(args: GenerateArgs): void;
  setArchived(mediaId: Id, archived: boolean): void;
  placeTakes(mediaId: Id, placements: Placement[]): void;
  /**
   * Cut a shot's video into new shots: one per kept segment, in its place,
   * and the shot itself to its scene's «Vídeos editados». Returns the new ids.
   */
  splitIntoShots(mediaId: Id, segments: Segment[]): Id[];
  /** Back to the row from «Vídeos editados»; returns the new number if its code was taken. */
  unshelveNode(nodeId: Id): number | undefined;
  selectTake(nodeId: Id, takeId: Id): void;
  removeTake(takeId: Id): void;

  // review
  addComment(nodeId: Id, text: string, mediaId?: Id, atSec?: number): void;
  setCommentResolved(commentId: Id, resolved: boolean): void;

  // collaboration & mirror
  setPresence(nodeId: Id | undefined): void;
  linkFolder(): void;
}
