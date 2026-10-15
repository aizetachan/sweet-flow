import type { ReactNode } from "react";
import { IconMessageCircle, IconPlus, IconSearch, IconStack2, IconWand, IconX } from "@tabler/icons-react";
import {
  childrenOf,
  codeOf,
  descendantsOf,
  isUnit,
  levelIndex,
  levelOf,
  roleOf,
  type ProdNode,
} from "@sweetflow/domain";
import { AvatarStack, Button, cx, Pill, Segmented } from "@sweetflow/ui";
import { useSnap, useStore, type CardSize } from "../state/store";
import { colorSlot, countsOf, coverOf, durationOf, filtersActive, matches, memberName, presenceAt, progressOf, statusOf } from "../state/selectors";
import { Thumb } from "../components/media";
import { nodeDragProps, useEndDrop, useNodeDrop } from "./dnd";

export function Board() {
  const snap = useSnap();
  const { scopeId, cardSize, set } = useStore();
  const p = snap.production;
  const scope = scopeId ? snap.nodes.find((n) => n.id === scopeId) : undefined;
  const roots = scope ? [scope] : childrenOf(snap.nodes, null);
  const units = (scope ? descendantsOf(snap.nodes, scope.id) : snap.nodes).filter((n) => isUnit(p, n));
  const done = units.filter((u) => statusOf(snap, u).category === "done").length;
  const total = roots.reduce((a, r) => a + durationOf(snap, r), 0);

  return (
    <main className="board">
      <div className="board__head">
        <div>
          <h1>{scope ? <><span className="board__code">{codeOf(p, scope)}</span> {scope.title}</> : "Toda la producción"}</h1>
          <div className="board__stats">
            <span>{units.length} {p.levels[p.levels.length - 1]!.name.toLowerCase()}s</span>
            <span className="board__bar"><span style={{ width: `${units.length ? (done / units.length) * 100 : 0}%` }} /></span>
            <span>{done} aprobados</span>
            <span>·</span>
            <span>{fmtDur(total)} montados</span>
          </div>
        </div>
        <div className="board__tools">
          <Segmented<CardSize>
            value={cardSize}
            onChange={(v) => set({ cardSize: v })}
            items={[{ id: "s", label: "S", title: "Cards pequeñas" }, { id: "m", label: "M", title: "Cards medianas" }, { id: "l", label: "L", title: "Cards grandes" }]}
          />
        </div>
      </div>
      <FilterBar />
      <div className={cx("board__body", `cards-${cardSize}`)}>
        {p.levels.length === 1 ? (
          <div className="lane"><div className="lane__cards">{childrenOf(snap.nodes, null).map((n) => <UnitCard key={n.id} node={n} />)}</div></div>
        ) : roots.map((r) => <Group key={r.id} node={r} />)}
        {!roots.length ? <p className="empty">Crea tu primera {p.levels[0]!.name.toLowerCase()} en el panel de estructura.</p> : null}
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
  if (li === rowLevel) return <Lane row={node} />;
  const kids = childrenOf(snap.nodes, node.id);
  const prog = progressOf(snap, node);
  return (
    <section className="group">
      <GroupHead node={node}>
        <span className="group__code">{codeOf(p, node)}</span>
        <span className="group__title">{node.title}</span>
        <span className="sf-faint sf-small">{levelOf(p, node).name} · {prog.done}/{prog.total} aprobados · {fmtDur(durationOf(snap, node))}</span>
      </GroupHead>
      {kids.map((k) => <Group key={k.id} node={k} />)}
    </section>
  );
}

function GroupHead({ node, children }: { node: ProdNode; children: ReactNode }) {
  const drop = useNodeDrop(node, "y", true);
  return <div className={cx("group__head", drop.zone && `dnd-${drop.zone}`)} {...nodeDragProps(node.id)} {...drop.props}>{children}</div>;
}

function Lane({ row }: { row: ProdNode }) {
  const snap = useSnap();
  const { filters, source, select } = useStore();
  const p = snap.production;
  const all = childrenOf(snap.nodes, row.id);
  const active = filtersActive(filters);
  const units = active ? all.filter((u) => matches(snap, u, filters)) : all;
  if (active && !units.length) return null;
  const unitLevel = p.levels[levelIndex(p, row) + 1]!;
  const empty = all.filter((u) => !snap.media.some((m) => m.nodeId === u.id) && !snap.takes.some((t) => t.nodeId === u.id));
  const st = statusOf(snap, row);
  const viewers = presenceAt(snap, row.id);
  const headDrop = useNodeDrop(row, "y");
  const endDrop = useEndDrop(row.id);

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
      </div>
      <div className={cx("lane__cards", endDrop.over && "dnd-end")} {...endDrop.props}>
        <SceneCard node={row} />
        {units.map((u) => <UnitCard key={u.id} node={u} />)}
        {!active ? (
          <button className="card card--add" onClick={() => select(source.createNode(row.id, ""))}>
            <IconPlus size={18} />
            <span>{unitLevel.name}</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** The scene's own production card: its long clips and how they were cut into shots. */
function SceneCard({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { selectedId, select } = useStore();
  const p = snap.production;
  const role = roleOf(p, node);
  const clips = snap.media.filter((m) => m.nodeId === node.id && !m.archived);
  const cover = coverOf(snap, node);
  // Which clip feeds the shots, and the segments it was cut into.
  const fed = clips.find((c) => snap.takes.some((t) => t.mediaId === c.id && t.nodeId !== node.id));
  const segs = fed ? snap.takes.filter((t) => t.mediaId === fed.id).sort((a, b) => a.inSec - b.inSec) : [];

  return (
    <div className={cx("card card--scene", selectedId === node.id && "card--on")} onClick={() => select(node.id, "produce")}>
      <Thumb {...cover} />
      <div className="card__meta">
        <span className="card__code">{codeOf(p, node)}</span>
        <span className="card__kind"><IconStack2 size={12} /> {role === "production" ? "Producción de escena" : "Montaje"}</span>
      </div>
      {fed && fed.durationSec ? (
        <div className="cutstrip" title={`v${fed.version} repartido en ${segs.length} tramos`}>
          {segs.map((t) => {
            return <span key={t.id} className={`seg-c${colorSlot(snap, t.nodeId)}`} style={{ left: `${(t.inSec / fed.durationSec!) * 100}%`, width: `${((t.outSec - t.inSec) / fed.durationSec!) * 100}%` }} />;
          })}
        </div>
      ) : null}
      <div className="card__foot">
        <span>{clips.length} clip{clips.length === 1 ? "" : "s"}</span>
        {fed ? <span>{segs.length} tramos</span> : <span className="sf-faint">sin repartir</span>}
      </div>
    </div>
  );
}

function UnitCard({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { selectedId, multi, select, toggleMulti } = useStore();
  const drop = useNodeDrop(node, "x");
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
        {viewers.length ? <span className="card__live" title={`${viewers.join(", ")} está aquí`}><AvatarStack names={viewers} size={16} /></span> : null}
        {node.assigneeIds.length ? <AvatarStack names={node.assigneeIds.map((u) => memberName(snap, u))} size={16} max={2} /> : null}
      </div>
    </div>
  );
}

function FilterBar() {
  const snap = useSnap();
  const { filters, setFilters } = useStore();
  const statuses = snap.production.statuses.filter((s) => !s.archived).sort((a, b) => a.order - b.order);
  const toggle = (id: string) =>
    setFilters({ statusIds: filters.statusIds.includes(id) ? filters.statusIds.filter((x) => x !== id) : [...filters.statusIds, id] });
  return (
    <div className="filters">
      <label className="filters__search">
        <IconSearch size={14} />
        <input placeholder="Buscar planos, notas…" value={filters.query} onChange={(e) => setFilters({ query: e.target.value })} />
      </label>
      <div className="filters__statuses">
        {statuses.map((s) => (
          <button key={s.id} className={cx("fchip", filters.statusIds.includes(s.id) && "fchip--on")} style={filters.statusIds.includes(s.id) ? { borderColor: s.color, color: s.color } : undefined} onClick={() => toggle(s.id)}>
            <span className="sf-pill__dot" style={{ background: s.color }} /> {s.name}
          </button>
        ))}
      </div>
      <select className="sf-select" value={filters.assigneeId ?? ""} onChange={(e) => setFilters({ assigneeId: e.target.value || null })}>
        <option value="">Cualquier responsable</option>
        {snap.members.filter((m) => m.role !== "viewer").map((m) => <option key={m.uid} value={m.uid}>{m.displayName}</option>)}
      </select>
      <select className="sf-select" value={filters.assetId ?? ""} onChange={(e) => setFilters({ assetId: e.target.value || null })}>
        <option value="">Reparto, props, localización…</option>
        {snap.assets.filter((a) => a.type !== "style").map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      {filtersActive(filters) ? (
        <Button size="sm" variant="ghost" onClick={() => setFilters({ query: "", statusIds: [], assigneeId: null, assetId: null })}><IconX size={13} /> Limpiar</Button>
      ) : null}
    </div>
  );
}
