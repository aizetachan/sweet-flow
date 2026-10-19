/**
 * The library (docs/INTERFAZ.md §2.8): reference images organised like the
 * production, but centred on the image. Each group is a row with a name the
 * team gives it («Personaje 1», «Casa de Robida»), showing its images. Groups
 * are made on the fly: «+ Grupo», or by dropping images below the last row.
 * Images are dragged to reorder or into another group. The panel on the left
 * generates into the selected group.
 */

import { useEffect, useState, type DragEvent, type MouseEvent } from "react";
import { IconPhotoPlus, IconPlus, IconStar, IconStarFilled, IconTrash } from "@tabler/icons-react";
import { libOrder, type Id, type Media, type ProdNode } from "@sweetflow/domain";
import { Button, cx } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { Thumb } from "../components/media";
import { ContextMenu, type MenuAt } from "../components/ContextMenu";
import { InlineEdit } from "../board/Board";
import { LIB_TYPES } from "../inspector/Inspector";
import type { AssetType } from "@sweetflow/domain";

/** Library images being dragged (also onto the references of Generar). */
export const MEDIA_DRAG = "application/x-sweetflow-media";

/** Images being dragged (dataTransfer can't be read during dragover). */
let dragging: Id[] = [];

/** The library images being dragged right now, for drop targets elsewhere (references). */
export const draggedMedia = () => dragging;

/** A group's images in their order (not archived). */
function imagesOf(media: Media[], nodeId: Id): Media[] {
  return media.filter((m) => m.nodeId === nodeId && !m.archived && m.kind === "image").sort((a, b) => libOrder(a) - libOrder(b));
}

/** The groups shown: every group, and the older catch-all one only while it has images. */
function groupsOf(library: ProdNode[], media: Media[]): ProdNode[] {
  return library
    .filter((n) => n.lib?.kind === "card" || (n.lib?.kind === "desk" && media.some((m) => m.nodeId === n.id && !m.archived)))
    .sort((a, b) => a.number - b.number);
}

export function LibraryBoard() {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const groups = groupsOf(snap.library, snap.media);
  const [picked, setPicked] = useState<Id[]>([]);
  const [over, setOver] = useState(false);

  // Coming from the board: the panel opens on the first group, ready to generate.
  useEffect(() => {
    if (groups[0] && !snap.library.some((n) => n.id === selectedId)) select(groups[0].id, "produce");
  }, [groups, selectedId, snap.library, select]);

  const newGroup = (ids: Id[] = []) => {
    const id = source.createLibGroup(null, ids);
    setPicked([]);
    select(id, "produce");
  };

  return (
    <div className="libb" onClick={(e) => { if (e.target === e.currentTarget) setPicked([]); }}>
      <header className="libb__head">
        <h1>Biblioteca</h1>
        <span className="sf-muted sf-small grow">Grupos de imágenes de referencia. El nombre de cada grupo es el que se usa al llamarlo en los planos.</span>
        <Button size="sm" variant="primary" onClick={() => newGroup()}><IconPlus size={14} /> Grupo</Button>
      </header>
      {groups.map((g) => <GroupRow key={g.id} group={g} picked={picked} setPicked={setPicked} />)}
      {/* Below the last row: a new group, by click or by dropping images here. */}
      <div className={cx("libb__newrow", over && "is-over", !groups.length && "libb__newrow--first")}
        onClick={() => newGroup()}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(MEDIA_DRAG)) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          if (!dragging.length) return;
          e.preventDefault();
          newGroup(dragging);
          dragging = [];
        }}>
        <IconPlus size={18} />
        <span>{groups.length ? "Nuevo grupo (o suelta imágenes aquí)" : "Crea tu primer grupo: «Personaje 1», «Casa de Robida»… y genera dentro desde el panel."}</span>
      </div>
    </div>
  );
}

/** Where a drop lands in a row: before an image, or at the end. */
type Hint = { before: Id | null };

