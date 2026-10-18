/**
 * Sandboxed preload: the only bridge between the renderer and the main
 * process. Exposes a minimal typed API as `window.sweetflow`.
 */

import { contextBridge, ipcRenderer } from "electron";
import { IPC, VERSION_ARG, type SweetflowApi } from "../shared/api";

const versionArg = process.argv.find((a) => a.startsWith(VERSION_ARG));

const api: SweetflowApi = {
  version: versionArg ? versionArg.slice(VERSION_ARG.length) : "0.0.0",
  platform: process.platform as SweetflowApi["platform"],
  pickFolder: () => ipcRenderer.invoke(IPC.pickFolder) as Promise<string | null>,
  revealInFolder: (path) => ipcRenderer.invoke(IPC.revealInFolder, path) as Promise<void>,
  copyFile: (path) => ipcRenderer.invoke(IPC.copyFile, path) as Promise<void>,
};

contextBridge.exposeInMainWorld("sweetflow", api);
