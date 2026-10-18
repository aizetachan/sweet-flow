import { useEffect, useState, type ReactNode } from "react";
import { IconArrowLeft, IconStack2, IconExternalLink, IconMessageCircle, IconPlus, IconFilter, IconInfoCircle, IconSearch, IconTrash, IconWand, IconX } from "@tabler/icons-react";
import {
  childrenOf,
  codeOf,
  descendantsOf,
  isUnit,
  levelIndex,
  levelOf,
  byPosition,
  sortValue,
  type Id,
  type ProdNode,
  type ShotGroup,
} from "@sweetflow/domain";
import { AvatarStack, Button, cx, IconButton, Pill, Segmented } from "@sweetflow/ui";
import { useSnap, useStore, type CardSize } from "../state/store";
import { colorSlot, countsOf, coverOf, durationOf, filtersActive, matches, memberName, presenceAt, progressOf, statusOf } from "../state/selectors";
import { Thumb } from "../components/media";
import { Popover } from "../components/Popover";
import { StatusPicker } from "../components/StatusPicker";
import { nodeDragProps, useEndDrop, useGroupDrop, useNodeDrop, useUngroupDrop } from "./dnd";
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
          <Popover button={({ open, toggle }) => (
            <IconButton size="sm" label="Información de la producción" className={open ? "is-on" : undefined} onClick={toggle}><IconInfoCircle size={17} stroke={1.6} /></IconButton>
          )}>
            <ProductionInfo scopeId={scope?.id ?? null} />
          </Popover>
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