function GroupRow({ group, picked, setPicked }: { group: ProdNode; picked: Id[]; setPicked: (ids: Id[]) => void }) {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const selectedId = useStore((s) => s.selectedId);
  const activeMediaId = useStore((s) => s.activeMediaId);
  const select = useStore((s) => s.select);
  const set = useStore((s) => s.set);
  const trashNodes = useStore((s) => s.trashNodes);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [rename, setRename] = useState(0);
  const [hint, setHint] = useState<Hint | null>(null);
  const images = imagesOf(snap.media, group.id);
  const ids = images.map((m) => m.id);
  const pending = snap.media.filter((m) => m.nodeId === group.id && m.status !== "ready" && m.status !== "failed" && !m.archived).length;
  const on = selectedId === group.id;

  const click = (e: MouseEvent, m: Media) => {
    e.stopPropagation();
    if (e.metaKey || e.ctrlKey) setPicked(picked.includes(m.id) ? picked.filter((x) => x !== m.id) : [...picked, m.id]);
    else if (e.shiftKey && picked.length) {
      const a = ids.indexOf(picked.at(-1)!);
      const b = ids.indexOf(m.id);
      if (a >= 0) setPicked([...new Set([...picked, ...ids.slice(Math.min(a, b), Math.max(a, b) + 1)])]);
      else setPicked([m.id]);
    } else setPicked([m.id]);
    // The panel shows it, in its group.
    select(group.id, "produce", true);
    set({ activeMediaId: m.id });
  };

  // Before which image a drop lands: the card under the pointer (left or right half), or the end.
  const pick = (e: DragEvent): Hint => {
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-media]");
    if (!card) return { before: null };
    const r = card.getBoundingClientRect();
    const id = card.dataset.media!;
    if (e.clientX < r.left + r.width / 2) return { before: id };
    return { before: ids[ids.indexOf(id) + 1] ?? null };
  };

  return (
    <section className={cx("libb__lane", on && "is-on")}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(MEDIA_DRAG)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const h = pick(e);
        setHint((old) => (old?.before === h.before ? old : h));
      }}
      onDragLeave={(e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setHint(null);
      }}
      onDrop={(e) => {
        const h = pick(e);
        setHint(null);
        if (!dragging.length) return;
        e.preventDefault();
        source.placeLibMedia(dragging.filter((id) => id !== h.before), group.id, h.before);
        dragging = [];
        setPicked([]);
      }}>
      <div className="libb__lanehead" onClick={() => select(group.id, "produce", true)}>
        <InlineEdit className="libb__gname" value={group.title} placeholder="Sin nombre" label="Doble clic para cambiar el nombre" startSignal={rename}
          onSave={(title) => source.updateNode(group.id, { title })} />
        <KindChip group={group} />
        <span className="sf-faint sf-small">{images.length || ""}{pending ? ` · generando ${pending}` : ""}</span>
        {group.notes.trim() ? <span className="libb__gdesc sf-faint sf-small" title={group.notes}>{group.notes}</span> : null}
      </div>
      <div className="libb__row">
        {images.map((m) => (
          <div key={m.id} data-media={m.id}
            className={cx("libimg", picked.includes(m.id) && "is-picked", on && activeMediaId === m.id && "is-active", hint?.before === m.id && "dnd-before")}
            draggable
            onDragStart={(e) => {
              dragging = picked.includes(m.id) ? ids.filter((id) => picked.includes(id)).concat(picked.filter((id) => !ids.includes(id))) : [m.id];
              e.dataTransfer.setData(MEDIA_DRAG, JSON.stringify(dragging));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => { dragging = []; }}
            onClick={(e) => click(e, m)}>
            <Thumb media={m} badge={false} />
            <button className={cx("libimg__star", m.chosen && "is-on")} title={m.chosen ? "Quitar de las elegidas" : "Elegir: es de las que se mandan al usar el grupo (si no hay elegidas, van todas)"}
              onClick={(e) => { e.stopPropagation(); source.setChosen([m.id], !m.chosen); }}>
              {m.chosen ? <IconStarFilled size={13} /> : <IconStar size={13} />}
            </button>
          </div>
        ))}
        {/* The end of the row: generate into this group (the panel) — also where drops land last. */}
        <button className={cx("libb__add", hint && hint.before === null && "dnd-before")} title="Generar o importar en este grupo (panel de la izquierda)"
          onClick={() => select(group.id, "produce")}>
          <IconPhotoPlus size={18} />
          <span className="sf-small">{images.length ? "Más" : "Generar aquí"}</span>
        </button>
      </div>
      {menu ? (
        <ContextMenu at={menu} onClose={() => setMenu(null)}>
          <div className="menu__title">Grupo</div>
          <button className="menu__item" onClick={() => setRename((n) => n + 1)}><span className="menu__label">Cambiar el nombre</span></button>
          <button className="menu__item" onClick={() => set({ modal: "notes", notesFor: group.id })}><span className="menu__label">Descripción…</span></button>
          <div className="menu__sep" />
          <button className="menu__item menu__item--danger" onClick={() => trashNodes([group.id])}><IconTrash size={14} /> <span className="menu__label">Mover a la papelera</span></button>
        </ContextMenu>
      ) : null}
    </section>
  );
}

/**
 * What a group is (docs/INTERFAZ.md §2.8). A new group asks right away, in
 * its row; it can be changed later from here or the panel. Characters,
 * objects and places can be called by name in a prompt («@Elena»).
 */
function KindChip({ group }: { group: ProdNode }) {
  const source = useStore((s) => s.source);
  const [open, setOpen] = useState(false);
  const type = group.lib?.kind === "card" ? group.lib.type : undefined;
  if (group.lib?.kind !== "card") return null;
  const choose = (t: AssetType) => {
    source.setLibType(group.id, t);
    setOpen(false);
  };
  if (!type || open) {
    return (
      <span className="libkind__ask" onClick={(e) => e.stopPropagation()}>
        {!type ? <span className="sf-small">¿Qué es?</span> : null}
        {LIB_TYPES.map((t) => <button key={t.id} className={cx("libkind__opt", type === t.id && "is-on")} onClick={() => choose(t.id)}>{t.label}</button>)}
      </span>
    );
  }
  return (
    <button className="libkind" title="Cambiar qué es" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
      {LIB_TYPES.find((t) => t.id === type)?.label}
    </button>
  );
}

/** The library in the Explorer tab: its groups. */
export function LibraryTree() {
  const snap = useSnap();
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const source = useStore((s) => s.source);
  const groups = groupsOf(snap.library, snap.media);
  const count = (id: Id) => snap.media.filter((m) => m.nodeId === id && !m.archived).length;
  return (
    <div className="tree">
      <div className="tree__head">
        <span>Grupos</span>
        <button className="link" title="Nuevo grupo" onClick={() => select(source.createLibGroup(null), "produce")}><IconPlus size={14} /></button>
      </div>
      <div className="tree__list">
        {groups.map((g) => (
          <div key={g.id} className={cx("trow", selectedId === g.id && "trow--on")} style={{ paddingLeft: 10 }} onClick={() => select(g.id, "produce", true)}>
            <span className="trow__title">{g.title}</span><span className="trow__prog">{count(g.id) || ""}</span>
          </div>
        ))}
        {!groups.length ? <p className="sf-faint sf-small" style={{ padding: "6px 10px" }}>Aún no hay grupos.</p> : null}
      </div>
    </div>
  );
}
