import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  IconCopy,
  IconExternalLink,
  IconLayoutSidebarLeftExpand,
  IconMovie,
  IconNote,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { ancestorsOf, codeOf, folderPath, isUnit, levelOf, type AssetType, type ProdNode } from "@sweetflow/domain";
import { Avatar, Button, cx, IconButton, Tabs } from "@sweetflow/ui";
import { useSnap, useStore, type FloatingPanel, type PanelTab } from "../state/store";
import { coverOf, presenceAt } from "../state/selectors";
import { StatusPicker } from "../components/StatusPicker";
import { DockedPanel, OwnPanel, usePanel } from "./panel";
import { StageProvider, useWide } from "./stage";
import { Player } from "../components/media";
import { ProduceTab } from "./ProduceTab";
import { CutTab } from "./CutTab";
import { ReviewTab } from "./ReviewTab";
import { ActivityTab } from "./ActivityTab";
import { nameOf, useShowCodes } from "../state/names";

const ASSET_LABEL = { cast: "Personaje", prop: "Prop", location: "Espacio", style: "Estilo", other: "Otro" } as const;
/** Kinds of library card, in the order they show (docs/INTERFAZ.md §2.8). */
export const LIB_TYPES: Array<{ id: AssetType; label: string; plural: string }> = [
  { id: "cast", label: "Personaje", plural: "Personajes" },
  { id: "location", label: "Espacio", plural: "Espacios" },
  { id: "prop", label: "Prop", plural: "Props" },
  { id: "style", label: "Estilo", plural: "Estilos" },
  { id: "other", label: "Otro", plural: "Otros" },
];

/**
 * A scene or shot pinned in the dashboard's side menu keeps its code and title
 * current while it is open here (pinning itself is done from the dashboard).
 */
