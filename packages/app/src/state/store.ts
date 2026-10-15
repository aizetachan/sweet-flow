/**
 * App store: the latest backend Snapshot + local UI state. Mutations go
 * through `source` (DataSource); the store only mirrors what it emits.
 */

import { create } from "zustand";
import type { Id } from "@sweetflow/domain";
import type { DataSource, Snapshot } from "../data/source";
import { MockSource } from "../data/mock/MockSource";

export type View = "board" | "library" | "team";
export type CardSize = "s" | "m" | "l";
export type PanelTab = "produce" | "cut" | "review" | "activity";

export interface Filters {
  query: string;
  statusIds: Id[];
  assigneeId: Id | null;
  assetId: Id | null;
}

interface UiState {
  view: View;
  selectedId: Id | null;
  /** Scope of the board: a top-level node or null (whole production). */
  scopeId: Id | null;
  cardSize: CardSize;
  panelTab: PanelTab;
  activeMediaId: Id | null;
  /** Shared playhead of the inspector viewer (cut + timecoded comments). */
  playhead: number;
  playing: boolean;
  filters: Filters;
  modal: null | "levels" | "statuses" | "invite";
  collapsed: Record<Id, boolean>;
}

interface Store extends UiState {
  source: DataSource;
  snap: Snapshot | null;
  set: (patch: Partial<UiState>) => void;
  select: (id: Id | null, tab?: PanelTab) => void;
  setFilters: (patch: Partial<Filters>) => void;
  toggleCollapsed: (id: Id) => void;
}

const source: DataSource = new MockSource();

export const useStore = create<Store>((set, get) => ({
  source,
  snap: null,
  view: "board",
  selectedId: null,
  scopeId: null,
  cardSize: "m",
  panelTab: "produce",
  activeMediaId: null,
  playhead: 0,
  playing: false,
  filters: { query: "", statusIds: [], assigneeId: null, assetId: null },
  modal: null,
  collapsed: {},
  set: (patch) => set(patch),
  select: (id, tab) => {
    if (id !== get().selectedId) set({ activeMediaId: null, playhead: 0, playing: false });
    set({ selectedId: id, ...(tab ? { panelTab: tab } : {}) });
    get().source.setPresence(id ?? undefined);
  },
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  toggleCollapsed: (id) => set({ collapsed: { ...get().collapsed, [id]: !get().collapsed[id] } }),
}));

source.subscribe((snap) => useStore.setState({ snap }));

/** Snapshot accessor for components rendered after the first emit. */
export function useSnap(): Snapshot {
  const s = useStore((x) => x.snap);
  if (!s) throw new Error("Snapshot not ready");
  return s;
}
