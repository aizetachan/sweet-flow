/**
 * Loading splash (docs/INTERFAZ.md §0): seen from above, each letter of
 * "Sweet Flow" is a drop of liquid on a surface. The drops creep in from the
 * edges of the screen along meandering paths (the earlier ants' routes), in
 * uneven surges as liquid does — a round head pulling a short tail that grows
 * with speed. At its slot each drop melts into its letter, which ends crisp
 * (the real text, never left deformed), with a small settling wobble. When
 * the word is complete, the app is ready and a minimum time has passed, the
 * overlay fades out.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const WORD = "Sweet Flow";
const MIN_MS = 2000;
const HOLD_MS = 250;
const FADE_MS = 450;
/** The small wobble once a letter has its shape. */
const SETTLE_MS = 600;
/** Last part of the way (0…1) in which the drop turns into its letter. */
const FORM_FROM = 0.78;
/** Blur (px) that lets the head, tail and letter merge as one liquid. */
const GOO = 7;

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
  /** Rhythm of the surges. */
  pulse: number;
  phase: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

function offscreenStart(size: Point, vw: number, vh: number): Point {
  const margin = 40;
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
  const delay = rand(0, 600);
  const travel = rand(2700, 3300);
  return { points, start: delay, travel, arrive: delay + travel, pulse: rand(3, 5), phase: rand(0, Math.PI * 2) };
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

/**
 * Progress along the path at time fraction `t`: liquid moves in surges — it
 * speeds up, slows down, speeds up again — starting gently and easing to a
 * stop. The speed never drops to zero, so it never jerks.
 */
function progress(plan: Plan, t: number): number {
  const c = clamp(t, 0, 1);
  const base = smooth(c);
  const surge = (Math.sin(c * Math.PI * 2 * plan.pulse + plan.phase) - Math.sin(plan.phase)) / (Math.PI * 2 * plan.pulse);
  // The surge fades at both ends so the start and the stop stay soft.
  return clamp(base + 0.55 * surge * Math.sin(c * Math.PI), 0, 1);
}

interface Pose {
  /** Top-left of the letter's box. */
  x: number;
  y: number;
  /** Direction of travel, in degrees, and speed (px per frame). */
  angle: number;
  speed: number;
  /** 0 = still a drop, 1 = the letter. */
  form: number;
  /** Squash of the formed letter (settling wobble). */
  wobble: number;
}

function poseAt(plan: Plan, t: number): Pose {
  const target = plan.points[plan.points.length - 1]!;
  if (t >= plan.arrive) {
    const k = t - plan.arrive;
    return { ...target, angle: 0, speed: 0, form: 1, wobble: 0.05 * Math.exp(-k / 150) * Math.sin((k / 220) * Math.PI * 2) };
  }
  const f = (t - plan.start) / plan.travel;
  const p = along(plan.points, progress(plan, f));
  const q = along(plan.points, progress(plan, f + 16 / plan.travel));
  const vx = q.x - p.x;
  const vy = q.y - p.y;
  return {
    x: p.x,
    y: p.y,
    angle: (Math.atan2(vy, vx) * 180) / Math.PI,
    speed: Math.hypot(vx, vy),
    form: smooth(clamp((f - FORM_FROM) / (1 - FORM_FROM), 0, 1)),
    wobble: 0,
  };
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

interface DropEls {
  root: HTMLDivElement | null;
  head: HTMLDivElement | null;
  tail: HTMLDivElement | null;
  glyph: HTMLSpanElement | null;
  goo: SVGFEGaussianBlurElement | null;
}

export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const drops = useRef<DropEls[]>([...WORD].map(() => ({ root: null, head: null, tail: null, glyph: null, goo: null })));
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
      const d = drops.current[i];
      const size = sizes[i];
      if (!d?.root || !size) return;
      const { x, y, angle, speed, form, wobble } = pose;
      d.root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      // The drop: a round head (about the letter's ink), stretched a little by speed,
      // and a tail that lags behind it, longer the faster it goes.
      const r = Math.min(size.x, size.y) * 0.42;
      const stretch = clamp(speed / 10, 0, 1) * 0.28;
      const drop = 1 - form;
      if (d.head) {
        d.head.style.width = d.head.style.height = `${r * 2}px`;
        d.head.style.transform = `translate(-50%, -50%) rotate(${angle}deg) scale(${(1 + stretch) * drop}, ${drop / (1 + stretch * 0.6)})`;
      }
      if (d.tail) {
        const lag = r * (0.55 + clamp(speed / 6, 0, 1) * 0.9);
        const a = (angle * Math.PI) / 180;
        const tr = r * 0.55 * clamp(speed / 4, 0, 1) * drop;
        d.tail.style.width = d.tail.style.height = `${tr * 2}px`;
        d.tail.style.transform = `translate(calc(-50% + ${-Math.cos(a) * lag}px), calc(-50% + ${-Math.sin(a) * lag}px))`;
      }
      if (d.glyph) {
        // The letter grows out of the drop; it is the real text, so it ends crisp.
        d.glyph.style.opacity = String(clamp(form * 1.6, 0, 1));
        d.glyph.style.transform = `scale(${(0.55 + 0.45 * form) * (1 + wobble)}, ${(0.55 + 0.45 * form) * (1 - wobble)})`;
      }
      // Merged as one liquid while it is a drop; no filter once formed.
      const goo = GOO * (1 - smooth(form));
      d.goo?.setAttribute("stdDeviation", goo.toFixed(2));
      d.root.style.filter = goo > 0.15 ? `url(#sf-goo-${i})` : "none";
    };

    const still = (p: Point): Pose => ({ ...p, angle: 0, speed: 0, form: 1, wobble: 0 });
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
        if (plan && targets[i]) place(i, poseAt(plan, t));
      });
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
      {/* Gooey filter per letter: blur, then cut back to a sharp edge, so head, tail and letter flow as one. */}
      <svg className="splash__defs" aria-hidden="true" width="0" height="0">
        {letters.map((ch, i) =>
          ch === " " ? null : (
            <filter key={i} id={`sf-goo-${i}`} x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur ref={(el) => (drops.current[i]!.goo = el)} in="SourceGraphic" stdDeviation="0" result="soft" />
              <feColorMatrix in="soft" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" />
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
          <div key={i} className="splash__drop" aria-hidden="true" ref={(el) => (drops.current[i]!.root = el)}>
            <div className="splash__blob" ref={(el) => (drops.current[i]!.tail = el)} />
            <div className="splash__blob" ref={(el) => (drops.current[i]!.head = el)} />
            <span className="splash__letter" ref={(el) => (drops.current[i]!.glyph = el)}>{ch}</span>
          </div>
        ),
      )}
    </div>
  );
}
