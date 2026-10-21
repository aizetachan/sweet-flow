/**
 * Electron main process: one window hosting the React renderer, typed IPC,
 * the mirror utility process and update checks. All Node/OS access stays
 * here or in utility processes; the renderer is sandboxed.
 */

import { app, BrowserWindow, screen, shell } from "electron";
import path from "node:path";
import { VERSION_ARG } from "../shared/api";
import { iconForWindow, startAppIcon } from "./appIcon";
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

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadURL(`${APP_ORIGIN}/index.html`);
  return win;
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
app.setPath("userData", path.join(app.getPath("appData"), "Sweet Flow"));

registerAppScheme();

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
    if (!DEV_URL) serveApp(path.join(__dirname, "renderer"));
    registerIpc();
    // The icon with the theme's colour, before the window shows.
    startAppIcon();
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
