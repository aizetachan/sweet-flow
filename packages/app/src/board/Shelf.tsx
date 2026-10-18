/**
 * «Vídeos editados» of a scene (docs/INTERFAZ.md §2.3): the shots whose video
 * was cut into new shots. They are off the row, kept in `_editados/`, and
 * their video still feeds the new shots. From here they can be watched, put
 * back on the row, or discarded to the production's trash.
 */

import { useState } from "react";
import { IconArrowBackUp, IconMovie, IconPlayerPlay, IconTrash } from "@tabler/icons-react";
import { codeOf, type ProdNode } from "@sweetflow/domain";
import { Button, cx, IconButton } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { Player, Thumb } from "../components/media";
import { Popover } from "../components/Popover";
import { nameOf, useShowCodes } from "../state/names";

export function ShelfButton({ row }: { row: ProdNode }) {
  const snap = useSnap();
  const items = snap.shelf.filter((n) => n.parentId === row.id);
  if (!items.length) return null;
  return (
    <Popover align="right" className="shelf" button={({ open, toggle }) => (
      // Same look as the row's «Ver todos / En fila».
      <Button size="sm" variant="ghost" className={cx(open && "is-on")} title={`Vídeos editados de ${nameOf(snap.production, row)}: los originales que se cortaron en planos`} onClick={toggle}>
        <IconMovie size={14} /> Vídeos editados <span className="shelf__count">{items.length}</span>
      </Button>
    )}>
      <ShelfList row={row} items={items} />
    </Popover>
  );
}

function ShelfList({ row, items }: { row: ProdNode; items: ProdNode[] }) {
  const showCodes = useShowCodes();
  const snap = useSnap();
  const { source, notify, select } = useStore();
  const selectedId = useStore((s) => s.selectedId);
  const p = snap.production;
  const [watching, setWatching] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const sorted = [...items].sort((a, b) => (b.shelvedAt ?? 0) - (a.shelvedAt ?? 0));

  return (
    <div className="shelf__in">
      <div className="menu__title">Vídeos editados · {nameOf(p, row)}</div>
      {sorted.map((n) => {
        const video = snap.media.filter((m) => m.nodeId === n.id && m.status === "ready" && !m.archived).sort((a, b) => b.createdAt - a.createdAt);
        const fed = video.find((m) => snap.takes.some((t) => t.mediaId === m.id)) ?? video[0];
        const shots = snap.nodes.filter((s) => snap.takes.some((t) => t.nodeId === s.id && t.mediaId === fed?.id));
        const open = watching === n.id && fed;
        return (
          <div key={n.id} className={cx("shelf__item", selectedId === n.id && "shelf__item--on")}>
            {/* A click opens it in the panel on the left, like a card (it stays in «Vídeos editados»). */}
            <div className="shelf__row" onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) select(n.id); }} title="Abrir en el panel">
              <button className="shelf__thumb" title="Ver el vídeo completo" onClick={() => { setWatching(open ? null : n.id); setTime(0); setPlaying(false); }}>
                <Thumb media={fed} />
                <span className="shelf__play"><IconPlayerPlay size={14} /></span>
              </button>
              <div className="shelf__meta">
                <div>{showCodes ? <><strong>{codeOf(p, n)}</strong> </> : null}{n.title || <span className="sf-faint">Sin título</span>}</div>
                <div className="sf-faint sf-small">
                  {fed?.durationSec ? `${fed.durationSec}s · ` : ""}
                  {shots.length ? `cortado en ${shots.map((s) => nameOf(p, s)).join(", ")}` : "sin planos que lo usen"}
                </div>
              </div>
              <IconButton size="sm" label="Devolver a la fila (los planos cortados se quedan)" onClick={() => {
                const renumbered = source.unshelveNode(n.id);
                notify(renumbered !== undefined
                  ? `${nameOf(p, n)} vuelve a la fila como ${nameOf(p, { ...n, number: renumbered })}: su código ya estaba en uso.`
                  : `${nameOf(p, n)} vuelve a la fila.`);
                select(n.id);
              }}><IconArrowBackUp size={14} /></IconButton>
              <IconButton size="sm" label={shots.length ? `Descartar a la papelera (${shots.map((s) => nameOf(p, s)).join(", ")} lo siguen usando mientras esté allí)` : "Descartar a la papelera"} onClick={() => {
                source.trashNode(n.id);
                notify(`${nameOf(p, n)} a la papelera de la producción.`, { label: "Deshacer", run: () => { source.restoreNode(n.id); useStore.getState().set({ notice: null }); } });
              }}><IconTrash size={14} /></IconButton>
            </div>
            {open ? <Player media={fed} time={time} playing={playing} onTime={setTime} onPlaying={setPlaying} /> : null}
          </div>
        );
      })}
    </div>
  );
}
