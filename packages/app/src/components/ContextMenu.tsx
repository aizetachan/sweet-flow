import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface MenuAt {
  x: number;
  y: number;
}

/**
 * Right-click menu (docs/INTERFAZ.md §2): floats at the pointer over
 * everything, kept inside the window. Closes on picking an item, a click
 * outside, Escape, scrolling or resizing.
 */
export function ContextMenu({ at, onClose, children }: { at: MenuAt; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  // Inside the window: flip left/up when it would overflow.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: at.x + r.width > window.innerWidth - 8 ? Math.max(8, at.x - r.width) : at.x,
      y: at.y + r.height > window.innerHeight - 8 ? Math.max(8, at.y - r.height) : at.y,
    });
  }, [at]);
  useEffect(() => {
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", off);
    window.addEventListener("keydown", esc);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("mousedown", off);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="menu ctxmenu" role="menu" style={{ left: pos.x, top: pos.y }}
      onClick={(e) => { e.stopPropagation(); if ((e.target as HTMLElement).closest(".menu__item")) onClose(); }}
      onContextMenu={(e) => e.preventDefault()}>
      {children}
    </div>,
    document.body,
  );
}
