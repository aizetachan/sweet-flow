/**
 * App store: where the user is (splash → dashboard → production), the open
 * production's latest Snapshot, and local UI state. Mutations go through
 * `library` (dashboard) and `source` (the open production); the store only
 * mirrors what they emit.
 */

import { create } from "zustand";
import { codeOf, type Id } from "@sweetflow/domain";
import type { DataSource, Snapshot } from "../data/source";
import type { Library, LibraryState, Pin } from "../data/library";
import { createLibrary } from "../data";
import { closePoppedWindow, closePoppedWindows, focusPoppedWindow, hostWindows, onFlashRequest, openerShare, popOutWindow, watchOpener, type PoppedWindow } from "./windows";

export type Phase = "dashboard" | "production" | "window";
export type View = "board" | "library" | "team" | "trash";
export type CardSize = "s" | "m" | "l";
export type PanelTab = "produce" | "cut" | "review" | "activity";
export type DashLayout = "grid" | "list";
export type DashSection = "home" | "recent" | "trash" | "settings";
export type SettingsTab = "profile" | "storage" | "integrations" | "about";
/** Left column of the production screen: the work panel or the structure tree. */
export type SideTab = "work" | "structure";

/** Short message at the bottom, optionally with one action (e.g. "Deshacer"). */
export interface Notice {
  text: string;
  action?: { label: string; run: () => void };
}

export interface Filters {
  query: string;
  statusIds: Id[];
  assigneeId: Id | null;
  assetId: Id | null;
}

