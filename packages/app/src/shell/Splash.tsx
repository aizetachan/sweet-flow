/**
 * Loading splash (docs/INTERFAZ.md §0): seen from above, the letters of
 * "Sweet Flow" are puddles of liquid that creep over a surface from the edges
 * of the screen — a continuous, meandering glide (the path of the earlier
 * ants, without their jolts), rippling and stretching gently as they go. On
 * the way each puddle gathers into its letter, and it settles with a small
 * drop-like wobble. When the word is complete, the app is ready and a minimum
 * time has passed, the overlay fades out.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const WORD = "Sweet Flow";
const MIN_MS = 2000;
const HOLD_MS = 250;
const FADE_MS = 450;
/** The small wobble once a letter has its shape. */
const SETTLE_MS = 650;
/** Most a puddle stretches along its way (0.2 = 20% longer). */
const MAX_STRETCH = 0.2;
/** How shapeless a puddle starts: blur (px) before the liquid threshold, and edge ripple (px). */
const MAX_MELT = 9;
const MAX_RIPPLE = 26;

interface Point {
  x: number;
  y: number;
}

interface Plan {
  /** Points the path goes through, smoothly (Catmull-Rom), from off-screen to the slot. */
  points: Point[];
  start: number;
  travel: number;
  /** Time (ms since start) at which the letter reaches its slot. */
  arrive: number;
  phase: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** Steady creep that slows softly into place. */
const easeOutSine = (t: number) => Math.sin((t * Math.PI) / 2);

function offscreenStart(size: Point, vw: number, vh: number): Point {
  const margin = 30;
  switch (Math.floor(Math.random() * 4)) {
    case 0:
      return { x: -size.x - margin, y: rand(0, vh) };
    case 1:
      return { x: vw + margin, y: rand(0, vh) };
    case 2:
      return { x: rand(0, vw), y: -size.y - margin };
    default:
      return { x: rand(0, vw), y: vh + margin };
  }
}

/** A wandering path to the slot: wide detours early on, a clean approach at the end. */
function planLetter(target: Point, size: Point, vw: number, vh: number): Plan {
  const start = offscreenStart(size, vw, vh);
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const amp = clamp(dist * 0.14, 30, 120);
  const f1 = rand(1, 2);
  const f2 = rand(2.5, 4);
  const p1 = rand(0, Math.PI * 2);
  const p2 = rand(0, Math.PI * 2);
  const count = 8;
  const points: Point[] = [start];
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const fade = Math.pow(1 - t, 1.3);
    const side = amp * fade * (Math.sin(t * Math.PI * f1 + p1) * 0.7 + Math.sin(t * Math.PI * f2 + p2) * 0.3);
    points.push({ x: start.x + dx * t + nx * side, y: start.y + dy * t + ny * side });
  }
  points.push(target);
  const delay = rand(0, 450);
  const travel = rand(1900, 2400);
  return { points, start: delay, travel, arrive: delay + travel, phase: rand(0, Math.PI * 2) };
}

/** Point at `u` (0…1) along the smooth curve through the plan's points. */
function along(points: Point[], u: number): Point {
  const n = points.length - 1;
  const f = clamp(u, 0, 1) * n;
  const i = Math.min(Math.floor(f), n - 1);
  const k = f - i;
  const p0 = points[Math.max(i - 1, 0)]!, p1 = points[i]!, p2 = points[i + 1]!, p3 = points[Math.min(i + 2, n)]!;
  const k2 = k * k, k3 = k2 * k;
  const cr = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * k + (2 * a - 5 * b + 4 * c - d) * k2 + (-a + 3 * b - 3 * c + d) * k3);
  return { x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y) };
}

const posAt = (plan: Plan, t: number) => along(plan.points, easeOutSine(clamp((t - plan.start) / plan.travel, 0, 1)));

interface Pose {
  x: number;
  y: number;
  /** Direction of the stretch, in degrees. */
  angle: number;
  /** Along and across the stretch direction. */
  sx: number;
  sy: number;
  /** How shapeless (0 = the letter itself). */
  melt: number;
  ripple: number;
}

