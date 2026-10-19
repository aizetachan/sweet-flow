/**
 * The library (docs/INTERFAZ.md §2.8): reference images, centred on the
 * image. On top, the desk, where whatever is generated without a card lands;
 * below, a row per kind (characters, places, props, styles, others) with its
 * cards. Pick images on the desk and make a card of them, or drag them onto a
 * card; open a card to see its chosen images and its exploration. The panel on
 * the left generates into what is selected (the desk when nothing is).
 */

import { useEffect, useMemo, useState, type DragEvent, type MouseEvent } from "react";
import { IconArchive, IconArrowBackUp, IconArrowLeft, IconPlus, IconStack2, IconStar, IconStarFilled, IconTrash, IconX } from "@tabler/icons-react";
import { type AssetType, type Id, type Media, type ProdNode } from "@sweetflow/domain";
import { Button, cx } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { Thumb } from "../components/media";
import { Popover } from "../components/Popover";
import { ContextMenu, type MenuAt } from "../components/ContextMenu";
import { InlineEdit } from "../board/Board";
import { LIB_TYPES } from "../inspector/Inspector";

const MEDIA_DRAG = "application/x-sweetflow-media";

/** Name of a new card until it gets its own. */
const defaultName = (t: AssetType) => (t === "other" ? "Ficha nueva" : `${LIB_TYPES.find((x) => x.id === t)!.label} nuevo`);

/** Images of a library node, newest first; not archived. */
function imagesOf(media: Media[], nodeId: Id): Media[] {
  return media.filter((m) => m.nodeId === nodeId && !m.archived).sort((a, b) => b.createdAt - a.createdAt);
}

