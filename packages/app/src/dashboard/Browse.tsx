/**
 * Dashboard sections that list entries: Inicio (browse folders), Recientes,
 * and Papelera. Click selects (⌘/Ctrl adds), double click opens,
 * drag onto a folder, a breadcrumb or a side-menu folder moves.
 */

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  IconArrowBackUp,
  IconChevronRight,
  IconClock,
  IconFolder,
  IconFolderPlus,
  IconHome,
  IconLayoutGrid,
  IconList,
  IconMovie,
  IconPencil,
  IconDots,
  IconLink,
  IconFolderOpen,
  IconFolderShare,
  IconPin,
  IconPinFilled,
  IconPlus,
  IconSearch,
  IconTrash,
  IconTrashX, IconUserPlus, IconBooks } from "@tabler/icons-react";
import { ContextMenu, type MenuAt } from "../components/ContextMenu";
import { revealEntry } from "../data/reveal";
import { copyEntryLink } from "../data/share";
import type { Id } from "@sweetflow/domain";
import { AvatarStack, Button, cx, IconButton, Segmented } from "@sweetflow/ui";
import { isInTrash, type LibraryEntry, type LibraryState, type ProductionSummary } from "../data/library";
import { useStore, type DashLayout, type DashSection } from "../state/store";

export const DRAG_TYPE = "application/x-sweetflow-entries";

const TITLES: Record<Exclude<DashSection, "settings" | "home" | "team">, { title: string; empty: string; icon: typeof IconClock }> = {
  recent: { title: "Recientes", empty: "Aquí aparecerán las producciones y carpetas que abras.", icon: IconClock },
  trash: { title: "Papelera", empty: "La papelera está vacía.", icon: IconTrash },
};

