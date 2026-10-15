/**
 * Loading splash (docs/INTERFAZ.md §0): the letters of "Sweet Flow" come in
 * from off-screen as if each one were carried by an ant seen from above —
 * short jerky steps, tiny pauses, wandering detours, a slight lean toward the
 * direction of travel — and settle into the word. When the word is complete,
 * the app is ready and a minimum time has passed, the overlay fades out.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const WORD = "Sweet Flow";
const MIN_MS = 2000;
const HOLD_MS = 250;
const FADE_MS = 450;
const SNAP_MS = 180;
const MAX_LEAN_DEG = 18;

interface Point {
  x: number;
  y: number;
}

/** One ant step: a quick move followed by a short stop. */
interface Step {
  from: Point;
  to: Point;
  start: number;
  moveMs: number;
  pauseMs: number;
  /** Lean while moving this step, in degrees. */
  lean: number;
}

interface Plan {
  steps: Step[];
  /** Time (ms since start) at which the letter reaches its slot. */
  arrive: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Shortest signed difference between two angles, in radians. */
function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

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

/** Wandering, jerky path from off-screen to the letter's slot. */
function planLetter(target: Point, size: Point, vw: number, vh: number): Plan {
  const start = offscreenStart(size, vw, vh);
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const dist = Math.hypot(dx, dy) || 1;
  const base = Math.atan2(dy, dx);
  // Unit normal to the straight line, for sideways detours.
  const nx = -dy / dist;
  const ny = dx / dist;

  const count = Math.round(rand(14, 22));
  const amp = clamp(dist * 0.12, 24, 110);
  const f1 = rand(1.2, 2.4);
  const f2 = rand(3, 5.5);
  const p1 = rand(0, Math.PI * 2);
  const p2 = rand(0, Math.PI * 2);

  const points: Point[] = [start];
  for (let i = 1; i < count; i++) {
    const t = i / count;
    // Detours fade out as the ant gets close, so it lands cleanly.
    const fade = Math.pow(1 - t, 1.2);
    const side = amp * fade * (Math.sin(t * Math.PI * f1 + p1) * 0.7 + Math.sin(t * Math.PI * f2 + p2) * 0.3);
    const jitter = 6 * fade;
    points.push({
      x: start.x + dx * t + nx * side + rand(-jitter, jitter),
      y: start.y + dy * t + ny * side + rand(-jitter, jitter),
    });
  }
  points.push(target);

  // Letters leave at different times and walk at different paces.
  const delay = rand(0, 520);
  const travel = rand(1150, 1550);
  const weights = points.slice(1).map(() => ({ move: rand(0.6, 1), pause: Math.random() < 0.3 ? rand(0.25, 0.7) : rand(0, 0.15) }));
  const total = weights.reduce((a, w) => a + w.move + w.pause, 0);
  const unit = travel / total;

  const steps: Step[] = [];
  let at = delay;
  for (let i = 0; i < weights.length; i++) {
    const from = points[i]!;
    const to = points[i + 1]!;
    const heading = Math.atan2(to.y - from.y, to.x - from.x);
    const lean = clamp((angleDiff(heading, base) * 180) / Math.PI * 0.35 + rand(-4, 4), -MAX_LEAN_DEG, MAX_LEAN_DEG);
    const moveMs = weights[i]!.move * unit;
    const pauseMs = weights[i]!.pause * unit;
    steps.push({ from, to, start: at, moveMs, pauseMs, lean });
    at += moveMs + pauseMs;
  }
  // The last pause is dropped: the letter arrives as soon as it stops moving.
  const last = steps[steps.length - 1]!;
  return { steps, arrive: last.start + last.moveMs };
}

/** Position, rotation and scale of a letter at time `t` (ms since start). */
function poseAt(plan: Plan, target: Point, t: number): { x: number; y: number; rot: number; scale: number } {
  if (t >= plan.arrive) {
    // Gentle snap: a small overshoot in scale that settles back to 1.
    const k = clamp((t - plan.arrive) / SNAP_MS, 0, 1);
    return { ...target, rot: 0, scale: 1 + 0.06 * Math.sin(k * Math.PI) };
  }
  const steps = plan.steps;
  let s = steps[0]!;
  for (const step of steps) {
    if (t < step.start) break;
    s = step;
  }
  if (t < s.start) return { ...s.from, rot: s.lean, scale: 1 };
  const k = clamp((t - s.start) / s.moveMs, 0, 1);
  const e = easeOutQuad(k);
  // Straighten up over the last steps before landing.
  const left = plan.arrive - t;
  const straighten = clamp(left / 260, 0, 1);
  return {
    x: s.from.x + (s.to.x - s.from.x) * e,
    y: s.from.y + (s.to.y - s.from.y) * e,
    rot: s.lean * straighten,
    scale: 1,
  };
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const actorRefs = useRef<(HTMLSpanElement | null)[]>([]);
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

    const place = (i: number, x: number, y: number, rot: number, scale: number) => {
      const el = actorRefs.current[i];
      if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${scale})`;
    };

    const placeAllAtTargets = () => {
      targets.forEach((p, i) => place(i, p.x, p.y, 0, 1));
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
    const done = Math.max(...plans.map((p) => (p ? p.arrive + SNAP_MS : 0)));
    const t0 = performance.now();
    let landed = false;

    const frame = (now: number) => {
      const t = now - t0;
      plans.forEach((plan, i) => {
        const target = targets[i];
        if (!plan || !target) return;
        const pose = poseAt(plan, target, t);
        place(i, pose.x, pose.y, pose.rot, pose.scale);
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
