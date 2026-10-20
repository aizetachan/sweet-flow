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
  ProductionCover,
  RowItem,
  Segment,
  ShotGroup,
  StatusDef,
  Take,
  Workspace,
  ClientEntry,
  AssetType,
  LibraryShare,
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
  /** The library (docs/INTERFAZ.md §2.8): the desk and the cards, apart from the board. */
  library: ProdNode[];
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

/** Something to bring in: a file from the computer, or a creation already at the provider. */
/** A reference at the provider: what generations send it by. */
export interface UploadedRef {
  ref: string;
}

export type ImportItem = { file: File } | { creation: RemoteCreation };

/** A creation at the provider (Magnific), as listed to import it. */
export interface RemoteCreation {
  provider: string;
  id: string;
  name: string;
  kind: MediaKind;
  /** Full file. */
  url: string;
  thumbUrl?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  folder?: string;
  createdAt?: number;
}

export interface RemoteFolder {
  id: string;
  name: string;
}

export interface BrowseQuery {
  /** Inside this folder and its subfolders (null: the latest creations, everywhere). */
  folder: string | null;
  search?: string;
  kind?: MediaKind;
  page?: number;
}

export interface BrowsePage {
  items: RemoteCreation[];
  more: boolean;
}

/** Kind of a file from the computer, by its type (null: not an image, video or audio). */
export function kindOfFile(f: File): MediaKind | null {
  if (f.type.startsWith("video/")) return "video";
  if (f.type.startsWith("image/")) return "image";
  if (f.type.startsWith("audio/")) return "audio";
  return null;
}

export const importName = (i: ImportItem) => ("file" in i ? i.file.name : i.creation.name);
export const importKind = (i: ImportItem) => ("file" in i ? kindOfFile(i.file) : i.creation.kind);

export interface GenerateArgs {
  nodeId: Id;
  kind: MediaKind;
  prompt: string;
  /** Model name as in `data/models.ts`. */
  model: string;
  durationSec?: number;
  /** Start frame (video): media of the production, or a file sent with `uploadReference` (`sourceRef`). */
  sourceMediaId?: Id;
  sourceRef?: string;
  /** End frame (video, with a start frame). */
  endMediaId?: Id;
  endRef?: string;
  /** What guides it (style, images, videos, audio): media of the production, or uploaded files (`ref`). */
  references?: Array<{ type: RefType; mediaId?: Id; ref?: string }>;
  /**
   * Library groups called in the prompt («@Elena», docs/INTERFAZ.md §2.8),
   * with the images picked for each.
   */
  mentions?: Array<{ groupId: Id; tag: string; mediaIds: Id[]; remote?: { ids: string[]; kind?: AssetType; description?: string } }>;
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
  /** ⌘Z: undo the last thing done by hand here (docs/INTERFAZ.md §2.9); what it was, or null. */
  undo(): string | null;
  /** ⌘⇧Z: do it again. */
  redo(): string | null;
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
  /** The image of its dashboard card (docs/INTERFAZ.md §1), for the whole team; null: back to its initials. */
  setCover(cover: ProductionCover | null): void;
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
  /** Cut again a shot made of a stretch: it keeps the first segment, the rest become shots after it. */
  splitTakeShot(nodeId: Id, segments: Segment[]): Id[];
  /**
   * Edit a video kept in «Vídeos editados»: each segment a new shot of its
   * scene, after the last shot made from it; the original stays there.
   */
  shotsFromEdited(nodeId: Id, mediaId: Id, segments: Segment[]): Id[];
  /** A version taken out to the row: a new shot right after `nodeId` with it as its take. Returns the new shot. */
  extractToRow(nodeId: Id, mediaId: Id, segment?: Segment): Id | undefined;
  /** Back to the row from «Vídeos editados»; returns the new number if its code was taken. */
  unshelveNode(nodeId: Id): number | undefined;
  selectTake(nodeId: Id, takeId: Id): void;
  removeTake(takeId: Id): void;

  // importing (docs/INTERFAZ.md §2.0): what the person already has, from Magnific or the computer
  /** A new version of `nodeId` from a file or a Magnific creation. Returns the media id. */
  importMedia(nodeId: Id, item: ImportItem): Id;
  /** One new shot per item, placed in the row before `before` (the end when null), each with it as v001. Returns the new shots. */
  importShots(rowId: Id, items: ImportItem[], before: RowItem | null, groupId: Id | null): Id[];
  /**
   * Sends a file of this computer, or media of the production the provider
   * doesn't have yet, to the provider to use as a reference (docs/INTERFAZ.md
   * §2.5). A file stays at the provider, in the node's folder there; media of
   * the production keeps the provider's id, so it is sent only once.
   */
  uploadReference(nodeId: Id, from: File | { mediaId: Id }): Promise<UploadedRef>;
  /** The library's older catch-all group (made the first time). Returns its node id. */
  libraryDesk(): Id;
  /** A new group of the library («Grupo N» without a name), with these images in it. Returns its node id. */
  createLibGroup(name: string | null, mediaIds?: Id[]): Id;
  /** Images into a group (`chosen`: as its chosen references). */
  moveToLib(mediaIds: Id[], toNodeId: Id, chosen?: boolean): void;
  /** Images placed in a group before another image (null: at the end): reorder, or move from another group. */
  placeLibMedia(mediaIds: Id[], toNodeId: Id, beforeId: Id | null): void;
  /** Mark images of a group as its chosen references, or not. */
  setChosen(mediaIds: Id[], chosen: boolean): void;
  setLibType(nodeId: Id, type: AssetType): void;
  /** Generate again what failed, with the same settings (a new version; the failed one is put away). */
  retryMedia(mediaId: Id): void;
  /** Share this production's library with others (null: only this one), docs/INTERFAZ.md §2.8.1. */
  setLibraryShare(share: LibraryShare | null): void;
  /** Show these shots to the client on the review page, or stop (docs/USUARIOS.md §4). */
  setForClient(nodeIds: Id[], on: boolean): void;
  /** How the client gets in: invitation to their email, or the link with their name (and email). */
  setClientEntry(entry: ClientEntry): void;
  addClientGuest(email: string, name?: string): void;
  removeClientGuest(email: string): void;
  /** This person's creations at the provider (Magnific), to import; absent when there is no provider. */
  browseCreations?(q: BrowseQuery): Promise<BrowsePage>;
  /** Folders at the provider: its projects (`parent` null) or what is inside one. */
  browseFolders?(parent: string | null): Promise<RemoteFolder[]>;

  // review
  /** A comment, or a reply (`parentId`); returns its id. */
  addComment(c: NewComment): Id;
  setCommentResolved(commentId: Id, resolved: boolean): void;
  /** Its author removes it (with its replies). */
  deleteComment(commentId: Id): void;
  /** Worked on in a newer version of the shot: the thread goes on there (its previous version kept in `history`). */
  moveCommentToVersion(commentId: Id, mediaId: Id): void;
  /** Its author moves its point or area. */
  moveCommentMark(commentId: Id, mark: { point?: { x: number; y: number }; area?: { x: number; y: number; w: number; h: number } }): void;

  // collaboration & mirror
  setPresence(nodeId: Id | undefined): void;
  linkFolder(): void;
}