export function Browse({ lib, section }: { lib: LibraryState; section: Exclude<DashSection, "settings" | "team"> }) {
  const { folderId, dashLayout, set, library, openProduction } = useStore();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Id[]>([]);
  const [renaming, setRenaming] = useState<Id | null>(null);
  useEffect(() => setPicked([]), [section, folderId]);

  const byId = useMemo(() => new Map(lib.entries.map((e) => [e.id, e])), [lib.entries]);
  const alive = (e: LibraryEntry) => !isInTrash(byId, e);
  const trail = useMemo(() => pathTo(byId, folderId), [byId, folderId]);
  // The open folder may vanish (moved to the trash from another window).
  useEffect(() => {
    if (folderId && (!byId.has(folderId) || isInTrash(byId, byId.get(folderId)!))) set({ folderId: null });
  }, [folderId, byId, set]);

  const q = query.trim().toLowerCase();
  const byName = (a: LibraryEntry, b: LibraryEntry) => (a.kind === b.kind ? a.name.localeCompare(b.name, "es") : a.kind === "folder" ? -1 : 1);
  let visible: LibraryEntry[];
  if (section === "trash") {
    visible = lib.entries.filter((e) => e.trashedAt).sort((a, b) => b.trashedAt! - a.trashedAt!);
  } else if (q) {
    visible = lib.entries.filter((e) => alive(e) && e.name.toLowerCase().includes(q)).sort(byName);
  } else if (section === "recent") {
    visible = Object.entries(lib.prefs.opened)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id))
      .filter((e): e is LibraryEntry => !!e && alive(e))
      .slice(0, 30);
  } else {
    visible = lib.entries.filter((e) => e.parentId === folderId && !e.trashedAt).sort(byName);
  }

  const open = (e: LibraryEntry) => {
    if (section === "trash") return;
    if (e.kind === "folder") {
      set({ dashSection: "home", folderId: e.id });
      library.touch(e.id);
      setQuery("");
    } else {
      openProduction(e.id);
    }
  };
  const pick = (id: Id, additive: boolean) => setPicked((cur) => (additive ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
  const editable = lib.mode !== "firebase";
  const showPlace = section !== "home" || !!q;
  const meta = section === "home" ? undefined : TITLES[section];

  return (
    // A click anywhere but on an entry (or its buttons) clears the selection.
    <div className="dash" onClick={(e) => !(e.target as HTMLElement).closest(".dcard, .drow") && setPicked([])}>
      <header className="dash__head">
        {meta ? (
          <h1 className="dash__title"><meta.icon size={20} stroke={1.6} /> {meta.title}</h1>
        ) : (
          <nav className="crumbs crumbs--title" aria-label="Ubicación">
            <Crumb label={<><IconHome size={20} stroke={1.6} /> Inicio</>} onOpen={() => set({ folderId: null })} target={null} />
            {trail.map((f) => (
              <span key={f.id} className="crumbs__item">
                <IconChevronRight size={13} className="sf-faint" />
                <Crumb label={f.name} onOpen={() => set({ folderId: f.id })} target={f.id} />
              </span>
            ))}
          </nav>
        )}
        <span className="dash__spacer" />
        {section === "trash" && visible.length && editable ? <EmptyTrash ids={visible.map((e) => e.id)} /> : null}
      </header>

      {section !== "trash" ? (
        <div className="dash__tools">
          <label className="filters__search dash__search">
            <IconSearch size={14} />
            <input placeholder="Buscar en todas las carpetas…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="dash__spacer" />
          <Segmented<DashLayout>
            value={dashLayout}
            onChange={(v) => set({ dashLayout: v })}
            items={[{ id: "grid", label: <IconLayoutGrid size={14} />, title: "Cuadrícula" }, { id: "list", label: <IconList size={14} />, title: "Lista" }]}
          />
          {editable && section === "home" ? (
            <>
              <Button size="sm" onClick={() => setRenaming(library.createFolder(folderId, "Nueva carpeta"))}><IconFolderPlus size={14} /> Carpeta</Button>
              <Button size="sm" variant="primary" onClick={() => void library.createProduction(folderId, "Nueva producción").then(setRenaming)}><IconPlus size={14} /> Producción</Button>
            </>
          ) : null}
        </div>
      ) : (
        <p className="sf-muted sf-small dash__note">Lo que está en la papelera no aparece en el resto del dashboard. Puedes restaurarlo o eliminarlo definitivamente; no se borra solo.</p>
      )}

      {visible.length ? (
        <div className={cx("dash__items", `dash__items--${section === "trash" ? "list" : dashLayout}`)}>
          {section === "trash" || dashLayout === "list" ? (
            <div className="drow drow--head sf-small sf-faint">
              <span>Nombre</span><span>{section === "trash" ? "Estaba en" : "Progreso"}</span><span>{section === "trash" ? "" : "Equipo"}</span><span>{section === "trash" ? "Eliminado" : section === "recent" ? "Abierto" : "Modificado"}</span><span />
            </div>
          ) : null}
          {visible.map((e) => (
            <EntryItem
              key={e.id}
              entry={e}
              layout={section === "trash" ? "list" : dashLayout}
              section={section}
              summary={lib.summaries[e.id]}
              items={lib.entries.filter((c) => c.parentId === e.id && !c.trashedAt).length}
              place={showPlace ? pathTo(byId, e.parentId).map((f) => f.name).join(" / ") || "Inicio" : undefined}
              when={section === "trash" ? e.trashedAt! : section === "recent" ? lib.prefs.opened[e.id] ?? e.updatedAt : lib.summaries[e.id]?.updatedAt ?? e.updatedAt}
              pinned={lib.prefs.pins.some((x) => x.entryId === e.id && !x.nodeId)}
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
              {meta ? <meta.icon size={30} stroke={1.3} className="sf-faint" /> : <IconFolder size={30} stroke={1.3} className="sf-faint" />}
              <p>{meta ? meta.empty : folderId ? "Esta carpeta está vacía." : "Aún no hay nada aquí."}</p>
              {!meta && editable ? <p className="sf-muted sf-small">Crea una carpeta para agrupar (una serie, una campaña) o una producción para empezar a trabajar.</p> : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyTrash({ ids }: { ids: Id[] }) {
  const library = useStore((s) => s.library);
  const [armed, setArmed] = useArmed();
  return (
    <Button size="sm" className={armed ? "danger" : undefined} onClick={() => (armed ? void library.deleteForever(ids) : setArmed(true))}>
      <IconTrashX size={14} /> {armed ? "Pulsa otra vez para vaciar" : "Vaciar papelera"}
    </Button>
  );
}

/** Two-step destructive actions (no native confirm dialogs). */
function useArmed(): [boolean, (v: boolean) => void] {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return [armed, setArmed];
}

function pathTo(byId: Map<Id, LibraryEntry>, folderId: Id | null): LibraryEntry[] {
  const out: LibraryEntry[] = [];
  for (let cur = folderId ? byId.get(folderId) : undefined; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) out.unshift(cur);
  return out;
}

/** Accepts dragged entries: moves them into `target` (null = root). */
export function useDropInto(target: Id | null) {
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
  section: Exclude<DashSection, "settings">;
  summary?: ProductionSummary;
  items: number;
  place?: string;
  when: number;
  pinned: boolean;
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
  const [armed, setArmed] = useArmed();
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const isFolder = p.entry.kind === "folder";
  const inTrash = p.section === "trash";
  const s = p.summary;
  const meta = isFolder ? `${p.items} elemento${p.items === 1 ? "" : "s"}` : s ? `${s.units} planos · ${s.done} aprobados` : "—";
  const canDrop = isFolder && !inTrash;

  const common = {
    className: cx(p.layout === "grid" ? "dcard" : "drow", p.picked && "is-picked", drop.over && canDrop && "is-drop"),
    draggable: p.editable && !p.renaming && !inTrash,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(p.dragIds));
      e.dataTransfer.effectAllowed = "move";
    },
    onClick: (e: React.MouseEvent) => p.onPick(e.metaKey || e.ctrlKey),
    onDoubleClick: p.onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !p.renaming) p.onOpen();
      if (e.key === "F2" && p.editable && !inTrash) p.onStartRename();
    },
    tabIndex: 0,
    onContextMenu: (e: React.MouseEvent) => {
      if (!p.editable) return;
      e.preventDefault();
      // Right click on something not picked picks it, like in Finder.
      if (!p.picked) p.onPick(false);
      setMenu({ x: e.clientX, y: e.clientY });
    },
    ...(canDrop ? drop.props : {}),
  };

  const name = p.renaming ? <RenameField initial={p.entry.name} onDone={p.onRename} /> : <span className="dentry__name" title={p.entry.name}>{p.entry.name}</span>;
  const actions = !p.editable ? null : inTrash ? (
    <span className="dentry__acts dentry__acts--show" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" onClick={() => library.restore([p.entry.id])}><IconArrowBackUp size={13} /> Restaurar</Button>
      <IconButton size="sm" className={armed ? "danger" : undefined} label={armed ? "Pulsa otra vez para eliminar definitivamente" : "Eliminar definitivamente"} onClick={() => (armed ? void library.deleteForever([p.entry.id]) : setArmed(true))}>
        <IconTrashX size={13} />
      </IconButton>
    </span>
  ) : (
    // One «⋯» instead of several icons: it opens the same menu as a right click.
    <span className="dentry__acts" onClick={(e) => e.stopPropagation()}>
      <IconButton size="sm" label="Más opciones" onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setMenu({ x: r.right - 220, y: r.bottom + 4 });
      }}><IconDots size={15} /></IconButton>
    </span>
  );
  const canShare = useStore((s) => !!s.lib?.team?.canInvite);
  const menuEl = menu && p.editable ? (
    <ContextMenu at={menu} onClose={() => setMenu(null)}>
      {inTrash ? (
        <>
          <button className="menu__item" onClick={() => library.restore(p.dragIds)}><IconArrowBackUp size={14} /> <span className="menu__label">Restaurar</span></button>
          <button className="menu__item menu__item--danger" onClick={() => void library.deleteForever(p.dragIds)}><IconTrashX size={14} /> <span className="menu__label">Eliminar definitivamente</span></button>
        </>
      ) : (
        <>
          <button className="menu__item" onClick={p.onOpen}><IconFolderOpen size={14} /> <span className="menu__label">Abrir</span></button>
          <button className="menu__item" onClick={() => void revealEntry(p.entry.id)}><IconFolderShare size={14} /> <span className="menu__label">Mostrar en la carpeta</span></button>
          <button className="menu__item" onClick={() => copyEntryLink(p.entry.id, p.entry.name)}><IconLink size={14} /> <span className="menu__label">Copiar enlace</span></button>
          <button className="menu__item" onClick={() => library.setPinned({ entryId: p.entry.id }, !p.pinned)}>
            {p.pinned ? <IconPinFilled size={14} /> : <IconPin size={14} />} <span className="menu__label">{p.pinned ? "Quitar de Fijados" : "Fijar en el menú lateral"}</span>
          </button>
          <button className="menu__item" onClick={p.onStartRename}><IconPencil size={14} /> <span className="menu__label">Renombrar</span></button>
          {canShare ? (
            <button className="menu__item" onClick={() => useStore.getState().set({ inviteTo: { access: [p.entry.id] } })}><IconUserPlus size={14} /> <span className="menu__label">Compartir con alguien del equipo…</span></button>
          ) : null}
          <div className="menu__sep" />
          <button className="menu__item menu__item--danger" onClick={() => library.trash(p.dragIds)}><IconTrash size={14} /> <span className="menu__label">Mover a la papelera</span></button>
        </>
      )}
    </ContextMenu>
  ) : null;
  const star = p.pinned && !inTrash ? <IconPinFilled size={12} className="dentry__star dentry__star--badge" /> : null;
  // Its library is shared with other productions (docs/INTERFAZ.md §2.8.1), like a Figma file with a library.
  const sharedLib = !isFolder && s?.libraryShare ? (
    <span className="dentry__lib" title={`Comparte su biblioteca${s.libraryGroups ? ` (${s.libraryGroups} ${s.libraryGroups === 1 ? "grupo" : "grupos"})` : ""} con ${s.libraryShare.scope === "all" ? "todo Sweet Flow" : "las producciones de su carpeta"}`}>
      <IconBooks size={13} />
    </span>
  ) : null;

  if (p.layout === "list") {
    return (
      <div {...common}>
        <span className="drow__name">
          {isFolder ? <IconFolder size={16} className="dentry__ficon" /> : <IconMovie size={16} className="sf-faint" />}
          {name}
          {star}
          {sharedLib}
          {p.place && !inTrash ? <span className="sf-faint sf-small">· {p.place}</span> : null}
        </span>
        <span>{inTrash ? <span className="sf-faint sf-small">{p.place}</span> : isFolder ? <span className="sf-faint sf-small">{meta}</span> : <Progress s={s} compact />}</span>
        <span>{!inTrash && s?.members.length ? <AvatarStack names={s.members} size={18} max={3} /> : null}</span>
        <span className="sf-faint sf-small">{ago(p.when)}</span>
        {actions}
        {menuEl}
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
          {sharedLib ? <span className="dcard__lib">{sharedLib}</span> : null}
        </div>
      )}
      <div className="dcard__body">
        <span className="dcard__titlerow">{name}{star}</span>
        {p.place ? <span className="sf-faint sf-small">{p.place}</span> : null}
        {isFolder ? <span className="sf-faint sf-small">{meta}</span> : (
          <>
            <Progress s={s} />
            <div className="dcard__foot sf-small">
              <span className="sf-muted">{meta}</span>
              <span className="dash__spacer" />
              {s?.members.length ? <AvatarStack names={s.members} size={18} max={3} /> : null}
            </div>
            <span className="sf-faint sf-small">{p.section === "recent" ? "Abierto" : "Modificado"} {ago(p.when)}</span>
          </>
        )}
      </div>
      {actions}
      {menuEl}
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
export function ago(ms: number): string {
  const s = (ms - Date.now()) / 1000;
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [u, n] of units) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  return "ahora mismo";
}
