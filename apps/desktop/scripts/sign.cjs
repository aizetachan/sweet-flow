/**
 * electron-builder's `afterSign` hook (macOS only): signs the packed app with
 * the development certificate «Sweetflow Dev» when this Mac's keychain has it
 * (scripts/dev-cert.sh makes it). macOS then sees every build as the same app
 * and keeps what the user allowed it (the team folder, screen recording…)
 * across updates; the ad-hoc signature electron-builder puts first changes
 * with every build and loses them (docs/DEVELOPMENT.md «Firma de desarrollo»).
 *
 * Without the certificate it only warns: the ad-hoc build stays as it was.
 * Not a Developer ID: installing still goes through right click › Open.
 */

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const IDENTITY = process.env.SWEETFLOW_SIGN_IDENTITY || "Sweetflow Dev";

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  let identities = "";
  try {
    identities = execFileSync("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
  } catch {
    // No keychain access (CI): the ad-hoc signature stays.
  }
  if (!identities.includes(`"${IDENTITY}"`)) {
    console.log(`  • sin el certificado «${IDENTITY}» en el llavero: la app queda con firma ad hoc (macOS vuelve a pedir los permisos tras cada actualización; scripts/dev-cert.sh lo crea)`);
    return;
  }
  // Everything inside too (--deep), so the whole bundle carries one identity; no timestamp: it is not notarized.
  execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", IDENTITY, "--timestamp=none", app], { stdio: "inherit" });
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
  const info = execFileSync("/usr/bin/codesign", ["-d", "-r-", app], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  console.log(`  • firmada con «${IDENTITY}» (${path.basename(app)}): ${info.trim().split("\n").pop()}`);
};
