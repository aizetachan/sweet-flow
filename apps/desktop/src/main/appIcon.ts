/**
 * The app's icon follows the theme (docs/INTERFAZ.md §1.4): only its blue
 * frame takes the accent, the «Sf.» stays white. While the app runs: the Dock
 * and ⌘Tab on the Mac, the taskbar on Windows.
 *
 * On the Mac it also stays with the app closed: the installed app gets it as
 * its custom icon (Finder's «Get Info» one), which Finder, Launchpad and the
 * Dock show. That adds an `Icon\r` file and a Finder flag to the bundle but
 * leaves the signed code as it is (same code hash), so macOS still knows the
 * app and keeps the access given to the team folder. An update replaces the
 * bundle: the icon is given again at the next launch.
 *
 * The accent is remembered here, so the next launch shows it from the start.
 */

import { app, BrowserWindow, nativeImage, type NativeImage } from "electron";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { accentShift, DEFAULT_ACCENT, normHex } from "@sweetflow/ui/color";

const settingsFile = () => path.join(app.getPath("userData"), "theme.json");
const iconName = process.platform === "darwin" ? "icon.png" : "icon-win.png";

let accent: string | null = null;
let current: NativeImage | null = null;
const cache = new Map<string, NativeImage>();

function original(): NativeImage | null {
  // Packaged: next to main.cjs (scripts/build.mjs copies it); in development: build/.
  for (const p of [path.join(__dirname, "icons", iconName), path.join(__dirname, "..", "build", iconName)]) {
    if (existsSync(p)) return nativeImage.createFromPath(p);
  }
  return null;
}

/** The icon with its frame in `hex`: every coloured pixel moved from the corporate blue to it. */
function recolour(hex: string): NativeImage | null {
  const hit = cache.get(hex);
  if (hit) return hit;
  const base = original();
  if (!base || base.isEmpty()) return null;
  const size = base.getSize();
  // BGRA, alpha premultiplied.
  const px = Buffer.from(base.toBitmap());
  const shift = accentShift(hex);
  const seen = new Map<number, number>();
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3]!;
    if (a === 0) continue;
    const b = px[i]!, g = px[i + 1]!, r = px[i + 2]!;
    // The white mark and the black shadow have no colour: they stay.
    if (Math.max(r, g, b) - Math.min(r, g, b) < 6) continue;
    const key = (r << 24) | (g << 16) | (b << 8) | a;
    let out = seen.get(key);
    if (out === undefined) {
      const k = 255 / a;
      const [nr, ng, nb] = shift([r * k, g * k, b * k]);
      const q = a / 255;
      out = (Math.round(nr * q) << 16) | (Math.round(ng * q) << 8) | Math.round(nb * q);
      seen.set(key, out);
    }
    px[i + 2] = (out >> 16) & 255;
    px[i + 1] = (out >> 8) & 255;
    px[i] = out & 255;
  }
  const img = nativeImage.createFromBitmap(px, { width: size.width, height: size.height });
  cache.set(hex, img);
  return img;
}

function show(win?: BrowserWindow): void {
  const img = current;
  if (process.platform === "darwin") {
    // Back to the corporate blue: the bundle's own icon.
    const dockImg = img ?? original();
    if (dockImg) app.dock?.setIcon(dockImg);
    return;
  }
  const target = img ?? original();
  if (!target) return;
  for (const w of win ? [win] : BrowserWindow.getAllWindows()) w.setIcon(target);
}

/** The installed app (…/Sweetflow.app); null in development. */
const bundle = (): string | null => (process.platform === "darwin" && app.isPackaged ? path.resolve(app.getPath("exe"), "../../..") : null);

/** Sets the bundle's custom icon (null: back to its own) with AppKit, through osascript (paths as arguments). */
const SET_ICON = `ObjC.import("AppKit");
function run(argv) {
  const img = argv[1] ? $.NSImage.alloc.initWithContentsOfFile(argv[1]) : $();
  return $.NSWorkspace.sharedWorkspace.setIconForFileOptions(img, argv[0], 0) ? "ok" : "no";
}`;

/** What the bundle has now (remembered: the bundle's own flag can't be read cheaply). */
let bundleIcon: string | null = null;

function keepWhenClosed(hex: string | null, img: NativeImage | null): void {
  const app_ = bundle();
  if (!app_) return;
  const hasCustom = existsSync(path.join(app_, "Icon\r"));
  if (hex === bundleIcon && hasCustom === !!hex) return;
  let png = "";
  if (hex && img) {
    png = path.join(app.getPath("userData"), "app-icon.png");
    writeFileSync(png, img.toPNG());
  } else if (!hasCustom) {
    bundleIcon = null;
    save();
    return;
  }
  execFile("/usr/bin/osascript", ["-l", "JavaScript", "-e", SET_ICON, app_, png], (err, out) => {
    // A read-only place (run from the .dmg) or no permission: it shows its own icon when closed.
    if (err || !String(out).includes("ok")) return console.warn("[icono] no se pudo dejar en la app:", err?.message ?? out);
    bundleIcon = hex;
    save();
  });
}

const save = () => writeFileSync(settingsFile(), JSON.stringify({ ...(accent ? { accent } : {}), ...(bundleIcon ? { bundleIcon } : {}) }));

/** At launch, before the first window: the accent of the last session. */
export function startAppIcon(): void {
  try {
    const saved = JSON.parse(readFileSync(settingsFile(), "utf8")) as { accent?: string; bundleIcon?: string };
    accent = normHex(saved.accent ?? "");
    bundleIcon = normHex(saved.bundleIcon ?? "");
  } catch {
    accent = null;
  }
  if (accent === DEFAULT_ACCENT) accent = null;
  current = accent ? recolour(accent) : null;
  if (current) show();
  // After an update the new bundle has no custom icon yet.
  keepWhenClosed(accent, current);
}

/** A new window (Windows: each one has its own icon in the taskbar). */
export function iconForWindow(win: BrowserWindow): void {
  if (process.platform !== "darwin" && current) show(win);
}

/** The renderer's theme changed (null: the corporate blue). */
export function setAccent(value: unknown): void {
  if (value !== null && typeof value !== "string") throw new Error("Color no válido");
  let hex = value === null ? null : normHex(value);
  if (value !== null && !hex) throw new Error("Color no válido");
  if (hex === DEFAULT_ACCENT) hex = null;
  if (hex === accent) return;
  accent = hex;
  save();
  current = hex ? recolour(hex) : null;
  show();
  keepWhenClosed(hex, current);
}
