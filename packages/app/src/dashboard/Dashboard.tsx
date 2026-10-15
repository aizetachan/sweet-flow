/**
 * Dashboard (docs/INTERFAZ.md §1): folders and productions, Drive style.
 * Click selects (⌘/Ctrl adds), double click opens, drag onto a folder or a
 * breadcrumb moves.
 */

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  IconArchive,
  IconArchiveOff,
  IconChevronRight,
  IconFolder,
  IconFolderPlus,
  IconHome,
  IconLayoutGrid,
  IconList,
  IconMovie,
  IconPencil,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import type { Id } from "@sweetflow/domain";
import { AvatarStack, Button, cx, IconButton, Segmented } from "@sweetflow/ui";
import type { LibraryEntry, LibraryState, ProductionSummary } from "../data/library";
import { useStore, type DashLayout } from "../state/store";

const DRAG_TYPE = "application/x-sweetflow-entries";

export function Dashboard() {
  const lib = useStore((s) => s.lib);
  if (!lib) return <div className="dash" />;
  return <DashboardView lib={lib} />;
}

function DashboardView({ lib }: { lib: LibraryState }) {
  const { folderId, dashLayout, set, library, openProduction } = useStore();
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [picked, setPicked] = useState<Id[]>([]);
  const [renaming, setRenaming] = useState<Id | null>(null);

  const byId = useMemo(() => new Map(lib.entries.map((e) => [e.id, e])), [lib.entries]);
  const trail = useMemo(() => pathTo(byId, folderId), [byId, folderId]);
  // The open folder may vanish (moved or archived from another window).
  useEffect(() => {
    if (folderId && !byId.has(folderId)) set({ folderId: null });
  }, [folderId, byId, set]);

  const q = query.trim().toLowerCase();
  const visible = lib.entries
    .filter((e) => (q ? e.name.toLowerCase().includes(q) : e.parentId === folderId))
    .filter((e) => showArchived || !e.archived)
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "es") : a.kind === "folder" ? -1 : 1));
  const archivedHere = lib.entries.filter((e) => e.parentId === folderId && e.archived).length;

  const open = (e: LibraryEntry) => {
    if (e.kind === "folder") {
      set({ folderId: e.id });
      setQuery("");
      setPicked([]);
    } else {
      openProduction(e.id);
    }
  };
  const pick = (id: Id, additive: boolean) => setPicked((cur) => (additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
  const editable = lib.label !== "Firebase";

  return (
    <div className="dash" onClick={(e) => e.target === e.currentTarget && setPicked([])}>
      <header className="dash__head">
        <nav className="crumbs" aria-label="Ubicación">
          <Crumb label={<><IconHome size={14} /> Inicio</>} onOpen={() => set({ folderId: null })} target={null} />
          {trail.map((f) => (
            <span key={f.id} className="crumbs__item">
              <IconChevronRight size={13} className="sf-faint" />
              <Crumb label={f.name} onOpen={() => set({ folderId: f.id })} target={f.id} />
            </span>
          ))}
        </nav>
        <span className="dash__where sf-faint sf-small" title="Dónde se guardan las producciones">{lib.label}</span>
      </header>

      <div className="dash__tools">
        <label className="filters__search dash__search">
          <IconSearch size={14} />
          <input placeholder="Buscar en todas las carpetas…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="dash__spacer" />
        {archivedHere || showArchived ? (
          <button className={cx("fchip", showArchived && "fchip--on")} onClick={() => setShowArchived(!showArchived)}>
            <IconArchive size={13} /> Archivados{archivedHere ? ` (${archivedHere})` : ""}
          </button>
        ) : null}
        <Segmented<DashLayout>
          value={dashLayout}
          onChange={(v) => set({ dashLayout: v })}
          items={[{ id: "grid", label: <IconLayoutGrid size={14} />, title: "Cuadrícula" }, { id: "list", label: <IconList size={14} />, title: "Lista" }]}
        />
        {editable ? (
          <>
            <Button size="sm" onClick={() => setRenaming(library.createFolder(folderId, "Nueva carpeta"))}><IconFolderPlus size={14} /> Carpeta</Button>
            <Button size="sm" variant="primary" onClick={() => void library.createProduction(folderId, "Nueva producción").then(setRenaming)}><IconPlus size={14} /> Producción</Button>
          </>
        ) : null}
      </div>

      {visible.length ? (
        <div className={cx("dash__items", `dash__items--${dashLayout}`)}>
          {dashLayout === "list" ? (
            <div className="drow drow--head sf-small sf-faint">
              <span>Nombre</span><span>Progreso</span><span>Equipo</span><span>Modificado</span><span />
            </div>
          ) : null}
          {visible.map((e) => (
            <EntryItem
              key={e.id}
              entry={e}
              layout={dashLayout}
              summary={lib.summaries[e.id]}
              children={lib.entries.filter((c) => c.parentId === e.id && !c.archived).length}
              place={q ? pathTo(byId, e.parentId).map((f) => f.name).join(" / ") || "Inicio" : undefined}
              picked={picked.includes(e.id)}
              dragIds={picked.includes(e.id) ? picked : [e.id]}
              renaming={renaming === e.id}
              editable={editable}
              onPick={(additive) => pick(e.id, additive)}
              onOpen={() => open(e)}
              onRename={(name) => {
                library.rename(e.id, name);
                setRenaming(null);
              }}
              onStartRename={() => setRenaming(e.id)}
            />
          ))}
        </div>
      ) : (
        <div className="dash__empty">
          {q ? <p>Nada coincide con «{query}».</p> : (
            <>
              <IconFolder size={30} stroke={1.3} className="sf-faint" />
              <p>{folderId ? "Esta carpeta está vacía." : "Aún no hay nada aquí."}</p>
              {editable ? <p className="sf-muted sf-small">Crea una carpeta para agrupar (una serie, una campaña) o una producción para empezar a trabajar.</p> : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function pathTo(byId: Map<Id, LibraryEntry>, folderId: Id | null): LibraryEntry[] {
  const out: LibraryEntry[] = [];
  for (let cur = folderId ? byId.get(folderId) : undefined; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) out.unshift(cur);
  return out;
}

/** Folder trail shown in the dashboard and in the production's top bar. */
export function useLibraryTrail(entryId: Id | null): LibraryEntry[] {
  const lib = useStore((s) => s.lib);
  if (!lib || !entryId) return [];
  const byId = new Map(lib.entries.map((e) => [e.id, e]));
  return pathTo(byId, byId.get(entryId)?.parentId ?? null);
}

/** Accepts dragged entries: moves them into `target` (null = root). */
function useDropInto(target: Id | null) {
  const library = useStore((s) => s.library);
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        const ids = JSON.parse(e.dataTransfer.getData(DRAG_TYPE) || "[]") as Id[];
        if (ids.length && !ids.includes(target ?? "")) library.move(ids, target);
      },
    },
  };
}

function Crumb({ label, onOpen, target }: { label: ReactNode; onOpen: () => void; target: Id | null }) {
  const drop = useDropInto(target);
  return <button className={cx("crumbs__btn", drop.over && "is-drop")} onClick={onOpen} {...drop.props}>{label}</button>;
}

interface EntryItemProps {
  entry: LibraryEntry;
  layout: DashLayout;
  summary?: ProductionSummary;
  children: number;
  place?: string;
  picked: boolean;
  dragIds: Id[];
  renaming: boolean;
  editable: boolean;
  onPick: (additive: boolean) => void;
  onOpen: () => void;
  onRename: (name: string) => void;
  onStartRename: () => void;
}

function EntryItem(p: EntryItemProps) {
  const library = useStore((s) => s.library);
  const drop = useDropInto(p.entry.id);
  const isFolder = p.entry.kind === "folder";
  const s = p.summary;
  const meta = isFolder ? `${p.children} elemento${p.children === 1 ? "" : "s"}` : s ? `${s.units} planos · ${s.done} aprobados` : "—";

  const common = {
    className: cx(p.layout === "grid" ? "dcard" : "drow", isFolder && (p.layout === "grid" ? "dcard--folder" : "drow--folder"), p.picked && "is-picked", drop.over && isFolder && "is-drop", p.entry.archived && "is-archived"),
    draggable: p.editable && !p.renaming,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(p.dragIds));
      e.dataTransfer.effectAllowed = "move";
    },
    onClick: (e: React.MouseEvent) => p.onPick(e.metaKey || e.ctrlKey),
    onDoubleClick: p.onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !p.renaming) p.onOpen();
      if (e.key === "F2" && p.editable) p.onStartRename();
    },
    tabIndex: 0,
    ...(isFolder ? drop.props : {}),
  };

  const name = p.renaming ? <RenameField initial={p.entry.name} onDone={p.onRename} /> : <span className="dentry__name" title={p.entry.name}>{p.entry.name}</span>;
  const actions = p.editable ? (
    <span className="dentry__acts" onClick={(e) => e.stopPropagation()}>
      <IconButton size="sm" label="Renombrar (F2)" onClick={p.onStartRename}><IconPencil size={13} /></IconButton>
      <IconButton size="sm" label={p.entry.archived ? "Recuperar" : "Archivar"} onClick={() => library.setArchived(p.entry.id, !p.entry.archived)}>
        {p.entry.archived ? <IconArchiveOff size={13} /> : <IconArchive size={13} />}
      </IconButton>
    </span>
  ) : null;

  if (p.layout === "list") {
    return (
      <div {...common}>
        <span className="drow__name">
          {isFolder ? <IconFolder size={16} className="dentry__ficon" /> : <IconMovie size={16} className="sf-faint" />}
          {name}
          {p.place ? <span className="sf-faint sf-small">· {p.place}</span> : null}
        </span>
        <span>{isFolder ? <span className="sf-faint sf-small">{meta}</span> : <Progress s={s} compact />}</span>
        <span>{s?.members.length ? <AvatarStack names={s.members} size={18} max={3} /> : null}</span>
        <span className="sf-faint sf-small">{ago(s?.updatedAt ?? p.entry.updatedAt)}</span>
        {actions}
      </div>
    );
  }

  return (
    <div {...common}>
      {isFolder ? (
        <div className="dcard__folder"><IconFolder size={40} stroke={1.2} /></div>
      ) : (
        <div className="dcard__thumb">
          {s?.thumbUrl ? <img src={s.thumbUrl} alt="" /> : <span className="dcard__initials">{initials(p.entry.name)}</span>}
          {s?.format ? <span className="dcard__format">{s.format}</span> : null}
        </div>
      )}
      <div className="dcard__body">
        {name}
        {p.place ? <span className="sf-faint sf-small">{p.place}</span> : null}
        {isFolder ? <span className="sf-faint sf-small">{meta}</span> : (
          <>
            <Progress s={s} />
            <div className="dcard__foot sf-small">
              <span className="sf-muted">{meta}</span>
              <span className="dash__spacer" />
              {s?.members.length ? <AvatarStack names={s.members} size={18} max={3} /> : null}
            </div>
            <span className="sf-faint sf-small">Modificado {ago(s?.updatedAt ?? p.entry.updatedAt)}</span>
          </>
        )}
      </div>
      {actions}
    </div>
  );
}

function Progress({ s, compact }: { s?: ProductionSummary; compact?: boolean }) {
  if (!s || !s.units) return <span className={cx("dprog", compact && "dprog--compact")}><span className="dprog__empty" /></span>;
  return (
    <span className={cx("dprog", compact && "dprog--compact")} title={s.byStatus.map((b) => `${b.name}: ${b.count}`).join(" · ")}>
      {s.byStatus.map((b) => <span key={b.name} style={{ flexGrow: b.count, background: b.color }} />)}
    </span>
  );
}

function RenameField({ initial, onDone }: { initial: string; onDone: (name: string) => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  return (
    <input
      ref={ref}
      className="sf-input dentry__rename"
      value={v}
      autoFocus
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v.trim() || initial)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onDone(v.trim() || initial);
        if (e.key === "Escape") onDone(initial);
      }}
    />
  );
}

const initials = (name: string) =>
  name.split(/[\s·\-_]+/).filter((w) => /[A-Za-zÀ-ÿ0-9]/.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
function ago(ms: number): string {
  const s = (ms - Date.now()) / 1000;
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [u, n] of units) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  return "ahora mismo";
}
