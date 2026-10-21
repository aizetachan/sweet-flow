/**
 * A colour of your own (Ajustes › Apariencia), drawn like the app's menus
 * instead of the system's picker: a saturation/brightness square, a hue
 * slider, the hexadecimal to type or paste, and the eyedropper where the
 * browser has one.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { IconColorPicker } from "@tabler/icons-react";
import { hexToRgb, hsvToRgb, normHex, rgbToHex, rgbToHsv, type Hsv } from "@sweetflow/ui/color";

type EyeDropperCtor = new () => { open(): Promise<{ sRGBHex: string }> };

/** Drag inside an element: `onMove` gets the pointer as 0–1 across and down it. */
function useDrag(onMove: (x: number, y: number) => void) {
  return (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      onMove(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)));
    };
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  // Kept as HSV so the hue survives greys and black (where the hexadecimal loses it).
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(hexToRgb(value)));
  const [text, setText] = useState(value.toUpperCase());
  const own = useRef(value);
  useEffect(() => {
    if (value === own.current) return;
    own.current = value;
    setHsv(rgbToHsv(hexToRgb(value)));
    setText(value.toUpperCase());
  }, [value]);

  const pick = (next: Hsv) => {
    setHsv(next);
    const hex = rgbToHex(hsvToRgb(next));
    own.current = hex;
    setText(hex.toUpperCase());
    onChange(hex);
  };
  const typed = (v: string) => {
    setText(v);
    const hex = normHex(v);
    if (!hex) return;
    own.current = hex;
    setHsv(rgbToHsv(hexToRgb(hex)));
    onChange(hex);
  };

  const square = useDrag((x, y) => pick([hsv[0], x, 1 - y]));
  const hue = useDrag((x) => pick([x * 360, hsv[1], hsv[2]]));
  const Dropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  const current = rgbToHex(hsvToRgb(hsv));

  return (
    <div className="cpick">
      <div className="cpick__square" style={{ ["--hue" as string]: `hsl(${hsv[0]} 100% 50%)` }} onPointerDown={square}>
        <span className="cpick__knob" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, background: current }} />
      </div>
      <div className="cpick__row">
        {Dropper ? (
          <button className="cpick__drop" title="Coger un color de la pantalla" aria-label="Coger un color de la pantalla" onClick={async () => {
            try {
              typed((await new Dropper().open()).sRGBHex);
            } catch {
              // Cancelled.
            }
          }}>
            <IconColorPicker size={16} stroke={1.6} />
          </button>
        ) : null}
        <span className="cpick__swatch" style={{ background: current }} />
        <div className="cpick__hue" onPointerDown={hue}>
          <span className="cpick__knob cpick__knob--hue" style={{ left: `${(hsv[0] / 360) * 100}%`, background: `hsl(${hsv[0]} 100% 50%)` }} />
        </div>
      </div>
      <label className="cpick__hex">
        <span className="sf-faint sf-small">Hex</span>
        <input className="sf-input" value={text} spellCheck={false} maxLength={7} aria-label="Color en hexadecimal"
          onChange={(e) => typed(e.target.value)}
          onBlur={() => setText(current.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
      </label>
    </div>
  );
}