/** Where the puddle is and how formed it is at time `t` (ms since start). */
function poseAt(plan: Plan, t: number): Pose {
  if (t >= plan.arrive) {
    // Formed: a small, damped wobble, like a drop coming to rest.
    const k = t - plan.arrive;
    const w = 0.07 * Math.exp(-k / 170) * Math.sin((k / 240) * Math.PI * 2);
    return { ...plan.points[plan.points.length - 1]!, angle: 0, sx: 1 + w, sy: 1 - w, melt: 0, ripple: 0 };
  }
  const u = clamp((t - plan.start) / plan.travel, 0, 1);
  const p = posAt(plan, t);
  const q = posAt(plan, t + 16);
  const vx = q.x - p.x;
  const vy = q.y - p.y;
  const speed = Math.hypot(vx, vy);
  // Liquid until close: it gathers into the letter over the second half of the way.
  const shapeless = Math.pow(1 - clamp((u - 0.35) / 0.6, 0, 1), 1.5);
  // A gentle stretch along the way, and a slow undulation (it creeps rather than slides).
  const stretch = clamp(speed / 12, 0, 1) * MAX_STRETCH * (0.4 + 0.6 * shapeless);
  const wave = 0.08 * shapeless * Math.sin(t / 140 + plan.phase);
  const sx = 1 + stretch + wave;
  const sy = 1 / sx;
  return { x: p.x, y: p.y, angle: speed > 0.01 ? (Math.atan2(vy, vx) * 180) / Math.PI : 0, sx, sy, melt: MAX_MELT * shapeless, ripple: MAX_RIPPLE * (0.15 + 0.85 * shapeless) * (1 - u * u) };
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const actorRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rippleRefs = useRef<(SVGFEDisplacementMapElement | null)[]>([]);
  const turbRefs = useRef<(SVGFETurbulenceElement | null)[]>([]);
  const meltRefs = useRef<(SVGFEGaussianBlurElement | null)[]>([]);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const [settled, setSettled] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [fading, setFading] = useState(false);
  const finished = useRef(false);
  const reduced = useRef(reducedMotion());

  /** Fade out after `holdMs`, then report done. Runs once, whatever triggers it. */
  const finish = useCallback((holdMs: number) => {
    if (finished.current) return;
    finished.current = true;
    window.setTimeout(() => {
      setFading(true);
      window.setTimeout(() => onDoneRef.current(), FADE_MS);
    }, holdMs);
  }, []);

  // Minimum on-screen time, so the animation is seen even on fast loads.
  useEffect(() => {
    const t = window.setTimeout(() => setMinElapsed(true), MIN_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (settled && ready && minElapsed) finish(HOLD_MS);
  }, [settled, ready, minElapsed, finish]);

  // Click/tap or Escape skips.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let raf = 0;
    let targets: Point[] = [];
    let sizes: Point[] = [];

    const measure = () => {
      const box = root.getBoundingClientRect();
      targets = [];
      sizes = [];
      measureRefs.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        targets[i] = { x: r.left - box.left, y: r.top - box.top };
        sizes[i] = { x: r.width, y: r.height };
      });
      return box;
    };

    const place = (i: number, pose: Pose) => {
      const el = actorRefs.current[i];
      if (!el) return;
      const { x, y, angle, sx, sy, melt, ripple } = pose;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg) scale(${sx}, ${sy}) rotate(${-angle}deg)`;
      // The liquid look: rippled edges, blurred and cut back to a sharp outline (gooey), per letter.
      rippleRefs.current[i]?.setAttribute("scale", ripple.toFixed(2));
      meltRefs.current[i]?.setAttribute("stdDeviation", melt.toFixed(2));
      el.style.filter = ripple > 0.3 || melt > 0.2 ? `url(#sf-drop-${i})` : "none";
    };

    const still = (p: Point): Pose => ({ ...p, angle: 0, sx: 1, sy: 1, melt: 0, ripple: 0 });
    const placeAllAtTargets = () => {
      targets.forEach((p, i) => place(i, still(p)));
    };

    const box = measure();

    if (reduced.current) {
      placeAllAtTargets();
      root.classList.add("splash--still");
      const t = window.setTimeout(() => setSettled(true), 400);
      const onResize = () => {
        measure();
        placeAllAtTargets();
      };
      window.addEventListener("resize", onResize);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("resize", onResize);
      };
    }

    const plans: (Plan | null)[] = targets.map((p, i) => (WORD[i] === " " || !p ? null : planLetter(p, sizes[i]!, box.width, box.height)));
    const done = Math.max(...plans.map((p) => (p ? p.arrive + SETTLE_MS : 0)));
    const t0 = performance.now();
    let landed = false;

    const frame = (now: number) => {
      const t = now - t0;
      plans.forEach((plan, i) => {
        if (!plan || !targets[i]) return;
        place(i, poseAt(plan, t));
      });
      // The turbulence drifts, so the ripples flow instead of standing still.
      turbRefs.current.forEach((n, i) => n?.setAttribute("baseFrequency", `${(0.012 + 0.004 * Math.sin(t / 420 + i)).toFixed(4)} ${(0.024 + 0.006 * Math.cos(t / 360 + i)).toFixed(4)}`));
      if (t < done) raf = requestAnimationFrame(frame);
      else {
        landed = true;
        placeAllAtTargets();
        setSettled(true);
      }
    };
    // First pose right away, so no letter flashes at the corner before the first frame.
    frame(t0);

    // Browsers pause animation frames in hidden windows: settle on time anyway.
    const safety = window.setTimeout(() => {
      if (landed) return;
      cancelAnimationFrame(raf);
      landed = true;
      placeAllAtTargets();
      setSettled(true);
    }, done + 300);

    // Slots measured before the web font loads are off (letters overlap): re-measure.
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (!alive) return;
      measure();
      if (landed) placeAllAtTargets();
    });

    // On resize the slots move: stop travelling and settle in the new layout.
    const onResize = () => {
      measure();
      if (!landed) {
        cancelAnimationFrame(raf);
        landed = true;
        setSettled(true);
      }
      placeAllAtTargets();
    };
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      window.clearTimeout(safety);
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const letters = [...WORD];
  return (
    <div
      ref={rootRef}
      className={`splash${fading ? " splash--out" : ""}`}
      role="status"
      aria-label="Cargando Sweet Flow"
      style={{ transitionDuration: `${FADE_MS}ms` }}
      onPointerDown={() => finish(0)}
    >
      {/* One liquid filter per letter: rippled, melted edges while it creeps, sharp once formed. */}
      <svg className="splash__defs" aria-hidden="true" width="0" height="0">
        {letters.map((ch, i) =>
          ch === " " ? null : (
            <filter key={i} id={`sf-drop-${i}`} x="-50%" y="-50%" width="200%" height="200%">
              <feTurbulence ref={(el) => (turbRefs.current[i] = el)} type="fractalNoise" baseFrequency="0.012 0.024" numOctaves={2} seed={i + 1} result="noise" />
              <feDisplacementMap ref={(el) => (rippleRefs.current[i] = el)} in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" result="rippled" />
              <feGaussianBlur ref={(el) => (meltRefs.current[i] = el)} in="rippled" stdDeviation="0" result="soft" />
              <feColorMatrix in="soft" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
            </filter>
          ),
        )}
      </svg>
      {/* Laid-out copy of the word: only used to measure each letter's slot. */}
      <div className="splash__measure" aria-hidden="true">
        {letters.map((ch, i) => (
          <span key={i} ref={(el) => (measureRefs.current[i] = el)}>{ch === " " ? " " : ch}</span>
        ))}
      </div>
      {letters.map((ch, i) =>
        ch === " " ? null : (
          <span key={i} className="splash__letter" aria-hidden="true" ref={(el) => (actorRefs.current[i] = el)}>
            {ch}
          </span>
        ),
      )}
    </div>
  );
}
