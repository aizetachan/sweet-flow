import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from "react";
import { IconCopy, IconDownload, IconLink, IconNote, IconArrowBackUp, IconArrowLeft, IconPencil, IconStack2, IconExternalLink, IconMessageCircle, IconPlus, IconFilter, IconSearch, IconTrash, IconLayoutGrid, IconLayoutList, IconX } from "@tabler/icons-react";
import {
  childrenOf,
  codeOf,
  descendantsOf,
  isUnit,
  levelIndex,
  byPosition,
  sortValue,
  takeDuration,
  type Id,
  type ProdNode,
  type ShotGroup,
  type StatusDef,
} from "@sweetflow/domain";
import { AvatarStack, Button, cx, IconButton, Pill, Segmented } from "@sweetflow/ui";
import { useSnap, useStore, type CardSize } from "../state/store";
import { countsOf, coverOf, durationOf, filtersActive, matches, memberName, presenceAt, progressOf, statusOf } from "../state/selectors";
import { Thumb, useDuration } from "../components/media";
import { Popover } from "../components/Popover";
import { ContextMenu, type MenuAt } from "../components/ContextMenu";
import { copyMedia, copyShotLink, downloadMedia } from "../data/share";
import { StatusPicker } from "../components/StatusPicker";
import { groupDragProps, nodeDragProps, useNodeDrop, useRowDrop, useUngroupDrop, type RowHint } from "./dnd";
import { ShelfButton } from "./Shelf";

export function Board() {
  const snap = useSnap();
  const { scopeId, cardSize, filters, set } = useStore();
  const p = snap.production;
  const scope = scopeId ? snap.nodes.find((n) => n.id === scopeId) : undefined;
  const roots = scope ? [scope] : childrenOf(snap.nodes, null);
  const units = (scope ? descendantsOf(snap.nodes, scope.id) : snap.nodes).filter((n) => isUnit(p, n));
  const unitName = p.levels[p.levels.length - 1]!.name.toLowerCase();

  return (
    <main className="board">
      <div className="board__head">
        <div className="board__title">
          <h1>{scope ? <><span className="board__code">{codeOf(p, scope)}</span> {scope.title}</> : "Toda la producción"}</h1>
          <span className="board__count" title={`${units.length} ${unitName}${units.length === 1 ? "" : "s"}`}>{units.length}</span>
        </div>
        <div className="board__tools">
          <Segmented<CardSize>
            value={cardSize}
            onChange={(v) => set({ cardSize: v })}
            items={[{ id: "s", label: "S", title: "Cards pequeñas" }, { id: "m", label: "M", title: "Cards medianas" }, { id: "l", label: "L", title: "Cards grandes" }]}
          />
        </div>
      </div>
      <div className={cx("board__body", `cards-${cardSize}`)}>
        {p.levels.length === 1 ? (
          <div className="lane"><div className="lane__cards">{childrenOf(snap.nodes, null).map((n) => <UnitCard key={n.id} node={n} />)}</div></div>
        ) : roots.map((r) => <Group key={r.id} node={r} />)}
        {!scope && !filtersActive(filters) ? <AddBar big={!roots.length} /> : null}
      </div>
    </main>
  );
}

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Next to a sequence's or scene's title: how many shots and how long; the approved ones only if any. */
function HeadInfo({ shots, done, seconds, unit }: { shots: number; done: number; seconds: number; unit: string }) {
  const name = unit.toLowerCase();
  return (
    <span className="sf-faint sf-small">
      {shots} {name}{shots === 1 ? "" : "s"} · {fmtDur(seconds)}
      {done ? <span className="head__done"> · {done} aprobado{done === 1 ? "" : "s"}</span> : null}
    </span>
  );
}

