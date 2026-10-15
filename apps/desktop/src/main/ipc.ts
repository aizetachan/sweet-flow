/** IPC handlers backing `window.sweetflow` (see shared/api.ts). */

import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type OpenDialogOptions } from "electron";
import path from "node:path";
import { IPC } from "../shared/api";
import { isAppUrl } from "./env";

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
}
