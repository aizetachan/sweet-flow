/**
 * The team folder on this computer, read and written here with Node: the
 * desktop app remembers it (no browser permission to give again on each
 * launch). The renderer only names paths relative to it; the folder itself is
 * set only through the native picker.
 */

import { app, BrowserWindow, dialog, type OpenDialogOptions } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { FolderEntry, TeamFolder } from "../shared/api";

const settingsFile = () => path.join(app.getPath("userData"), "team-folder.json");

let root: string | null = null;

function load(): string | null {
  try {
    const p = (JSON.parse(readFileSync(settingsFile(), "utf8")) as { path?: string }).path;
    return p && existsSync(p) ? p : null;
  } catch {
    return null;
  }
}

const info = (p: string): TeamFolder => ({ path: p, name: path.basename(p) });

/** The remembered folder, if it is still there. */
export function teamFolder(): TeamFolder | null {
  root ??= load();
  return root ? info(root) : null;
}

export async function pickTeamFolder(win: BrowserWindow | null): Promise<TeamFolder | null> {
  const opts: OpenDialogOptions = { title: "Carpeta del equipo", properties: ["openDirectory", "createDirectory"] };
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  const chosen = res.canceled ? null : res.filePaths[0];
  if (!chosen) return null;
  root = chosen;
  writeFileSync(settingsFile(), JSON.stringify({ path: chosen }));
  return info(chosen);
}

export function forgetTeamFolder(): void {
  root = null;
  writeFileSync(settingsFile(), "{}");
}

/** Absolute path of a path relative to the team folder; never outside it. */
function abs(rel: unknown): string {
  if (!root) throw new Error("No hay carpeta del equipo.");
  if (typeof rel !== "string") throw new Error("Ruta no válida");
  const p = path.resolve(root, rel);
  if (p !== root && !p.startsWith(root + path.sep)) throw new Error("Ruta fuera de la carpeta del equipo");
  return p;
}

const missing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT" || (e as NodeJS.ErrnoException)?.code === "ENOTDIR";

async function list(dir: string): Promise<FolderEntry[]> {
  let names: string[];
  try {
    names = await fs.readdir(abs(dir));
  } catch (e) {
    if (missing(e)) return [];
    throw e;
  }
  const out: FolderEntry[] = [];
  for (const name of names) {
    if (name === ".DS_Store") continue;
    try {
      const st = await fs.stat(path.join(abs(dir), name));
      out.push(st.isDirectory() ? { name, kind: "dir" } : { name, kind: "file", size: st.size, modified: st.mtimeMs });
    } catch {
      // Gone meanwhile (a sync moving it).
    }
  }
  return out;
}

async function listFiles(dir: string): Promise<Array<FolderEntry & { path: string }>> {
  const out: Array<FolderEntry & { path: string }> = [];
  const walk = async (rel: string) => {
    for (const e of await list(rel)) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.kind === "dir") await walk(p);
      else out.push({ ...e, path: p });
    }
  };
  await walk(dir);
  return out;
}

async function readText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(abs(p), "utf8");
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

async function readBytes(p: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await fs.readFile(abs(p)));
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

async function write(p: string, data: string | Uint8Array): Promise<void> {
  const file = abs(p);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

async function move(from: string, to: string): Promise<void> {
  const a = abs(from);
  const b = abs(to);
  await fs.mkdir(path.dirname(b), { recursive: true });
  try {
    await fs.rename(a, b);
  } catch (e) {
    // Another volume: copy, then remove.
    if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
    await fs.cp(a, b, { recursive: true });
    await fs.rm(a, { recursive: true, force: true });
  }
}

/** One handler for every operation of the renderer's FolderFs. */
export async function folderOp(op: unknown, a: unknown, b: unknown): Promise<unknown> {
  switch (op) {
    case "list":
      return list(a as string);
    case "listFiles":
      return listFiles(a as string);
    case "readText":
      return readText(a as string);
    case "readBytes":
      return readBytes(a as string);
    case "writeText":
      if (typeof b !== "string") throw new Error("Contenido no válido");
      return write(a as string, b);
    case "writeBytes":
      if (!(b instanceof Uint8Array)) throw new Error("Contenido no válido");
      return write(a as string, b);
    case "mkdir":
      return void (await fs.mkdir(abs(a), { recursive: true }));
    case "move":
      return move(a as string, b as string);
    case "remove":
      return void (await fs.rm(abs(a), { recursive: true, force: true }));
    default:
      throw new Error(`Operación desconocida: ${String(op)}`);
  }
}