/** Folders above the lane level render as headed groups; the lane level renders lanes. */
function Group({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const p = snap.production;
  const rowLevel = p.levels.length - 2;
  const li = levelIndex(p, node);
  const filters = useStore((s) => s.filters);
  const createRow = useCreateRow();
  const trashNodes = useStore((s) => s.trashNodes);
  const [folded, toggleFold] = useFold(node.id);
  if (li === rowLevel) return <Lane row={node} />;
  const kids = childrenOf(snap.nodes, node.id);
  const prog = progressOf(snap, node);
  const childLevel = p.levels[li + 1]!;
  return (
    <section className="group">
      <GroupHead node={node} onToggle={toggleFold} folded={folded}>
        <span className="group__code">{codeOf(p, node)}</span>
        <InlineEdit className="group__title" value={node.title} placeholder="Sin título" label="Doble clic para cambiar el título"
          onSave={(title) => useStore.getState().source.updateNode(node.id, { title })} />
        <HeadInfo shots={prog.total} done={prog.done} seconds={durationOf(snap, node)} unit={p.levels.at(-1)!.name} />
        <span className="group__spacer" />
        {!filtersActive(filters) ? (
          <Button size="sm" variant="ghost" title={`Nueva ${childLevel.name.toLowerCase()} al final de ${codeOf(p, node)}`} onClick={() => createRow(node.id)}>
            <IconPlus size={14} /> {childLevel.name}
          </Button>
        ) : null}
        <IconButton size="sm" className="head__del" label={`Mover ${codeOf(p, node)} y su contenido a la papelera`} onClick={() => trashNodes([node.id])}><IconTrash size={14} /></IconButton>
      </GroupHead>
      {folded ? null : kids.map((k) => <Group key={k.id} node={k} />)}
      {/* Never empty: with nothing inside yet, the "+" card that starts its first scene with its first shot. */}
      {!folded && !kids.length && !filtersActive(filters) ? <EmptyRow parent={node} /> : null}
    </section>
  );
}

/**
 * Creates a node under `parentId` and, down to the row level, its first child
 * (a new sequence comes with its first scene), then selects the row.
 */
function useCreateRow(): (parentId: Id | null) => Id {
  const snap = useSnap();
  const { source, select } = useStore();
  return (parentId) => {
    const p = snap.production;
    const rowLevel = p.levels.length - 2;
    const parent = parentId ? snap.nodes.find((n) => n.id === parentId) : undefined;
    let li = parent ? levelIndex(p, parent) + 1 : 0;
    let id = source.createNode(parentId, "");
    for (; li < rowLevel; li++) id = source.createNode(id, "");
    select(id);
    return id;
  };
}

/** Square "+" at the end of the board: a new top-level node (a sequence, with its first scene). */
function AddBar({ big }: { big?: boolean }) {
  const snap = useSnap();
  const createRow = useCreateRow();
  const p = snap.production;
  const name = p.levels[0]!.name.toLowerCase();
  const label = big ? `Crear la primera ${name}` : `Nueva ${name}`;
  return (
    <div className={cx("addbar", big && "addbar--big")}>
      {big ? <p className="sf-muted">La producción está vacía. Empieza por la primera {name}: dentro irán sus {p.levels[1]?.name.toLowerCase() ?? "elementos"}s.</p> : null}
      <button className="addbar__btn" title={label} aria-label={label} onClick={() => createRow(null)}>
        <IconPlus size={18} stroke={1.6} />
      </button>
    </div>
  );
}

function GroupHead({ node, children, onToggle, folded }: { node: ProdNode; children: ReactNode; onToggle: (e: ReactMouseEvent) => void; folded?: boolean }) {
  const drop = useNodeDrop(node, "y", true);
  return (
    <div className={cx("group__head", folded && "group__head--folded", drop.zone && `dnd-${drop.zone}`)} {...nodeDragProps(node.id)} {...drop.props} onClick={(e) => { if (!isControl(e.target)) onToggle(e); }}>
      {children}
    </div>
  );
}

/** A click on a header folds it, except on what the header holds (buttons, the status, a title being edited…). */
function isControl(t: EventTarget): boolean {
  return !!(t as HTMLElement).closest("button, input, select, textarea, label, a, .picker, .pop, .menu, .inline-edit__in");
}

/**
 * Folded sequences and scenes of the board (docs/INTERFAZ.md §2), remembered
 * per production in this browser.
 */
function useFold(id: Id): [boolean, (e?: ReactMouseEvent) => void] {
  const productionId = useStore((s) => s.productionId);
  const key = `sweetflow:fold:${productionId}`;
  const read = (): Id[] => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]") as Id[];
    } catch {
      return [];
    }
  };
  const [folded, setFolded] = useState(() => read().includes(id));
  const flip = () => {
    const next = !folded;
    setFolded(next);
    try {
      const ids = new Set(read());
      if (next) ids.add(id);
      else ids.delete(id);
      localStorage.setItem(key, JSON.stringify([...ids]));
    } catch {
      // Only a convenience.
    }
  };
  // A click folds a moment later, so a double click (renaming the title) does not fold and unfold.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toggle = (e?: ReactMouseEvent) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (e && e.detail > 1) return;
    timer.current = setTimeout(flip, 220);
  };
  return [folded, toggle];
}

