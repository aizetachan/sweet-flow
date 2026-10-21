// Generates the two language pages from src/page.html and src/i18n/*.json:
//   index.html               English (the default Hosting serves)
//   localized/es/index.html  Spanish (Hosting i18n picks it for es-* browsers)
// Placeholders are {{key}}; values are trusted HTML (a <br /> in the title).
// Runs before `vite` and `vite build` (see package.json). Output is ignored by git.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const template = readFileSync(join(root, "src/page.html"), "utf8");

const PAGES = [
  { lang: "en", out: "index.html" },
  { lang: "es", out: "localized/es/index.html" },
];

let failed = false;
for (const { lang, out } of PAGES) {
  const dict = JSON.parse(readFileSync(join(root, `src/i18n/${lang}.json`), "utf8"));
  const used = new Set();
  const html = template.replace(/\{\{([\w.]+)\}\}/g, (_, key) => {
    used.add(key);
    if (!(key in dict)) {
      console.error(`[i18n] ${lang}: missing key "${key}"`);
      failed = true;
      return "";
    }
    return dict[key];
  });
  for (const key of Object.keys(dict)) {
    if (!used.has(key)) console.warn(`[i18n] ${lang}: unused key "${key}"`);
  }
  const target = join(root, out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `<!-- Generated from src/page.html + src/i18n/${lang}.json. Do not edit. -->\n${html}`);
  console.log(`[i18n] wrote ${out}`);
}
if (failed) process.exit(1);
