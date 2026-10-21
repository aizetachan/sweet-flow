/**
 * The editor's panel (docs/INTERFAZ.md §4), on the left like Producción's
 * and Biblioteca's. «Planos»: the production's shots, as a tree (like the
 * Explorer) or a gallery, filtered by status, to drag onto the timeline;
 * a scene or a sequence dragged goes in as a block with its own montage.
 * «Clip»: what is selected on the timeline.
 */

import { useMemo, useState, type ReactNode } from "react";
import { IconChevronDown, IconChevronRight, IconFolderOpen, IconLayoutGrid, IconLink, IconLinkOff, IconListTree, IconSearch, IconStack2, IconStackPop, IconTrash, IconVideo, IconX } from "@tabler/icons-react";
import { childrenOf, clipEnd, clipLength, codeOf, isUnit, timecode, trackName, versionTag, type Edit, type Id, type ProdNode } from "@sweetflow/domain";
import { Button, cx, Segmented } from "@sweetflow/ui";
import { Thumb } from "../components/media";
import type { Snapshot } from "../data/source";
import { statusOf } from "../state/selectors";
import { useStore } from "../state/store";
import { clipLabel, editLookup, editName, saveEdits, shotPlay, shotsIn, useCurrentEdit } from "./model";
import { deleteSelection, groupSelection, toggleLink, ungroupSelection, usePrefs } from "./actions";
import { clipFps } from "./frames";
import { endDrag, startDrag } from "./dnd";
import { dropInto } from "./Timeline";

export function EditorPanel() {
  const tab = useStore((s) => s.editTab);
  const set = useStore((s) => s.set);
  const sel = useStore((s) => s.editSel);
  return (
    <aside className="side">
      <div className="sidetabs" role="tablist">
        <button role="tab" aria-selected={tab === "bin"} className={cx("sidetabs__tab", tab === "bin" && "sidetabs__tab--on")} onClick={() => set({ editTab: "bin" })}>Planos</button>
        <button role="tab" aria-selected={tab === "clip"} className={cx("sidetabs__tab", tab === "clip" && "sidetabs__tab--on")} onClick={() => set({ editTab: "clip" })}>
          Clip{sel.length > 1 ? ` (${sel.length})` : ""}
        </button>
      </div>
      {tab === "bin" ? <Bin /> : <ClipInfo />}
    </aside>
  );
}

// ---------- Planos ----------

type Filter = { query: string; statusIds: Id[]; videoOnly: boolean };

