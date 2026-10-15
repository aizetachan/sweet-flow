import { useState } from "react";
import { IconCopy, IconFolder, IconPlus, IconX } from "@tabler/icons-react";
import { ancestorsOf, codeOf, folderPath, levelOf, roleOf, type ProdNode } from "@sweetflow/domain";
import { Avatar, cx, IconButton, Tabs } from "@sweetflow/ui";
import { useSnap, useStore, type PanelTab } from "../state/store";
import { presenceAt } from "../state/selectors";
import { StatusPicker } from "../components/StatusPicker";
import { ProduceTab } from "./ProduceTab";
import { CutTab } from "./CutTab";
import { ReviewTab } from "./ReviewTab";
import { ActivityTab } from "./ActivityTab";

const ASSET_LABEL = { cast: "Reparto", prop: "Prop", location: "Localización", style: "Estilo" } as const;

export function Inspector() {
  const snap = useSnap();
  const { selectedId, panelTab, set, select } = useStore();
  const node = snap.nodes.find((n) => n.id === selectedId);
  if (!node) {
    return (
      <aside className="insp insp--empty">
        <div>
          <h3>Selecciona una escena o un plano</h3>
          <p className="sf-muted">Desde aquí se genera, se corta y se reparte, se revisa y se comenta. Todo el equipo lo ve en tiempo real.</p>
        </div>
      </aside>
    );
  }
  const p = snap.production;
  const comments = snap.comments.filter((c) => c.nodeId === node.id && !c.resolved).length;
  const hasVideo = snap.media.some((m) => m.kind === "video" && m.status === "ready" && !m.archived && ancestorsOf(snap.nodes, node).some((a) => a.id === m.nodeId));

  return (
    <aside className="insp">
      <div className="insp__top">
        <div className="insp__crumbs">
          {ancestorsOf(snap.nodes, node).map((a, i, arr) => (
            <span key={a.id}>
              <button className="link" onClick={() => select(a.id)}>{codeOf(p, a)}</button>
              {i < arr.length - 1 ? <span className="sf-faint"> / </span> : null}
            </span>
          ))}
          <span className="sf-faint"> · {levelOf(p, node).name}{roleOf(p, node) === "production" ? " · punto de producción" : roleOf(p, node) === "group" ? " · montaje" : ""}</span>
          <span className="insp__spacer" />
          <IconButton label="Cerrar panel" size="sm" onClick={() => select(null)}><IconX size={14} /></IconButton>
        </div>
        <NodeHeader node={node} />
      </div>
      <Tabs<PanelTab>
        value={panelTab}
        onChange={(v) => set({ panelTab: v })}
        items={[
          { id: "produce", label: "Producir" },
          ...(hasVideo ? [{ id: "cut" as const, label: "Cortar y repartir" }] : []),
          { id: "review", label: "Revisión", count: comments },
          { id: "activity", label: "Actividad" },
        ]}
      />
      <div className="insp__body">
        {panelTab === "produce" ? <ProduceTab node={node} /> : null}
        {panelTab === "cut" && hasVideo ? <CutTab node={node} /> : null}
        {panelTab === "cut" && !hasVideo ? <ProduceTab node={node} /> : null}
        {panelTab === "review" ? <ReviewTab node={node} /> : null}
        {panelTab === "activity" ? <ActivityTab node={node} /> : null}
      </div>
    </aside>
  );
}

function NodeHeader({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { source, set } = useStore();
  const [adding, setAdding] = useState(false);
  const p = snap.production;
  const path = folderPath(p, snap.nodes, node);
  const viewers = presenceAt(snap, node.id);
  const assets = node.assetIds.map((id) => snap.assets.find((a) => a.id === id)).filter(Boolean);
  const team = snap.members.filter((m) => m.role !== "viewer");

  return (
    <div className="nhead">
      <div className="nhead__row">
        <span className="nhead__code">{codeOf(p, node)}</span>
        <input
          className="sf-input sf-input--bare nhead__title"
          value={node.title}
          placeholder={`Título del ${levelOf(p, node).name.toLowerCase()}`}
          onChange={(e) => source.updateNode(node.id, { title: e.target.value })}
        />
      </div>
      <button className="folderchip" title="Ruta de la carpeta en el escritorio (copiar)" onClick={() => void navigator.clipboard?.writeText(path)}>
        <IconFolder size={12} /> <span>{path}</span> <IconCopy size={11} />
      </button>
      <div className="nhead__row nhead__row--wrap">
        <StatusPicker statuses={p.statuses} value={node.statusId} onChange={(id) => source.updateNode(node.id, { statusId: id })} onEdit={() => set({ modal: "statuses" })} />
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
      <textarea
        className="sf-textarea nhead__notes"
        placeholder="Acción, diálogo, notas de dirección… (base del prompt)"
        value={node.notes}
        onChange={(e) => source.updateNode(node.id, { notes: e.target.value })}
      />
    </div>
  );
}
