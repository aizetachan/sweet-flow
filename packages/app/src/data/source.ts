/**
 * DataSource — the only door between the UI and the backend.
 *
 * The UI never talks to Firebase directly: it renders a Snapshot and calls
 * intent methods. `MockSource` (in-memory demo) implements it today; a
 * `FirebaseSource` (Firestore listeners + callable Functions) will implement
 * the same contract, so screens don't change when the backend lands.
 */

import type { RefType } from "./models";
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
  /** Model name as in `data/models.ts`. */
  model: string;
  durationSec?: number;
  /** Start frame (video). */
  sourceMediaId?: Id;
  /** End frame (video, with a start frame). */
  endMediaId?: Id;
  /** Media of the production guiding it (style, images, videos, audio). */
  references?: Array<{ type: RefType; mediaId: Id }>;
  /** How many results (one version each). */
  count?: number;
  aspectRatio?: string;
  resolution?: string;
  /** Generated sound on a video. */
  sound?: boolean;
  /** Music without vocals. */
  instrumental?: boolean;
  /** A sound effect that loops. */
  loop?: boolean;
}

/** Where a cut segment goes: an existing node, a new child, or stays here. */
export interface Placement {
  segment: Segment;
  target: { nodeId: Id } | { newChildOf: Id };
}

/** A comment as written (docs/INTERFAZ.md §2.6). */
export interface NewComment {
  nodeId: Id;
  text: string;
  /** The version it is about. */
  mediaId?: Id;
  /** The moment of a video. */
  atSec?: number;
  /** A point on the image or frame, 0–1. */
  point?: { x: number; y: number };
  /** Or an area of it, 0–1. */
  area?: { x: number; y: number; w: number; h: number };
  mentions?: Id[];
  parentId?: Id;
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
  /**
   * A video's length read from the file, when the provider did not give it:
   * recorded once so scenes and sequences add it up.
   */
  noteDuration?(mediaId: Id, durationSec: number): void;
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
  /** A comment, or a reply (`parentId`); returns its id. */
  addComment(c: NewComment): Id;
  setCommentResolved(commentId: Id, resolved: boolean): void;
  /** Its author removes it (with its replies). */
  deleteComment(commentId: Id): void;
  /** Its author moves its point or area. */
  moveCommentMark(commentId: Id, mark: { point?: { x: number; y: number }; area?: { x: number; y: number; w: number; h: number } }): void;

  // collaboration & mirror
  setPresence(nodeId: Id | undefined): void;
  linkFolder(): void;
}