function Lane({ row }: { row: ProdNode }) {
  const snap = useSnap();
  const { filters, trashNodes } = useStore();
  const [folded, toggleFold] = useFold(row.id);
  const p = snap.production;
  const all = childrenOf(snap.nodes, row.id);
  const active = filtersActive(filters);
  const units = active ? all.filter((u) => matches(snap, u, filters)) : all;
  const unitLevel = p.levels[levelIndex(p, row) + 1]!;
  const st = statusOf(snap, row);
  const viewers = presenceAt(snap, row.id);
  const headDrop = useNodeDrop(row, "y");

  // Groups of shots (§2.4): a card each in the row; open, the row shows what is inside.
  const groups = snap.groups.filter((g) => g.parentId === row.id && all.some((u) => u.groupId === g.id));
  const [openId, setOpenId] = useState<Id | null>(null);
  const selectedId = useStore((s) => s.selectedId);
  useEffect(() => {
    const sel = all.find((u) => u.id === selectedId);
    if (sel?.groupId && groups.some((g) => g.id === sel.groupId)) setOpenId(sel.groupId);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = groups.find((g) => g.id === openId);
  // All the cards visible, wrapping to the width, instead of one scrolling row (remembered per scene).
  const [wrap, setWrapState] = useState(() => readWrap(row.id));
  const setWrap = (v: boolean) => { setWrapState(v); writeWrap(row.id, v); };
  const box = useRef<HTMLDivElement>(null);
  const cols = useColumns(box, wrap);
  const rowDrop = useRowDrop(row.id, open?.id ?? null);
  const hintOf = (key: string) => (rowDrop.hint?.key === key ? rowDrop.hint.zone : undefined);
  // After every hook: a row left empty by the filters is hidden.
  if (active && !units.length) return null;
  const inGroup = (u: ProdNode) => !!u.groupId && groups.some((g) => g.id === u.groupId);
  const items: Array<{ key: string; at: number; el: ReactNode }> = active
    ? units.map((u) => ({ key: u.id, at: 0, el: <UnitCard key={u.id} node={u} inRow hint={hintOf(`n:${u.id}`)} /> }))
    : open
      ? units.filter((u) => u.groupId === open.id).map((u) => ({ key: u.id, at: 0, el: <UnitCard key={u.id} node={u} inRow hint={hintOf(`n:${u.id}`)} /> }))
      : [
          ...units.filter((u) => !inGroup(u)).map((u) => ({ key: u.id, at: sortValue(u), el: <UnitCard key={u.id} node={u} inRow hint={hintOf(`n:${u.id}`)} /> })),
          ...groups.map((g) => ({ key: g.id, at: g.order, el: <GroupCard key={g.id} group={g} hint={hintOf(`g:${g.id}`)} onOpen={() => setOpenId(g.id)} /> })),
        ].sort((a, b) => a.at - b.at);

  const grid = wrap && cols > 0 && items.length + 1 > cols;
  return (
    <section className="lane">
      <div className={cx("lane__head", folded && "lane__head--folded", headDrop.zone && `dnd-${headDrop.zone}`)} {...nodeDragProps(row.id)} {...headDrop.props}
        onClick={(e) => { if (!isControl(e.target)) toggleFold(e); }}>
        <span className="lane__code">{codeOf(p, row)}</span>
        <InlineEdit className="lane__title" value={row.title} placeholder="Sin título" label="Doble clic para cambiar el título"
          onSave={(title) => useStore.getState().source.updateNode(row.id, { title })} />
        <Pill color={st.color}>{st.name}</Pill>
        <HeadInfo shots={all.length} done={all.filter((u) => statusOf(snap, u).category === "done").length} seconds={durationOf(snap, row)} unit={unitLevel.name} />
        {viewers.length ? <AvatarStack names={viewers} size={18} /> : null}
        {/* Trash right after the info, shown on hover; the row's own buttons stay on the right. */}
        <IconButton size="sm" className="head__del" label={`Mover ${codeOf(p, row)} y sus ${unitLevel.name.toLowerCase()}s a la papelera`} onClick={() => trashNodes([row.id])}><IconTrash size={14} /></IconButton>
        <div className="lane__spacer" />
        <Button size="sm" variant="ghost" className={cx(wrap && "is-on")} title={wrap ? "Volver a una sola fila con scroll" : "Ver todos los planos: la fila se adapta al ancho y baja de línea"} onClick={() => setWrap(!wrap)}>
          {wrap ? <IconLayoutList size={14} /> : <IconLayoutGrid size={14} />} {wrap ? "En fila" : "Ver todos"}
        </Button>
        <ShelfButton row={row} />
      </div>
      {folded ? null : <>
      {open && !active ? <GroupBar group={open} row={row} count={units.filter((u) => u.groupId === open.id).length} onClose={() => setOpenId(null)} /> : null}
      {/* Wrapped only when they don't all fit in one row: then the columns fill the width exactly. */}
      <div ref={box} className={cx("lane__cards", grid && "lane__cards--wrap")} onScroll={showScrollbar}
        style={grid ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined} {...rowDrop.props}>
        {items.map((i) => i.el)}
        {!active ? <AddCard row={row} groupId={open?.id} hint={hintOf("end")} /> : null}
      </div>
      </>}
    </section>
  );
}

/**
 * Columns for «Ver todos»: as many cards of the chosen size (S, M, L) as fit
 * the row's width, rounded to the nearest, so they stretch or shrink a little
 * and fill it with nothing left over on the right.
 */
function useColumns(ref: RefObject<HTMLDivElement>, on: boolean): number {
  const [cols, setCols] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!on || !el) return setCols(0);
    const measure = () => {
      const style = getComputedStyle(el);
      const card = parseFloat(style.getPropertyValue("--card")) || 268;
      const gap = parseFloat(style.columnGap) || 10;
      const width = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setCols(Math.max(1, Math.round((width + gap) / (card + gap))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // The card size lives on the board: changing S/M/L changes the class there.
    const mo = new MutationObserver(measure);
    const board = el.closest(".board__body");
    if (board) mo.observe(board, { attributes: true, attributeFilter: ["class"] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [ref, on]);
  return cols;
}

/** While a row scrolls, its scrollbar shows; a moment after it stops, it hides again. */
const scrollTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
function showScrollbar(e: { currentTarget: HTMLElement }): void {
  const el = e.currentTarget;
  el.classList.add("is-scrolling");
  clearTimeout(scrollTimers.get(el));
  scrollTimers.set(el, setTimeout(() => el.classList.remove("is-scrolling"), 900));
}

const WRAP_KEY = "sweetflow:board:wrap";
function readWrap(rowId: Id): boolean {
  try {
    return (JSON.parse(localStorage.getItem(WRAP_KEY) ?? "[]") as Id[]).includes(rowId);
  } catch {
    return false;
  }
}
function writeWrap(rowId: Id, on: boolean): void {
  try {
    const ids = new Set(JSON.parse(localStorage.getItem(WRAP_KEY) ?? "[]") as Id[]);
    if (on) ids.add(rowId);
    else ids.delete(rowId);
    localStorage.setItem(WRAP_KEY, JSON.stringify([...ids]));
  } catch {
    // Only a convenience: without storage it just isn't remembered.
  }
}

/** The row of an empty sequence: the "+" card, which makes its first scene and, in it, its first shot. */
function EmptyRow({ parent }: { parent: ProdNode }) {
  const snap = useSnap();
  const createRow = useCreateRow();
  const { source, select } = useStore();
  const p = snap.production;
  const shot = p.levels.at(-1)!.name.toLowerCase();
  const label = `Nuevo ${shot} en ${codeOf(p, parent)}`;
  return (
    <section className="lane">
      <div className="lane__cards">
        <button className="card card--add" title={label} aria-label={label} onClick={() => select(source.createNode(createRow(parent.id), ""))}>
          <span className="card__ghost" aria-hidden>
            <span className="thumb" />
            <span className="card__meta"><span className="card__code">SH</span><Pill color="transparent">·</Pill></span>
            <span className="card__title">·</span>
          </span>
          <IconPlus size={24} stroke={1.5} className="card__plus" />
        </button>
      </div>
    </section>
  );
}

/** "+" at the end of a row: a new shot in that scene (the row grows to the right). */
function AddCard({ row, groupId, hint }: { row: ProdNode; groupId?: Id; hint?: RowHint["zone"] }) {
  const snap = useSnap();
  const { source, select } = useStore();
  const p = snap.production;
  const g = groupId ? snap.groups.find((x) => x.id === groupId) : undefined;
  const label = `Nuevo ${p.levels[levelIndex(p, row) + 1]!.name.toLowerCase()} en ${g ? `«${g.name}»` : codeOf(p, row)}`;
  return (
    <button className={cx("card card--add", hint && `dnd-${hint}`)} data-row-item="end" title={label} aria-label={label} onClick={() => {
      const id = source.createNode(row.id, "");
      if (groupId) source.groupShots([id], { groupId });
      select(id);
    }}>
      {/* Same insides as a shot card, invisible: it always has a card's size and ratio. */}
      <span className="card__ghost" aria-hidden>
        <span className="thumb" />
        <span className="card__meta"><span className="card__code">SH</span><Pill color="transparent">·</Pill></span>
        <span className="card__title">·</span>
      </span>
      <IconPlus size={24} stroke={1.5} className="card__plus" />
    </button>
  );
}

/** `inRow`: its row handles drops (§2.1, §2.4); `hint` says where a drop would land. */
function UnitCard({ node, inRow, hint }: { node: ProdNode; inRow?: boolean; hint?: RowHint["zone"] }) {
  const snap = useSnap();
  const { selectedId, multi, select, toggleMulti, focusPopped } = useStore();
  const apart = useStore((s) => s.popped.some((w) => w.nodeId === node.id));
  // Only a production with a single level has no rows: there the card takes drops itself.
  const drop = useNodeDrop(node, "x");
  const zone = inRow ? hint : drop.zone;
  const p = snap.production;
  const c = countsOf(snap, node);
  const cover = coverOf(snap, node);
  const viewers = presenceAt(snap, node.id);
  const source = useStore((s) => s.source);
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [rename, setRename] = useState(0);
  // Right click on one of several selected cards acts on all of them.
  const targets = multi.includes(node.id) ? multi : [node.id];

  return (
    <>
    <div
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }}
      className={cx("card", selectedId === node.id && "card--on", multi.includes(node.id) && "card--multi", viewers.length > 0 && "card--watched", zone && `dnd-${zone}`)}
      data-row-item={`n:${node.id}`}
      {...nodeDragProps(node.id)}
      draggable={!editing}
      {...(inRow ? {} : drop.props)}
      onClick={(e) => (e.metaKey || e.ctrlKey || e.shiftKey ? toggleMulti(node.id) : select(node.id, "produce"))}
    >
      {/* The length goes under the status, not on the cover. */}
      <Thumb {...cover} preview badge={false} />
      {/* The title carries the weight (it is how a shot is found); the code goes under it. */}
      <div className="card__meta">
        <InlineEdit className="card__name" value={node.title} placeholder="Sin título" label="Doble clic para escribir el título"
          onEditing={setEditing} startSignal={rename} onSave={(title) => source.updateNode(node.id, { title })} />
        {/* The status changes right here: a click opens the list (the card is not selected). */}
        <span className="card__status" draggable={false} onClick={(e) => e.stopPropagation()} onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <StatusPicker floating statuses={p.statuses} value={node.statusId} onChange={(id) => source.updateNode(node.id, { statusId: id })}
            onEdit={() => useStore.getState().set({ modal: "statuses" })} />
        </span>
      </div>
      {/* Second line: code and who is on it on the left; notes and length on the right. No third line. */}
      <div className="card__row">
        <span className="card__title card__codeline">{codeOf(p, node)}</span>
        {node.assigneeIds.length ? <AvatarStack names={node.assigneeIds.map((u) => memberName(snap, u))} size={16} max={2} /> : null}
        {c.comments ? <span className="card__comments"><IconMessageCircle size={12} /> {c.comments}</span> : null}
        {apart ? (
          <button className="apart" title="Abierto en una ventana aparte: ir a la ventana" onClick={(e) => { e.stopPropagation(); focusPopped(node.id); }}>
            <IconExternalLink size={12} />
          </button>
        ) : null}
        {viewers.length ? <span className="card__live" title={`${viewers.join(", ")} está aquí`}><AvatarStack names={viewers} size={16} /></span> : null}
        <span className="card__spacer" />
        {/* It has notes: the icon says so, and opens them without the panel. */}
        {node.notes.trim() ? (
          <button className="card__note" title={node.notes} aria-label="Ver las notas" draggable={false}
            onClick={(e) => { e.stopPropagation(); useStore.getState().set({ modal: "notes", notesFor: node.id }); }}>
            <IconNote size={13} />
          </button>
        ) : null}
        <CardLength cover={cover} />
      </div>
    </div>
    {menu ? <ShotMenu at={menu} node={node} targets={targets} onRename={() => setRename((n) => n + 1)} onClose={() => setMenu(null)} /> : null}
    </>
  );
}

/** Most mini covers a group card shows; the last one says how many more there are. */
const GROUP_TILES = 4;

/** The status in a menu, as in the work panel: the label, and a click opens the list. Mixed: "Varios". */
function StatusRow({ statuses, current, onPick, label = "Estado" }: { statuses: StatusDef[]; current: Id | null; onPick: (id: Id) => void; label?: string }) {
  return (
    <div className="ctxmenu__status">
      <span className="sf-muted sf-small">{label}</span>
      <StatusPicker floating statuses={statuses} value={current} placeholder={current ? undefined : "Varios"} onChange={onPick}
        onEdit={() => useStore.getState().set({ modal: "statuses" })} />
    </div>
  );
}

/** Right-click menu of shot cards: status, title, open apart, trash (§2). */
function ShotMenu({ at, node, targets, onRename, onClose }: { at: MenuAt; node: ProdNode; targets: Id[]; onRename: () => void; onClose: () => void }) {
  const snap = useSnap();
  const { source, trashNodes, popOut } = useStore();
  const p = snap.production;
  const many = targets.length > 1;
  const nodes = targets.map((id) => snap.nodes.find((n) => n.id === id)).filter((n): n is ProdNode => !!n);
  const same = nodes.every((n) => n.statusId === nodes[0]?.statusId) ? nodes[0]?.statusId ?? null : null;
  // What the shot is now: its chosen version (or its latest).
  const media = coverOf(snap, node).media;
  return (
    <ContextMenu at={at} onClose={onClose}>
      <div className="menu__title">{many ? `Menú · ${targets.length} planos` : "Menú"}</div>
      <StatusRow statuses={p.statuses} current={same} onPick={(id) => { for (const n of nodes) source.updateNode(n.id, { statusId: id }); }} />
      <div className="menu__sep" />
      {!many ? (
        <>
          <button className="menu__item" onClick={onRename}><IconPencil size={14} /> <span className="menu__label">Cambiar el título</span></button>
          <button className="menu__item" onClick={() => popOut(node.id)}><IconExternalLink size={14} /> <span className="menu__label">Abrir en ventana aparte</span></button>
          <div className="menu__sep" />
          {media ? (
            <>
              <button className="menu__item" onClick={() => void copyMedia(node, media)}>
                <IconCopy size={14} /> <span className="menu__label">{media.kind === "image" ? "Copiar imagen" : media.kind === "audio" ? "Copiar audio" : "Copiar vídeo"}</span>
              </button>
              <button className="menu__item" onClick={() => downloadMedia(node, media)}><IconDownload size={14} /> <span className="menu__label">Descargar</span></button>
            </>
          ) : null}
          <button className="menu__item" onClick={() => copyShotLink(node, media)}>
            <IconLink size={14} /> <span className="menu__label">Copiar enlace</span>
          </button>
          <div className="menu__sep" />
        </>
      ) : null}
      <button className="menu__item menu__item--danger" onClick={() => trashNodes(targets)}>
        <IconTrash size={14} /> <span className="menu__label">{many ? `Mover los ${targets.length} a la papelera` : "Mover a la papelera"}</span>
      </button>
    </ContextMenu>
  );
}

/** Right-click menu of group cards: the status of all its shots, its name, undo it, or trash it with its shots. */
function GroupMenu({ at, group, shots, onRename, onOpen, onClose }: { at: MenuAt; group: ShotGroup; shots: ProdNode[]; onRename: () => void; onOpen: () => void; onClose: () => void }) {
  const snap = useSnap();
  const { source, trashNodes } = useStore();
  const same = shots.every((n) => n.statusId === shots[0]?.statusId) ? shots[0]?.statusId ?? null : null;
  return (
    <ContextMenu at={at} onClose={onClose}>
      <div className="menu__title">Menú</div>
      <StatusRow label="Estado de sus planos" statuses={snap.production.statuses} current={same} onPick={(id) => { for (const n of shots) source.updateNode(n.id, { statusId: id }); }} />
      <div className="menu__sep" />
      <button className="menu__item" onClick={onRename}><IconPencil size={14} /> <span className="menu__label">Cambiar el nombre</span></button>
      <button className="menu__item" onClick={onOpen}><IconStack2 size={14} /> <span className="menu__label">Abrir el grupo</span></button>
      <button className="menu__item" onClick={() => source.dissolveGroup(group.id)}><IconArrowBackUp size={14} /> <span className="menu__label">Deshacer el grupo</span></button>
      <button className="menu__item menu__item--danger" onClick={() => trashNodes(shots.map((s) => s.id))}>
        <IconTrash size={14} /> <span className="menu__label">Mover a la papelera</span>
      </button>
    </ContextMenu>
  );
}

/** The length of a shot's video, under its status: its stretch, or the whole clip; N/A for an image. */
function CardLength({ cover }: { cover: ReturnType<typeof coverOf> }) {
  const clip = useDuration(cover.media);
  const media = cover.media;
  const label = !media ? "—" : media.kind === "image" ? "N/A" : cover.take ? `${takeDuration(cover.take)}s` : clip || media.durationSec ? `${clip || media.durationSec}s` : "—";
  const title = !media ? "Aún no tiene vídeo" : media.kind !== "video" ? "Es una imagen: no aplica" : "Duración del vídeo";
  return <span className="card__len" title={title}>{label}</span>;
}

/**
 * A group of shots in the row: a normal card with the covers of its shots
 * in small, each 16:9 like a shot's (up to four; "+N" on the last when there
 * are more), its name and how many shots. Click to open; drop shots on it to add them.
 */
function GroupCard({ group, hint, onOpen }: { group: ShotGroup; hint?: RowHint["zone"]; onOpen: () => void }) {
  const snap = useSnap();
  const shots = snap.nodes.filter((n) => n.groupId === group.id && n.parentId === group.parentId).sort(byPosition);
  const source = useStore((s) => s.source);
  const [editing, setEditing] = useState(false);
  // A click opens the group, a bit later, so a double click on the name can rename it instead.
  const opening = useRef<ReturnType<typeof setTimeout> | null>(null);
  const more = shots.length > GROUP_TILES ? shots.length - (GROUP_TILES - 1) : 0;
  const tiles = shots.slice(0, GROUP_TILES);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [rename, setRename] = useState(0);
  return (
    <>
    <div onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }); }} className={cx("card card--group", hint && `dnd-${hint === "into" ? "group" : hint}`)} data-row-item={`g:${group.id}`} {...groupDragProps(group.id)} draggable={!editing} onClick={(e) => {
      // The second click of a double click waits for the rename instead.
      if (editing || e.detail > 1) return;
      if (opening.current) clearTimeout(opening.current);
      opening.current = setTimeout(onOpen, 220);
    }} title={`Abrir «${group.name}»`}>
      <div className={`gmosaic gmosaic--${tiles.length}`}>
        {tiles.map((s, i) => (
          <div key={s.id} className="gmosaic__tile" title={codeOf(snap.production, s)}>
            <Thumb {...coverOf(snap, s)} preview badge={false} />
            {more && i === tiles.length - 1 ? <span className="gmosaic__more">+{more}</span> : null}
          </div>
        ))}
      </div>
      <div className="card__meta">
        <span className="card__code"><IconStack2 size={12} />
          <InlineEdit value={group.name} placeholder="Grupo" label="Doble clic para cambiar el nombre" onEditing={setEditing} startSignal={rename}
            onStart={() => { if (opening.current) clearTimeout(opening.current); }} onSave={(name) => source.renameGroup(group.id, name)} />
        </span>
        <span className="sf-faint sf-small">{shots.length} plano{shots.length === 1 ? "" : "s"}</span>
      </div>
    </div>
    {menu ? <GroupMenu at={menu} group={group} shots={shots} onRename={() => setRename((n) => n + 1)} onOpen={onOpen} onClose={() => setMenu(null)} /> : null}
    </>
  );
}

