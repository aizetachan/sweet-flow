/**
 * Update checks against GitHub Releases (docs/ARCHITECTURE.md §7.2).
 *
 * While builds are unsigned, macOS refuses to auto-install updates, so on
 * macOS we only notify and send the user to the release page. Windows (NSIS)
 * downloads and installs on quit. Once the mac build is signed, drop the
 * `NOTIFY_ONLY` branch.
 */

import { app, dialog, shell } from "electron";
import { autoUpdater } from "electron-updater";

const RELEASES_URL = "https://github.com/aizetachan/sweet-flow/releases/latest";
const NOTIFY_ONLY = process.platform === "darwin";

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = !NOTIFY_ONLY;
  autoUpdater.autoInstallOnAppQuit = !NOTIFY_ONLY;
  autoUpdater.logger = console;

  if (NOTIFY_ONLY) {
    autoUpdater.on("update-available", async (info) => {
      const { response } = await dialog.showMessageBox({
        type: "info",
        buttons: ["Descargar", "Más tarde"],
        defaultId: 0,
        cancelId: 1,
        message: `Hay una versión nueva de Sweetflow (${info.version})`,
        detail: "Esta versión no está firmada, así que la actualización se instala a mano: descarga el .dmg y reemplaza la app.",
      });
      if (response === 0) void shell.openExternal(RELEASES_URL);
    });
  }

  try {
    if (NOTIFY_ONLY) await autoUpdater.checkForUpdates();
    else await autoUpdater.checkForUpdatesAndNotify();
  } catch (err) {
    // No network or no release published yet: not an error for the user.
    console.warn("[updater] check failed:", err);
  }
}
