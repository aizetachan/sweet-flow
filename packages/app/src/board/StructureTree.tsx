import { IconStack2, IconExternalLink, IconArrowDown, IconArrowUp, IconChevronRight, IconFolderPlus, IconLayoutList, IconPlus, IconTrash } from "@tabler/icons-react";
import { childrenOf, codeOf, isUnit, levelIndex, sortValue, type ProdNode, type ShotGroup } from "@sweetflow/domain";
import { cx, IconButton } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { progressOf, statusOf } from "../state/selectors";
import { nodeDragProps, useEndDrop, useGroupDrop, useNodeDrop } from "./dnd";
import { InlineEdit } from "./Board";

export function StructureTree() {
  const snap = useSnap();
  const { scopeId, set, select, source } = useStore();
  const top = snap.production.levels[0]!;
  const roots = childrenOf(snap.nodes, null);
  const rootDrop = useEndDrop(null);
  return (
    <div className="tree">
      <div className="tree__head">
        <span>{top.name}s</span>
        <IconButton label={`Nuevo ${top.name.toLowerCase()}`} size="sm" onClick={() => {
          const id = source.createNode(null, "");
          set({ scopeId: id });
          select(id);
        }}><IconPlus size={14} /></IconButton>
      </div>
      <button className={cx("tree__all", scopeId === null && "tree__all--on")} onClick={() => set({ scopeId: null })}>
        <IconLayoutList size={14} /> Toda la producción
        <span className="tree__count">{snap.nodes.filter((n) => isUnit(snap.production, n)).length}</span>
      </button>
      <div className={cx("tree__list", rootDrop.over && "dnd-end")} {...rootDrop.props}>
        {roots.map((n) => <TreeRow key={n.id} node={n} depth={0} />)}
      </div>
      <div className="tree__hint sf-faint sf-small">Arrastra para reordenar o mover · ⌘ clic para seleccionar varios</div>
      <div className="tree__levels sf-faint sf-small">
        {snap.production.levels.map((l) => l.name).join(" › ")}
        <button className="link" onClick={() => set({ modal: "levels" })}>Editar</button>
      </div>
    </div>
  );
}

function TreeRow({ node, depth }: { node: ProdNode; depth: number }) {
  const snap = useSnap();
  const { selectedId, multi, scopeId, collapsed, toggleCollapsed, toggleMulti, select, set, source, focusPopped } = useStore();
  const apart = useStore((s) => s.popped.some((w) => w.nodeId === node.id));
  const p = snap.production;
  const kids = childrenOf(snap.nodes, node.id);
  const unit = isUnit(p, node);
  const childLevel = p.levels[levelIndex(p, node) + 1];
  const st = statusOf(snap, node);
  const prog = progressOf(snap, node);
  const open = !collapsed[node.id];
  const isScope = depth === 0 && scopeId === node.id;
  const drop = useNodeDrop(node, "y", !unit);
  const trashNodes = useStore((s) => s.trashNodes);

  return (
    <>
      <div
        className={cx("trow", selectedId === node.id && "trow--on", multi.includes(node.id) && "trow--multi", isScope && "trow--scope", drop.zone && `dnd-${drop.zone}`)}
        style={{ paddingLeft: 6 + depth * 14 }}
        {...nodeDragProps(node.id)}
        {...drop.props}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return toggleMulti(node.id);
          if (depth === 0 && !unit) set({ scopeId: node.id });
          // Picking in the tree keeps the tree open; double click opens it to work on.
          select(node.id, undefined, true);
        }}
        onDoubleClick={() => select(node.id)}
      >
        {unit ? <span className="trow__caret" /> : (
          <button className={cx("trow__caret", open && "is-open")} onClick={(e) => { e.stopPropagation(); toggleCollapsed(node.id); }} aria-label="Plegar">
            <IconChevronRight size={12} />
          </button>
        )}
        <span className="trow__dot" style={{ background: st.color }} title={st.name} />
        <span className="trow__code">{codeOf(p, node)}</span>
        <InlineEdit className="trow__title" value={node.title} placeholder="Sin título" label="Doble clic para escribir el título"
          onSave={(title) => source.updateNode(node.id, { title })} />
        {apart ? (
          <button className="apart" title="Abierto en una ventana aparte: ir a la ventana" onClick={(e) => { e.stopPropagation(); focusPopped(node.id); }}>
            <IconExternalLink size={12} />
          </button>
        ) : null}
        {!unit && prog.total ? <span className="trow__prog">{prog.done}/{prog.total}</span> : null}
        <span className="trow__acts" onClick={(e) => e.stopPropagation()}>
          {childLevel ? (
            <IconButton size="sm" label={`Añadir ${childLevel.name.toLowerCase()}`} onClick={() => select(source.createNode(node.id, ""))}><IconFolderPlus size={13} /></IconButton>
          ) : null}
          <IconButton size="sm" label="Insertar después" onClick={() => select(source.insertAfter(node.id))}><IconPlus size={13} /></IconButton>
          <IconButton size="sm" label="Subir" onClick={() => source.moveNode(node.id, -1)}><IconArrowUp size={13} /></IconButton>
          <IconButton size="sm" label="Bajar" onClick={() => source.moveNode(node.id, 1)}><IconArrowDown size={13} /></IconButton>
          <IconButton size="sm" label="Mover a la papelera (Supr)" onClick={() => trashNodes([node.id])}><IconTrash size={13} /></IconButton>
        </span>
      </div>
      {open && !unit ? <TreeChildren row={node} kids={kids} depth={depth + 1} /> : null}
    </>
  );
}