/** Bar of an open group: back to the row (drop shots there to take them out), name, undo the group. */
function GroupBar({ group, row, count, onClose }: { group: ShotGroup; row: ProdNode; count: number; onClose: () => void }) {
  const snap = useSnap();
  const { source } = useStore();
  const out = useUngroupDrop(group.id);
  const [name, setName] = useState<string | null>(null);
  const save = () => {
    if (name !== null) source.renameGroup(group.id, name);
    setName(null);
  };
  return (
    <div className="lane__group">
      <button className={cx("lane__back", out.over && "dnd-group")} {...out.props} onClick={onClose} title={`Volver a ${codeOf(snap.production, row)}. Suelta aquí un plano para sacarlo del grupo.`}>
        <IconArrowLeft size={14} /> {codeOf(snap.production, row)}
      </button>
      <IconStack2 size={14} className="sf-faint" />
      {name === null ? (
        <button className="lane__gname" title="Cambiar el nombre" onClick={() => setName(group.name)}>{group.name}</button>
      ) : (
        <input className="sf-input lane__gname-in" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setName(null); }} />
      )}
      <span className="sf-faint sf-small">{count} plano{count === 1 ? "" : "s"} · arrastra un plano a «{codeOf(snap.production, row)}» para sacarlo</span>
      <span className="lane__spacer" />
      <Button size="sm" variant="ghost" title="Los planos vuelven a la fila; el grupo desaparece" onClick={() => { source.dissolveGroup(group.id); onClose(); }}>Deshacer grupo</Button>
    </div>
  );
}

