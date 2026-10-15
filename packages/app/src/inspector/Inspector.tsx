import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  IconCopy,
  IconExternalLink,
  IconLayoutSidebarLeftExpand,
  IconPlus,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { ancestorsOf, codeOf, folderPath, levelOf, roleOf, type ProdNode } from "@sweetflow/domain";
import { Avatar, Button, cx, IconButton, Tabs } from "@sweetflow/ui";
import { useSnap, useStore, type FloatingPanel, type PanelTab } from "../state/store";
import { presenceAt } from "../state/selectors";
import { StatusPicker } from "../components/StatusPicker";
import { DockedPanel, OwnPanel, usePanel } from "./panel";
import { ProduceTab } from "./ProduceTab";
import { CutTab } from "./CutTab";
import { ReviewTab } from "./ReviewTab";
import { ActivityTab } from "./ActivityTab";

const ASSET_LABEL = { cast: "Reparto", prop: "Prop", location: "Localización", style: "Estilo" } as const;

/** The work panel in its column, bound to the selection. */
export function DockedInspector() {
  const snap = useSnap();
  const selectedId = useStore((s) => s.selectedId);
  const popped = useStore((s) => s.popped);
  const node = snap.nodes.find((n) => n.id === selectedId);
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
        <h3>{codeOf(snap.production, node)} {node.title ? `· ${node.title}` : ""}</h3>
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
  const snap = useSnap();
  const panel = usePanel();
  const { select, dockPanel, closeFloating, popOut, source, set } = useStore();
  const node = snap.nodes.find((n) => n.id === panel.nodeId);
  const p = snap.production;

  if (!node) {
    return (
      <div className="insp__gone">
        <p className="sf-muted">Este elemento ya no existe (se ha borrado o movido fuera de la producción).</p>
        {floatKey ? <button className="link" onClick={() => closeFloating(floatKey)}>Cerrar</button> : null}
      </div>
    );
  }

  const comments = snap.comments.filter((c) => c.nodeId === node.id && !c.resolved).length;
  const hasVideo = snap.media.some((m) => m.kind === "video" && m.status === "ready" && !m.archived && ancestorsOf(snap.nodes, node).some((a) => a.id === m.nodeId));
  const { features } = snap;
  const tab: PanelTab = panel.tab === "cut" && !hasVideo ? "produce" : panel.tab;
  const path = folderPath(p, snap.nodes, node);

  return (
    <>
      <div className="insp__top">
        {/* Row 1: code + title, close on the right. */}
        <div className={cx("nhead__row nhead__row--title", onDragHandle && "insp__drag")} onPointerDown={onDragHandle}>
          <CodeEditor node={node} />
          <input
            className="sf-input sf-input--bare nhead__title"
            value={node.title}
            placeholder={`Título del ${levelOf(p, node).name.toLowerCase()}`}
            onChange={(e) => source.updateNode(node.id, { title: e.target.value })}
          />
          {panel.mode === "floating" && floatKey ? (
            <IconButton label="Acoplar al panel lateral" size="sm" onClick={() => dockPanel(floatKey)}><IconLayoutSidebarLeftExpand size={14} /></IconButton>
          ) : null}
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
            onClick={() => (panel.mode === "window" ? window.close() : floatKey ? closeFloating(floatKey) : select(null))}
          ><IconX size={14} /></IconButton>
        </div>
        {/* Row 2: where it is, open apart, copy folder path; status on the right. */}
        <div className="insp__meta">
          <span className="insp__crumbs">
            {ancestorsOf(snap.nodes, node).map((a, i, arr) => (
              <span key={a.id}>
                <button className="link" onClick={() => panel.setPanel({ nodeId: a.id })}>{codeOf(p, a)}</button>
                {i < arr.length - 1 ? <span className="sf-faint"> / </span> : null}
              </span>
            ))}
            <span className="sf-faint"> · {levelOf(p, node).name}{roleOf(p, node) === "production" ? " · punto de producción" : roleOf(p, node) === "group" ? " · montaje" : ""}</span>
          </span>
          <IconButton label={`Copiar la ruta de la carpeta: ${path}`} size="sm" onClick={() => void navigator.clipboard?.writeText(path)}><IconCopy size={14} /></IconButton>
          <span className="insp__spacer" />
          <StatusPicker statuses={p.statuses} value={node.statusId} onChange={(id) => source.updateNode(node.id, { statusId: id })} onEdit={() => set({ modal: "statuses" })} />
        </div>
        <NodeHeader node={node} />
      </div>
      <Tabs<PanelTab>
        value={tab}
        onChange={(v) => panel.setPanel({ tab: v })}
        items={[
          { id: "produce", label: "Producir" },
          ...(hasVideo ? [{ id: "cut" as const, label: "Cortar y repartir" }] : []),
          { id: "review", label: "Revisión", count: comments },
          { id: "activity", label: "Actividad" },
        ]}
      />
      <div className="insp__body">
        {tab === "produce" ? (features.generation ? <ProduceTab node={node} /> : <ComingSoon what="Generar imágenes y vídeo, versiones y tomas" />) : null}
        {tab === "cut" ? <CutTab node={node} /> : null}
        {tab === "review" ? (features.review ? <ReviewTab node={node} /> : <ComingSoon what="Comentarios y revisión" />) : null}
        {tab === "activity" ? <ActivityTab node={node} /> : null}
      </div>
    </>
  );
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

function NodeHeader({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const source = useStore((s) => s.source);
  const [adding, setAdding] = useState(false);
  const viewers = presenceAt(snap, node.id);
  const assets = node.assetIds.map((id) => snap.assets.find((a) => a.id === id)).filter(Boolean);
  const team = snap.members.filter((m) => m.role !== "viewer");

  return (
    <div className="nhead">
      <div className="nhead__row nhead__row--wrap">
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
        {viewers.length ? <span className="sf-small sf-muted"><span className="live-dot" /> {viewers.join(", ")} aquí</span> : null}
      </div>
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
      <textarea
        className="sf-textarea nhead__notes"
        placeholder="Acción, diálogo, notas de dirección… (base del prompt)"
        value={node.notes}
        onChange={(e) => source.updateNode(node.id, { notes: e.target.value })}
      />
    </div>
  );
}