/**
 * A node's children. In a scene, its groups of shots show as groups, as on
 * the board (docs/INTERFAZ.md §2.4): closed by default, with their shots inside.
 */
function TreeChildren({ row, kids, depth }: { row: ProdNode; kids: ProdNode[]; depth: number }) {
  const snap = useSnap();
  const groups = snap.groups.filter((g) => g.parentId === row.id && kids.some((k) => k.groupId === g.id));
  if (!groups.length) return <>{kids.map((k) => <TreeRow key={k.id} node={k} depth={depth} />)}</>;
  const items = [
    ...kids.filter((k) => !groups.some((g) => g.id === k.groupId)).map((k) => ({ at: sortValue(k), el: <TreeRow key={k.id} node={k} depth={depth} /> })),
    ...groups.map((g) => ({ at: g.order, el: <TreeGroup key={g.id} group={g} shots={kids.filter((k) => k.groupId === g.id)} depth={depth} /> })),
  ].sort((a, b) => a.at - b.at);
  return <>{items.map((i) => i.el)}</>;
}

function TreeGroup({ group, shots, depth }: { group: ShotGroup; shots: ProdNode[]; depth: number }) {
  const { collapsed, toggleCollapsed, source } = useStore();
  const key = `open:${group.id}`;
  const open = !!collapsed[key];
  const drop = useGroupDrop(group.id);
  return (
    <>
      <div className={cx("trow trow--group", drop.over && "dnd-into")} style={{ paddingLeft: 6 + depth * 14 }} {...drop.props} onClick={() => toggleCollapsed(key)}>
        <button className={cx("trow__caret", open && "is-open")} onClick={(e) => { e.stopPropagation(); toggleCollapsed(key); }} aria-label={open ? "Plegar" : "Desplegar"}>
          <IconChevronRight size={12} />
        </button>
        <IconStack2 size={13} className="trow__gicon" />
        <InlineEdit className="trow__code" value={group.name} placeholder="Grupo" label="Doble clic para cambiar el nombre" onSave={(name) => source.renameGroup(group.id, name)} />
        <span className="trow__prog">{shots.length}</span>
      </div>
      {open ? shots.map((s) => <TreeRow key={s.id} node={s} depth={depth + 1} />) : null}
    </>
  );
}