/**
 * Text that becomes an input on double click (Enter or leaving saves,
 * Escape cancels). Used for a card's title and a group's name.
 */
export function InlineEdit({ value, placeholder, label, className, onSave, onEditing, onStart, startSignal }: {
  value: string;
  placeholder: string;
  label: string;
  className?: string;
  onSave: (v: string) => void;
  onEditing?: (on: boolean) => void;
  onStart?: () => void;
  /** Changing it (to anything but 0) starts editing, as a double click would: from a menu. */
  startSignal?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (!startSignal) return;
    onStart?.();
    setDraft(value);
    onEditing?.(true);
  }, [startSignal]); // eslint-disable-line react-hooks/exhaustive-deps
  const begin = (e: ReactMouseEvent) => {
    e.stopPropagation();
    onStart?.();
    setDraft(value);
    onEditing?.(true);
  };
  const end = (save: boolean) => {
    if (save && draft !== null && draft.trim() !== value) onSave(draft.trim());
    setDraft(null);
    onEditing?.(false);
  };
  if (draft === null) {
    // Long text is cut with "…"; resting the mouse on it shows it whole.
    return <span className={cx("inline-edit", className)} title={value || label} onDoubleClick={begin}>{value || <span className="sf-faint">{placeholder}</span>}</span>;
  }
  return (
    <input className={cx("inline-edit__in", className)} autoFocus value={draft} placeholder={placeholder}
      onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)} onBlur={() => end(true)}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") end(true); if (e.key === "Escape") end(false); }} />
  );
}

