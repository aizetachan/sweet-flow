/**
 * Vector outlines for the loading splash's drops: each letter is traced from
 * the real font (rendered on a canvas, then followed with marching squares)
 * into closed contours, resampled to a fixed number of points so a round drop
 * can turn into the letter point by point.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Glyph {
  /** Outer outline, clockwise on screen, `OUTER_POINTS` points, in the letter box's pixels. */
  outer: Pt[];
  /** Holes (the eye of an «e», the inside of an «o»), `HOLE_POINTS` points each. */
  holes: Pt[][];
  /** Centre of the ink, and the radius of a round drop with the same area (same amount of liquid). */
  centroid: Pt;
  radius: number;
  /** Lowest point of the ink (the letter rests on it when it bounces). */
  base: number;
}

export const OUTER_POINTS = 140;
export const HOLE_POINTS = 60;
/** Canvas pixels per CSS pixel when tracing: smoother outlines. */
const RES = 2;

/** Signed area (positive = clockwise on screen, y pointing down). */
function area(c: Pt[]): number {
  let a = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i]!, q = c[(i + 1) % c.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function centroidOf(c: Pt[]): Pt {
  let x = 0, y = 0;
  for (const p of c) (x += p.x), (y += p.y);
  return { x: x / c.length, y: y / c.length };
}

function inside(p: Pt, c: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const a = c[i]!, b = c[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** `n` points evenly spaced along a closed outline. */
function resample(c: Pt[], n: number): Pt[] {
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i]!, q = c[(i + 1) % c.length]!;
    const l = Math.hypot(q.x - p.x, q.y - p.y);
    lens.push(l);
    total += l;
  }
  const out: Pt[] = [];
  let seg = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * total;
    while (seg < c.length - 1 && acc + lens[seg]! < d) acc += lens[seg++]!;
    const p = c[seg]!, q = c[(seg + 1) % c.length]!;
    const t = lens[seg]! ? (d - acc) / lens[seg]! : 0;
    out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  }
  return out;
}

/** Closed outlines of the ink in an alpha mask (marching squares, edges interpolated). */
function contours(alpha: Uint8ClampedArray, w: number, h: number): Pt[][] {
  const v = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : alpha[(y * w + x) * 4 + 3]! / 255);
  const ISO = 0.5;
  const lerp = (a: number, b: number) => (ISO - a) / (b - a || 1);
  // Edges of a cell: 0 top, 1 right, 2 bottom, 3 left.
  const point = (x: number, y: number, e: number): Pt => {
    const tl = v(x, y), tr = v(x + 1, y), br = v(x + 1, y + 1), bl = v(x, y + 1);
    if (e === 0) return { x: x + lerp(tl, tr), y };
    if (e === 1) return { x: x + 1, y: y + lerp(tr, br) };
    if (e === 2) return { x: x + lerp(bl, br), y: y + 1 };
    return { x, y: y + lerp(tl, bl) };
  };
  // For each case (tl=8, tr=4, br=2, bl=1), segments as [from edge, to edge], ink on the right.
  const TABLE: Record<number, Array<[number, number]>> = {
    1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[1, 0]], 5: [[3, 0], [1, 2]], 6: [[2, 0]], 7: [[3, 0]],
    8: [[0, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[0, 1]], 12: [[1, 3]], 13: [[1, 2]], 14: [[2, 3]],
  };
  const key = (p: Pt) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  const next = new Map<string, Pt>();
  const pts = new Map<string, Pt>();
  for (let y = -1; y < h; y++) {
    for (let x = -1; x < w; x++) {
      const c = (v(x, y) > ISO ? 8 : 0) | (v(x + 1, y) > ISO ? 4 : 0) | (v(x + 1, y + 1) > ISO ? 2 : 0) | (v(x, y + 1) > ISO ? 1 : 0);
      for (const [a, b] of TABLE[c] ?? []) {
        const p = point(x, y, a), q = point(x, y, b);
        pts.set(key(p), p);
        next.set(key(p), q);
      }
    }
  }
  const loops: Pt[][] = [];
  const seen = new Set<string>();
  for (const k0 of next.keys()) {
    if (seen.has(k0)) continue;
    const loop: Pt[] = [];
    let k = k0;
    while (!seen.has(k)) {
      seen.add(k);
      loop.push(pts.get(k)!);
      const q = next.get(k);
      if (!q) break;
      k = key(q);
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

/** Starts the outline at the point nearest to straight right of `c` (where a drop's point 0 is). */
function alignStart(c: Pt[], center: Pt): Pt[] {
  let best = 0, bestD = Infinity;
  c.forEach((p, i) => {
    const a = Math.atan2(p.y - center.y, p.x - center.x);
    if (Math.abs(a) < bestD) (bestD = Math.abs(a)), (best = i);
  });
  return [...c.slice(best), ...c.slice(0, best)];
}

/** Traces one letter, drawn with `font` in a `w`×`h` box (line-height 1). Null if nothing came out. */
export function traceGlyph(ch: string, font: string, w: number, h: number): Glyph | null {
  const pad = 4;
  const cw = Math.ceil((w + pad * 2) * RES);
  const chh = Math.ceil((h + pad * 2) * RES);
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = chh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.scale(RES, RES);
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  const m = ctx.measureText(ch);
  const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
  // Where the browser puts the baseline in a line box as tall as the letter's (line-height 1).
  const baseline = (h - (ascent + descent)) / 2 + ascent;
  ctx.fillStyle = "#000";
  ctx.fillText(ch, pad, pad + baseline);
  const loops = contours(ctx.getImageData(0, 0, cw, chh).data, cw, chh).map((l) => l.map((p) => ({ x: p.x / RES - pad, y: p.y / RES - pad })));
  if (!loops.length) return null;
  loops.sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const outerRaw = loops[0]!;
  const holesRaw = loops.slice(1).filter((l) => inside(l[0]!, outerRaw));
  const ink = Math.abs(area(outerRaw)) - holesRaw.reduce((s, l) => s + Math.abs(area(l)), 0);
  const centroid = centroidOf(outerRaw);
  // Same turning direction as a drop drawn by increasing angle (clockwise on screen).
  const cw1 = area(outerRaw) > 0 ? outerRaw : [...outerRaw].reverse();
  return {
    outer: alignStart(resample(cw1, OUTER_POINTS), centroid),
    holes: holesRaw.map((l) => resample(l, HOLE_POINTS)),
    centroid,
    radius: Math.sqrt(Math.max(ink, 1) / Math.PI),
    base: Math.max(...outerRaw.map((p) => p.y)),
  };
}
