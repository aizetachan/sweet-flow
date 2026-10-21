/**
 * A hover highlight that flows like liquid between the items of a list (the
 * dashboard's side menu, docs/INTERFAZ.md §1): moving from one item to
 * another, the highlight stretches out of the first and pours into the next.
 *
 * Two pills follow the hovered item on springs, one quick (the head) and one
 * slower (the tail); a goo filter (blur, then a hard alpha threshold) melts
 * them into one shape, and a neck between them (thinner as they part) keeps
 * the liquid joined while it pours from one item into the next.
 * Items are found by `itemSelector`; their own hover fill is turned off.
 */

import { useEffect, useId, useRef, type ReactNode } from "react";

interface Spring {
  y: number;
  h: number;
  vy: number;
  vh: number;
}

const HEAD = { k: 700, d: 48 };
const TAIL = { k: 130, d: 21 };

export function LiquidHover({ children, itemSelector = ".dside__item", className }: { children: ReactNode; itemSelector?: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const layer = useRef<SVGGElement>(null);
  const head = useRef<SVGRectElement>(null);
  const tail = useRef<SVGRectElement>(null);
  const bridge = useRef<SVGRectElement>(null);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let target: { y: number; h: number; x: number; w: number } | null = null;
    let a: Spring | null = null;
    let b: Spring | null = null;
    let raf = 0;
    let last = 0;

    const draw = () => {
      if (!a || !b || !target) return;
      for (const [r, s] of [[head.current, a], [tail.current, b]] as const) {
        if (!r) continue;
        r.setAttribute("x", String(target.x));
        r.setAttribute("width", String(target.w));
        r.setAttribute("y", String(s.y));
        r.setAttribute("height", String(Math.max(0, s.h)));
      }
      // The neck between them: narrower the further apart they are (the same liquid, stretched).
      const br = bridge.current;
      if (br) {
        const ca = a.y + a.h / 2, cb = b.y + b.h / 2;
        const gap = Math.abs(ca - cb);
        const bw = target.w * Math.max(0.22, Math.min(0.7, 1 - gap / 140));
        br.setAttribute("x", String(target.x + (target.w - bw) / 2));
        br.setAttribute("width", String(gap > 1 ? bw : 0));
        br.setAttribute("y", String(Math.min(ca, cb)));
        br.setAttribute("height", String(gap));
      }
    };
    const step = (s: Spring, p: { k: number; d: number }, dt: number) => {
      const ay = -p.k * (s.y - target!.y) - p.d * s.vy;
      const ah = -p.k * (s.h - target!.h) - p.d * s.vh;
      s.vy += ay * dt;
      s.vh += ah * dt;
      s.y += s.vy * dt;
      s.h += s.vh * dt;
      return Math.abs(s.y - target!.y) > 0.2 || Math.abs(s.vy) > 0.5 || Math.abs(s.h - target!.h) > 0.2;
    };
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      if (!a || !b || !target) return;
      const headMoving = step(a, HEAD, dt);
      const tailMoving = step(b, TAIL, dt);
      const moving = headMoving || tailMoving;
      draw();
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    const go = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>(itemSelector);
      if (!item || !el.contains(item)) return leave();
      const r = item.getBoundingClientRect();
      const o = el.getBoundingClientRect();
      const next = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
      if (target && next.y === target.y && next.h === target.h && layer.current?.classList.contains("is-on")) return;
      target = next;
      // Coming in from outside: it appears on the item, nothing to flow from.
      if (!a || !b || !layer.current?.classList.contains("is-on")) {
        a = { y: next.y, h: next.h, vy: 0, vh: 0 };
        b = { ...a };
        draw();
        layer.current?.classList.add("is-on");
        return;
      }
      go();
    };
    const leave = () => layer.current?.classList.remove("is-on");

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [itemSelector]);

  return (
    <div ref={box} className={`liquid${className ? ` ${className}` : ""}`}>
      <svg className="liquid__layer" aria-hidden="true">
        <defs>
          {/* Blur, then keep only what is dense enough: the two pills melt into one with a liquid neck. */}
          <filter id={`${id}-goo`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
          </filter>
        </defs>
        <g ref={layer} className="liquid__blob" filter={`url(#${id}-goo)`}>
          <rect ref={tail} rx="8" />
          <rect ref={bridge} />
          <rect ref={head} rx="8" />
        </g>
      </svg>
      {children}
    </div>
  );
}