/** A work panel detached from the right column (docs/INTERFAZ.md §3). */
export interface FloatingPanel {
  key: string;
  nodeId: Id;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

interface UiState {
  phase: Phase;
  /** Dashboard folder being browsed (null = root). */
  folderId: Id | null;
  dashLayout: DashLayout;
  dashSection: DashSection;
  settingsTab: SettingsTab;
  /** Open production (library entry id). */
  productionId: Id | null;
  sideTab: SideTab;
  /** Node shown by a popped-out window (phase "window"). */
  windowNodeId: Id | null;
  view: View;
  selectedId: Id | null;
  /** Extra nodes picked with ⌘/⇧ for drag and drop (includes selectedId when set). */
  multi: Id[];
  /** Scope of the board: a top-level node or null (whole production). */
  scopeId: Id | null;
  cardSize: CardSize;
  // Docked panel state; floating panels keep their own (see inspector/panel.tsx).
  panelTab: PanelTab;
  activeMediaId: Id | null;
  /** Shared playhead of the docked viewer (cut + timecoded comments). */
  playhead: number;
  playing: boolean;
  filters: Filters;
  modal: null | "levels" | "statuses" | "invite";
  collapsed: Record<Id, boolean>;
  floating: FloatingPanel[];
  /** Short message at the bottom of the screen (e.g. a code changed on move). */
  notice: Notice | null;
  /** Popped window: glowing frame while the main window points at it. */
  flash: number;
  /** Windows popped out from this one (own OS/browser windows). */
  popped: PoppedWindow[];
  /** Asking to confirm leaving the production with windows open; holds where to go. */
  leaveAsk: { folderId?: Id | null } | null;
}

interface Store extends UiState {
  library: Library;
  lib: LibraryState | null;
  source: DataSource;
  snap: Snapshot | null;
  set: (patch: Partial<UiState>) => void;
  /** Select a node; the left column switches to the work panel unless `stay` (picking from the tree). */
  select: (id: Id | null, tab?: PanelTab, stay?: boolean) => void;
  /** ⌘-click toggles a node in the multi-selection; ⇧-click extends it. */
  toggleMulti: (id: Id) => void;
  setFilters: (patch: Partial<Filters>) => void;
  toggleCollapsed: (id: Id) => void;
  /** `nodeId`: select that node once the production has loaded. */
  openProduction: (id: Id, opts?: { windowNodeId?: Id; source?: DataSource; nodeId?: Id }) => void;
  /** Go to a pinned folder, production, scene or shot. */
  openPin: (pin: Pin) => void;
  closeProduction: (folderId?: Id | null) => void;
  /** Leave the production, asking first if floating panels or popped windows are open. */
  requestLeave: (folderId?: Id | null) => void;
  confirmLeave: () => void;
  floatPanel: (nodeId: Id) => void;
  dockPanel: (key: string) => void;
  closeFloating: (key: string) => void;
  updateFloating: (key: string, patch: Partial<Omit<FloatingPanel, "key">>) => void;
  /** Opens a node in its own OS window (desktop) or browser window. */
  popOut: (nodeId: Id) => void;
  /** Bring a node's popped window to the front, glowing. */
  focusPopped: (nodeId: Id) => void;
  /** Close a node's popped window and show it in the side panel again. */
  bringBack: (nodeId: Id) => void;
  notify: (text: string, action?: Notice["action"]) => void;
  /** Use another library (the team folder changed); the dashboard updates in place. */
  setLibrary: (library: Library) => void;
  /** Move nodes (with everything inside) to the production's trash, with "Deshacer". */
  trashNodes: (ids: Id[]) => void;
}

/** Stand-in while no production is open: views that need a source are not mounted then. */
const IDLE: DataSource = new Proxy({} as DataSource, {
  get: (_t, prop) => {
    if (prop === "subscribe") return () => () => undefined;
    if (prop === "dispose" || prop === "then") return undefined;
    return () => {
      throw new Error("No hay ninguna producción abierta.");
    };
  },
});

const PANEL_RESET = { selectedId: null, multi: [], scopeId: null, activeMediaId: null, playhead: 0, playing: false, floating: [], view: "board" as View };

const library = createLibrary();
let unsubscribeLibrary: () => void = () => undefined;
let unsubscribeSource: () => void = () => undefined;
/** A popped window borrows its opener's source: it must not dispose it. */
let sourceIsShared = false;
let floatSeq = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<Store>((set, get) => ({
  library,
  lib: null,
  source: IDLE,
  snap: null,
  phase: "dashboard",
  folderId: null,
  dashLayout: "grid",
  dashSection: "home",
  settingsTab: "profile",
  productionId: null,
  windowNodeId: null,
  view: "board",
  selectedId: null,
  multi: [],
  scopeId: null,
  cardSize: "m",
  panelTab: "produce",
  activeMediaId: null,
  playhead: 0,
  playing: false,
  filters: { query: "", statusIds: [], assigneeId: null, assetId: null },
  modal: null,
  collapsed: {},
  floating: [],
  notice: null,
  flash: 0,
  popped: [],
  leaveAsk: null,
  sideTab: "work",
  set: (patch) => set(patch),
  select: (id, tab, stay) => {
    if (id !== get().selectedId) set({ activeMediaId: null, playhead: 0, playing: false });
    set({ selectedId: id, multi: [], ...(tab ? { panelTab: tab } : {}), ...(id && !stay ? { sideTab: "work" as SideTab } : {}) });
    get().source.setPresence(id ?? undefined);
  },
  toggleMulti: (id) => {
    const { multi, selectedId } = get();
    const base = multi.length ? multi : selectedId ? [selectedId] : [];
    set({ multi: base.includes(id) ? base.filter((x) => x !== id) : [...base, id] });
  },
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  toggleCollapsed: (id) => set({ collapsed: { ...get().collapsed, [id]: !get().collapsed[id] } }),

  openProduction: (id, opts) => {
    get().closeProduction(get().folderId);
    const src = opts?.source ?? get().library.open(id);
    sourceIsShared = !!opts?.source;
    if (!opts?.windowNodeId) get().library.touch(id);
    let pending = opts?.nodeId;
    unsubscribeSource = src.subscribe((snap) => {
      set({ snap });
      if (!pending) return;
      const nodeId = pending;
      pending = undefined;
      // After openProduction has reset the panel (the first emit can be synchronous).
      queueMicrotask(() => {
        if (snap.nodes.some((n) => n.id === nodeId)) {
          get().select(nodeId);
        } else if (snap.trash.some((n) => n.id === nodeId)) {
          get().notify("Ese elemento está en la papelera de la producción.");
        } else {
          get().library.setPinned({ entryId: id, nodeId }, false);
          get().notify("Ese elemento ya no existe en la producción: lo he quitado de Fijados.");
        }
      });
    });
    set({ ...PANEL_RESET, source: src, snap: null, productionId: id, phase: opts?.windowNodeId ? "window" : "production", windowNodeId: opts?.windowNodeId ?? null });
  },
  openPin: (pin) => {
    const entry = get().lib?.entries.find((e) => e.id === pin.entryId);
    if (!entry) return;
    if (entry.kind === "folder") {
      get().library.touch(entry.id);
      return set({ dashSection: "home", folderId: entry.id });
    }
    // Already in that production: just select.
    if (get().phase === "production" && get().productionId === entry.id) return pin.nodeId ? get().select(pin.nodeId) : undefined;
    get().openProduction(entry.id, { nodeId: pin.nodeId });
  },
  closeProduction: (folderId) => {
    // Popped windows never outlive the production screen.
    closePoppedWindows();
    unsubscribeSource();
    unsubscribeSource = () => undefined;
    if (!sourceIsShared) get().source.dispose?.();
    sourceIsShared = false;
    set({ ...PANEL_RESET, source: IDLE, snap: null, productionId: null, phase: "dashboard", popped: [], leaveAsk: null, ...(folderId !== undefined ? { folderId, dashSection: "home" as DashSection } : {}) });
  },
  requestLeave: (folderId) => {
    const { floating, popped } = get();
    if (floating.length || popped.length) set({ leaveAsk: { folderId } });
    else get().closeProduction(folderId);
  },
  confirmLeave: () => get().closeProduction(get().leaveAsk?.folderId),

  floatPanel: (nodeId) => {
    const { floating, selectedId } = get();
    const existing = floating.find((f) => f.nodeId === nodeId);
    const top = Math.max(0, ...floating.map((f) => f.z)) + 1;
    if (existing) return get().updateFloating(existing.key, { z: top });
    const n = floating.length % 8;
    // Cascade over the board, clear of the docked panel.
    const x = Math.max(80, Math.min(window.innerWidth - 480, window.innerWidth / 2 - 180)) + n * 28;
    set({
      floating: [...floating, { key: `fp${++floatSeq}`, nodeId, x, y: 80 + n * 28, w: 440, h: Math.min(720, window.innerHeight - 140), z: top }],
      ...(selectedId === nodeId ? { selectedId: null } : {}),
    });
  },
  dockPanel: (key) => {
    const f = get().floating.find((x) => x.key === key);
    get().closeFloating(key);
    if (f) get().select(f.nodeId);
  },
  closeFloating: (key) => set({ floating: get().floating.filter((f) => f.key !== key) }),
  updateFloating: (key, patch) => set({ floating: get().floating.map((f) => (f.key === key ? { ...f, ...patch } : f)) }),
  notify: (text, action) => {
    clearTimeout(noticeTimer);
    set({ notice: { text, action } });
    noticeTimer = setTimeout(() => set({ notice: null }), action ? 8000 : 5000);
  },
  setLibrary: (next) => {
    const prev = get().library;
    if (prev === next) return;
    unsubscribeLibrary();
    prev.dispose?.();
    set({ library: next, folderId: null });
    unsubscribeLibrary = next.subscribe((lib) => set({ lib }));
  },
  trashNodes: (ids) => {
    const { snap, source, selectedId, multi } = get();
    if (!snap || !ids.length) return;
    const asked = new Set(ids);
    const byId = new Map(snap.nodes.map((n) => [n.id, n]));
    // A node inside another one being trashed goes with it.
    const isInside = (id: Id) => {
      for (let n = byId.get(id); n?.parentId; n = byId.get(n.parentId)) if (asked.has(n.parentId)) return true;
      return false;
    };
    const top = ids.filter((id) => byId.has(id) && !isInside(id));
    if (!top.length) return;
    const gone = new Set(snap.nodes.filter((n) => asked.has(n.id) || isInside(n.id)).map((n) => n.id));
    for (const id of top) {
      closePoppedWindow(id);
      source.trashNode(id);
    }
    if (selectedId && gone.has(selectedId)) get().select(null);
    if (multi.some((id) => gone.has(id))) set({ multi: multi.filter((id) => !gone.has(id)) });
    const p = snap.production;
    const what = top.length === 1 ? codeOf(p, byId.get(top[0]!)!) : `${top.length} elementos`;
    get().notify(`${what} a la papelera de la producción.`, {
      label: "Deshacer",
      run: () => {
        for (const id of top) get().source.restoreNode(id);
        set({ notice: null });
      },
    });
  },
  focusPopped: (nodeId) => focusPoppedWindow(nodeId),
  bringBack: (nodeId) => {
    closePoppedWindow(nodeId);
    get().select(nodeId);
  },
  popOut: (nodeId) => {
    const { productionId } = get();
    if (!productionId) return;
    // href without the hash: also right for file:// in the packaged desktop app (origin is "null" there).
    const url = `${location.href.split("#")[0]}#/ventana/${encodeURIComponent(productionId)}/${encodeURIComponent(nodeId)}`;
    popOutWindow(url, productionId, nodeId);
  },
}));

unsubscribeLibrary = library.subscribe((lib) => useStore.setState({ lib }));

// A popped-out window opens straight on its node (no splash, no dashboard) on
// its opener's own DataSource; a main window lends its source and tracks them.
const popped = /^#\/ventana\/([^/]+)\/([^/]+)$/.exec(location.hash);
if (popped) {
  const productionId = decodeURIComponent(popped[1]!);
  const nodeId = decodeURIComponent(popped[2]!);
  const share = openerShare(productionId);
  useStore.getState().openProduction(productionId, { windowNodeId: nodeId, source: share?.source() });
  onFlashRequest(() => useStore.setState({ flash: Date.now() }));
  if (share) {
    // Stop listening before this window goes, and go quiet if the opener leaves.
    window.addEventListener("pagehide", () => unsubscribeSource());
    watchOpener(productionId, () => {
      useStore.getState().closeProduction();
      useStore.setState({ phase: "window", windowNodeId: null });
      window.close();
    });
  }
} else {
  hostWindows(
    { productionId: () => useStore.getState().productionId, source: () => useStore.getState().source },
    (list) => useStore.setState({ popped: list }),
  );
}

/** Snapshot accessor for components rendered after the first emit. */
export function useSnap(): Snapshot {
  const s = useStore((x) => x.snap);
  if (!s) throw new Error("Snapshot not ready");
  return s;
}
