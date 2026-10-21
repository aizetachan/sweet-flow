/** IPC handlers backing `window.sweetflow` (see shared/api.ts). */

import { BrowserWindow, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { IPC } from "../shared/api";
import { authOpen, authRedirect, googleToken } from "./auth";
import { isAppUrl } from "./env";
import { setAccent } from "./appIcon";
import { folderOp, forgetTeamFolder, pickTeamFolder, teamFolder } from "./folder";

/** Only our own renderer may call privileged handlers. */
function assertTrusted(e: IpcMainInvokeEvent): void {
  const url = e.senderFrame?.url ?? "";
  if (!isAppUrl(url)) throw new Error(`IPC rejected from ${url}`);
}

export function registerIpc(): void {
  ipcMain.handle(IPC.pickFolder, async (e) => {
    assertTrusted(e);
    const opts: OpenDialogOptions = { title: "Elegir carpeta", properties: ["openDirectory", "createDirectory"] };
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC.revealInFolder, (e, target: unknown) => {
    assertTrusted(e);
    if (typeof target !== "string" || !path.isAbsolute(target)) throw new Error("Ruta no válida");
    shell.showItemInFolder(path.normalize(target));
  });

  // The file itself on the clipboard (not its contents), as Finder / Explorer copy does.
  ipcMain.handle(IPC.copyFile, (e, target: unknown) => {
    assertTrusted(e);
    if (typeof target !== "string" || !path.isAbsolute(target)) throw new Error("Ruta no válida");
    const file = path.normalize(target);
    if (!existsSync(file)) throw new Error("El archivo no está en el disco (¿aún se está sincronizando?)");
    if (process.platform === "darwin") {
      const esc = file.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><array><string>${esc}</string></array></plist>`;
      clipboard.writeBuffer("NSFilenamesPboardType", Buffer.from(plist));
    } else if (process.platform === "win32") {
      clipboard.writeBuffer("FileNameW", Buffer.from(`${file}\0`, "ucs2"));
    } else {
      clipboard.writeText(`file://${file}`);
    }
  });

  ipcMain.handle(IPC.authRedirect, (e, p: unknown) => {
    assertTrusted(e);
    if (typeof p !== "string" || !/^\/auth\/[a-z]+$/.test(p)) throw new Error("Ruta no válida");
    return authRedirect(p);
  });

  ipcMain.handle(IPC.authOpen, (e, url: unknown) => {
    assertTrusted(e);
    if (typeof url !== "string") throw new Error("Dirección no válida");
    return authOpen(url);
  });

  ipcMain.handle(IPC.googleToken, (e, body: unknown) => {
    assertTrusted(e);
    if (typeof body !== "string") throw new Error("Petición no válida");
    return googleToken(body);
  });

  ipcMain.handle(IPC.teamFolder, (e) => (assertTrusted(e), teamFolder()));
  ipcMain.handle(IPC.pickTeamFolder, (e) => (assertTrusted(e), pickTeamFolder(BrowserWindow.fromWebContents(e.sender))));
  ipcMain.handle(IPC.forgetTeamFolder, (e) => (assertTrusted(e), forgetTeamFolder()));
  ipcMain.handle(IPC.setAccent, (e, accent: unknown) => (assertTrusted(e), setAccent(accent)));
  ipcMain.handle(IPC.folder, (e, op: unknown, a: unknown, b: unknown) => (assertTrusted(e), folderOp(op, a, b)));
}
