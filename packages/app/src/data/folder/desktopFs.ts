/**
 * The team folder in the desktop app: read and written by the app itself
 * (Node, through `window.sweetflow`), and remembered there. Unlike the
 * browser's folder access, nothing has to be allowed again on each launch.
 */

import type { DesktopBridge } from "../../platform";
import type { FolderFs, FsEntry } from "./fs";

type Bridge = Required<Pick<DesktopBridge, "teamFolder" | "pickTeamFolder" | "forgetTeamFolder" | "folder">>;

/** The bridge, when this desktop build has it. */
export function desktopFolders(): Bridge | null {
  const d = typeof window !== "undefined" ? window.sweetflow : undefined;
  return d?.teamFolder && d.pickTeamFolder && d.forgetTeamFolder && d.folder ? (d as Bridge) : null;
}

const TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
  json: "application/json", jsonl: "application/x-ndjson", txt: "text/plain",
};
const typeOf = (path: string) => TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] ?? "";

export class DesktopFolderFs implements FolderFs {
  readonly kind = "local" as const;

  constructor(
    private readonly bridge: Bridge,
    readonly label: string,
  ) {}

  list(dir: string) {
    return this.bridge.folder("list", dir) as Promise<FsEntry[]>;
  }

  listFiles(dir: string) {
    return this.bridge.folder("listFiles", dir) as Promise<Array<FsEntry & { path: string }>>;
  }

  readText(path: string) {
    return this.bridge.folder("readText", path) as Promise<string | null>;
  }

  async writeText(path: string, text: string): Promise<void> {
    await this.bridge.folder("writeText", path, text);
  }

  async readBlob(path: string): Promise<Blob | null> {
    const bytes = (await this.bridge.folder("readBytes", path)) as Uint8Array | null;
    return bytes ? new Blob([bytes as BlobPart], { type: typeOf(path) }) : null;
  }

  async writeBlob(path: string, data: Blob): Promise<void> {
    await this.bridge.folder("writeBytes", path, new Uint8Array(await data.arrayBuffer()));
  }

  async mkdir(path: string): Promise<void> {
    await this.bridge.folder("mkdir", path);
  }

  async move(from: string, to: string): Promise<void> {
    await this.bridge.folder("move", from, to);
  }

  async remove(path: string): Promise<void> {
    await this.bridge.folder("remove", path);
  }
}
