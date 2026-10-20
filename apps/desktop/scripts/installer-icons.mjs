// Installer icons from their PNGs (docs/DEVELOPMENT.md «Imágenes del instalador»), on a Mac:
// build/dmg-icon.png → build/dmg-icon.icns (the .dmg disk), build/installer-icon.png →
// build/installer-icon.ico (the Windows setup program). Run: node scripts/installer-icons.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { root } from "./bundle.mjs";

const build = path.join(root, "build");
const tmp = mkdtempSync(path.join(tmpdir(), "sf-icons-"));
const resize = (src, size, out) => {
  execFileSync("sips", ["-z", String(size), String(size), src, "--out", out], { stdio: "ignore" });
  return out;
};

// .icns: an iconset with every size macOS asks for, put together by iconutil.
const set = path.join(tmp, "dmg-icon.iconset");
execFileSync("mkdir", [set]);
for (const s of [16, 32, 128, 256, 512]) {
  resize(path.join(build, "dmg-icon.png"), s, path.join(set, `icon_${s}x${s}.png`));
  resize(path.join(build, "dmg-icon.png"), s * 2, path.join(set, `icon_${s}x${s}@2x.png`));
}
execFileSync("iconutil", ["-c", "icns", set, "-o", path.join(build, "dmg-icon.icns")]);

// .ico: PNG images in an ICO container (Windows Vista and later read them).
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((s) => readFileSync(resize(path.join(build, "installer-icon.png"), s, path.join(tmp, `${s}.png`))));
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const at = 6 + 16 * i;
  head.writeUInt8(s % 256, at);
  head.writeUInt8(s % 256, at + 1);
  head.writeUInt16LE(1, at + 4);
  head.writeUInt16LE(32, at + 6);
  head.writeUInt32LE(pngs[i].length, at + 8);
  head.writeUInt32LE(offset, at + 12);
  offset += pngs[i].length;
});
writeFileSync(path.join(build, "installer-icon.ico"), Buffer.concat([head, ...pngs]));
rmSync(tmp, { recursive: true, force: true });
console.log("build/dmg-icon.icns and build/installer-icon.ico ready");
