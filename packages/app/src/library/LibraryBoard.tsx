/**
 * The library (docs/INTERFAZ.md §2.8): reference images organised like the
 * production, but centred on the image. Each group is a row with a name the
 * team gives it («Personaje 1», «Casa de Robida»), showing its images. Groups
 * are made on the fly: «+ Grupo», or by dropping images below the last row.
 * Images are dragged to reorder or into another group. The panel on the left
 * generates into the selected group.
 */

import { useEffect, useState, type DragEvent, type MouseEvent } from "react";
import { IconBooks, IconPhotoPlus, IconPlus, IconRefresh, IconStar, IconStarFilled, IconTrash } from "@tabler/icons-react";
import { libOrder, type Id, type LibraryShare, type Media, type ProdNode } from "@sweetflow/domain";
import { Button, cx } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { Thumb } from "../components/media";
import { ContextMenu, type MenuAt } from "../components/ContextMenu";
import { Popover } from "../components/Popover";
import { InlineEdit } from "../board/Board";
import { useSharedLibraries } from "./shared";
import { LIB_TYPES } from "../inspector/Inspector";
import type { AssetType } from "@sweetflow/domain";

/** Library images being dragged (also onto the references of Generar). */
export const MEDIA_DRAG = "application/x-sweetflow-media";

/** Images being dragged (dataTransfer can't be read during dragover). */
let dragging: Id[] = [];

/** The library images being dragged right now, for drop targets elsewhere (references). */
export const draggedMedia = () => dragging;

/**
 * Drag props for any picture of the production (gallery versions, a group's
 * images in its own window): dropped on the references of Generar, like the
 * library's images (docs/INTERFAZ.md §2.0).
 */
export function mediaDrag(ids: Id[]) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragging = ids;
      e.dataTransfer.setData(MEDIA_DRAG, JSON.stringify(ids));
      e.dataTransfer.effectAllowed = "copyMove";
      document.body.classList.add("sf-drag-media");
    },
    onDragEnd: () => {
      dragging = [];
      document.body.classList.remove("sf-drag-media");
    },
  };
}

/**
 * The end of any drag clears the highlight of the reference slots: the card
 * dragged may have moved to another group (and its own dragend is lost).
 */
if (typeof window !== "undefined") {
  const clear = () => {
    document.body.classList.remove("sf-drag-media");
    setTimeout(() => (dragging = []), 0);
  };
  window.addEventListener("dragend", clear, true);
  window.addEventListener("drop", clear, true);
}

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
        <ShareLibrary />
        <Button size="sm" variant="primary" onClick={() => newGroup()}><IconPlus size={14} /> Grupo</Button>
      </header>
      {groups.map((g) => <GroupRow key={g.id} group={g} picked={picked} setPicked={setPicked} />)}
      {/* Below the last row: a new group, by click or by dropping images here. */}
      <div className={cx("libb__newrow", over && "is-over", !groups.length && "libb__newrow--first")}
        onClick={() => newGroup()}
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes(MEDIA_DRAG)) e.preventDefault();
        }}
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
      <SharedLibraries />
    </div>
  );
}

/**
 * Libraries other productions share with this one (docs/INTERFAZ.md §2.8.1):
 * read here, always up to date, edited only in their own production. Their
 * images drag onto the references like this production's.
 */
function SharedLibraries() {
  const shared = useSharedLibraries();
  const lib = useStore((s) => s.lib);
  if (!shared.length) return null;
  const folderName = (id: Id) => lib?.entries.find((e) => e.id === id)?.name ?? "una carpeta";
  return (
    <section className="libb__shared">
      <div className="libb__sharedhead"><IconBooks size={16} /> <b>Bibliotecas compartidas</b> <span className="sf-faint sf-small">de otras producciones; se editan en la suya</span></div>
      {shared.map((l) => (
        <div key={l.productionId} className="libb__from">
          <div className="libb__fromhead">
            <span>De <b>{l.name}</b></span>
            <span className="sf-faint sf-small">{l.share.scope === "all" ? "compartida con todo Sweet Flow" : `compartida con «${folderName(l.share.folderId)}»`}</span>
            <span className="grow" />
            <button className="link sf-small" onClick={() => { useStore.getState().openProduction(l.productionId); useStore.getState().set({ view: "library" }); }}>Abrir «{l.name}»</button>
          </div>
          {l.groups.length ? l.groups.map((g) => {
            const images = l.media.filter((m) => m.nodeId === g.id && m.kind === "image").sort((a, b) => libOrder(a) - libOrder(b));
            const kind = g.lib?.kind === "card" ? g.lib.type : undefined;
            const type = kind ? LIB_TYPES.find((t) => t.id === kind)?.label : undefined;
            return (
              <div key={g.id} className="libb__lane libb__lane--shared">
                <div className="libb__lanehead"><span className="libb__gname">{g.title}</span>{type ? <span className="libkind libkind--static">{type}</span> : null}<span className="sf-faint sf-small">{images.length || ""}</span></div>
                <div className="libb__row">
                  {images.map((m) => (
                    <div key={m.id} className="libimg" draggable data-tip={`${g.title} · de ${l.name}`}
                      onDragStart={(e) => {
                        dragging = [m.id];
                        e.dataTransfer.setData(MEDIA_DRAG, JSON.stringify(dragging));
                        e.dataTransfer.effectAllowed = "copy";
                        document.body.classList.add("sf-drag-media");
                      }}>
                      <Thumb media={m} badge={false} />
                    </div>
                  ))}
                  {!images.length ? <span className="sf-faint sf-small">Sin imágenes todavía.</span> : null}
                </div>
              </div>
            );
          }) : <p className="sf-faint sf-small">Aún no tiene grupos.</p>}
        </div>
      ))}
    </section>
  );
}