function Bin() {
  const snap = useStore((s) => s.snap)!;
  const { bin, thumb } = usePrefs();
  const setPrefs = usePrefs((s) => s.set);
  const { edit } = useCurrentEdit();
  const [f, setF] = useState<Filter>({ query: "", statusIds: [], videoOnly: false });
  const [picked, setPicked] = useState<Id[]>([]);
  const used = useMemo(() => shotsIn(edit), [edit]);
  const p = snap.production;

  // Which shots pass the filters, and which levels hold one.
  const { shots, levels } = useMemo(() => {
    const q = f.query.trim().toLowerCase();
    const ok = new Set<Id>();
    for (const n of snap.nodes) {
      if (!isUnit(p, n)) continue;
      if (f.statusIds.length && !f.statusIds.includes(n.statusId)) continue;
      if (f.videoOnly && !(shotPlay(snap, n.id)?.length)) continue;
      if (q && !`${codeOf(p, n)} ${n.title}`.toLowerCase().includes(q)) continue;
      ok.add(n.id);
    }
    const lv = new Set<Id>();
    const byId = new Map(snap.nodes.map((n) => [n.id, n]));
    for (const id of ok) for (let cur = byId.get(byId.get(id)!.parentId ?? ""); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) lv.add(cur.id);
    return { shots: ok, levels: lv };
  }, [snap, f, p]);

  const pick = (id: Id, add: boolean) => setPicked((cur) => (add ? (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]) : [id]));
  // Dragging what is picked when the item is among them; else just it.
  const dragIds = (id: Id) => (picked.includes(id) ? picked : [id]);
  /** Double click: at the playhead, on V1 (with its sound on A1). */
  const placeAtPlayhead = (ids: Id[]) => {
    if (!edit) return;
    const v1 = edit.tracks.find((t) => t.kind === "video")!, a1 = edit.tracks.find((t) => t.kind === "audio")!;
    dropInto(snap, edit, ids, { trackId: v1.id, start: useStore.getState().editTime }, a1.id);
  };
  const openLevel = (id: Id) => useStore.getState().set({ editorPath: [{ nodeId: id }], editSel: [], editTime: 0 });
  const statuses = [...p.statuses].sort((a, b) => a.order - b.order);

  return (
    <div className="ebin">
      <div className="ebin__head">
        <Segmented value={bin} onChange={(v) => setPrefs({ bin: v })} items={[
          { id: "gallery", label: <><IconLayoutGrid size={14} /> Galería</>, title: "Ver los planos en miniatura" },
          { id: "tree", label: <><IconListTree size={14} /> Árbol</>, title: "Ver la estructura, como el Explorer" },
        ]} />
        {bin === "gallery" ? (
          <Segmented value={thumb} onChange={(v) => setPrefs({ thumb: v })} items={[
            { id: "s", label: "S", title: "Miniaturas pequeñas" },
            { id: "m", label: "M", title: "Miniaturas medianas" },
            { id: "l", label: "L", title: "Miniaturas grandes" },
          ]} />
        ) : null}
      </div>
      <label className="ebin__search">
        <IconSearch size={14} className="sf-faint" />
        <input value={f.query} placeholder="Buscar por código o título" onChange={(e) => setF({ ...f, query: e.target.value })} />
        {f.query ? <button className="ebin__clear" aria-label="Borrar la búsqueda" onClick={() => setF({ ...f, query: "" })}><IconX size={12} /></button> : null}
      </label>
      <div className="ebin__chips">
        {statuses.map((st) => {
          const on = f.statusIds.includes(st.id);
          return (
            <button key={st.id} className={cx("ebin__chip", on && "is-on")} style={{ ["--st" as string]: st.color }}
              onClick={() => setF({ ...f, statusIds: on ? f.statusIds.filter((x) => x !== st.id) : [...f.statusIds, st.id] })}>
              <span className="ebin__dot" /> {st.name}
            </button>
          );
        })}
        <button className={cx("ebin__chip", f.videoOnly && "is-on")} onClick={() => setF({ ...f, videoOnly: !f.videoOnly })} title="Solo los planos que ya tienen vídeo">
          <IconVideo size={12} /> Con vídeo
        </button>
      </div>
      <div className="ebin__body" onDragEnd={endDrag}>
        {!shots.size ? <p className="sf-faint sf-small ebin__none">Ningún plano con estos filtros.</p> : bin === "tree" ? (
          <Tree snap={snap} parentId={null} shots={shots} levels={levels} used={used} picked={picked} onPick={pick} dragIds={dragIds} onPlace={placeAtPlayhead} onOpen={openLevel} depth={0} />
        ) : (
          <Gallery snap={snap} shots={shots} used={used} picked={picked} onPick={pick} dragIds={dragIds} onPlace={placeAtPlayhead} onOpen={openLevel} size={thumb} />
        )}
      </div>
      <p className="ebin__tip sf-faint sf-small">Arrastra a la línea de tiempo · doble clic: al cabezal · ⌘ o ⇧ para coger varios</p>
    </div>
  );
}

type ItemProps = { snap: Snapshot; used: Set<Id>; picked: Id[]; onPick: (id: Id, add: boolean) => void; dragIds: (id: Id) => Id[]; onPlace: (ids: Id[]) => void; onOpen: (id: Id) => void };

function Tree({ snap, parentId, shots, levels, depth, ...rest }: ItemProps & { parentId: Id | null; shots: Set<Id>; levels: Set<Id>; depth: number }) {
  const [closed, setClosed] = useState<Record<Id, boolean>>({});
  const kids = childrenOf(snap.nodes, parentId).filter((n) => shots.has(n.id) || levels.has(n.id));
  return (
    <>
      {kids.map((n) => {
        const unit = isUnit(snap.production, n);
        const open = !closed[n.id];
        return (
          <div key={n.id}>
            <TreeRow snap={snap} node={n} depth={depth} unit={unit} open={open} onToggle={() => setClosed({ ...closed, [n.id]: open })} {...rest} />
            {!unit && open ? <Tree snap={snap} parentId={n.id} shots={shots} levels={levels} depth={depth + 1} {...rest} /> : null}
          </div>
        );
      })}
    </>
  );
}

