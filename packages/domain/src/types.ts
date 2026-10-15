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
  createdAt: Millis;
  updatedAt: Millis;
}

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
  /** Stable number used in the code (10, 15, 20…). */
  number: number;
  title: string;
  notes: string;
  statusId: Id;
  assigneeIds: Id[];
  /** Breakdown: cast / props / locations linked to this node. */
  assetIds: Id[];
  selectedTakeId?: Id;
  updatedAt: Millis;
  updatedBy: Id;
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
  text: string;
  authorId: Id;
  resolved: boolean;
  createdAt: Millis;
}

export type AssetType = "cast" | "prop" | "location" | "style";

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
