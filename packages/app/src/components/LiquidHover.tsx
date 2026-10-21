/**
 * A hover highlight that behaves like a drop of liquid between the items of a
 * list (the dashboard's side menu, docs/INTERFAZ.md §1).
 *
 * Moving to another item, the drop does not jump: it pulls away from the item
 * it was on, leaving behind a part of itself that drains into it through a
 * neck; on the way it stretches along its path and thins; on arrival it
 * overshoots, squashes and wobbles until it settles into the item's shape.
 * Its surface ripples while it moves (turbulence displacing its edge) and a
 * goo filter (blur, then a hard alpha threshold) melts the drop, what is left
 * behind and the neck into one shape. At rest it is just the item's pill.
 *
 * Items are found by `itemSelector`; their own hover fill is turned off.
 */

import { useEffect, useId, useRef, type ReactNode } from "react";

/** The moving drop: an underdamped spring (it overshoots and wobbles), and its squash. */
const MOVE = { k: 230, d: 17 };
const SQUASH = { k: 520, d: 14 };
/** How long what stays behind takes to drain into the drop. */
const DRAIN_MS = 380;

export function LiquidHover({ children, itemSelector = ".dside__item", className }: { children: ReactNode; itemSelector?: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const layer = useRef<SVGGElement>(null);
  const drop = useRef<SVGRectElement>(null);
  const rest = useRef<SVGRectElement>(null);
  const neck = useRef<SVGPathElement>(null);
  const noise = useRef<SVGFETurbulenceElement>(null);
  const warp = useRef<SVGFEDisplacementMapElement>(null);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    type Box = { x: number; y: number; w: number; h: number };
    let target: Box | null = null;
    // The drop: centre y and its velocity; squash (−1…1: tall/thin ↔ flat/wide) and its velocity.
    let cy = 0, vy = 0, sq = 0, vs = 0;
    // What stays behind on the item it left, draining (1 → 0).
    let left: (Box & { t0: number }) | null = null;
    let raf = 0, last = 0, clock = 0;

    const set = (n: Element | null, a: Record<string, number | string>) => {
      if (n) for (const [k, v] of Object.entries(a)) n.setAttribute(k, String(v));
    };

    const draw = () => {
      if (!target) return;
      const speed = Math.abs(vy);
      // Volume kept: stretched along its path, thinner across it; squashed on landing.
      const stretch = Math.min(speed / 900, 0.55);
      const h = target.h * (1 + stretch - sq * 0.28);
      const w = target.w * (1 - stretch * 0.32 + sq * 0.06);
      const x = target.x + (target.w - w) / 2;
      set(drop.current, { x, y: cy - h / 2, width: w, height: Math.max(0, h), rx: Math.min(h / 2, 8 + stretch * 10) });

      // What stays behind drains (shrinks towards the side the drop went to).
      let restAmt = 0;
      if (left) {
        const k = Math.min(1, (performance.now() - left.t0) / DRAIN_MS);
        restAmt = 1 - k * k;
        if (k >= 1) left = null;
      }
      if (left && restAmt > 0) {
        const lh = left.h * restAmt, lw = left.w * (0.55 + 0.45 * restAmt);
        const toward = Math.sign(cy - (left.y + left.h / 2));
        const ly = left.y + (left.h - lh) / 2 + toward * (left.h - lh) / 2;
        set(rest.current, { x: left.x + (left.w - lw) / 2, y: ly, width: lw, height: lh, rx: Math.min(lh / 2, 8) });
        // The neck: from what stays to the drop, thinner as it drains and stretches.
        const a = ly + lh / 2, b = cy;
        // Wide where it leaves each blob, pinched thin in the middle.
        const nw = Math.max(2, left.w * 0.22 * restAmt);
        const mx = target.x + target.w / 2;
        const mid = (a + b) / 2;
        const pinch = nw * 0.08;
        set(neck.current, {
          d: `M ${mx - nw / 2} ${a} C ${mx - pinch} ${mid} ${mx - pinch} ${mid} ${mx - nw / 2} ${b} L ${mx + nw / 2} ${b} C ${mx + pinch} ${mid} ${mx + pinch} ${mid} ${mx + nw / 2} ${a} Z`,
        });
      } else {
        set(rest.current, { width: 0, height: 0 });
        set(neck.current, { d: "" });
      }

      // The surface ripples while it moves; still at rest.
      const ripple = Math.min(9, speed / 70 + Math.abs(sq) * 6 + restAmt * 4);
      set(warp.current, { scale: ripple.toFixed(2) });
      set(noise.current, { seed: Math.floor(clock / 60) % 97 });
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      clock = now;
      if (!target) return;
      const ty = target.y + target.h / 2;
      const ay = -MOVE.k * (cy - ty) - MOVE.d * vy;
      const prev = vy;
      vy += ay * dt;
      cy += vy * dt;
      // Braking hard (arriving) squashes it; the squash springs back with a wobble.
      const brake = (Math.abs(prev) - Math.abs(vy)) / Math.max(dt, 1e-3);
      const as = -SQUASH.k * sq - SQUASH.d * vs + Math.max(0, brake) * 0.0009;
      vs += as * dt;
      sq = Math.max(-1, Math.min(1, sq + vs * dt));
      draw();
      const moving = Math.abs(cy - ty) > 0.15 || Math.abs(vy) > 0.6 || Math.abs(sq) > 0.004 || Math.abs(vs) > 0.02 || !!left;
      raf = moving ? requestAnimationFrame(tick) : 0;
      if (!moving) {
        sq = 0;
        draw();
      }
    };
    const go = () => {
      if (raf) return;
      last = clock = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>(itemSelector);
      if (!item || !el.contains(item)) return leave();
      const r = item.getBoundingClientRect();
      const o = el.getBoundingClientRect();
      const next = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
      const on = layer.current?.classList.contains("is-on");
      if (target && on && next.y === target.y && next.h === target.h) return;
      if (!target || !on) {
        // Coming in from outside: it forms on the item, nothing to flow from.
        target = next;
        cy = next.y + next.h / 2;
        vy = vs = sq = 0;
        left = null;
        draw();
        layer.current?.classList.add("is-on");
        return;
      }
      // Part of it stays where it was and drains into the drop as it pulls away.
      left = { ...target, t0: performance.now() };
      target = next;
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
          <filter id={`${id}-goo`} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
            {/* A rippling surface while it moves… */}
            <feTurbulence ref={noise} type="fractalNoise" baseFrequency="0.035 0.06" numOctaves="2" seed="3" result="noise" />
            <feDisplacementMap ref={warp} in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" result="warped" />
            {/* …then melted into one drop: blur, and keep only what is dense enough. */}
            <feGaussianBlur in="warped" stdDeviation="5" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" />
          </filter>
        </defs>
        <g ref={layer} className="liquid__blob" filter={`url(#${id}-goo)`}>
          <rect ref={rest} />
          <path ref={neck} />
          <rect ref={drop} />
        </g>
      </svg>
      {children}
    </div>
  );
}
