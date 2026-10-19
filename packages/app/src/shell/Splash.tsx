/**
 * Loading splash (docs/INTERFAZ.md §0): seen from above, each letter of
 * "Sweet Flow" is a drop of liquid on a surface, lit from the top left (a
 * highlight, shading at its edges and a soft shadow on the surface). The drops
 * creep in from the edges of the screen along meandering paths (the earlier
 * ants' routes), in uneven surges as liquid does, their outline rippling and
 * pulled into a short tail. At its slot each drop changes shape into its
 * letter — the letter's real outline, traced from the font (liquid.ts), with
 * the same amount of liquid — loses its shine and ends as the crisp text, with
 * a small settling wobble. When the word is complete, the app is ready and a
 * minimum time has passed, the overlay fades out.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { OUTER_POINTS, traceGlyph, type Glyph } from "./liquid";

const WORD = "Sweet Flow";
const MIN_MS = 2000;
const HOLD_MS = 250;
const FADE_MS = 450;
/** Once at its slot and still, the drop takes the letter's shape (still lit, as liquid)… */
const FORM_MS = 650;
/** …then settles with a small bounce, in which it loses its shine and shadow. */
const BOUNCE_MS = 600;

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
  const travel = rand(2300, 2900);
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
  /** Squash of the formed letter (settling bounce): >0 wider and lower. */
  wobble: number;
  /** Shine, shading and shadow: 1 while liquid, 0 as the flat letter. */
  light: number;
}

