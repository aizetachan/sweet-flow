/**
 * Sweet Flow domain types. Pure data, JSON-serializable, one interface per
 * Firestore document (see docs/ARCHITECTURE.md §3). No framework imports.
 */

export type Id = string;
/** Epoch milliseconds. */
export type Millis = number;

export type Role = "owner" | "admin" | "supervisor" | "artist" | "viewer";

export interface Workspace {
  id: Id;
  name: string;
  createdAt: Millis;
}

export interface Member {
  uid: Id;
  email: string;
  displayName: string;
  photoUrl?: string;
  role: Role;
  /** Whether this member linked their own Magnific account (generation). */
  magnificConnected: boolean;
  /** Credits left on their Magnific account, when known. */
  magnificCredits?: number;
}

export interface LevelDef {
  id: Id;
  name: string;
  prefix: string;
  /** Numbering step: 10 → 010, 020… leaving room to insert 015. */
  step: number;
  pad: number;
  /** Media can be generated directly at this level (production point). */
  canGenerate: boolean;
  maxVideoSec: number;
}

export type StatusCategory = "todo" | "active" | "review" | "done";

export interface StatusDef {
  id: Id;
  name: string;
  color: string;
  category: StatusCategory;
  order: number;
  archived?: boolean;
}

export interface Production {
  id: Id;
  workspaceId: Id;
  name: string;
  /** Short format hint shown in the UI ("Serie · 45 min"). */
  format?: string;
  levels: LevelDef[];
  statuses: StatusDef[];
  /** Sharing with the client (docs/USUARIOS.md §4): how they get in, and who is invited. */
  client?: ClientShare;
  /**
   * Its library shared with other productions (docs/INTERFAZ.md §2.8.1):
   * with every production of the team ("all"), or with those inside a
   * dashboard folder (its id). Absent: only this production.
   */
  libraryShare?: LibraryShare;
  /** The image its dashboard card shows (docs/INTERFAZ.md §1); null or absent: its initials. */
  cover?: ProductionCover | null;
  createdAt: Millis;
  updatedAt: Millis;
}

/**
 * A production's card image: a small copy of the image (a data URL, so every
 * device shows it without reaching its file) and, when it is one of the
 * production's own images, which.
 */
export interface ProductionCover {
  thumb: string;
  mediaId?: Id;
}

/**
 * How the client (a guest, without access to the team folder) gets into the
 * production's review page: by an invitation to their email (only those
 * invited), or with the link giving their name, or their name and email.
 * They only see the shots marked «Mostrar al cliente».
 */
export type ClientEntry = "invite" | "link-name" | "link-name-email";

export interface ClientGuest {
  email: string;
  name?: string;
  addedBy: Id;
  addedAt: Millis;
}

export interface ClientShare {
  entry: ClientEntry;
  guests: ClientGuest[];
}

/** Who a production's library is shared with: everyone, or the productions inside a dashboard folder. */
export type LibraryShare = { scope: "all" } | { scope: "folder"; folderId: Id };

export interface NodeStats {
  media: number;
  takes: number;
  comments: number;
}

export interface ProdNode {
  id: Id;
  productionId: Id;
  parentId: Id | null;
  levelId: Id;
  /** Stable number used in the code (10, 15, 20…). Only changes when edited by hand. */
  number: number;
  /**
   * Visual position among siblings (docs/INTERFAZ.md §2.1). Independent of the
   * code; nodes never reordered by hand sort by `number`.
   */
  order?: number;
  title: string;
  notes: string;
  statusId: Id;
  assigneeIds: Id[];
  /** Breakdown: cast / props / locations linked to this node. */
  assetIds: Id[];
  selectedTakeId?: Id;
  /** Shown to the client on the review page (docs/USUARIOS.md §4); off by default. */
  forClient?: boolean;
  /** A node of the library, not of the board (desk or card). */
  lib?: LibKind;
  /**
   * In the production's trash since then (docs/INTERFAZ.md §2.2); its subtree
   * goes with it. Hidden from the board; its code can be reused meanwhile.
   */
  trashedAt?: Millis;
  /**
   * Set aside in its parent's «Vídeos editados» since then: a shot whose video
   * was cut into new shots (docs/INTERFAZ.md §2.3). Off the board, kept in
   * `_editados/`, its media still feeding the new shots' takes.
   */
  shelvedAt?: Millis;
  /** Group of shots it is in, inside its scene (docs/INTERFAZ.md §2.4); null/absent: none. */
  groupId?: Id | null;
  updatedAt: Millis;
  updatedBy: Id;
}

