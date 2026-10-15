import { useEffect, useRef, useState } from "react";
import { IconCheck, IconSettings } from "@tabler/icons-react";
import type { Id, StatusDef } from "@sweetflow/domain";
import { Pill } from "@sweetflow/ui";

/** Any status → any status (going back is allowed by design). */
export function StatusPicker({
  statuses,
  value,
  onChange,
  onEdit,
}: {
  statuses: StatusDef[];
  value: Id;
  onChange: (id: Id) => void;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = statuses.find((s) => s.id === value) ?? statuses[0]!;
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", off);
    return () => window.removeEventListener("mousedown", off);
  }, [open]);
  const list = statuses.filter((s) => !s.archived).sort((a, b) => a.order - b.order);
  return (
    <div className="picker" ref={ref}>
      <button className="picker__btn" title="Cambiar el estado" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Pill color={cur.color}>{cur.name}</Pill>
      </button>
      {open ? (
        <div className="menu">
          {list.map((s) => (
            <button key={s.id} className="menu__item" onClick={() => { onChange(s.id); setOpen(false); }}>
              <span className="sf-pill__dot" style={{ background: s.color }} />
              <span className="menu__label">{s.name}</span>
              {s.id === value ? <IconCheck size={13} /> : null}
            </button>
          ))}
          {onEdit ? (
            <>
              <div className="menu__sep" />
              <button className="menu__item sf-muted" onClick={() => { setOpen(false); onEdit(); }}>
                <IconSettings size={13} /> <span className="menu__label">Editar estados…</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
