import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** How long the pointer rests on something before its tip shows. */
const DELAY_MS = 3000;

/**
 * Tooltips for pictures without a title (docs/INTERFAZ.md §2.0): anything with
 * `data-tip` shows that text in a bubble above it (below if there is no room)
 * after the pointer rests on it a while. Mounted once for the whole app.
 */
export function DelayedTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let current: HTMLElement | null = null;
    const hide = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      current = null;
      setTip(null);
    };
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]") ?? null;
      if (el === current) return;
      hide();
      if (!el?.dataset.tip) return;
      current = el;
      timer = setTimeout(() => {
        if (!current?.isConnected) return;
        const r = current.getBoundingClientRect();
        const below = r.top < 60;
        setTip({ text: current.dataset.tip!, x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below });
      }, DELAY_MS);
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("mousedown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("keydown", hide);
    return () => {
      hide();
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mousedown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("keydown", hide);
    };
  }, []);
  if (!tip) return null;
  return createPortal(
    <div className={tip.below ? "dtip dtip--below" : "dtip"} role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>,
    document.body,
  );
}
