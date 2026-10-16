import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@sweetflow/ui";

/**
 * A small panel under a button (info, filters). Closes on a click outside or
 * Escape. `align` says which edge of the button it lines up with.
 */
export function Popover({ button, children, align = "left", className }: {
  button: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", off);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", off);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="pop" ref={ref}>
      {button({ open, toggle: () => setOpen((v) => !v) })}
      {open ? <div className={cx("menu pop__panel", align === "right" && "pop__panel--right", className)} role="dialog">{children}</div> : null}
    </div>
  );
}
