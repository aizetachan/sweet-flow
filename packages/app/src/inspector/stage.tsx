/**
 * The "stage" of a wide popped window (docs/INTERFAZ.md §3): the work panel's
 * tabs on the left, and the big viewer with the versions on the right, like
 * the production screen at a smaller scale. Tabs put their viewer on the
 * stage with <OnStage>; in the narrow panel it stays where it is.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Stage {
  el: HTMLElement | null;
  /** Something is on the stage while mounted; returns the release. */
  claim: () => () => void;
}

const StageContext = createContext<Stage | null>(null);

/** Width from which a popped window splits into side + stage. */
export const WIDE_FROM = 960;

export function useWide(enabled: boolean): boolean {
  const [wide, setWide] = useState(() => enabled && window.innerWidth >= WIDE_FROM);
  useEffect(() => {
    if (!enabled) return setWide(false);
    const on = () => setWide(window.innerWidth >= WIDE_FROM);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [enabled]);
  return wide;
}

/** Provides the stage element; `fallback` shows while no tab has put anything on it. */
export function StageProvider({ children, stage, fallback }: { children: (stage: ReactNode) => ReactNode; stage: boolean; fallback: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const value = useMemo<Stage>(() => ({
    el,
    claim: () => {
      setClaims((c) => c + 1);
      return () => setClaims((c) => c - 1);
    },
  }), [el]);
  if (!stage) return <>{children(null)}</>;
  const area = (
    <div className="insp__stage">
      <div className="insp__stage-in" ref={setEl} />
      {claims ? null : fallback}
    </div>
  );
  return <StageContext.Provider value={value}>{children(area)}</StageContext.Provider>;
}

/** Shows its children on the stage when there is one; in place otherwise. */
export function OnStage({ children }: { children: ReactNode }) {
  const stage = useContext(StageContext);
  useEffect(() => stage?.claim(), [stage]);
  if (!stage) return <>{children}</>;
  return stage.el ? createPortal(children, stage.el) : null;
}
