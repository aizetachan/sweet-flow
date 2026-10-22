import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { cx } from "@sweetflow/ui";

/**
 * A drop-down drawn by the app instead of the system's `<select>` menu: the
 * closed field looks like `.sf-select`, and the open list has the app's menu
 * look, right under the field and as wide as it. It floats above everything
 * (a scrolling panel does not clip it) and flips above the field when there
 * is no room below. Closes on a click outside, on Escape or on a pick.
 */
export function Select({ value, options, onChange, title, className, disabled }: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  title?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: "hidden" });

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !list.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = options.indexOf(value);
        const next = options[(i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length];
        if (next !== undefined) onChange(next);
      }
    };
    window.addEventListener("mousedown", off);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", off);
      window.removeEventListener("keydown", key);
    };
  }, [open, options, value, onChange]);

  // Under the field, same width; above it when the window has no room below.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = btn.current?.getBoundingClientRect();
      const p = list.current;
      if (!b || !p) return;
      const gap = 4;
      const margin = 8;
      const h = p.offsetHeight;
      const below = window.innerHeight - b.bottom - gap - margin;
      const above = b.top - gap - margin;
      const down = h <= below || below >= above;
      setPos({
        position: "fixed",
        left: Math.max(margin, Math.min(b.left, window.innerWidth - b.width - margin)),
        width: b.width,
        top: down ? b.bottom + gap : Math.max(margin, b.top - gap - h),
        maxHeight: down ? below : above,
      });
      // Keep the current option in view.
      p.querySelector<HTMLElement>("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
    };
    place();
    const ro = new ResizeObserver(place);
    if (list.current) ro.observe(list.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} type="button" className={cx("select", open && "select--open", className)} title={title} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} onClick={() => { setPos({ visibility: "hidden" }); setOpen((v) => !v); }}>
        <span className="select__value">{value}</span>
        <IconChevronDown size={13} className="select__chevron" />
      </button>
      {open ? createPortal(
        <div ref={list} className="menu menu--select" role="listbox" style={pos}>
          {options.map((o) => (
            <button key={o} type="button" className={cx("menu__item", o === value && "menu__item--on")} role="option" aria-selected={o === value}
              onClick={() => { onChange(o); setOpen(false); }}>
              <span className="menu__label">{o}</span>
              {o === value ? <IconCheck size={13} /> : null}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
