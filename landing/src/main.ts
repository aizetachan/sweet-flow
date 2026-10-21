import { initBackgroundVideos } from "./bgvideo.ts";
import { initForms } from "./forms.ts";
import { initLangSwitch } from "./i18n.ts";
import { initModals } from "./modals.ts";
import { initPricing } from "./pricing.ts";

initModals();
initForms();
initPricing();
initLangSwitch();
initBackgroundVideos();

for (const el of document.querySelectorAll("[data-year]")) el.textContent = String(new Date().getFullYear());

// --- Decorative mockups that are easier to generate than to hand-write ---

// Editor mini (How it works › 03): ruler ticks and the audio waveform.
for (const ruler of document.querySelectorAll<HTMLElement>("[data-ruler]")) {
  const labels = ["0s", "", "", "", "", "10s", "", "", "", "", "20s"];
  ruler.replaceChildren(
    ...labels.map((label) => {
      const tick = document.createElement("span");
      tick.className = label ? "ed__tick ed__tick--major" : "ed__tick";
      if (label) tick.dataset["label"] = label;
      return tick;
    }),
  );
}
const WAVE = [6, 9, 13, 8, 15, 11, 6, 12, 16, 9, 5, 11, 14, 8, 13, 7, 10, 15, 9, 6, 11, 13, 8, 5, 12, 15, 10, 7, 11, 9, 13, 6, 8, 12];
for (const wave of document.querySelectorAll<HTMLElement>("[data-wave]")) {
  wave.replaceChildren(
    ...WAVE.map((h) => {
      const bar = document.createElement("i");
      bar.style.height = `${h}px`;
      return bar;
    }),
  );
}

// CTA collage: four rows of tiles at low opacity, as laid out in the design.
const TILE_ROWS: string[][] = [
  ["00", "01", "02", "03", "04", "05"],
  ["06", "07", "08", "09", "10", "11", "12"],
  ["13", "14", "15", "16", "17", "18"],
  ["19", "20", "00", "08", "04", "07", "15"],
];
for (const collage of document.querySelectorAll<HTMLElement>("[data-collage]")) {
  const tiles: HTMLElement[] = [];
  TILE_ROWS.forEach((row, r) => {
    const offset = r % 2 === 0 ? -20 : -123;
    row.forEach((tile, c) => {
      const img = document.createElement("img");
      img.src = `/img/tile-${tile}.jpg`;
      img.alt = "";
      img.loading = "lazy";
      img.style.left = `${offset + c * 214}px`;
      img.style.top = `${-10 + r * 137}px`;
      tiles.push(img);
    });
  });
  collage.replaceChildren(...tiles);
}
