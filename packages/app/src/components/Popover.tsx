import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cx } from "@sweetflow/ui";

/**
 * A small panel under a button (info, filters). Closes on a click outside or
 * Escape. `align` says which edge of the button it lines up with.
 *
 * `float`: drawn above everything (not inside the scrolling column it was
 * opened from), placed next to the button and kept inside the window: under
 * it, or above when there is no room.
 */
export function Popover({ button, children, align = "left", className, float }: {
  button: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
  float?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: "hidden" });

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", off);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", off);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Floating: next to the button, inside the window; follows it on scroll and resize.
  useLayoutEffect(() => {
    if (!open || !float) return;
    const place = () => {
      const b = ref.current?.getBoundingClientRect();
      const p = panel.current;
      if (!b || !p) return;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const gap = 4;
      const margin = 8;
      let left = align === "right" ? b.right - w : b.left;
      left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
      const below = window.innerHeight - b.bottom - gap - margin;
      const above = b.top - gap - margin;
      const top = h <= below || below >= above ? b.bottom + gap : Math.max(margin, b.top - gap - h);
      const maxHeight = h <= below || below >= above ? below : above;
      setPos({ position: "fixed", top, left, maxHeight, overflow: "auto" });
    };
    place();
    const ro = new ResizeObserver(place);
    if (panel.current) ro.observe(panel.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, float, align]);

  const body = open ? (
    // Picking an item of a menu closes it.
    <div ref={panel} className={cx("menu pop__panel", align === "right" && "pop__panel--right", float && "pop__panel--float", className)} role="dialog"
      style={float ? pos : undefined}
      onClick={(e) => (e.target as HTMLElement).closest(".menu__item, [data-close]") && setOpen(false)}>{children}</div>
  ) : null;

  return (
    <div className="pop" ref={ref}>
      {button({ open, toggle: () => { setPos({ visibility: "hidden" }); setOpen((v) => !v); } })}
      {float && body ? createPortal(body, document.body) : body}
    </div>
  );
}