export function LibraryBoard() {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const selectedId = useStore((s) => s.selectedId);
  const openId = useStore((s) => s.libOpenId);
  const set = useStore((s) => s.set);
  const select = useStore((s) => s.select);
  const desk = snap.library.find((n) => n.lib?.kind === "desk");
  const cards = snap.library.filter((n) => n.lib?.kind === "card");
  const open = openId ? cards.find((c) => c.id === openId) : undefined;

  // The desk exists from the first visit; with nothing of the library selected, it is what the panel generates into.
  useEffect(() => {
    if (!desk) source.libraryDesk();
  }, [desk, source]);
  useEffect(() => {
    // Coming from the board: the panel opens on the desk, ready to generate.
    if (desk && !snap.library.some((n) => n.id === selectedId)) select(desk.id, "produce");
  }, [desk, selectedId, snap.library, select]);

  if (open) return <CardView card={open} onBack={() => { set({ libOpenId: null }); }} />;
  return (
    <div className="libb">
      <header className="libb__head">
        <h1>Biblioteca</h1>
        <span className="sf-muted sf-small">Imágenes de referencia: genera, elige y agrúpalas en fichas para usarlas en los planos.</span>
      </header>
      {desk ? <Desk desk={desk} cards={cards} /> : null}
      {LIB_TYPES.map((t) => {
        const list = cards.filter((c) => c.lib?.kind === "card" && c.lib.type === t.id).sort((a, b) => a.title.localeCompare(b.title, "es"));
        return (
          <section key={t.id} className="libb__lane">
            <div className="libb__lanehead"><b>{t.plural}</b>{list.length ? <span className="sf-faint sf-small">{list.length}</span> : null}</div>
            <div className="libb__cards">
              {list.map((c) => <CardTile key={c.id} card={c} />)}
              <button className="libb__new" title={`Nueva ficha: ${t.label.toLowerCase()}`} onClick={() => {
                const id = source.createLibCard(t.id, defaultName(t.id));
                select(id, "produce", true);
              }}>
                <IconPlus size={18} />
                <span className="sf-small">{t.label}</span>
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Selected images, shared by the desk and an open card. */
function useImageSelection(ids: Id[]) {
  const [picked, setPicked] = useState<Id[]>([]);
  // Drop what is no longer here (moved to a card, archived).
  useEffect(() => setPicked((p) => p.filter((id) => ids.includes(id))), [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const click = (e: MouseEvent, id: Id) => {
    if (e.metaKey || e.ctrlKey) return setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    if (e.shiftKey && picked.length) {
      const a = ids.indexOf(picked.at(-1)!);
      const b = ids.indexOf(id);
      const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
      return setPicked((p) => [...new Set([...p, ...range])]);
    }
    setPicked((p) => (p.length === 1 && p[0] === id ? [] : [id]));
  };
  return { picked, setPicked, click };
}

function Desk({ desk, cards }: { desk: ProdNode; cards: ProdNode[] }) {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const select = useStore((s) => s.select);
  const set = useStore((s) => s.set);
  const images = imagesOf(snap.media, desk.id);
  const ids = images.map((m) => m.id);
  const sel = useImageSelection(ids);
  const show = (m: Media) => {
    select(desk.id, "produce", true);
    set({ activeMediaId: m.id });
  };
  return (
    <section className="libb__desk">
      <div className="libb__deskhead">
        <b>Mesa de trabajo</b>
        <span className="sf-faint sf-small">{images.length ? `${images.length} ${images.length === 1 ? "imagen" : "imágenes"}` : ""}</span>
        <span className="grow" />
        {sel.picked.length ? (
          <div className="libb__actions">
            <span className="sf-small">{sel.picked.length} {sel.picked.length === 1 ? "seleccionada" : "seleccionadas"}</span>
            <CreateCard onCreate={(type, name) => {
              const id = source.createLibCard(type, name, sel.picked);
              sel.setPicked([]);
              select(id, "produce", true);
            }} />
            <AddToCard cards={cards} onPick={(cardId) => { source.moveToLib(sel.picked, cardId, true); sel.setPicked([]); }} />
            <Button size="sm" variant="ghost" title="Archivar (se puede recuperar en la galería)" onClick={() => { for (const id of sel.picked) source.setArchived(id, true); sel.setPicked([]); }}><IconArchive size={14} /></Button>
            <Button size="sm" variant="ghost" title="Quitar la selección" onClick={() => sel.setPicked([])}><IconX size={14} /></Button>
          </div>
        ) : images.length ? <span className="sf-faint sf-small">Selecciona (⌘ o ⇧ para varias) y crea una ficha, o arrástralas a una.</span> : null}
      </div>
      {images.length ? (
        <div className="libb__grid">
          {images.map((m) => <ImageTile key={m.id} media={m} picked={sel.picked.includes(m.id)} dragIds={sel.picked.includes(m.id) ? sel.picked : [m.id]}
            onClick={(e) => { sel.click(e, m.id); show(m); }} />)}
        </div>
      ) : (
        <div className="libb__empty sf-muted">
          <IconStack2 size={20} />
          <span>Genera en el panel de la izquierda: lo que generas sin elegir ficha cae aquí. Luego eliges las buenas y haces una ficha con ellas.</span>
        </div>
      )}
    </section>
  );
}

function ImageTile({ media, picked, chosen, dragIds, onClick, onToggleChosen, onToDesk }: {
  media: Media;
  picked: boolean;
  chosen?: boolean;
  dragIds: Id[];
  onClick: (e: MouseEvent) => void;
  onToggleChosen?: () => void;
  onToDesk?: () => void;
}) {
  return (
    <div className={cx("libimg", picked && "is-picked")} draggable onClick={onClick}
      onDragStart={(e) => {
        e.dataTransfer.setData(MEDIA_DRAG, JSON.stringify(dragIds));
        e.dataTransfer.effectAllowed = "move";
      }}>
      <Thumb media={media} badge={false} />
      {media.status !== "ready" ? <span className="libimg__state sf-small">{media.status === "failed" ? "Fallida" : `${media.progress}%`}</span> : null}
      {onToggleChosen ? (
        <button className={cx("libimg__star", chosen && "is-on")} title={chosen ? "Quitar de las elegidas" : "Elegir como referencia"} onClick={(e) => { e.stopPropagation(); onToggleChosen(); }}>
          {chosen ? <IconStarFilled size={14} /> : <IconStar size={14} />}
        </button>
      ) : null}
      {onToDesk ? (
        <button className="libimg__desk" title="Devolver a la mesa de trabajo" onClick={(e) => { e.stopPropagation(); onToDesk(); }}><IconArrowBackUp size={14} /></button>
      ) : null}
    </div>
  );
}

/** «Crear ficha»: its kind and its name. */
function CreateCard({ onCreate }: { onCreate: (type: AssetType, name: string) => void }) {
  const [type, setType] = useState<AssetType>("cast");
  const [name, setName] = useState("");
  return (
    <Popover align="right" className="libb__create" button={({ open, toggle }) => (
      <Button size="sm" variant="primary" className={open ? "is-on" : undefined} onClick={toggle}><IconPlus size={14} /> Crear ficha</Button>
    )}>
      <div className="menu__title">Nueva ficha</div>
      <div className="libb__types">
        {LIB_TYPES.map((t) => <button key={t.id} className={cx("libb__type", type === t.id && "is-on")} onClick={() => setType(t.id)}>{t.label}</button>)}
      </div>
      <input className="sf-input" autoFocus placeholder={type === "cast" ? "Nombre (Elena, Tomás…)" : type === "location" ? "Nombre (Faro, Puerto…)" : "Nombre"} value={name}
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onCreate(type, name || defaultName(type))} />
      <button className="menu__item" onClick={() => onCreate(type, name || defaultName(type))}><IconPlus size={14} /> <span className="menu__label">Crear «{name || defaultName(type)}»</span></button>
    </Popover>
  );
}

/** «Añadir a…»: an existing card, by kind. */
function AddToCard({ cards, onPick }: { cards: ProdNode[]; onPick: (cardId: Id) => void }) {
  return (
    <Popover align="right" className="libb__addto" button={({ toggle }) => <Button size="sm" disabled={!cards.length} onClick={toggle}>Añadir a…</Button>}>
      {LIB_TYPES.map((t) => {
        const list = cards.filter((c) => c.lib?.kind === "card" && c.lib.type === t.id);
        return list.length ? (
          <div key={t.id}>
            <div className="menu__title">{t.plural}</div>
            {list.map((c) => <button key={c.id} className="menu__item" onClick={() => onPick(c.id)}><span className="menu__label">{c.title}</span></button>)}
          </div>
        ) : null;
      })}
    </Popover>
  );
}

/** Accepts images dragged onto it: they go in as chosen references. */
function useImageDrop(onDrop: (ids: Id[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(MEDIA_DRAG)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        setOver(false);
        if (!e.dataTransfer.types.includes(MEDIA_DRAG)) return;
        e.preventDefault();
        try {
          onDrop(JSON.parse(e.dataTransfer.getData(MEDIA_DRAG)) as Id[]);
        } catch {
          // Not ours.
        }
      },
    },
  };
}

/** A card in its row: a mosaic of its chosen images (or its latest), its name and how many. */
function CardTile({ card }: { card: ProdNode }) {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const set = useStore((s) => s.set);
  const trashNodes = useStore((s) => s.trashNodes);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const [rename, setRename] = useState(0);
  const images = imagesOf(snap.media, card.id);
  const chosen = images.filter((m) => m.chosen);
  const tiles = (chosen.length ? chosen : images).slice(0, 4);
  const drop = useImageDrop((ids) => source.moveToLib(ids, card.id, true));
  return (
    <>
      <div className={cx("card libcard", selectedId === card.id && "card--on", drop.over && "dnd-group")} {...drop.props}
        onClick={(e) => { if (e.detail === 1) select(card.id, "produce", true); }}
        onDoubleClick={() => set({ libOpenId: card.id })}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
        title="Doble clic para abrirla">
        <div className={cx("gmosaic", `gmosaic--${Math.max(1, tiles.length)}`)}>
          {tiles.length ? tiles.map((m) => <div key={m.id} className="gmosaic__tile"><Thumb media={m} badge={false} /></div>) : <div className="gmosaic__tile libcard__blank"><IconStack2 size={18} /></div>}
        </div>
        <div className="card__meta">
          <InlineEdit className="card__name" value={card.title} placeholder="Sin nombre" label="Doble clic para cambiar el nombre" startSignal={rename}
            onSave={(title) => source.updateNode(card.id, { title })} />
        </div>
        <div className="card__row">
          <span className="card__title card__codeline">{chosen.length ? `${chosen.length} ${chosen.length === 1 ? "elegida" : "elegidas"} · ` : ""}{images.length} {images.length === 1 ? "imagen" : "imágenes"}</span>
        </div>
      </div>
      {menu ? (
        <ContextMenu at={menu} onClose={() => setMenu(null)}>
          <div className="menu__title">Ficha</div>
          <button className="menu__item" onClick={() => set({ libOpenId: card.id })}><IconStack2 size={14} /> <span className="menu__label">Abrir</span></button>
          <button className="menu__item" onClick={() => setRename((n) => n + 1)}><span className="menu__label">Cambiar el nombre</span></button>
          <div className="menu__sep" />
          {LIB_TYPES.map((t) => (
            <button key={t.id} className="menu__item" disabled={card.lib?.kind === "card" && card.lib.type === t.id} onClick={() => source.setLibType(card.id, t.id)}>
              <span className="menu__label">Es un {t.label.toLowerCase()}</span>
            </button>
          ))}
          <div className="menu__sep" />
          <button className="menu__item menu__item--danger" onClick={() => trashNodes([card.id])}><IconTrash size={14} /> <span className="menu__label">Mover a la papelera</span></button>
        </ContextMenu>
      ) : null}
    </>
  );
}

/** An open card: its chosen images on top, its exploration below. */
function CardView({ card, onBack }: { card: ProdNode; onBack: () => void }) {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const select = useStore((s) => s.select);
  const set = useStore((s) => s.set);
  const desk = snap.library.find((n) => n.lib?.kind === "desk");
  const images = imagesOf(snap.media, card.id);
  const chosen = images.filter((m) => m.chosen);
  const rest = images.filter((m) => !m.chosen);
  const ids = useMemo(() => [...chosen, ...rest].map((m) => m.id), [chosen, rest]);
  const sel = useImageSelection(ids);
  // Generating while it is open fills it.
  useEffect(() => {
    select(card.id, "produce", true);
  }, [card.id, select]);
  const tile = (m: Media) => (
    <ImageTile key={m.id} media={m} picked={sel.picked.includes(m.id)} chosen={!!m.chosen} dragIds={sel.picked.includes(m.id) ? sel.picked : [m.id]}
      onClick={(e) => { sel.click(e, m.id); select(card.id, "produce", true); set({ activeMediaId: m.id }); }}
      onToggleChosen={() => source.setChosen([m.id], !m.chosen)}
      onToDesk={desk ? () => source.moveToLib([m.id], desk.id) : undefined} />
  );
  const typeLabel = LIB_TYPES.find((t) => card.lib?.kind === "card" && t.id === card.lib.type)?.label ?? "Ficha";
  return (
    <div className="libb">
      <header className="libb__head libb__head--card">
        <Button size="sm" variant="ghost" onClick={onBack}><IconArrowLeft size={14} /> Volver</Button>
        <span className="libb__kind sf-small">{typeLabel}</span>
        <InlineEdit className="libb__name" value={card.title} placeholder="Sin nombre" label="Doble clic para cambiar el nombre" onSave={(title) => source.updateNode(card.id, { title })} />
        <span className="grow" />
        {sel.picked.length ? (
          <div className="libb__actions">
            <span className="sf-small">{sel.picked.length} {sel.picked.length === 1 ? "seleccionada" : "seleccionadas"}</span>
            <Button size="sm" onClick={() => { source.setChosen(sel.picked, true); sel.setPicked([]); }}><IconStarFilled size={14} /> Elegir</Button>
            <Button size="sm" onClick={() => { source.setChosen(sel.picked, false); sel.setPicked([]); }}><IconStar size={14} /> A exploración</Button>
            {desk ? <Button size="sm" onClick={() => { source.moveToLib(sel.picked, desk.id); sel.setPicked([]); }}><IconArrowBackUp size={14} /> A la mesa</Button> : null}
            <Button size="sm" variant="ghost" title="Quitar la selección" onClick={() => sel.setPicked([])}><IconX size={14} /></Button>
          </div>
        ) : null}
      </header>
      {card.notes.trim() ? <p className="libb__desc sf-muted">{card.notes}</p> : (
        <p className="libb__desc sf-faint sf-small">Sin descripción: en el panel, «Descripción» (cómo es; se usa como base del prompt).</p>
      )}
      <section className="libb__sec">
        <div className="libb__lanehead"><b>Elegidas</b><span className="sf-faint sf-small">las referencias que se mandan al usarla en un plano</span></div>
        {chosen.length ? <div className="libb__grid">{chosen.map(tile)}</div> : <p className="sf-faint sf-small libb__hint">Ninguna aún: marca con ★ las que mejor la representan.</p>}
      </section>
      <section className="libb__sec">
        <div className="libb__lanehead"><b>Exploración</b>{rest.length ? <span className="sf-faint sf-small">{rest.length}</span> : null}</div>
        {rest.length ? <div className="libb__grid">{rest.map(tile)}</div> : <p className="sf-faint sf-small libb__hint">Lo que generes con la ficha abierta cae aquí.</p>}
      </section>
    </div>
  );
}

/** The library in the Explorer tab: the desk, then each kind with its cards. */
export function LibraryTree() {
  const snap = useSnap();
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const set = useStore((s) => s.set);
  const desk = snap.library.find((n) => n.lib?.kind === "desk");
  const cards = snap.library.filter((n) => n.lib?.kind === "card");
  const count = (id: Id) => snap.media.filter((m) => m.nodeId === id && !m.archived).length;
  return (
    <div className="tree">
      <div className="tree__head"><span>Biblioteca</span></div>
      <div className="tree__list">
        {desk ? (
          <div className={cx("trow", selectedId === desk.id && "trow--on")} style={{ paddingLeft: 6 }} onClick={() => { set({ libOpenId: null }); select(desk.id, "produce", true); }}>
            <span className="trow__caret" /><IconStack2 size={13} className="trow__gicon" /><span className="trow__title">Mesa de trabajo</span><span className="trow__prog">{count(desk.id) || ""}</span>
          </div>
        ) : null}
        {LIB_TYPES.map((t) => {
          const list = cards.filter((c) => c.lib?.kind === "card" && c.lib.type === t.id).sort((a, b) => a.title.localeCompare(b.title, "es"));
          return (
            <div key={t.id}>
              <div className="trow trow--group" style={{ paddingLeft: 6 }}><span className="trow__caret" /><span className="trow__title sf-muted">{t.plural}</span><span className="trow__prog">{list.length || ""}</span></div>
              {list.map((c) => (
                <div key={c.id} className={cx("trow", selectedId === c.id && "trow--on")} style={{ paddingLeft: 20 }}
                  onClick={() => select(c.id, "produce", true)} onDoubleClick={() => set({ libOpenId: c.id })}>
                  <span className="trow__caret" /><span className="trow__title">{c.title}</span><span className="trow__prog">{count(c.id) || ""}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
