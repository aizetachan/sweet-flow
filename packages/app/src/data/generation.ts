/**
 * Generation providers for the local and folder modes (docs/ARCHITECTURE.md
 * §6). LocalSource drives the job and records it in the log; a provider only
 * knows how to ask for an image or a video and get the file back. Magnific
 * is the first (src/integrations/magnific/generator.ts).
 */

import type { MediaKind } from "@sweetflow/domain";

export interface GenerationRequest {
  kind: MediaKind;
  prompt: string;
  /** Model name as shown in the UI. */
  model: string;
  durationSec?: number;
  /** Provider id of an image to start the video from. */
  startFrom?: string;
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
}

/** Models offered in the generate box, per kind. The provider maps them to its own. */
export const MODELS: Record<"image" | "video", string[]> = {
  image: ["Nano Banana Pro", "Recraft V4.1", "Seedream 5 Pro", "Auto (Magnific elige)"],
  video: ["Seedance 2.5", "Kling 2.5", "Seedance 2.0 Fast", "Auto (Magnific elige)"],
};
