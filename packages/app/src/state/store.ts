/**
 * App store: where the user is (splash → dashboard → production), the open
 * production's latest Snapshot, and local UI state. Mutations go through
 * `library` (dashboard) and `source` (the open production); the store only
 * mirrors what they emit.
 */

import { create } from "zustand";
import type { Id } from "@sweetflow/domain";
import type { DataSource, Snapshot } from "../data/source";
import type { Library, LibraryState } from "../data/library";
import { createLibrary } from "../data";

export type Phase = "dashboard" | "production" | "window";
export type View = "board" | "library" | "team";
export type CardSize = "s" | "m" | "l";
export type PanelTab = "produce" | "cut" | "review" | "activity";
export type DashLayout = "grid" | "list";

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
  /** Open production (library entry id). */
  productionId: Id | null;
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
  notice: string | null;
}

interface Store extends UiState {
  library: Library;
  lib: LibraryState | null;
  source: DataSource;
  snap: Snapshot | null;
  set: (patch: Partial<UiState>) => void;
  select: (id: Id | null, tab?: PanelTab) => void;
  /** ⌘-click toggles a node in the multi-selection; ⇧-click extends it. */
  toggleMulti: (id: Id) => void;
  setFilters: (patch: Partial<Filters>) => void;
  toggleCollapsed: (id: Id) => void;
  openProduction: (id: Id, opts?: { windowNodeId?: Id }) => void;
  closeProduction: (folderId?: Id | null) => void;
  floatPanel: (nodeId: Id) => void;
  dockPanel: (key: string) => void;
  closeFloating: (key: string) => void;
  updateFloating: (key: string, patch: Partial<Omit<FloatingPanel, "key">>) => void;
  /** Opens a node in its own OS window (desktop) or browser window. */
  popOut: (nodeId: Id) => void;
  notify: (text: string) => void;
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
let unsubscribeSource: () => void = () => undefined;
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
  set: (patch) => set(patch),
  select: (id, tab) => {
    if (id !== get().selectedId) set({ activeMediaId: null, playhead: 0, playing: false });
    set({ selectedId: id, multi: [], ...(tab ? { panelTab: tab } : {}) });
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
    const src = get().library.open(id);
    unsubscribeSource = src.subscribe((snap) => set({ snap }));
    set({ ...PANEL_RESET, source: src, snap: null, productionId: id, phase: opts?.windowNodeId ? "window" : "production", windowNodeId: opts?.windowNodeId ?? null });
  },
  closeProduction: (folderId) => {
    unsubscribeSource();
    unsubscribeSource = () => undefined;
    get().source.dispose?.();
    set({ ...PANEL_RESET, source: IDLE, snap: null, productionId: null, phase: "dashboard", ...(folderId !== undefined ? { folderId } : {}) });
  },

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
  notify: (text) => {
    clearTimeout(noticeTimer);
    set({ notice: text });
    noticeTimer = setTimeout(() => set({ notice: null }), 5000);
  },
  popOut: (nodeId) => {
    const { productionId } = get();
    if (!productionId) return;
    // href without the hash: also right for file:// in the packaged desktop app (origin is "null" there).
    const url = `${location.href.split("#")[0]}#/ventana/${encodeURIComponent(productionId)}/${encodeURIComponent(nodeId)}`;
    // noopener: the new window gets its own sessionStorage, i.e. its own device id.
    window.open(url, "_blank", "noopener,width=560,height=880");
  },
}));

library.subscribe((lib) => useStore.setState({ lib }));

// A popped-out window opens straight on its node (no splash, no dashboard).
const popped = /^#\/ventana\/([^/]+)\/([^/]+)$/.exec(location.hash);
if (popped) useStore.getState().openProduction(decodeURIComponent(popped[1]!), { windowNodeId: decodeURIComponent(popped[2]!) });

/** Snapshot accessor for components rendered after the first emit. */
export function useSnap(): Snapshot {
  const s = useStore((x) => x.snap);
  if (!s) throw new Error("Snapshot not ready");
  return s;
}
