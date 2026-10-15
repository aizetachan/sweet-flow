import { IconExternalLink, IconArrowDown, IconArrowUp, IconChevronRight, IconFolderPlus, IconLayoutList, IconPlus, IconTrash } from "@tabler/icons-react";
import { childrenOf, codeOf, isUnit, levelIndex, type ProdNode } from "@sweetflow/domain";
import { cx, IconButton } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { progressOf, statusOf } from "../state/selectors";
import { nodeDragProps, useEndDrop, useNodeDrop } from "./dnd";

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
        <span className="trow__title">{node.title || <i className="sf-faint">Sin título</i>}</span>
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
      {open && !unit ? kids.map((k) => <TreeRow key={k.id} node={k} depth={depth + 1} />) : null}
    </>
  );
}
