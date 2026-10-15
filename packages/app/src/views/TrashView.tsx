/**
 * The production's trash (docs/INTERFAZ.md §2.2): what was removed from the
 * board, with what it contained. Restore puts it back where it was; delete
 * for good asks twice. It never empties by itself.
 */

import { useEffect, useState } from "react";
import { IconArrowBackUp, IconTrash, IconTrashX } from "@tabler/icons-react";
import { ancestorsOf, codeOf, descendantsOf, levelOf, splitTrash, type ProdNode } from "@sweetflow/domain";
import { Button, IconButton } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { ago } from "../dashboard/Browse";

export function TrashView() {
  const snap = useSnap();
  const all = [...snap.nodes, ...snap.trash];
  const roots = splitTrash(all).roots.sort((a, b) => b.trashedAt! - a.trashedAt!);
  const [armed, setArmed] = useArmed();
  const { source } = useStore();

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>Papelera</h1>
          <p className="sf-muted">Lo que se quita del tablero viene aquí con todo lo que contiene. Restaurar lo devuelve a su sitio; si su código se ha usado mientras tanto, recibe el siguiente libre. No se vacía sola.</p>
        </div>
        {roots.length ? (
          <Button className={armed ? "danger" : undefined} onClick={() => (armed ? roots.forEach((n) => source.deleteNode(n.id)) : setArmed(true))}>
            <IconTrashX size={15} /> {armed ? "Pulsa otra vez para vaciar" : "Vaciar papelera"}
          </Button>
        ) : null}
      </div>
      {roots.length ? (
        <div className="trash">
          {roots.map((n) => <TrashRow key={n.id} node={n} all={all} />)}
        </div>
      ) : (
        <div className="dash__empty">
          <IconTrash size={30} stroke={1.3} className="sf-faint" />
          <p>La papelera está vacía.</p>
        </div>
      )}
    </main>
  );
}

function TrashRow({ node, all }: { node: ProdNode; all: ProdNode[] }) {
  const p = useSnap().production;
  const { notify, set, select, source } = useStore();
  const [armedRow, setArmedRow] = useArmed();
  const inside = descendantsOf(all, node.id);
  const counts = new Map<string, number>();
  for (const d of inside) {
    const name = levelOf(p, d).name.toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const where = ancestorsOf(all, node).slice(0, -1).map((a) => codeOf(p, a)).join(" / ") || "la raíz de la producción";
  const restore = () => {
    const was = codeOf(p, node);
    const renumbered = source.restoreNode(node.id);
    const now = renumbered === undefined ? was : codeOf(p, { ...node, number: renumbered });
    notify(renumbered === undefined ? `${was} ha vuelto a su sitio.` : `${was} ha vuelto como ${now}: su código estaba ocupado.`, {
      label: "Ver",
      run: () => {
        set({ view: "board", notice: null });
        select(node.id);
      },
    });
  };
  return (
    <div className="trash__row">
      <span className="trash__code">{codeOf(p, node)}</span>
      <span className="trash__main">
        <span className="trash__title">{node.title || <i className="sf-faint">Sin título</i>}</span>
        <span className="sf-faint sf-small">
          {levelOf(p, node).name} · en {where}
          {counts.size ? ` · con ${[...counts].map(([name, c]) => `${c} ${name}${c === 1 ? "" : "s"}`).join(", ")}` : ""}
        </span>
      </span>
      <span className="sf-faint sf-small">{ago(node.trashedAt!)}</span>
      <Button size="sm" onClick={restore}><IconArrowBackUp size={13} /> Restaurar</Button>
      <IconButton
        size="sm"
        className={armedRow ? "danger" : undefined}
        label={armedRow ? "Pulsa otra vez para eliminar definitivamente" : "Eliminar definitivamente"}
        onClick={() => (armedRow ? source.deleteNode(node.id) : setArmedRow(true))}
      ><IconTrashX size={13} /></IconButton>
    </div>
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
