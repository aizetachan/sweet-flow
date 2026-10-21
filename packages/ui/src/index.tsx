import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useEffect } from "react";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");
export { cx };

type BtnVariant = "default" | "ghost" | "primary" | "create";

export function Button({
  variant = "default",
  size = "md",
  block,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md"; block?: boolean }) {
  return (
    <button
      type="button"
      className={cx("sf-btn", variant !== "default" && `sf-btn--${variant}`, size === "sm" && "sf-btn--sm", block && "sf-btn--block", className)}
      {...rest}
    />
  );
}

export function IconButton({
  label,
  on,
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; on?: boolean; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx("sf-icon-btn", on && "sf-icon-btn--on", size === "sm" && "sf-icon-btn--sm", className)}
      {...rest}
    />
  );
}

export function Pill({ color, children, title }: { color?: string; children: ReactNode; title?: string }) {
  return (
    <span className="sf-pill" title={title} style={color ? { background: `${color}1f`, color } : undefined}>
      {color ? <span className="sf-pill__dot" style={{ background: color }} /> : null}
      {children}
    </span>
  );
}

const PALETTE = ["#2f7dff", "#e0559b", "#2fb38a", "#d8913f", "#8f6ee8", "#2aa9c9", "#c9564f"];
/** The colour of someone's avatar (from their name): marks and timeline dots use it too. */
export function avatarColor(s: string): string {
  return hue(s);
}

function hue(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length]!;
}

export function Avatar({ name, src, size = 22, ring }: { name: string; src?: string; size?: number; ring?: string }) {
  return (
    <span
      className="sf-avatar"
      title={name}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: hue(name),
        boxShadow: ring ? `0 0 0 2px var(--bg-1), 0 0 0 3.5px ${ring}` : undefined,
      }}
    >
      {src ? <img src={src} alt="" /> : name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

/** A person shown by an avatar: their name, and their photo when they have one. */
export type AvatarPerson = string | { name: string; src?: string };

export function AvatarStack({ names, size = 22, max = 4 }: { names: AvatarPerson[]; size?: number; max?: number }) {
  const shown = names.slice(0, max).map((p) => (typeof p === "string" ? { name: p } : p));
  return (
    <span className="sf-avatars">
      {shown.map((p, i) => <Avatar key={`${p.name}-${i}`} name={p.name} src={p.src} size={size} />)}
      {names.length > max ? (
        <span className="sf-avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: "var(--bg-5)" }}>
          +{names.length - max}
        </span>
      ) : null}
    </span>
  );
}

export const Spinner = () => <span className="sf-spin" aria-label="Cargando" />;

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ id: T; label: ReactNode; count?: number; disabled?: boolean; title?: string }>;
}) {
  return (
    <div className="sf-tabs" role="tablist">
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} disabled={it.disabled} title={it.title} className={cx("sf-tab", value === it.id && "sf-tab--on")} onClick={() => onChange(it.id)}>
          {it.label}
          {it.count ? <span className="sf-tab__count">{it.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ id: T; label: ReactNode; title?: string }>;
}) {
  return (
    <div className="sf-seg">
      {items.map((it) => (
        <button key={it.id} title={it.title} className={value === it.id ? "on" : ""} onClick={() => onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, width }: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sf-modal-bg" onMouseDown={onClose}>
      <div className="sf-modal" style={width ? { width: `min(${width}px, 100%)` } : undefined} onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="sf-modal__head">
          <h3>{title}</h3>
          <IconButton label="Cerrar" onClick={onClose}>✕</IconButton>
        </div>
        <div className="sf-modal__body">{children}</div>
      </div>
    </div>
  );
}