/**
 * A group of shots inside a scene, like a folder (docs/INTERFAZ.md §2.4): to
 * keep together shots still to decide or validate. A folder on disk inside
 * the scene; its shots keep their codes and names.
 */
export interface ShotGroup {
  id: Id;
  productionId: Id;
  /** The scene (row) it belongs to. */
  parentId: Id;
  name: string;
  /** Place in the row, in the same scale as its shots' `order`. */
  order: number;
  createdAt: Millis;
}

export type MediaKind = "image" | "video" | "audio";
export type MediaStatus = "queued" | "rendering" | "ready" | "failed";

export interface GenerationInfo {
  provider: string;
  model: string;
  prompt: string;
  params?: Record<string, unknown>;
  sourceMediaId?: Id;
  credits?: number;
  /** uid whose own provider account paid for the generation. */
  launchedBy: Id;
}

export interface Media {
  id: Id;
  productionId: Id;
  /** Node where it was produced (its folder). */
  nodeId: Id;
  kind: MediaKind;
  /** Per node + kind version (v001…), allocated server-side. */
  version: number;
  origin: "generated" | "uploaded" | "render";
  status: MediaStatus;
  progress: number;
  /** Playback / preview URL resolved by the data layer. */
  url?: string;
  thumbUrl?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  archived: boolean;
  generation?: GenerationInfo;
  error?: string;
  /** File name inside the node's `_media/` folder, once downloaded (team folder). */
  file?: string;
  /** Where the provider keeps it (e.g. a Magnific creation), to resume, preview or re-download. */
  remote?: { provider: string; id: string; url?: string; previewUrl?: string; folder?: string };
  /** In a library group: one of the few chosen as its reference (when none is, all are). */
  chosen?: boolean;
  /** Position in its library group (images are dragged to reorder); by creation when absent. */
  order?: number;
  createdBy: Id;
  createdAt: Millis;
}

/** A non-destructive cut of a media placed in a node. */
export interface Take {
  id: Id;
  productionId: Id;
  nodeId: Id;
  mediaId: Id;
  inSec: number;
  outSec: number;
  /** Poster frame at the in-point (rendered server-side). */
  thumbUrl?: string;
  createdBy: Id;
  createdAt: Millis;
}

export interface Comment {
  id: Id;
  productionId: Id;
  nodeId: Id;
  mediaId?: Id;
  /** Timecode within the media. */
  atSec?: number;
  /** A point marked on the image or frame, 0–1 from its top left. */
  point?: { x: number; y: number };
  /** Or an area of it: top left and size, 0–1. */
  area?: { x: number; y: number; w: number; h: number };
  text: string;
  /** People mentioned with @ (they are notified). */
  mentions?: Id[];
  /** The comment it answers (a thread); replies are never resolved on their own. */
  parentId?: Id;
  /**
   * Versions it was on before, oldest first: a comment worked on in a new
   * version is taken there and the thread goes on (v001 → v002).
   */
  history?: Array<{ mediaId: Id; at: Millis; by: Id }>;
  authorId: Id;
  resolved: boolean;
  createdAt: Millis;
}

export type AssetType = "cast" | "prop" | "location" | "style" | "other";

/**
 * The library of a production (docs/INTERFAZ.md §2.8): groups of reference
 * images, each with a name the team gives it («Personaje 1», «Casa de
 * Robida»), shown as rows of images. A group is a node kept apart from the
 * board (like «Vídeos editados»), so generating, versions, review and
 * activity work the same; its folder is `Biblioteca/<Nombre>/`. `type` is
 * optional (what it is, when known). `desk` is an older catch-all group.
 */
export type LibKind = { kind: "desk" } | { kind: "card"; type?: AssetType };

export interface Asset {
  id: Id;
  productionId: Id;
  type: AssetType;
  name: string;
  description: string;
  imageUrl?: string;
}

export type ActivityKind =
  | "status"
  | "generate"
  | "take"
  | "comment"
  | "structure"
  | "assign";

export interface Activity {
  id: Id;
  productionId: Id;
  nodeId?: Id;
  kind: ActivityKind;
  actorId: Id;
  /** Human-readable summary, already localized by the writer. */
  text: string;
  at: Millis;
}

/** Live presence of a member inside a production. */
export interface Presence {
  uid: Id;
  nodeId?: Id;
  at: Millis;
}
