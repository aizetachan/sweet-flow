/**
 * App store: where the user is (splash → dashboard → production), the open
 * production's latest Snapshot, and local UI state. Mutations go through
 * `library` (dashboard) and `source` (the open production); the store only
 * mirrors what they emit.
 */

import type { ImportItem } from "../data/source";
import { create } from "zustand";
import { parseAppLink } from "../data/share";
import { type Access, type Id, type MediaKind, type RowItem } from "@sweetflow/domain";
import type { DataSource, Snapshot } from "../data/source";
import type { Library, LibraryState, Pin } from "../data/library";
import { createLibrary } from "../data";
import { closePoppedWindow, closePoppedWindows, focusPoppedWindow, hostWindows, onFlashRequest, openerShare, popOutWindow, watchOpener, type PoppedWindow } from "./windows";
import { nameOf } from "./names";

export type Phase = "dashboard" | "production" | "window";
export type View = "board" | "library" | "trash";
export type CardSize = "s" | "m" | "l";
export type PanelTab = "produce" | "cut" | "review" | "activity";
export type DashLayout = "grid" | "list";
export type DashSection = "home" | "recent" | "team" | "trash" | "settings";
/** Ajustes tabs: the dashboard's, plus the production's own (settings/Modals.tsx). */
export type SettingsTab = "profile" | "storage" | "integrations" | "models" | "about" | "levels" | "statuses" | "view";
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
  /** The library card open (docs/INTERFAZ.md §2.8): its chosen images and its exploration. */
  libOpenId: Id | null;
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
  /** `team`: who works on the production (opened from the avatar menu). */
  modal: null | "settings" | "team" | "notes" | "share";
  /** The node whose notes the `notes` modal shows. */
  notesFor: Id | null;
  /** The «Importar» window: as versions of a shot, or as new shots in a row. */
  importTo: ImportTarget | null;
  /** The invite window (docs/USUARIOS.md §2): to what, or a member whose access is being changed. */
  inviteTo: { access: Access } | { member: string } | null;
  /** Show the codes (SQ010, SH0020…) on screen; off, things go by their title (a setting of this computer). */
  showCodes: boolean;
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

const SHOW_CODES_KEY = "sweetflow:show-codes";
function readShowCodes(): boolean {
  try {
    return localStorage.getItem(SHOW_CODES_KEY) === "1";
  } catch {
    return false;
  }
}
function saveShowCodes(on: boolean): void {
  try {
    localStorage.setItem(SHOW_CODES_KEY, on ? "1" : "0");
  } catch {
    // Only a convenience.
  }
}

/** Where an import lands (docs/INTERFAZ.md §2.0). */
export type ImportTarget =
  | { nodeId: Id }
  | { rowId: Id; before: RowItem | null; groupId: Id | null }
  /** As references of Generar (docs/INTERFAZ.md §2.0): what was picked goes to `refs`. */
  | { refs: (items: ImportItem[]) => void; label: string; kinds?: MediaKind[] };

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
  openProduction: (id: Id, opts?: { windowNodeId?: Id; source?: DataSource; nodeId?: Id; mediaId?: Id }) => void;
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

// Nothing selected yet: the left column shows the structure, never an empty panel.
const PANEL_RESET = { selectedId: null, multi: [], scopeId: null, activeMediaId: null, playhead: 0, playing: false, floating: [], view: "board" as View, sideTab: "structure" as SideTab, libOpenId: null };

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
  libOpenId: null,
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
  importTo: null,
  inviteTo: null,
  showCodes: readShowCodes(),
  notesFor: null,
  collapsed: {},
  floating: [],
  notice: null,
  flash: 0,
  popped: [],
  leaveAsk: null,
  sideTab: "structure",
  set: (patch) => {
    if (patch.showCodes !== undefined) saveShowCodes(patch.showCodes);
    set(patch);
  },
  select: (id, tab, stay) => {
    if (id !== get().selectedId) set({ activeMediaId: null, playhead: 0, playing: false });
    // Nothing selected (closed, deselected, sent to the trash): back to the structure.
    set({ selectedId: id, multi: [], ...(tab ? { panelTab: tab } : {}), ...(id && !stay ? { sideTab: "work" as SideTab } : !id ? { sideTab: "structure" as SideTab } : {}) });
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
    // Reset first, then subscribe: a source that is already loaded (the one a
    // popped window borrows) emits at once, and that first snapshot must stay.
    set({ ...PANEL_RESET, source: src, snap: null, productionId: id, phase: opts?.windowNodeId ? "window" : "production", windowNodeId: opts?.windowNodeId ?? null });
    let pending = opts?.nodeId;
    unsubscribeSource = src.subscribe((snap) => {
      set({ snap });
      if (!pending) return;
      const nodeId = pending;
      pending = undefined;
      queueMicrotask(() => {
        if (snap.nodes.some((n) => n.id === nodeId)) {
          get().select(nodeId);
          if (opts?.mediaId) set({ activeMediaId: opts.mediaId });
        } else if (snap.trash.some((n) => n.id === nodeId)) {
          get().notify("Ese elemento está en la papelera de la producción.");
        } else {
          get().library.setPinned({ entryId: id, nodeId }, false);
          get().notify("Ese elemento ya no existe en la producción: lo he quitado de Fijados.");
        }
      });
    });
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
    // The board's nodes and the library's groups (docs/INTERFAZ.md §2.8).
    const all = [...snap.nodes, ...snap.library];
    const byId = new Map(all.map((n) => [n.id, n]));
    // A node inside another one being trashed goes with it.
    const isInside = (id: Id) => {
      for (let n = byId.get(id); n?.parentId; n = byId.get(n.parentId)) if (asked.has(n.parentId)) return true;
      return false;
    };
    const top = ids.filter((id) => byId.has(id) && !isInside(id));
    if (!top.length) return;
    const gone = new Set(all.filter((n) => asked.has(n.id) || isInside(n.id)).map((n) => n.id));
    for (const id of top) {
      closePoppedWindow(id);
      source.trashNode(id);
    }
    if (selectedId && gone.has(selectedId)) get().select(null);
    if (multi.some((id) => gone.has(id))) set({ multi: multi.filter((id) => !gone.has(id)) });
    const p = snap.production;
    const what = top.length === 1 ? nameOf(p, byId.get(top[0]!)!) : `${top.length} elementos`;
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
  // A link into the app (`#/abrir/…`, docs/INTERFAZ.md §1–2): a dashboard folder, a production, or a
  // shot in it, opened once the dashboard is known.
  const openLink = () => {
    const link = parseAppLink(location.hash);
    if (!link) return;
    history.replaceState(null, "", location.href.split("#")[0]);
    const go = () => {
      const st = useStore.getState();
      if (!st.lib) return false;
      const entry = st.lib.entries.find((e) => e.id === link.entryId);
      if (!entry) {
        st.notify("Ese enlace es de algo que no está en tu carpeta del equipo.");
        return true;
      }
      if (entry.kind === "folder") {
        if (st.phase === "production") st.requestLeave(entry.id);
        else st.set({ dashSection: "home", folderId: entry.id });
        return true;
      }
      if (st.phase === "production" && st.productionId === entry.id) {
        if (link.nodeId) st.select(link.nodeId);
        if (link.mediaId) st.set({ activeMediaId: link.mediaId });
        return true;
      }
      st.openProduction(entry.id, { nodeId: link.nodeId, mediaId: link.mediaId });
      return true;
    };
    if (go()) return;
    const off = useStore.subscribe((s) => s.lib && go() && off());
  };
  openLink();
  window.addEventListener("hashchange", openLink);
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