/**
 * «Compartir biblioteca» (docs/INTERFAZ.md §2.8.1): on or off, and for whom:
 * every production of Sweet Flow, or those inside one of the folders this
 * production is in. No links: the other productions just see it, always up to
 * date, in their own Biblioteca.
 */
function ShareLibrary() {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const lib = useStore((s) => s.lib);
  const productionId = useStore((s) => s.productionId);
  const share = snap.production.libraryShare;
  // The folders this production is in, from the closest one up.
  const folders: Array<{ id: Id; name: string }> = [];
  if (lib && productionId) {
    const byId = new Map(lib.entries.map((e) => [e.id, e]));
    for (let cur = byId.get(productionId)?.parentId; cur; cur = byId.get(cur)?.parentId) {
      const f = byId.get(cur);
      if (f) folders.push({ id: f.id, name: f.name });
    }
  }
  const label = !share ? "Compartir biblioteca" : share.scope === "all" ? "Compartida con todo Sweet Flow" : `Compartida con «${folders.find((f) => f.id === share.folderId)?.name ?? "una carpeta"}»`;
  const pick = (next: LibraryShare | null) => source.setLibraryShare(next);
  const on = (s: LibraryShare) => JSON.stringify(s) === JSON.stringify(share ?? null);
  return (
    <Popover align="right" className="libshare" button={({ open, toggle }) => (
      <Button size="sm" className={cx(share && "libshare__on", open && "is-on")} onClick={toggle}><IconBooks size={14} /> {label}</Button>
    )}>
      <div className="menu__title">Compartir la biblioteca</div>
      <label className="libshare__switch">
        <input type="checkbox" checked={!!share} onChange={(e) => pick(e.target.checked ? (folders[0] ? { scope: "folder", folderId: folders[0].id } : { scope: "all" }) : null)} />
        <span><b>{share ? "Compartida" : "Solo esta producción"}</b><span className="sf-faint sf-small"> · las demás la ven en su Biblioteca, siempre al día; solo se edita aquí.</span></span>
      </label>
      {share ? (
        <div className="libshare__scopes">
          <div className="sf-faint sf-small">Para:</div>
          {folders.map((f) => (
            <button key={f.id} className={cx("libshare__scope", on({ scope: "folder", folderId: f.id }) && "is-on")} onClick={() => pick({ scope: "folder", folderId: f.id })}>
              Las producciones de «{f.name}»
            </button>
          ))}
          <button className={cx("libshare__scope", on({ scope: "all" }) && "is-on")} onClick={() => pick({ scope: "all" })}>Todo Sweet Flow</button>
        </div>
      ) : null}
    </Popover>
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
      // A click anywhere in the row that is not an image or a button selects the group.
      onClick={(e) => { if (!(e.target as HTMLElement).closest(".libimg, button, input, [contenteditable=true]")) select(group.id, "produce", true); }}
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes(MEDIA_DRAG)) e.preventDefault();
      }}
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
        // Images of another production's library stay there (they are only read here).
        const own = dragging.filter((id) => id !== h.before && snap.media.some((m) => m.id === id));
        if (own.length) source.placeLibMedia(own, group.id, h.before);
        else useStore.getState().notify("Esa imagen es de la biblioteca de otra producción: úsala como referencia, no se mueve aquí.");
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
              // Moved inside the library, copied into the references of Generar: both must be allowed.
              e.dataTransfer.effectAllowed = "copyMove";
              // The reference slots light up while it is dragged.
              document.body.classList.add("sf-drag-media");
            }}
            onDragEnd={() => { dragging = []; document.body.classList.remove("sf-drag-media"); }}
            onClick={(e) => click(e, m)}>
            <Thumb media={m} badge={false} />
            {/* Same buttons as the gallery's versions. */}
            <span className={cx("version__acts", m.chosen && "version__acts--show")} onClick={(e) => e.stopPropagation()}>
              {m.generation ? (
                <button className="version__act" title="Recrear: carga en Generar el prompt, el modelo y las referencias con los que se hizo"
                  onClick={(e) => { e.stopPropagation(); select(group.id, "produce"); set({ recreate: m.id, activeMediaId: m.id }); }}><IconRefresh size={13} /></button>
              ) : null}
              <button className={cx("version__act", m.chosen && "version__act--on")} title={m.chosen ? "Favorita: sale marcada al usar el grupo como referencia. Clic para quitarla" : "Marcar como favorita: sale ya marcada al usar el grupo como referencia (@ o «De la biblioteca»)"}
                onClick={(e) => { e.stopPropagation(); source.setChosen([m.id], !m.chosen); }}>
                {m.chosen ? <IconStarFilled size={13} /> : <IconStar size={13} />}
              </button>
              <button className="version__act" title="Eliminar esta imagen del grupo"
                onClick={(e) => {
                  e.stopPropagation();
                  source.setArchived(m.id, true);
                  useStore.getState().notify("Imagen eliminada del grupo.", { label: "Deshacer", run: () => { source.setArchived(m.id, false); useStore.getState().set({ notice: null }); } });
                }}><IconTrash size={13} /></button>
            </span>
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
