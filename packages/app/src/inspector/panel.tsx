/**
 * Work panel state: which node, tab, version and playhead. The docked panel
 * keeps it in the store (the board can steer it, e.g. "open in Cut"); each
 * floating panel or popped-out window keeps its own, so several nodes can be
 * worked on at once without sharing a playhead.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Id } from "@sweetflow/domain";
import { useStore, type PanelTab } from "../state/store";

export interface PanelState {
  nodeId: Id;
  tab: PanelTab;
  activeMediaId: Id | null;
  playhead: number;
  playing: boolean;
}

export interface PanelApi extends PanelState {
  setPanel: (patch: Partial<PanelState>) => void;
  /** "docked" (right column), "floating" (in-app) or "window" (own OS window). */
  mode: "docked" | "floating" | "window";
}

const PanelContext = createContext<PanelApi | null>(null);

export function usePanel(): PanelApi {
  const p = useContext(PanelContext);
  if (!p) throw new Error("usePanel outside a panel");
  return p;
}

/** Panel bound to the store's selection. */
export function DockedPanel({ nodeId, children }: { nodeId: Id; children: ReactNode }) {
  const tab = useStore((s) => s.panelTab);
  const activeMediaId = useStore((s) => s.activeMediaId);
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);
  const set = useStore((s) => s.set);
  const select = useStore((s) => s.select);
  const api = useMemo<PanelApi>(
    () => ({
      nodeId, tab, activeMediaId, playhead, playing, mode: "docked",
      setPanel: (p) => {
        if (p.nodeId !== undefined && p.nodeId !== nodeId) select(p.nodeId);
        set({
          ...(p.tab !== undefined ? { panelTab: p.tab } : {}),
          ...(p.activeMediaId !== undefined ? { activeMediaId: p.activeMediaId } : {}),
          ...(p.playhead !== undefined ? { playhead: p.playhead } : {}),
          ...(p.playing !== undefined ? { playing: p.playing } : {}),
        });
      },
    }),
    [nodeId, tab, activeMediaId, playhead, playing, set, select],
  );
  return <PanelContext.Provider value={api}>{children}</PanelContext.Provider>;
}

/** Panel with its own state (floating panel, popped-out window). */
export function OwnPanel({ nodeId, mode, children }: { nodeId: Id; mode: "floating" | "window"; children: ReactNode }) {
  const [s, setS] = useState<PanelState>({ nodeId, tab: "produce", activeMediaId: null, playhead: 0, playing: false });
  const api = useMemo<PanelApi>(
    () => ({
      ...s,
      mode,
      // Changing node resets the viewer, like selecting another node in the docked panel.
      setPanel: (p) => setS((cur) => (p.nodeId && p.nodeId !== cur.nodeId ? { ...cur, activeMediaId: null, playhead: 0, playing: false, ...p } : { ...cur, ...p })),
    }),
    [s, mode],
  );
  return <PanelContext.Provider value={api}>{children}</PanelContext.Provider>;
}
