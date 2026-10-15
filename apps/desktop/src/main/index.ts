/**
 * Electron main process: one window hosting the React renderer, typed IPC,
 * the mirror utility process and update checks. All Node/OS access stays
 * here or in utility processes; the renderer is sandboxed.
 */

import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { VERSION_ARG } from "../shared/api";
import { DEV_URL, isAppUrl } from "./env";
import { registerIpc } from "./ipc";
import { startMirror, stopMirror } from "./mirror";
import { checkForUpdates } from "./updater";

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "Sweet Flow",
    backgroundColor: "#0b0b0c",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      additionalArguments: [`${VERSION_ARG}${app.getVersion()}`],
    },
  });

  win.once("ready-to-show", () => win.show());
  lockNavigation(win);

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(path.join(__dirname, "renderer", "index.html"));
  return win;
}

/** The window only ever shows our renderer; links open in the system browser. */
function lockNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    registerIpc();
    startMirror();
    createWindow();
    void checkForUpdates();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", stopMirror);
}