/** What the info button shows: counts per level, approved, edited length, per status. */
export function ProductionInfo({ scopeId }: { scopeId: Id | null }) {
  const snap = useSnap();
  const p = snap.production;
  const inScope = scopeId ? [snap.nodes.find((n) => n.id === scopeId)!, ...descendantsOf(snap.nodes, scopeId)] : snap.nodes;
  const units = inScope.filter((n) => isUnit(p, n));
  const done = units.filter((u) => statusOf(snap, u).category === "done").length;
  const roots = scopeId ? inScope.slice(0, 1) : childrenOf(snap.nodes, null);
  const total = roots.reduce((a, r) => a + durationOf(snap, r), 0);
  const statuses = [...p.statuses].filter((s) => !s.archived).sort((a, b) => a.order - b.order);
  const plural = (n: number, name: string) => `${name}${n === 1 ? "" : "s"}`;
  return (
    <div className="pinfo">
      <div className="menu__title">{scopeId ? "Esta parte" : "La producción"}</div>
      {p.levels.map((l) => {
        const n = inScope.filter((x) => x.levelId === l.id).length;
        return <div key={l.id} className="pinfo__row"><span>{plural(n, l.name)}</span><strong>{n}</strong></div>;
      })}
      <div className="pinfo__row"><span>Aprobados</span><strong>{done} de {units.length}</strong></div>
      <span className="board__bar pinfo__bar"><span style={{ width: `${units.length ? (done / units.length) * 100 : 0}%` }} /></span>
      <div className="pinfo__row"><span>Montado</span><strong>{fmtDur(total)}</strong></div>
      {units.length ? (
        <>
          <div className="menu__title">Por estado</div>
          {statuses.map((st) => {
            const n = units.filter((u) => u.statusId === st.id).length;
            return n ? <div key={st.id} className="pinfo__row"><span><span className="sf-pill__dot" style={{ background: st.color }} /> {st.name}</span><strong>{n}</strong></div> : null;
          })}
        </>
      ) : null}
    </div>
  );
}

