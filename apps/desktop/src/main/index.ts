/**
 * Electron main process: one window hosting the React renderer, typed IPC,
 * the mirror utility process and update checks. All Node/OS access stays
 * here or in utility processes; the renderer is sandboxed.
 */

import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import path from "node:path";
import { IPC, VERSION_ARG } from "../shared/api";
import { iconForWindow, startAppIcon } from "./appIcon";
import { startAgent } from "./agent";
import { APP_ORIGIN, registerAppScheme, serveApp } from "./appProtocol";
import { DEV_URL, isAppUrl } from "./env";
import { registerIpc } from "./ipc";
import { startMirror, stopMirror } from "./mirror";
import { checkForUpdates } from "./updater";

/** Every window of ours, popped-out ones too: the same hardened preferences and the bridge. */
function webPreferences(): Electron.WebPreferences {
  return {
    preload: path.join(__dirname, "preload.cjs"),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    additionalArguments: [`${VERSION_ARG}${app.getVersion()}`],
  };
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "Sweetflow",
    backgroundColor: "#0b0b0c",
    show: false,
    // The renderer draws the title bar (Home and the production tabs, docs/INTERFAZ.md §0.1), 40 px
    // tall: the window buttons sit in it, centred (Mac, on the left) or drawn over it (Windows, on the right).
    titleBarStyle: "hidden",
    ...(process.platform === "darwin"
      ? { trafficLightPosition: { x: 14, y: 14 } }
      : { titleBarOverlay: { color: "#0c0c0d", symbolColor: "#b4b4bb", height: 40 } }),
    webPreferences: webPreferences(),
  });

  iconForWindow(win);
  win.once("ready-to-show", () => win.show());
  lockNavigation(win);

  void win.loadURL(pageUrl(""));
  return win;
}

/** Our page at a route of its own (the bundled app or the dev server). */
const pageUrl = (hash: string) => `${DEV_URL ?? `${APP_ORIGIN}/index.html`}${hash}`;

/**
 * The assistant (docs/INTERFAZ.md §0.2) in a window of its own, as narrow as a
 * phone, to put anywhere (another screen too). Only one: asked again, it comes
 * to the front. It starts beside the window that asked, or at the screen's edge.
 */
let assistant: BrowserWindow | null = null;
function openAssistant(from: BrowserWindow | null): void {
  if (assistant && !assistant.isDestroyed()) {
    if (assistant.isMinimized()) assistant.restore();
    assistant.focus();
    return;
  }
  const near = from?.getBounds();
  const area = (near ? screen.getDisplayMatching(near) : screen.getPrimaryDisplay()).workArea;
  const width = 440;
  const height = Math.min(820, area.height - 40);
  const right = near ? near.x + near.width + 12 : area.x + area.width;
  const x = right + width <= area.x + area.width ? right : area.x + area.width - width - 12;
  const y = near ? Math.max(area.y, Math.min(near.y, area.y + area.height - height)) : area.y + 20;
  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 340,
    minHeight: 420,
    title: "Asistente · Sweetflow",
    backgroundColor: "#121214",
    show: false,
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 14, y: 15 } } : {}),
    webPreferences: webPreferences(),
  });
  assistant = win;
  iconForWindow(win);
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    if (assistant === win) assistant = null;
  });
  lockNavigation(win);
  void win.loadURL(pageUrl("#/asistente"));
}

/**
 * Windows only ever show our renderer; links open in the system browser. The
 * renderer may open itself in another window (a node popped out to another
 * monitor, docs/INTERFAZ.md §3); it gets the same hardened preferences.
 */
function lockNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      // A popped-out node opens like a 13–14" laptop screen (1440×900), centred on the
      // screen it starts on, smaller if that screen is (it can be resized or moved).
      const area = screen.getDisplayMatching(win.getBounds()).workArea;
      const width = Math.min(1440, area.width);
      const height = Math.min(900, area.height);
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width,
          height,
          x: area.x + Math.round((area.width - width) / 2),
          y: area.y + Math.round((area.height - height) / 2),
          minWidth: 380,
          minHeight: 480,
          backgroundColor: "#0b0b0c",
          titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
          webPreferences: webPreferences(),
        },
      };
    }
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("did-create-window", (child) => {
    iconForWindow(child);
    lockNavigation(child);
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
}

// The data folder keeps the app's first name ("Sweet Flow"), so renaming the app
// does not lose the sessions and the team folder already saved there.
// In development, SWEETFLOW_USER_DATA gives it a folder of its own: a test run then
// neither shares the installed app's sessions and team folder nor its single-instance lock.
app.setPath("userData", (DEV_URL && process.env.SWEETFLOW_USER_DATA) || path.join(app.getPath("appData"), "Sweet Flow"));

registerAppScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows().filter((w) => w !== assistant);
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  void app.whenReady().then(() => {
    if (!DEV_URL) serveApp(path.join(__dirname, "renderer"));
    registerIpc();
    ipcMain.handle(IPC.agentWindow, (e) => {
      if (!isAppUrl(e.senderFrame?.url ?? "")) throw new Error("IPC rejected");
      openAssistant(BrowserWindow.fromWebContents(e.sender));
    });
    // The connector for the assistant's terminal (docs/INTERFAZ.md §0.2).
    startAgent();
    // The icon with the theme's colour, before the window shows.
    startAppIcon();
    startMirror();
    createWindow();
    void checkForUpdates();

    app.on("activate", () => {
      // The assistant's window alone is not the app: the main one comes back.
      if (BrowserWindow.getAllWindows().every((w) => w === assistant)) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", stopMirror);
}