/** Folders above the lane level render as headed groups; the lane level renders lanes. */
function Group({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const p = snap.production;
  const rowLevel = p.levels.length - 2;
  const li = levelIndex(p, node);
  const filters = useStore((s) => s.filters);
  const createRow = useCreateRow();
  const trashNodes = useStore((s) => s.trashNodes);
  if (li === rowLevel) return <Lane row={node} />;
  const kids = childrenOf(snap.nodes, node.id);
  const prog = progressOf(snap, node);
  const childLevel = p.levels[li + 1]!;
  return (
    <section className="group">
      <GroupHead node={node}>
        <span className="group__code">{codeOf(p, node)}</span>
        <span className="group__title">{node.title}</span>
        <span className="sf-faint sf-small">{levelOf(p, node).name} · {prog.done}/{prog.total} aprobados · {fmtDur(durationOf(snap, node))}</span>
        <span className="group__spacer" />
        {!filtersActive(filters) ? (
          <Button size="sm" variant="ghost" title={`Nueva ${childLevel.name.toLowerCase()} al final de ${codeOf(p, node)}`} onClick={() => createRow(node.id)}>
            <IconPlus size={14} /> {childLevel.name}
          </Button>
        ) : null}
        <IconButton size="sm" className="head__del" label={`Mover ${codeOf(p, node)} y su contenido a la papelera`} onClick={() => trashNodes([node.id])}><IconTrash size={14} /></IconButton>
      </GroupHead>
      {kids.map((k) => <Group key={k.id} node={k} />)}
    </section>
  );
}

/**
 * Creates a node under `parentId` and, down to the row level, its first child
 * (a new sequence comes with its first scene), then selects the row.
 */
function useCreateRow(): (parentId: Id | null) => void {
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

function GroupHead({ node, children }: { node: ProdNode; children: ReactNode }) {
  const drop = useNodeDrop(node, "y", true);
  return <div className={cx("group__head", drop.zone && `dnd-${drop.zone}`)} {...nodeDragProps(node.id)} {...drop.props}>{children}</div>;
}

function Lane({ row }: { row: ProdNode }) {
  const snap = useSnap();
  const { filters, source, trashNodes } = useStore();
  const p = snap.production;
  const all = childrenOf(snap.nodes, row.id);
  const active = filtersActive(filters);
  const units = active ? all.filter((u) => matches(snap, u, filters)) : all;
  const unitLevel = p.levels[levelIndex(p, row) + 1]!;
  const empty = all.filter((u) => !snap.media.some((m) => m.nodeId === u.id) && !snap.takes.some((t) => t.nodeId === u.id));
  const st = statusOf(snap, row);
  const viewers = presenceAt(snap, row.id);
  const headDrop = useNodeDrop(row, "y");
  const endDrop = useEndDrop(row.id);
  // Groups of shots (§2.4): a card each in the row; open, the row shows what is inside.
  const groups = snap.groups.filter((g) => g.parentId === row.id && all.some((u) => u.groupId === g.id));
  const [openId, setOpenId] = useState<Id | null>(null);
  const selectedId = useStore((s) => s.selectedId);
  useEffect(() => {
    const sel = all.find((u) => u.id === selectedId);
    if (sel?.groupId && groups.some((g) => g.id === sel.groupId)) setOpenId(sel.groupId);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = groups.find((g) => g.id === openId);
  // After every hook: a row left empty by the filters is hidden.
  if (active && !units.length) return null;
  const inGroup = (u: ProdNode) => !!u.groupId && groups.some((g) => g.id === u.groupId);
  const items: Array<{ key: string; at: number; el: ReactNode }> = active
    ? units.map((u) => ({ key: u.id, at: 0, el: <UnitCard key={u.id} node={u} /> }))
    : open
      ? units.filter((u) => u.groupId === open.id).map((u) => ({ key: u.id, at: 0, el: <UnitCard key={u.id} node={u} /> }))
      : [
          ...units.filter((u) => !inGroup(u)).map((u) => ({ key: u.id, at: sortValue(u), el: <UnitCard key={u.id} node={u} /> })),
          ...groups.map((g) => ({ key: g.id, at: g.order, el: <GroupCard key={g.id} group={g} onOpen={() => setOpenId(g.id)} /> })),
        ].sort((a, b) => a.at - b.at);

  return (
    <section className="lane">
      <div className={cx("lane__head", headDrop.zone && `dnd-${headDrop.zone}`)} {...nodeDragProps(row.id)} {...headDrop.props}>
        <span className="lane__code">{codeOf(p, row)}</span>
        <span className="lane__title">{row.title}</span>
        <Pill color={st.color}>{st.name}</Pill>
        <span className="sf-faint sf-small">{all.length} {unitLevel.name.toLowerCase()}s · {fmtDur(durationOf(snap, row))}</span>
        {viewers.length ? <AvatarStack names={viewers} size={18} /> : null}
        <div className="lane__spacer" />
        {empty.length && unitLevel.canGenerate && snap.me.magnificConnected ? (
          <Button size="sm" variant="ghost" title="Genera un keyframe para cada plano vacío a partir de su título y notas" onClick={() => {
            for (const u of empty) {
              source.generate({ nodeId: u.id, kind: "image", model: "Nano Banana Pro", prompt: [row.notes, u.title, u.notes].filter(Boolean).join(". ") });
            }
          }}>
            <IconWand size={14} /> Keyframes vacíos ({empty.length})
          </Button>
        ) : null}
        <ShelfButton row={row} />
        <IconButton size="sm" className="head__del" label={`Mover ${codeOf(p, row)} y sus ${unitLevel.name.toLowerCase()}s a la papelera`} onClick={() => trashNodes([row.id])}><IconTrash size={14} /></IconButton>
      </div>
      {open && !active ? <GroupBar group={open} row={row} count={units.filter((u) => u.groupId === open.id).length} onClose={() => setOpenId(null)} /> : null}
      <div className={cx("lane__cards", endDrop.over && "dnd-end")} {...endDrop.props}>
        {items.map((i) => i.el)}
        {!active ? <AddCard row={row} groupId={open?.id} /> : null}
      </div>
    </section>
  );
}

/** "+" at the end of a row: a new shot in that scene (the row grows to the right). */
function AddCard({ row, groupId }: { row: ProdNode; groupId?: Id }) {
  const snap = useSnap();
  const { source, select } = useStore();
  const p = snap.production;
  const g = groupId ? snap.groups.find((x) => x.id === groupId) : undefined;
  const label = `Nuevo ${p.levels[levelIndex(p, row) + 1]!.name.toLowerCase()} en ${g ? `«${g.name}»` : codeOf(p, row)}`;
  return (
    <button className="card card--add" title={label} aria-label={label} onClick={() => {
      const id = source.createNode(row.id, "");
      if (groupId) source.groupShots([id], { groupId });
      select(id);
    }}>
      {/* Same insides as a shot card, invisible: it always has a card's size and ratio. */}
      <span className="card__ghost" aria-hidden>
        <span className="thumb" />
        <span className="card__meta"><span className="card__code">SH</span><Pill color="transparent">·</Pill></span>
        <span className="card__title">·</span>
        <span className="card__foot">·</span>
      </span>
      <IconPlus size={24} stroke={1.5} className="card__plus" />
    </button>
  );
}

function UnitCard({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { selectedId, multi, select, toggleMulti, focusPopped } = useStore();
  const apart = useStore((s) => s.popped.some((w) => w.nodeId === node.id));
  const drop = useNodeDrop(node, "x", false, true);
  const p = snap.production;
  const st = statusOf(snap, node);
  const c = countsOf(snap, node);
  const cover = coverOf(snap, node);
  const viewers = presenceAt(snap, node.id);

  return (
    <div
      className={cx("card", selectedId === node.id && "card--on", multi.includes(node.id) && "card--multi", viewers.length > 0 && "card--watched", drop.zone && `dnd-${drop.zone}`)}
      {...nodeDragProps(node.id)}
      {...drop.props}
      onClick={(e) => (e.metaKey || e.ctrlKey || e.shiftKey ? toggleMulti(node.id) : select(node.id))}
    >
      <Thumb {...cover} />
      <span className={`card__swatch seg-c${colorSlot(snap, node.id)}`} />
      <div className="card__meta">
        <span className="card__code">{codeOf(p, node)}</span>
        <Pill color={st.color}>{st.name}</Pill>
      </div>
      <div className="card__title">{node.title || <span className="sf-faint">Sin título</span>}</div>
      <div className="card__foot">
        <span>{durationOf(snap, node).toFixed(1)}s</span>
        <span title="Versiones generadas en este plano">{c.media}v</span>
        {c.comments ? <span className="card__comments"><IconMessageCircle size={12} /> {c.comments}</span> : null}
        <span className="card__spacer" />
        {apart ? (
          <button className="apart" title="Abierto en una ventana aparte: ir a la ventana" onClick={(e) => { e.stopPropagation(); focusPopped(node.id); }}>
            <IconExternalLink size={12} />
          </button>
        ) : null}
        {viewers.length ? <span className="card__live" title={`${viewers.join(", ")} está aquí`}><AvatarStack names={viewers} size={16} /></span> : null}
        {node.assigneeIds.length ? <AvatarStack names={node.assigneeIds.map((u) => memberName(snap, u))} size={16} max={2} /> : null}
      </div>
    </div>
  );
}

/** A group of shots in the row: a stack with the first shot's cover. Click to open; drop shots on it to add them. */
function GroupCard({ group, onOpen }: { group: ShotGroup; onOpen: () => void }) {
  const snap = useSnap();
  const drop = useGroupDrop(group.id);
  const shots = snap.nodes.filter((n) => n.groupId === group.id && n.parentId === group.parentId).sort(byPosition);
  const cover = shots[0] ? coverOf(snap, shots[0]) : {};
  const total = shots.reduce((a, s) => a + durationOf(snap, s), 0);
  const done = shots.filter((s) => statusOf(snap, s).category === "done").length;
  return (
    <div className={cx("card card--group", drop.over && "dnd-group")} {...drop.props} onClick={onOpen} title={`Abrir «${group.name}»`}>
      <span className="card--group__stack" aria-hidden />
      <Thumb {...cover} />
      <div className="card__meta">
        <span className="card__code"><IconStack2 size={12} /> {group.name}</span>
        <span className="sf-faint sf-small">{shots.length} plano{shots.length === 1 ? "" : "s"}</span>
      </div>
      <div className="card__title">{shots.map((s) => codeOf(snap.production, s)).join(" · ")}</div>
      <div className="card__foot">
        <span>{total.toFixed(1)}s</span>
        <span>{done}/{shots.length} aprobados</span>
        <span className="card__spacer" />
        <span className="group-dots">{shots.slice(0, 6).map((s) => <span key={s.id} style={{ background: statusOf(snap, s).color }} />)}</span>
      </div>
    </div>
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

/** What the info button shows: counts per level, approved, edited length, per status. */
function ProductionInfo({ scopeId }: { scopeId: Id | null }) {
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
