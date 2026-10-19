/**
 * Generation providers for the local and folder modes (docs/ARCHITECTURE.md
 * §6). LocalSource drives the job and records it in the log; a provider only
 * knows how to ask for an image or a video and get the file back. Magnific
 * is the first (src/integrations/magnific/generator.ts).
 */

import type { MediaKind } from "@sweetflow/domain";
import type { RefType } from "./models";
import type { BrowsePage, BrowseQuery, RemoteFolder } from "./source";

export interface GenerationRequest {
  kind: MediaKind;
  prompt: string;
  /** Model name as shown in the UI. */
  model: string;
  durationSec?: number;
  /** Provider id of an image to start the video from. */
  startFrom?: string;
  /** Provider id of an image to end it on. */
  endOn?: string;
  /** Provider ids of what guides it. */
  references?: Array<{ type: RefType; id: string }>;
  /**
   * Library groups called in the prompt («@Elena»): what the group is
   * (character, product, place; null when none of those) and the provider ids
   * of its picked images. The provider makes it a library asset of its own
   * when it can (Magnific), or sends the images as references.
   */
  mentions?: Array<{ key: string; tag: string; kind: "character" | "product" | "locations" | "style" | null; description?: string; ids: string[] }>;
  aspectRatio?: string;
  resolution?: string;
  sound?: boolean;
  instrumental?: boolean;
  loop?: boolean;
  /**
   * Where to keep it at the provider, mirroring the team folder down to the
   * node: dashboard folders, production, SQ, SC, SH (decided 16 oct 2026).
   */
  folderPath: string[];
}

export type GenerationPoll =
  | { status: "pending"; progress?: number }
  | { status: "done"; url: string; previewUrl?: string; width?: number; height?: number; durationSec?: number; credits?: number }
  | { status: "failed"; error: string };

export interface Generator {
  readonly provider: string;
  /** Whether this person's account is connected right now. */
  connected(): boolean;
  /** Credits it would cost, if the provider can tell. */
  estimate(req: GenerationRequest): Promise<number | null>;
  /** Queues it; resolves with the provider's id and the provider folder used. */
  start(req: GenerationRequest): Promise<{ id: string; folder?: string }>;
  /** One check (may wait a little on the provider's side). */
  poll(id: string): Promise<GenerationPoll>;
  /** The finished file. */
  download(url: string): Promise<Blob>;
  /** A URL this page can show for one of the provider's files. */
  viewUrl(url: string): string;
  /** Uploads a file to the provider, in the folder for `folderPath`; resolves with its id there. */
  upload?(file: File, folderPath: string[]): Promise<{ id: string }>;
  /** This person's creations and folders there, to import them. */
  browse?(q: BrowseQuery): Promise<BrowsePage>;
  folders?(parent: string | null): Promise<RemoteFolder[]>;
}