function PinLabelSync({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { library, productionId } = useStore();
  const pins = useStore((s) => s.lib?.prefs.pins);
  const pin = productionId ? { entryId: productionId, nodeId: node.id, code: codeOf(snap.production, node), title: node.title, level: levelOf(snap.production, node).name } : null;
  const pinned = !!pin && !!pins?.some((x) => x.entryId === pin.entryId && x.nodeId === pin.nodeId);
  useEffect(() => {
    if (pin && pinned) library.setPinned(pin, true);
  }, [pinned, pin?.code, pin?.title, pin?.level]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** The work panel in its column, bound to the selection. */
export function DockedInspector() {
  const snap = useSnap();
  const selectedId = useStore((s) => s.selectedId);
  const popped = useStore((s) => s.popped);
  const node = snap.nodes.find((n) => n.id === selectedId) ?? snap.shelf.find((n) => n.id === selectedId) ?? snap.library.find((n) => n.id === selectedId);
  if (!node) {
    return (
      <div className="insp insp--empty">
        <div>
          <h3>Selecciona una escena o un plano</h3>
          <p className="sf-muted">Desde aquí se genera, se corta y se reparte, se revisa y se comenta. Puedes abrir cada plano en una ventana aparte para trabajar varios a la vez, incluso en otro monitor.</p>
        </div>
      </div>
    );
  }
  if (popped.some((w) => w.nodeId === node.id)) return <OpenElsewhere node={node} />;
  return (
    <div className="insp">
      <DockedPanel nodeId={node.id}><InspectorBody /></DockedPanel>
    </div>
  );
}

/** The selected node is open in a popped window: point there instead of showing it twice. */
function OpenElsewhere({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { focusPopped, bringBack } = useStore();
  return (
    <div className="insp insp--empty insp--elsewhere">
      <div>
        <IconExternalLink size={26} stroke={1.5} className="accent" />
        <h3>{nameOf(snap.production, node)}</h3>
        <p className="sf-muted">Está abierto en una ventana aparte. Trabaja en esa ventana, o tráelo aquí para cerrarla.</p>
        <div className="insp__elsewhere-acts">
          <Button variant="primary" onClick={() => focusPopped(node.id)}><IconExternalLink size={14} /> Ir a la ventana</Button>
          <Button onClick={() => bringBack(node.id)}><IconLayoutSidebarLeftExpand size={14} /> Traer aquí</Button>
        </div>
      </div>
    </div>
  );
}

/** Panels detached inside the app window (docs/INTERFAZ.md §3). */
export function FloatingInspectors() {
  const floating = useStore((s) => s.floating);
  return <>{floating.map((f) => <FloatingInspector key={f.key} f={f} />)}</>;
}

function FloatingInspector({ f }: { f: FloatingPanel }) {
  const update = useStore((s) => s.updateFloating);
  const floating = useStore((s) => s.floating);
  const ref = useRef<HTMLDivElement>(null);
  const bringToFront = () => {
    const top = Math.max(...floating.map((x) => x.z));
    if (f.z < top) update(f.key, { z: top + 1 });
  };
  // Remember the size the user drags it to (CSS resize handle).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.offsetWidth - f.w) > 2 || Math.abs(el.offsetHeight - f.h) > 2) update(f.key, { w: el.offsetWidth, h: el.offsetHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [f.key, f.w, f.h, update]);

  return (
    <div ref={ref} className="floatwin" style={{ left: f.x, top: f.y, width: f.w, height: f.h, zIndex: 40 + f.z }} onPointerDown={bringToFront}>
      <OwnPanel nodeId={f.nodeId} mode="floating">
        <InspectorBody floatKey={f.key} onDragHandle={(e) => startDrag(e, f, update)} />
      </OwnPanel>
    </div>
  );
}

function startDrag(e: ReactPointerEvent, f: FloatingPanel, update: (key: string, p: Partial<FloatingPanel>) => void) {
  if ((e.target as HTMLElement).closest("button, input, textarea, select")) return;
  const dx = e.clientX - f.x;
  const dy = e.clientY - f.y;
  const move = (ev: PointerEvent) => {
    const x = Math.min(Math.max(ev.clientX - dx, -f.w + 120), window.innerWidth - 120);
    const y = Math.min(Math.max(ev.clientY - dy, 0), window.innerHeight - 40);
    update(f.key, { x, y });
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** A node opened in its own OS/browser window. */
export function WindowInspector({ nodeId }: { nodeId: string }) {
  return (
    <div className="insp insp--window">
      <OwnPanel nodeId={nodeId} mode="window"><InspectorBody /></OwnPanel>
    </div>
  );
}

function InspectorBody({ floatKey, onDragHandle }: { floatKey?: string; onDragHandle?: (e: ReactPointerEvent) => void }) {
  const showCodes = useShowCodes();
  const snap = useSnap();
  const panel = usePanel();
  const { select, dockPanel, closeFloating, popOut, source, set, trashNodes } = useStore();
  const node = snap.nodes.find((n) => n.id === panel.nodeId) ?? snap.shelf.find((n) => n.id === panel.nodeId) ?? snap.library.find((n) => n.id === panel.nodeId);
  const p = snap.production;
  // A popped window wide enough: tabs on the left, the viewer on the right (docs/INTERFAZ.md §3).
  const wide = useWide(panel.mode === "window");

  if (!node) {
    return (
      <div className="insp__gone">
        <p className="sf-muted">Este elemento ya no existe (se ha borrado o movido fuera de la producción).</p>
        {floatKey ? <button className="link" onClick={() => closeFloating(floatKey)}>Cerrar</button> : null}
      </div>
    );
  }

  const comments = snap.comments.filter((c) => c.nodeId === node.id && !c.resolved).length;
  // A video of its own (or of its scene), or the stretch of another video it is made of.
  const take = node.selectedTakeId ? snap.takes.find((t) => t.id === node.selectedTakeId) : undefined;
  const hasVideo = snap.media.some((m) => m.kind === "video" && m.status === "ready" && !m.archived && (ancestorsOf(snap.nodes, node).some((a) => a.id === m.nodeId) || m.id === take?.mediaId));
  const { features } = snap;
  const tab: PanelTab = panel.tab === "cut" && !hasVideo ? "produce" : panel.tab;
  const path = folderPath(p, snap.nodes, node);

  const content = (
    <>
      <div className="insp__top">
        {/* Row 1: the title, then the actions and close. */}
        <div className={cx("nhead__row nhead__row--title", onDragHandle && "insp__drag")} onPointerDown={onDragHandle}>
          <input
            className="sf-input sf-input--bare nhead__title"
            value={node.title}
            placeholder={node.lib ? "Nombre de la ficha" : `Título del ${levelOf(p, node).name.toLowerCase()}`}
            title={node.title}
            onChange={(e) => source.updateNode(node.id, { title: e.target.value })}
          />
          {panel.mode === "floating" && floatKey ? (
            <IconButton label="Acoplar al panel lateral" size="sm" onClick={() => dockPanel(floatKey)}><IconLayoutSidebarLeftExpand size={14} /></IconButton>
          ) : null}
          {panel.mode !== "window" && node.lib?.kind !== "desk" ? (
            <IconButton label={`Mover ${nameOf(p, node)} a la papelera (Supr)`} size="sm" onClick={() => trashNodes([node.id])}><IconTrash size={14} /></IconButton>
          ) : null}
          {node.lib ? null : <PinLabelSync node={node} />}
          {/* Its folder path, to paste in the Finder or send (it says sequence, scene and shot). */}
          <IconButton label={`Copiar la ruta: ${path}`} size="sm" onClick={() => {
            void navigator.clipboard?.writeText(path);
            useStore.getState().notify(`Ruta de ${nameOf(p, node)} copiada.`);
          }}><IconCopy size={14} /></IconButton>
          {panel.mode !== "window" ? (
            <IconButton
              label="Abrir en una ventana aparte (puedes llevarla a otro monitor)"
              size="sm"
              onClick={() => {
                popOut(node.id);
                if (floatKey) closeFloating(floatKey);
              }}
            ><IconExternalLink size={14} /></IconButton>
          ) : null}
          <IconButton
            label={panel.mode === "window" ? "Cerrar ventana" : "Cerrar panel"}
            size="sm"
            onClick={() => {
              if (panel.mode === "window") return window.close();
              if (floatKey) return closeFloating(floatKey);
              // Never an empty column: with nothing selected the structure shows.
              select(null);
            }}
          ><IconX size={14} /></IconButton>
        </div>
        {/* Row 2, under the title: the code (only with «Mostrar códigos»), the status and the notes; who works on it on the right. */}
        {node.lib ? (
          // A card of the library: its kind and its description (the base of its prompt); the desk, a hint.
          <div className="nhead__row nhead__row--code">
            {node.lib.kind === "card" ? (
              <>
                <select className="sf-select libtype" value={node.lib.type} title="Tipo de ficha" onChange={(e) => source.setLibType(node.id, e.target.value as AssetType)}>
                  {LIB_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <button className={cx("notes__btn", node.notes.trim() && "notes__btn--on")} title={node.notes.trim() ? node.notes : "Describir: cómo es (base del prompt)"}
                  onClick={() => set({ modal: "notes", notesFor: node.id })}>
                  <IconNote size={13} /> Descripción
                </button>
              </>
            ) : <span className="sf-faint sf-small">Lo que generas sin elegir ficha cae aquí.</span>}
          </div>
        ) : (
          <>
            <div className="nhead__row nhead__row--code">
              {showCodes ? <CodeEditor node={node} /> : null}
              <StatusPicker statuses={p.statuses} value={node.statusId} onChange={(id) => source.updateNode(node.id, { statusId: id })} onEdit={() => set({ modal: "settings", settingsTab: "statuses" })} />
              <button className={cx("notes__btn", node.notes.trim() && "notes__btn--on")} title={node.notes.trim() ? node.notes : "Escribir notas: acción, diálogo, dirección (base del prompt)"}
                onClick={() => set({ modal: "notes", notesFor: node.id })}>
                <IconNote size={13} /> Notas
              </button>
              <span className="insp__spacer" />
              <Assignees node={node} />
            </div>
            <NodeHeader node={node} />
          </>
        )}
      </div>
      <Tabs<PanelTab>
        value={tab}
        onChange={(v) => panel.setPanel({ tab: v })}
        items={[
          { id: "produce", label: "Producir" },
          // Always there on shots (and wherever there is video): off until there is a video to edit.
          ...(hasVideo || isUnit(p, node) ? [{ id: "cut" as const, label: "Editar", disabled: !hasVideo, title: hasVideo ? undefined : "Hace falta un vídeo para editar" }] : []),
          { id: "review", label: "Revisión", count: comments },
          { id: "activity", label: "Actividad" },
        ]}
      />
      {node.shelvedAt !== undefined ? (
        <div className="insp__shelved"><IconMovie size={13} /> Está en «Vídeos editados»{node.parentId ? ` de ${nameOf(p, snap.nodes.find((n) => n.id === node.parentId) ?? node)}` : ""}: en Editar puedes sacar más planos de su vídeo.</div>
      ) : null}
      <div className="insp__body">
        {tab === "produce" ? (features.generation ? <ProduceTab node={node} /> : <ComingSoon what="Generar imágenes y vídeo, versiones y tomas" />) : null}
        {tab === "cut" ? <CutTab node={node} /> : null}
        {tab === "review" ? (features.review ? <ReviewTab node={node} /> : <ComingSoon what="Comentarios y revisión" />) : null}
        {tab === "activity" ? <ActivityTab node={node} /> : null}
      </div>
    </>
  );
  return (
    <StageProvider stage={wide} fallback={<StageFallback node={node} />}>
      {(stage) => (stage ? <div className="insp__wide"><div className="insp__side">{content}</div>{stage}</div> : content)}
    </StageProvider>
  );
}

/** What the stage shows on tabs without a viewer of their own: the node's latest image or video. */
function StageFallback({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { playhead, playing, setPanel } = usePanel();
  const { media } = coverOf(snap, node);
  if (!media) return <div className="insp__stage-empty sf-muted">Aún no hay nada generado en {nameOf(snap.production, node)}.</div>;
  return <Player media={media} time={playhead} playing={playing} onTime={(t) => setPanel({ playhead: t })} onPlaying={(v) => setPanel({ playing: v })} />;
}



function ComingSoon({ what }: { what: string }) {
  return (
    <div className="tab">
      <div className="soon">
        <IconSparkles size={18} />
        <div>
          <strong>Próximamente</strong>
          <p className="sf-muted">{what} llegará pronto en modo local. Mientras tanto puedes organizar la estructura, los estados y los responsables.</p>
        </div>
      </div>
    </div>
  );
}

/** Code with an editable number (the level prefix is fixed). */
function CodeEditor({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const level = levelOf(snap.production, node);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const code = codeOf(snap.production, node);
  useEffect(() => {
    setDraft(null);
    setError(null);
  }, [node.id]);

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    try {
      source.setNodeNumber(node.id, n);
      setDraft(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <span className="codeedit">
      {draft === null ? (
        <button className="nhead__code codeedit__btn" title="Cambiar el número del código" onClick={() => setDraft(String(node.number))}>{code}</button>
      ) : (
        <span className="nhead__code codeedit__field">
          <span className="codeedit__prefix">{level.prefix}</span>
          <input
            autoFocus
            inputMode="numeric"
            value={draft}
            size={level.pad}
            maxLength={level.pad}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(null);
                setError(null);
              }
            }}
          />
        </span>
      )}
      {error ? <span className="codeedit__error" role="alert">{error}</span> : null}
    </span>
  );
}

/** Who works on it: the team's avatars, lit when assigned; a click assigns or removes. */
function Assignees({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const team = snap.members.filter((m) => m.role !== "viewer");
  return (
    <div className="assignees">
      {team.map((m) => {
        const on = node.assigneeIds.includes(m.uid);
        return (
          <button key={m.uid} className={cx("assignee", on && "assignee--on")} title={`${on ? "Quitar" : "Asignar"} ${m.displayName}`} onClick={() =>
            source.updateNode(node.id, { assigneeIds: on ? node.assigneeIds.filter((x) => x !== m.uid) : [...node.assigneeIds, m.uid] })
          }>
            <Avatar name={m.displayName} size={20} />
          </button>
        );
      })}
    </div>
  );
}

function NodeHeader({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const [adding, setAdding] = useState(false);
  const viewers = presenceAt(snap, node.id);
  const assets = node.assetIds.map((id) => snap.assets.find((a) => a.id === id)).filter(Boolean);

  return (
    <div className="nhead">
      {viewers.length ? <div className="nhead__row sf-small sf-muted"><span className="live-dot" /> {viewers.join(", ")} aquí</div> : null}
      {snap.assets.length || assets.length ? (
        <div className="breakdown">
          {assets.map((a) => (
            <span key={a!.id} className="bchip" title={`${ASSET_LABEL[a!.type]} · ${a!.description}`}>
              {a!.imageUrl ? <img src={a!.imageUrl} alt="" /> : null}
              {a!.name}
              <button aria-label="Quitar" onClick={() => source.updateNode(node.id, { assetIds: node.assetIds.filter((x) => x !== a!.id) })}><IconX size={10} /></button>
            </span>
          ))}
          {adding ? (
            <select className="sf-select bchip-add" autoFocus onBlur={() => setAdding(false)} value="" onChange={(e) => {
              if (e.target.value) source.updateNode(node.id, { assetIds: [...node.assetIds, e.target.value] });
              setAdding(false);
            }}>
              <option value="">Añadir del desglose…</option>
              {snap.assets.filter((a) => !node.assetIds.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{ASSET_LABEL[a.type]} · {a.name}</option>)}
            </select>
          ) : (
            <button className="bchip bchip--add" onClick={() => setAdding(true)}><IconPlus size={11} /> Reparto / props</button>
          )}
        </div>
      ) : null}
    </div>
  );
}