function poseAt(plan: Plan, t: number): Pose {
  const target = plan.points[plan.points.length - 1]!;
  if (t >= plan.arrive) {
    // At its slot, standing still: first it takes the letter's shape…
    const k = t - plan.arrive;
    if (k < FORM_MS) return { ...target, angle: 0, speed: 0, form: smooth(k / FORM_MS), wobble: 0, light: 1 };
    // …then a small bounce (squash, then a little stretch, dying out) that leaves it flat.
    const b = k - FORM_MS;
    const wobble = 0.09 * Math.exp(-b / 170) * Math.sin((b / 260) * Math.PI * 2 + Math.PI / 2) * clamp(b / 40, 0, 1);
    return { ...target, angle: 0, speed: 0, form: 1, wobble, light: 1 - smooth(clamp(b / (BOUNCE_MS * 0.7), 0, 1)) };
  }
  // On the way it is all drop: it keeps its round shape until it stops.
  const f = (t - plan.start) / plan.travel;
  const p = along(plan.points, progress(plan, f));
  const q = along(plan.points, progress(plan, f + 16 / plan.travel));
  const vx = q.x - p.x;
  const vy = q.y - p.y;
  return { x: p.x, y: p.y, angle: (Math.atan2(vy, vx) * 180) / Math.PI, speed: Math.hypot(vx, vy), form: 0, wobble: 0, light: 1 };
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Elements of one letter: its drop (an outline in the shared SVG, with its light) and the real text. */
interface DropEls {
  path: SVGPathElement | null;
  glyph: HTMLSpanElement | null;
  /** Light controls of its filter: shading mix, shine and shadow. */
  mix: SVGFECompositeElement | null;
  shine: SVGFECompositeElement | null;
  shadow: SVGFEColorMatrixElement | null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Outline of the drop at time `t`, as an SVG path: a round drop with a
 * rippling edge, pulled into a tail by its speed, turning into the letter's
 * outline as `form` goes to 1.
 */
function dropPath(g: Glyph, pose: Pose, t: number, phase: number): string {
  const { x, y, form } = pose;
  const m = smooth(form);
  const loose = 1 - m;
  const cx = x + g.centroid.x;
  const cy = y + g.centroid.y;
  const R = g.radius;
  const a = (pose.angle * Math.PI) / 180;
  const s = clamp(pose.speed / 9, 0, 1) * loose;
  const stretch = 0.2 * s;
  const tail = 0.75 * s;
  const n = OUTER_POINTS;
  // The bounce squashes and stretches the letter about its base.
  const w = pose.wobble;
  const bx = (px: number) => cx + (px - cx) * (1 + w);
  const by = (py: number) => y + g.base + (py - y - g.base) * (1 - w);
  let d = "";
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    // The edge ripples a little, more while the drop is moving.
    const ripple = 1 + loose * (0.03 * Math.sin(3 * th + t / 170 + phase) + 0.02 * Math.sin(5 * th - t / 120 + phase * 2) + 0.03 * s * Math.sin(2 * th + t / 90));
    const u = Math.cos(th);
    const v = Math.sin(th);
    // In the drop's own frame (u along its travel): a longer back with a tapering tail.
    const along = u * (1 + stretch) - (u < 0 ? tail * u * u : 0);
    const across = (v / (1 + stretch * 0.5)) * (u < 0 ? 1 - 0.35 * tail * -u : 1);
    // Turning into the letter: the drop straightens before its points move onto the outline.
    const rot = a * loose;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const lx = along * R * ripple;
    const ly = across * R * ripple;
    const px = cx + lx * cr - ly * sr;
    const py = cy + lx * sr + ly * cr;
    const o = g.outer[i]!;
    const qx = lerp(px, x + o.x, m);
    const qy = lerp(py, y + o.y, m);
    d += `${i ? "L" : "M"}${bx(qx).toFixed(1)} ${by(qy).toFixed(1)}`;
  }
  d += "Z";
  // Holes open from the middle of the drop as it takes the letter's shape.
  if (m > 0.02) {
    for (const h of g.holes) {
      h.forEach((p, j) => (d += `${j ? "L" : "M"}${bx(lerp(cx, x + p.x, m)).toFixed(1)} ${by(lerp(cy, y + p.y, m)).toFixed(1)}`));
      d += "Z";
    }
  }
  return d;
}

export function Splash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const drops = useRef<DropEls[]>([...WORD].map(() => ({ path: null, glyph: null, mix: null, shine: null, shadow: null })));
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

    // Each letter's outline, traced from the font (again once the web font has loaded).
    let glyphs: (Glyph | null)[] = [];
    const trace = () => {
      const cs = measureRefs.current.find(Boolean) ? getComputedStyle(measureRefs.current.find(Boolean)!) : null;
      const font = cs ? `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}` : "";
      glyphs = [...WORD].map((ch, i) => (ch === " " || !sizes[i] || !font ? null : traceGlyph(ch, font, sizes[i]!.x, sizes[i]!.y)));
    };
    const phases = [...WORD].map(() => rand(0, Math.PI * 2));
    let clock = 0;

    const place = (i: number, pose: Pose) => {
      const d = drops.current[i];
      const g = glyphs[i];
      if (!d) return;
      const { x, y, form, wobble, light } = pose;
      // The text itself takes over once the letter has lost its shine: crisp, never deformed.
      const text = !g ? form : form < 1 ? 0 : clamp((0.15 - light) / 0.15, 0, 1);
      if (d.glyph) {
        d.glyph.style.opacity = String(text);
        d.glyph.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${1 + wobble}, ${1 - wobble})`;
      }
      if (!d.path) return;
      if (!g || (form >= 1 && light <= 0)) {
        d.path.style.display = "none";
        return;
      }
      d.path.style.display = "";
      d.path.setAttribute("d", dropPath(g, pose, clock, phases[i]!));
      // Shine, shading and shadow: full while liquid, gone during the bounce.
      const L = light;
      d.mix?.setAttribute("k2", L.toFixed(3));
      d.mix?.setAttribute("k3", (1 - L).toFixed(3));
      d.shine?.setAttribute("k2", (0.75 * L).toFixed(3));
      d.shadow?.setAttribute("values", `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${(0.6 * L).toFixed(3)} 0`);
    };

    const still = (p: Point): Pose => ({ ...p, angle: 0, speed: 0, form: 1, wobble: 0, light: 0 });
    const placeAllAtTargets = () => {
      targets.forEach((p, i) => place(i, still(p)));
    };

    const box = measure();
    trace();

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
    const done = Math.max(...plans.map((p) => (p ? p.arrive + FORM_MS + BOUNCE_MS : 0)));
    const t0 = performance.now();
    let landed = false;

    const frame = (now: number) => {
      const t = now - t0;
      clock = t;
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
      trace();
      if (landed) placeAllAtTargets();
    });

    // On resize the slots move: stop travelling and settle in the new layout.
    const onResize = () => {
      measure();
      trace();
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
      {/* The drops: one outline per letter, each with its light (shading, shine, shadow on the surface). */}
      <svg className="splash__drops" aria-hidden="true">
        <defs>
          {letters.map((ch, i) =>
            ch === " " ? null : (
              <filter key={i} id={`sf-drop-${i}`} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
                <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="height" />
                <feDiffuseLighting in="height" surfaceScale="7" diffuseConstant="1.3" lightingColor="#ffffff" result="diffuse">
                  <feDistantLight azimuth="225" elevation="48" />
                </feDiffuseLighting>
                <feComposite in="SourceGraphic" in2="diffuse" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="shaded" />
                <feComposite ref={(el) => (drops.current[i]!.mix = el)} in="shaded" in2="SourceGraphic" operator="arithmetic" k1="0" k2="1" k3="0" k4="0" result="body" />
                <feSpecularLighting in="height" surfaceScale="7" specularConstant="1.2" specularExponent="26" lightingColor="#ffffff" result="spec">
                  <feDistantLight azimuth="225" elevation="48" />
                </feSpecularLighting>
                <feComposite in="spec" in2="SourceAlpha" operator="in" result="shine" />
                <feComposite ref={(el) => (drops.current[i]!.shine = el)} in="shine" in2="body" operator="arithmetic" k1="0" k2="0.75" k3="1" k4="0" result="lit" />
                <feOffset in="SourceAlpha" dx="5" dy="8" result="offset" />
                <feGaussianBlur in="offset" stdDeviation="6" result="soft" />
                <feColorMatrix ref={(el) => (drops.current[i]!.shadow = el)} in="soft" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0" result="shadow" />
                <feMerge>
                  <feMergeNode in="shadow" />
                  <feMergeNode in="lit" />
                </feMerge>
              </filter>
            ),
          )}
        </defs>
        {letters.map((ch, i) =>
          ch === " " ? null : <path key={i} className="splash__drop" fillRule="evenodd" filter={`url(#sf-drop-${i})`} ref={(el) => (drops.current[i]!.path = el)} />,
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
          <span key={i} className="splash__letter" aria-hidden="true" ref={(el) => (drops.current[i]!.glyph = el)}>{ch}</span>
        ),
      )}
    </div>
  );
}
