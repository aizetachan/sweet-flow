// Hero: an interactive replica of the production board, desktop only (the
// CSS shows it from 1100px with a fine pointer; narrower screens keep the
// still capture). Everything runs on fixed data in the markup: the window is
// laid out at 1200×750 and scaled to the container; the left panel shows the
// item picked in the grid or in the Explorer, can be closed (empty state) or
// popped out into a window of its own; groups open in place; «Generate»
// fakes a run that adds a version; floating windows (the assistant, the
// popped item) drag inside the app. No network, nothing persisted.

const WIDTH = 1200;
const HEIGHT = 750;
const EDGE = 8;
/** How much of a window must stay on screen when it leaves by a side (it never leaves by the top or bottom). */
const KEEP = 0.45;
const RUN_MS = 2400;

type Variant = "character" | "shot";
type Item = {
  id: string;
  /** Older versions' pictures, newest first, for the gallery of the wide window. */
  gallery: string[];
  name: string;
  type: string;
  img: string;
  video: string;
  /** What the next «Generate» produces; swapped with `img` on each run so repeated runs alternate. */
  result: string;
  version: number;
  when: string;
  note: string;
  variant: Variant;
};

const tag = (v: number) => `v${String(v).padStart(3, "0")}`;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};

export function initHeroApp(root: ParentNode = document): void {
  const app = root.querySelector<HTMLElement>("[data-hero-app]");
  const frame = app?.parentElement;
  const stage = frame?.parentElement;
  const layer = root.querySelector<HTMLElement>("[data-winlayer]");
  if (!app || !frame || !stage || !layer) return;
  const windows = Array.from(layer.querySelectorAll<HTMLElement>("[data-window]"));
  const t = (key: string) => app.dataset[key] ?? "";
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => app.querySelector<T>(sel);
  const qa = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(app.querySelectorAll<T>(sel));

  // --- scale the fixed layout to the container's width ---
  let scale = 1;
  /** Positions are in the app's units (1200×750) and drawn scaled like it; a window may sit outside the frame. */
  const placeWindow = (w: HTMLElement) => {
    w.style.left = `${Number(w.dataset["x"] ?? 0) * scale}px`;
    w.style.top = `${Number(w.dataset["y"] ?? 0) * scale}px`;
  };
  const fit = () => {
    scale = frame.clientWidth / WIDTH;
    app.style.setProperty("--app-scale", String(scale));
    layer.style.setProperty("--app-scale", String(scale));
    for (const w of windows) placeWindow(w);
  };
  fit();
  new ResizeObserver(fit).observe(frame);

  // --- segmented controls and tabs: a [data-x] button shows the [data-x-pane] with the same value ---
  const group = (attr: string, onPick?: (id: string) => void) => {
    const btns = qa(`[data-${attr}]`);
    const panes = qa(`[data-${attr}-pane]`);
    const pick = (b: HTMLElement) => {
      const id = b.getAttribute(`data-${attr}`) ?? "";
      for (const o of btns) {
        o.classList.toggle("is-on", o === b);
        if (o.hasAttribute("aria-selected")) o.setAttribute("aria-selected", String(o === b));
      }
      for (const p of panes) p.classList.toggle("is-on", p.getAttribute(`data-${attr}-pane`) === id);
      onPick?.(id);
    };
    for (const b of btns) b.addEventListener("click", () => pick(b));
    return (id: string) => {
      const b = btns.find((o) => o.getAttribute(`data-${attr}`) === id);
      if (b) pick(b);
    };
  };
  const showSide = group("side");
  const showTab = group("tab", (id) => { app.dataset["tab"] = id; layer.dataset["tab"] = id; });

  // --- S / M / L, and grid ↔ one row ---
  const grid = q("[data-grid]");
  const scene = q(".app__scene");
  const sizes = qa("[data-size]");
  for (const b of sizes) {
    b.addEventListener("click", () => {
      for (const o of sizes) o.classList.toggle("is-on", o === b);
      grid?.setAttribute("data-size", b.dataset["size"] ?? "m");
    });
  }
  q("[data-view-toggle]")?.addEventListener("click", () => {
    const row = grid?.getAttribute("data-view") !== "row";
    grid?.setAttribute("data-view", row ? "row" : "grid");
    scene?.classList.toggle("is-row", row);
  });

  // --- groups open in place: the row shows only their shots, with a bar to go back ---
  const groupbar = q("[data-groupbar]");
  const openGroup = (id: string | null) => {
    const card = id ? q(`[data-group="${id}"]`) : null;
    if (grid) {
      if (id) grid.setAttribute("data-open", id);
      else grid.removeAttribute("data-open");
    }
    scene?.classList.toggle("is-group-open", !!id);
    if (card && groupbar) {
      const name = groupbar.querySelector("[data-group-name]");
      const count = groupbar.querySelector("[data-group-count]");
      if (name) name.textContent = card.dataset["name"] ?? "";
      if (count) count.textContent = card.dataset["count"] ?? "";
    }
    for (const b of qa("[data-tree-group]")) b.classList.toggle("is-open", b.dataset["treeGroup"] === id || b.classList.contains("is-open"));
  };
  for (const g of qa("[data-group]")) g.addEventListener("click", () => openGroup(g.dataset["group"] ?? null));
  q("[data-group-close]")?.addEventListener("click", () => openGroup(null));

  // --- the item in the left panel ---
  const pane = q("[data-side-pane='production']");
  const itemwrap = q(".app__itemwrap");
  const tabbody = q(".app__tabbody");
  const viewer = q(".app__viewer");
  const setState = (s: "item" | "empty" | "elsewhere") => { if (pane) pane.dataset["state"] = s; };
  const el = {
    name: q("[data-sel-name]"),
    type: q("[data-sel-type]"),
    img: q<HTMLImageElement>("[data-viewer-img]"),
    video: q<HTMLVideoElement>("[data-viewer-video]"),
    stage: q(".app__viewer-img"),
    version: q("[data-viewer-version]"),
    reviewVersion: q("[data-review-version]"),
    reviewNow: qa("[data-review-now]"),
    reviewTrail: q("[data-review-trail]"),
    meta: q("[data-viewer-meta]"),
    note: q("[data-viewer-note]"),
    prompt: q("[data-prompt]"),
    generate: q<HTMLButtonElement>("[data-generate]"),
    generateLabel: q("[data-generate-label]"),
    elsewhereName: q("[data-elsewhere-name]"),
  };
  const itemOf = (id: string, d: DOMStringMap, prefix = ""): Item & { gallery: string[] } => {
    const k = (s: string) => d[prefix ? prefix + s[0]!.toUpperCase() + s.slice(1) : s] ?? "";
    return {
      id, name: k("name"), type: k("type"), img: k("img"), video: k("video"), result: k("result") || k("img"),
      version: Number(k("version") || 1), when: k("when"), note: k("note"), variant: (k("variant") || "shot") as Variant,
      gallery: k("gallery") ? k("gallery").split(",") : [],
    };
  };
  const home = itemOf("home", app.dataset, "home");
  const items = new Map<string, Item>([["home", home]]);
  const shots = qa("[data-shot]");
  const itemFor = (id: string): Item => {
    let item = items.get(id);
    if (!item) {
      const card = shots.find((s) => s.dataset["shot"] === id);
      item = card ? itemOf(id, card.dataset) : home;
      items.set(id, item);
    }
    return item;
  };
  let current: Item | null = home;
  let popped: Item | null = null;

  /** Puts the item's picture or clip on a stage (the panel's viewer or the popped window). */
  const showMedia = (item: Item, stage: HTMLElement | null, img: HTMLImageElement | null, video: HTMLVideoElement | null) => {
    stage?.classList.toggle("has-video", !!item.video);
    if (img && img.getAttribute("src") !== item.img) img.src = item.img;
    if (!video) return;
    if (item.video) {
      if (video.getAttribute("src") !== item.video) {
        video.poster = item.img;
        video.src = item.video;
      }
      video.play().catch(() => {});
    } else {
      video.pause();
      video.removeAttribute("src");
    }
  };
  const show = (item: Item) => {
    current = item;
    app.dataset["variant"] = item.variant;
    layer.dataset["variant"] = item.variant;
    if (el.name) el.name.textContent = item.name;
    if (el.type) el.type.textContent = item.type;
    if (el.version) el.version.textContent = tag(item.version);
    if (el.reviewVersion) el.reviewVersion.textContent = tag(item.version);
    for (const n of el.reviewNow) n.textContent = tag(item.version);
    // A shot on its first version has no trail of versions yet.
    if (el.reviewTrail) el.reviewTrail.style.display = item.version > 1 ? "" : "none";
    if (el.meta) el.meta.textContent = `${t("tModel")} · Nora · ${item.when}`;
    if (el.note) el.note.textContent = item.note;
    if (el.prompt) el.prompt.textContent = t("tPrompt").replace("{name}", item.name);
    showMedia(item, el.stage, el.img, el.video);
    if (popped && popped.id === item.id) {
      // The panel itself is in the window; the column points there.
      if (el.elsewhereName) el.elsewhereName.textContent = item.name;
      syncWindowHead(item);
      setState("elsewhere");
    } else {
      setState("item");
    }
  };
  const select = (id: string | null, fromBoard = true) => {
    for (const s of shots) {
      const on = !!id && s.dataset["shot"] === id;
      s.classList.toggle("is-on", on);
      s.setAttribute("aria-pressed", String(on));
    }
    for (const r of qa("[data-tree-shot], [data-tree-home]")) {
      r.classList.toggle("is-on", (r.dataset["treeShot"] ?? (r.hasAttribute("data-tree-home") ? "home" : "")) === id);
    }
    // Picking something else while an item is in its window brings that one back first.
    if (popped && popped.id !== id) bringBack();
    if (!id) {
      current = null;
      el.video?.pause();
      setState("empty");
      return;
    }
    show(itemFor(id));
    if (fromBoard) {
      showSide("production");
      showTab("produce");
    }
  };
  for (const s of shots) s.addEventListener("click", () => select(s.classList.contains("is-on") ? null : s.dataset["shot"] ?? null));
  q("[data-sel-close]")?.addEventListener("click", () => (popped ? bringBack() : select(null)));

  // Explorer: folders fold; a shot picks its card (opening its group), «Woman main» the character.
  for (const f of qa("[data-folder]")) {
    f.addEventListener("click", () => f.classList.toggle("is-open"));
  }
  for (const r of qa("[data-tree-shot]")) {
    r.addEventListener("click", () => {
      const id = r.dataset["treeShot"] ?? "";
      const card = shots.find((s) => s.dataset["shot"] === id);
      const g = card?.dataset["inGroup"];
      if (g !== grid?.getAttribute("data-open")) openGroup(g ?? null);
      select(id, false);
    });
  }
  q("[data-tree-home]")?.addEventListener("click", () => { openGroup(null); select("home", false); });

  // --- floating windows: open, close, raise, drag by the header inside the app ---
  let z = 20;
  const raise = (w: HTMLElement) => { w.style.zIndex = String(++z); };
  const winOf = (name: string) => windows.find((w) => w.dataset["window"] === name) ?? null;
  /** Where a window may go, in app units. Opening: whole on screen. Dragging: it may leave by the sides (keeping part in view), never by the top or the bottom. */
  const bounds = (w: HTMLElement, dragging = false) => {
    const r = stage.getBoundingClientRect();
    const out = dragging ? w.offsetWidth * (1 - KEEP) : 0;
    return {
      minX: (EDGE - r.left) / scale - out,
      maxX: (window.innerWidth - EDGE - r.left) / scale - w.offsetWidth + out,
      minY: (EDGE - r.top) / scale,
      maxY: Math.max(HEIGHT + 200, (window.innerHeight - EDGE - r.top) / scale - w.offsetHeight),
    };
  };
  /** A window opens as far out of the app as the screen allows: the item's panel to the left, the assistant to the right. */
  const openWindow = (name: string) => {
    const w = winOf(name);
    if (!w) return;
    w.classList.add("is-open");
    raise(w);
    const b = bounds(w);
    const gap = 24;
    const wanted = name === "assistant" ? WIDTH + gap : -(w.offsetWidth + gap);
    w.dataset["x"] = String(clamp(wanted, b.minX, b.maxX));
    w.dataset["y"] = String(clamp(Number(w.dataset["y0"] ?? 40), b.minY, b.maxY));
    placeWindow(w);
  };
  const closeWindow = (w: HTMLElement) => {
    w.classList.remove("is-open");
    if (w.dataset["window"] === "item") bringBack();
  };
  for (const w of windows) {
    w.addEventListener("pointerdown", () => raise(w));
    w.querySelector("[data-win-close]")?.addEventListener("click", () => closeWindow(w));
    const handle = w.querySelector<HTMLElement>("[data-win-handle]");
    handle?.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      const ox = Number(w.dataset["x"] ?? 0);
      const oy = Number(w.dataset["y"] ?? 0);
      // The handle captures the pointer, so the drag ends wherever the button is released.
      // The window can leave the app's frame; it only stays on screen (and not far below the hero).
      const move = (ev: PointerEvent) => {
        if (ev.buttons === 0) return end();
        const b = bounds(w, true);
        w.dataset["x"] = String(clamp(ox + (ev.clientX - sx) / scale, b.minX, b.maxX));
        w.dataset["y"] = String(clamp(oy + (ev.clientY - sy) / scale, b.minY, b.maxY));
        placeWindow(w);
      };
      const end = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        handle.classList.remove("is-dragging");
        if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
      };
      handle.classList.add("is-dragging");
      handle.setPointerCapture(e.pointerId);
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  }
  for (const b of qa("[data-open-window]")) b.addEventListener("click", () => openWindow(b.dataset["openWindow"] ?? ""));
  q("[data-term-toggle]")?.addEventListener("click", () => winOf("assistant")?.classList.toggle("is-term"));

  // The item in a window of its own: the whole panel moves into the window (like the
  // app, which opens the inspector in a window) and the column points there until it
  // is brought back.
  const itemWin = winOf("item");
  const winBody = itemWin?.querySelector<HTMLElement>("[data-win-body]") ?? null;
  const winStage = itemWin?.querySelector<HTMLElement>("[data-win-stage]") ?? null;
  const gallery = itemWin?.querySelector<HTMLElement>("[data-gallery]") ?? null;
  /** The stage's gallery: this version first (chosen), then the older ones the item knows. */
  const fillGallery = (item: Item) => {
    if (!gallery) return;
    const older = item.gallery.length ? item.gallery : item.version > 1 ? [item.result] : [];
    const pics = [item.img, ...older].slice(0, 6);
    gallery.replaceChildren(...pics.map((src, i) => {
      const v = item.version - i;
      if (v < 1) return document.createDocumentFragment();
      const el = document.createElement("div");
      el.className = i === 0 ? "app__version is-on" : "app__version";
      el.innerHTML = `<img src="${src}" alt="" loading="lazy" /><span class="app__version-tag">${tag(v)}${i === 0 ? `<em>${gallery.dataset["tChosen"] ?? ""}</em>` : ""}</span>`;
      return el;
    }));
  };
  function syncWindowHead(item: Item) {
    const name = itemWin?.querySelector("[data-win-item-name]");
    const meta = itemWin?.querySelector("[data-win-item-meta]");
    if (name) name.textContent = item.name;
    if (meta) meta.textContent = `${tag(item.version)} · ${t("tModel")} · Nora · ${item.when}`;
  }
  const popOut = () => {
    if (!current || !itemWin || !winBody || !itemwrap) return;
    popped = current;
    winBody.append(itemwrap);
    if (viewer && winStage) winStage.append(viewer);
    fillGallery(popped);
    openWindow("item");
    show(popped);
    el.video?.play().catch(() => {});
  };
  function bringBack() {
    if (!popped) return;
    popped = null;
    itemWin?.classList.remove("is-open");
    if (viewer && tabbody) tabbody.append(viewer);
    if (itemwrap && pane) pane.append(itemwrap);
    if (current) show(current);
  }
  q("[data-popout]")?.addEventListener("click", popOut);
  q("[data-bring-back]")?.addEventListener("click", bringBack);
  q("[data-goto-window]")?.addEventListener("click", () => {
    if (!itemWin) return;
    raise(itemWin);
    itemWin.classList.add("is-flash");
    window.setTimeout(() => itemWin.classList.remove("is-flash"), 700);
  });

  // --- the production's information, under its button; closes on a click elsewhere ---
  const infoBtn = q("[data-info]");
  const infoPop = q("[data-info-pop]");
  const setInfo = (open: boolean) => {
    infoPop?.classList.toggle("is-open", open);
    infoBtn?.classList.toggle("is-on", open);
    infoBtn?.setAttribute("aria-expanded", String(open));
  };
  infoBtn?.addEventListener("click", () => setInfo(!infoPop?.classList.contains("is-open")));
  window.addEventListener("pointerdown", (e) => {
    const target = e.target as Node;
    if (infoPop?.classList.contains("is-open") && !infoPop.contains(target) && !infoBtn?.contains(target)) setInfo(false);
  });

  // --- the clip's player under the viewer ---
  const player = q("[data-player]");
  const playBtn = q("[data-play]");
  const bar = q("[data-player-bar]");
  const time = q("[data-player-time]");
  if (el.video) {
    const v = el.video;
    v.addEventListener("timeupdate", () => {
      const d = v.duration || 5;
      if (bar) bar.style.width = `${(v.currentTime / d) * 100}%`;
      if (time) time.textContent = `${fmtTime(v.currentTime)} / ${fmtTime(d)}`;
    });
    v.addEventListener("play", () => player?.classList.add("is-playing"));
    v.addEventListener("pause", () => player?.classList.remove("is-playing"));
    playBtn?.addEventListener("click", () => { if (v.paused) v.play().catch(() => {}); else v.pause(); });
  }

  // --- activity: the categories filter the feed ---
  const feed = q("[data-feed]");
  const cats = qa("[data-acat]");
  for (const c of cats) {
    c.addEventListener("click", () => {
      for (const o of cats) o.classList.toggle("is-on", o === c);
      feed?.setAttribute("data-acat", c.dataset["acat"] ?? "all");
    });
  }

  // --- «Generate»: a fake run, then one more version of the current item ---
  let running = false;
  el.generate?.addEventListener("click", () => {
    if (running || !current) return;
    running = true;
    const item = current;
    app.classList.add("is-generating");
    layer.classList.add("is-generating");
    el.generate?.classList.add("is-running");
    if (el.generateLabel) el.generateLabel.textContent = t("tGenerating");
    window.setTimeout(() => {
      item.version += 1;
      if (!item.video) [item.img, item.result] = [item.result, item.img];
      item.when = t("tNow");
      app.classList.remove("is-generating");
      layer.classList.remove("is-generating");
      el.generate?.classList.remove("is-running");
      if (el.generateLabel) el.generateLabel.textContent = t("tGenerate");
      running = false;
      if (current === item) show(item);
      if (popped === item) fillGallery(item);
      const today = q(`[data-for="${item.variant}"] [data-feed-today]`);
      if (today) {
        const li = document.createElement("li");
        li.dataset["kind"] = "generate";
        li.innerHTML = `<svg class="ic"><use href="#i-wand" /></svg><span><b>Nora</b> ${t("tGenerated")} <code>${tag(item.version)}</code> ${t("tModel")}</span><small>${t("tNow")}</small>`;
        today.prepend(li);
      }
    }, RUN_MS);
  });
}