function TreeRow({ snap, node, depth, unit, open, onToggle, used, picked, onPick, dragIds, onPlace, onOpen }: ItemProps & { node: ProdNode; depth: number; unit: boolean; open: boolean; onToggle: () => void }) {
  const play = unit ? shotPlay(snap, node.id) : null;
  const playable = !unit || !!play?.length;
  const st = statusOf(snap, node);
  return (
    <div className={cx("etree__row", picked.includes(node.id) && "is-on", !playable && "is-off")} style={{ paddingLeft: 8 + depth * 14 }}
      draggable={playable}
      onDragStart={(e) => startDrag(e, dragIds(node.id))}
      onClick={(e) => onPick(node.id, e.metaKey || e.ctrlKey || e.shiftKey)}
      onDoubleClick={() => (unit ? onPlace(dragIds(node.id)) : onOpen(node.id))}
      title={unit ? (playable ? "Arrastra a la línea de tiempo · doble clic: al cabezal" : "Aún no tiene vídeo") : "Arrastra para meterlo como bloque · doble clic: abrir su montaje"}>
      {unit ? <span className="etree__dot" style={{ background: st.color }} /> : (
        <button className="etree__chev" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-label={open ? "Plegar" : "Desplegar"}>
          {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
        </button>
      )}
      {unit && play?.poster ? <img className="etree__thumb" src={play.poster} alt="" draggable={false} /> : null}
      <b className="etree__code">{codeOf(snap.production, node)}</b>
      <span className="etree__title">{node.title}</span>
      {unit && play?.length ? <span className="etree__dur sf-faint">{play.length.toFixed(1)}s</span> : null}
      {used.has(node.id) ? <span className="etree__used" title="Ya está en este montaje">●</span> : null}
      {!unit ? (
        <button className="etree__open" title="Abrir su montaje" onClick={(e) => { e.stopPropagation(); onOpen(node.id); }}><IconFolderOpen size={13} /></button>
      ) : null}
    </div>
  );
}

function Gallery({ snap, shots, size, ...rest }: ItemProps & { shots: Set<Id>; size: "s" | "m" | "l" }) {
  const [closed, setClosed] = useState<Record<Id, boolean>>({});
  // One section per level that holds shots (a scene, by default), in the board's order.
  const sections = useMemo(() => {
    const out: ProdNode[] = [];
    const walk = (parentId: Id | null) => {
      for (const n of childrenOf(snap.nodes, parentId)) {
        if (isUnit(snap.production, n)) continue;
        if (childrenOf(snap.nodes, n.id).some((k) => shots.has(k.id))) out.push(n);
        walk(n.id);
      }
    };
    walk(null);
    return out;
  }, [snap, shots]);
  const path = (n: ProdNode) => {
    const parts: string[] = [];
    for (let cur: ProdNode | undefined = snap.nodes.find((x) => x.id === n.parentId); cur; cur = snap.nodes.find((x) => x.id === cur!.parentId)) parts.unshift(codeOf(snap.production, cur));
    return parts;
  };
  return (
    <div className={cx("egal", `egal--${size}`)}>
      {sections.map((sec) => {
        const open = !closed[sec.id];
        const kids = childrenOf(snap.nodes, sec.id).filter((k) => shots.has(k.id));
        return (
          <section key={sec.id} className="egal__sec">
            <header className="egal__head" draggable onDragStart={(e) => startDrag(e, [sec.id])} title="Arrastra para meter la escena entera como bloque · doble clic: abrir su montaje"
              onDoubleClick={() => rest.onOpen(sec.id)}>
              <button className="etree__chev" onClick={() => setClosed({ ...closed, [sec.id]: open })} aria-label={open ? "Plegar" : "Desplegar"}>
                {open ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
              </button>
              <span className="egal__path sf-faint">{path(sec).join(" › ")}{path(sec).length ? " › " : ""}</span>
              <b>{codeOf(snap.production, sec)}</b>
              <span className="egal__title">{sec.title}</span>
              <span className="grow" />
              <span className="sf-faint sf-small">{kids.length}</span>
              <button className="etree__open" title="Abrir su montaje" onClick={() => rest.onOpen(sec.id)}><IconFolderOpen size={13} /></button>
            </header>
            {open ? (
              <div className="egal__grid">
                {kids.map((n) => <Tile key={n.id} snap={snap} node={n} {...rest} />)}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function Tile({ snap, node, used, picked, onPick, dragIds, onPlace }: ItemProps & { node: ProdNode }) {
  const play = shotPlay(snap, node.id);
  const playable = !!play?.length;
  const st = statusOf(snap, node);
  return (
    <div className={cx("etile", picked.includes(node.id) && "is-on", !playable && "is-off")} style={{ ["--st" as string]: st.color }}
      draggable={playable}
      onDragStart={(e) => startDrag(e, dragIds(node.id))}
      onClick={(e) => onPick(node.id, e.metaKey || e.ctrlKey || e.shiftKey)}
      onDoubleClick={() => playable && onPlace(dragIds(node.id))}
      title={`${codeOf(snap.production, node)} ${node.title} · ${st.name}${playable ? "" : " · aún sin vídeo"}`}>
      <Thumb media={play?.media} take={play?.take} preview badge={playable} className="etile__thumb" />
      <span className="etile__foot">
        <b>{codeOf(snap.production, node)}</b>
        <span className="etile__title">{node.title}</span>
        {used.has(node.id) ? <span className="etree__used" title="Ya está en este montaje">●</span> : null}
      </span>
    </div>
  );
}

// ---------- Clip ----------

function ClipInfo() {
  const snap = useStore((s) => s.snap)!;
  const sel = useStore((s) => s.editSel);
  const set = useStore((s) => s.set);
  const { edit } = useCurrentEdit();
  if (!edit) return null;
  const clips = edit.clips.filter((c) => sel.includes(c.id));
  if (!clips.length) return <div className="eclip"><p className="sf-faint sf-small">Selecciona un clip en la línea de tiempo para ver aquí de dónde sale, sus tiempos y su enlace.</p></div>;
  if (clips.length > 1) {
    return (
      <div className="eclip">
        <h3 className="eclip__title">{clips.length} clips seleccionados</h3>
        <div className="eclip__acts">
          <Button onClick={() => groupSelection(edit)}><IconStack2 size={14} /> Agrupar</Button>
          <Button onClick={() => toggleLink(edit)}><IconLink size={14} /> Enlazar / desenlazar</Button>
          <Button variant="ghost" onClick={() => deleteSelection(edit)}><IconTrash size={14} /> Eliminar</Button>
        </div>
      </div>
    );
  }
  const c = clips[0]!;
  const label = clipLabel(snap, c);
  const fps = edit.format.fps;
  const own = clipFps(snap, edit, c);
  const play = c.source.kind === "shot" ? shotPlay(snap, c.source.nodeId) : null;
  const inner = c.source.kind === "edit" ? editLookup(snap)(c.source.editId) : undefined;
  const kind = edit.tracks.find((t) => t.id === c.trackId)?.kind;
  return (
    <div className="eclip">
      <span className="eclip__kicker sf-faint sf-small">{c.source.kind === "edit" ? (inner?.group ? "Grupo" : "Bloque") : kind === "audio" ? "Sonido del plano" : "Plano"} · {trackName(edit, c.trackId)}</span>
      {inner?.group ? (
        <GroupName edit={inner} />
      ) : (
        <h3 className="eclip__title">{label.code ? <b>{label.code}</b> : null} {label.title}</h3>
      )}
      {play ? (
        <>
          <Thumb media={play.media} take={play.take} preview className="eclip__thumb" />
          <Row k="Versión">{play.media ? versionTag(play.media.version) : "—"}{play.take ? " · su tramo elegido" : ""}</Row>
          <Row k="Estado"><span className="etree__dot" style={{ background: statusOf(snap, play.node).color }} /> {statusOf(snap, play.node).name}</Row>
        </>
      ) : inner ? <Row k="Contiene">{inner.clips.length} clips · {editName(snap, inner)}</Row> : null}
      <Row k="En el montaje">{timecode(c.start, fps)} → {timecode(clipEnd(c), fps)}</Row>
      <Row k="Del original">{timecode(c.inSec + (play?.fileIn ?? 0), own)} → {timecode(c.outSec + (play?.fileIn ?? 0), own)}{own !== fps ? <span className="sf-faint"> (a {own} fps)</span> : null}</Row>
      <Row k="Duración">{clipLength(c).toFixed(3)} s · {Math.round(clipLength(c) * own)} fotogramas</Row>
      <Row k="Enlace">{c.linkId ? "Vídeo y sonido enlazados" : "Por separado"}</Row>
      <div className="eclip__acts">
        <Button onClick={() => toggleLink(edit)}>{c.linkId ? <><IconLinkOff size={14} /> Desenlazar</> : <><IconLink size={14} /> Enlazar</>}</Button>
        {c.source.kind === "edit" ? (
          <Button onClick={() => set({ editorPath: [...useStore.getState().editorPath, { editId: (c.source as { editId: Id }).editId }], editSel: [], editTime: 0 })}><IconFolderOpen size={14} /> Abrir el bloque</Button>
        ) : (
          <Button onClick={() => {
            set({ view: "board" });
            useStore.getState().select((c.source as { nodeId: Id }).nodeId, "produce");
          }}><IconFolderOpen size={14} /> Abrir el plano</Button>
        )}
        {inner?.group ? <Button onClick={() => ungroupSelection(edit)}><IconStackPop size={14} /> Desagrupar</Button> : null}
        <Button variant="ghost" onClick={() => deleteSelection(edit)}><IconTrash size={14} /> Eliminar</Button>
      </div>
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="eclip__row">
      <span className="sf-faint">{k}</span>
      <span>{children}</span>
    </div>
  );
}

function GroupName({ edit }: { edit: Edit }) {
  const [name, setName] = useState(edit.group!.name);
  const save = () => {
    const v = name.trim();
    if (v && v !== edit.group!.name) saveEdits([{ ...edit, group: { name: v } }]);
    else setName(edit.group!.name);
  };
  return <input className="sf-input eclip__name" value={name} aria-label="Nombre del grupo" onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />;
}
