/**
 * Marks of comments over the picture (docs/INTERFAZ.md §2.6): numbered points
 * and areas. While marking, a click leaves a point and a drag an area; the
 * author's own marks can be dragged to a better place.
 */

import { useRef, useState, type PointerEvent } from "react";
import { cx } from "@sweetflow/ui";

/** A point (no size) or an area, 0–1 from the picture's top left. */
export interface Mark {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface ShownMark extends Mark {
  id: string;
  /** Who left it: their initial on their colour (no numbers that go out of order). */
  label: string;
  color?: string;
  on?: boolean;
  onClick?: () => void;
  /** Present when it can be moved (the author's). */
  onMove?: (m: Mark) => void;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
/** Smaller than this, a drag is just a click: a point. */
const MIN_AREA = 0.02;

/** Keeps the pointer while dragging (some pointers cannot be captured: then it just goes on). */
function capture(e: PointerEvent): void {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // no capture
  }
}

function rel(e: PointerEvent, box: HTMLElement): { x: number; y: number } {
  const r = box.getBoundingClientRect();
  return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
}

export function MarkLayer({ marks, onMark }: { marks?: ShownMark[]; onMark?: (m: Mark) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [draft, setDraftState] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  // Also in a ref: a very quick click lifts before the state has updated.
  const live = useRef<typeof draft>(null);
  const setDraft = (d: typeof draft) => { live.current = d; setDraftState(d); };
  const [moving, setMoving] = useState<{ id: string; dx: number; dy: number; start: { x: number; y: number }; moved: boolean } | null>(null);

  const area = draft && { x: Math.min(draft.from.x, draft.to.x), y: Math.min(draft.from.y, draft.to.y), w: Math.abs(draft.to.x - draft.from.x), h: Math.abs(draft.to.y - draft.from.y) };

  return (
    <div ref={box} className={cx("marks", onMark && "marks--picking")}
      onPointerDown={onMark ? (e) => {
        if ((e.target as HTMLElement).closest(".mark")) return;
        capture(e);
        const p = rel(e, box.current!);
        setDraft({ from: p, to: p });
      } : undefined}
      onPointerMove={(e) => { if (live.current) setDraft({ ...live.current, to: rel(e, box.current!) }); }}
      onPointerUp={(e) => {
        const d = live.current;
        if (d && onMark) {
          const to = rel(e, box.current!);
          const a = { x: Math.min(d.from.x, to.x), y: Math.min(d.from.y, to.y), w: Math.abs(to.x - d.from.x), h: Math.abs(to.y - d.from.y) };
          onMark(a.w > MIN_AREA && a.h > MIN_AREA ? a : { x: d.from.x, y: d.from.y });
        }
        setDraft(null);
      }}>
      {marks?.map((m) => {
        const dx = moving?.id === m.id ? moving.dx : 0;
        const dy = moving?.id === m.id ? moving.dy : 0;
        const isArea = !!m.w && !!m.h;
        const tint = m.on ? "var(--primary)" : m.color;
        const style = isArea
          ? { left: `${(m.x + dx) * 100}%`, top: `${(m.y + dy) * 100}%`, width: `${m.w! * 100}%`, height: `${m.h! * 100}%`, ...(tint ? { borderColor: tint } : {}) }
          : { left: `${(m.x + dx) * 100}%`, top: `${(m.y + dy) * 100}%`, ...(tint ? { background: tint } : {}) };
        return (
          <div key={m.id} className={cx("mark", isArea ? "mark--area" : "mark--point", m.on && "mark--on", m.onMove && "mark--movable")} style={style}
            title={m.onMove ? "Tu comentario · arrastra para moverlo" : "Ver el comentario"}
            // The mark handles its own drag, so the layer never covers the viewer when not marking.
            onPointerDown={(e) => {
              e.stopPropagation();
              capture(e);
              setMoving({ id: m.id, dx: 0, dy: 0, start: rel(e, box.current!), moved: false });
            }}
            onPointerMove={(e) => {
              if (moving?.id !== m.id || !m.onMove) return;
              const p = rel(e, box.current!);
              setMoving({ ...moving, dx: p.x - moving.start.x, dy: p.y - moving.start.y, moved: moving.moved || Math.abs(p.x - moving.start.x) + Math.abs(p.y - moving.start.y) > 0.005 });
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              if (moving?.id !== m.id) return;
              if (moving.moved && m.onMove) {
                const w = m.w ?? 0;
                const h = m.h ?? 0;
                m.onMove({ x: Math.min(1 - w, clamp(m.x + moving.dx)), y: Math.min(1 - h, clamp(m.y + moving.dy)), ...(m.w ? { w: m.w, h: m.h } : {}) });
              } else m.onClick?.();
              setMoving(null);
            }}>
            <span className="mark__n" style={m.color && !m.on ? { background: m.color } : undefined}>{m.label}</span>
          </div>
        );
      })}
      {area && (area.w > MIN_AREA || area.h > MIN_AREA) ? (
        <div className="mark mark--area mark--draft" style={{ left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.w * 100}%`, height: `${area.h * 100}%` }} />
      ) : null}
    </div>
  );
}
