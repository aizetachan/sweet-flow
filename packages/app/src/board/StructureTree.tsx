import { IconArrowDown, IconArrowUp, IconChevronRight, IconFolderPlus, IconLayoutList, IconPlus, IconTrash } from "@tabler/icons-react";
import { childrenOf, codeOf, isUnit, levelIndex, type ProdNode } from "@sweetflow/domain";
import { cx, IconButton } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { progressOf, statusOf } from "../state/selectors";

export function StructureTree() {
  const snap = useSnap();
  const { scopeId, set, select, source } = useStore();
  const top = snap.production.levels[0]!;
  const roots = childrenOf(snap.nodes, null);
  return (
    <aside className="tree">
      <div className="tree__head">
        <span>Estructura</span>
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
      <div className="tree__list">
        {roots.map((n) => <TreeRow key={n.id} node={n} depth={0} />)}
      </div>
      <div className="tree__levels sf-faint sf-small">
        {snap.production.levels.map((l) => l.name).join(" › ")}
        <button className="link" onClick={() => set({ modal: "levels" })}>Editar</button>
      </div>
    </aside>
  );
}

function TreeRow({ node, depth }: { node: ProdNode; depth: number }) {
  const snap = useSnap();
  const { selectedId, scopeId, collapsed, toggleCollapsed, select, set, source } = useStore();
  const p = snap.production;
  const kids = childrenOf(snap.nodes, node.id);
  const unit = isUnit(p, node);
  const childLevel = p.levels[levelIndex(p, node) + 1];
  const st = statusOf(snap, node);
  const prog = progressOf(snap, node);
  const open = !collapsed[node.id];
  const isScope = depth === 0 && scopeId === node.id;

  return (
    <>
      <div
        className={cx("trow", selectedId === node.id && "trow--on", isScope && "trow--scope")}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => {
          if (depth === 0 && !unit) set({ scopeId: node.id });
          select(node.id);
        }}
      >
        {unit ? <span className="trow__caret" /> : (
          <button className={cx("trow__caret", open && "is-open")} onClick={(e) => { e.stopPropagation(); toggleCollapsed(node.id); }} aria-label="Plegar">
            <IconChevronRight size={12} />
          </button>
        )}
        <span className="trow__dot" style={{ background: st.color }} title={st.name} />
        <span className="trow__code">{codeOf(p, node)}</span>
        <span className="trow__title">{node.title || <i className="sf-faint">Sin título</i>}</span>
        {!unit && prog.total ? <span className="trow__prog">{prog.done}/{prog.total}</span> : null}
        <span className="trow__acts" onClick={(e) => e.stopPropagation()}>
          {childLevel ? (
            <IconButton size="sm" label={`Añadir ${childLevel.name.toLowerCase()}`} onClick={() => select(source.createNode(node.id, ""))}><IconFolderPlus size={13} /></IconButton>
          ) : null}
          <IconButton size="sm" label="Insertar después" onClick={() => select(source.insertAfter(node.id))}><IconPlus size={13} /></IconButton>
          <IconButton size="sm" label="Subir" onClick={() => source.moveNode(node.id, -1)}><IconArrowUp size={13} /></IconButton>
          <IconButton size="sm" label="Bajar" onClick={() => source.moveNode(node.id, 1)}><IconArrowDown size={13} /></IconButton>
          <IconButton size="sm" label="Eliminar" onClick={() => {
            if (confirm(`¿Eliminar ${codeOf(p, node)} y todo su contenido?`)) {
              source.deleteNode(node.id);
              if (selectedId === node.id) select(null);
            }
          }}><IconTrash size={13} /></IconButton>
        </span>
      </div>
      {open && !unit ? kids.map((k) => <TreeRow key={k.id} node={k} depth={depth + 1} />) : null}
    </>
  );
}