/** Search and filters of the board, in the top bar: one field, with the filter button inside it. */
export function BoardFilters() {
  const snap = useSnap();
  const { filters, setFilters } = useStore();
  const statuses = snap.production.statuses.filter((s) => !s.archived).sort((a, b) => a.order - b.order);
  const active = filters.statusIds.length + (filters.assigneeId ? 1 : 0) + (filters.assetId ? 1 : 0);
  return (
    <div className="filters__search tfilters">
      <IconSearch size={14} />
      <input placeholder="Buscar planos, notas…" value={filters.query} onChange={(e) => setFilters({ query: e.target.value })} />
      {filters.query ? <button className="filters__clear" aria-label="Borrar búsqueda" onClick={() => setFilters({ query: "" })}><IconX size={12} /></button> : null}
      <Popover align="right" className="fpanel" button={({ open, toggle }) => (
        <button className={cx("fbtn", (open || active > 0) && "fbtn--on")} title="Filtros" aria-label="Filtros" onClick={toggle}>
          <IconFilter size={14} stroke={1.7} />
          {active ? <span className="fbtn__count">{active}</span> : null}
        </button>
      )}>
        <div className="menu__title">Estado</div>
        <StatusPicker
          statuses={statuses}
          value={filters.statusIds[0] ?? null}
          placeholder="Seleccionar estado"
          onChange={(id) => setFilters({ statusIds: [id] })}
          onClear={() => setFilters({ statusIds: [] })}
        />
        <div className="menu__title">Responsable</div>
        <select className="sf-select" value={filters.assigneeId ?? ""} onChange={(e) => setFilters({ assigneeId: e.target.value || null })}>
          <option value="">Cualquiera</option>
          {snap.members.filter((m) => m.role !== "viewer").map((m) => <option key={m.uid} value={m.uid}>{m.displayName}</option>)}
        </select>
        <div className="menu__title">Desglose</div>
        <select className="sf-select" value={filters.assetId ?? ""} onChange={(e) => setFilters({ assetId: e.target.value || null })}>
          <option value="">Reparto, props, localización…</option>
          {snap.assets.filter((a) => a.type !== "style").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {active ? (
          <button className="link sf-small fpanel__clear" onClick={() => setFilters({ statusIds: [], assigneeId: null, assetId: null })}>Quitar filtros</button>
        ) : null}
      </Popover>
    </div>
  );
}
