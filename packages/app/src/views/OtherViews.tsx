import { useState } from "react";
import { IconBolt, IconCheck, IconPlus, IconPlugConnected } from "@tabler/icons-react";
import { isUnit, ROLE_LABEL, type AssetType } from "@sweetflow/domain";
import { Avatar, Button, cx, Pill, Segmented } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";

const TYPES: Array<{ id: AssetType | "all"; label: string }> = [
  { id: "all", label: "Todo" },
  { id: "cast", label: "Reparto" },
  { id: "prop", label: "Props" },
  { id: "location", label: "Localizaciones" },
  { id: "style", label: "Estilo" },
];

export function LibraryView() {
  const snap = useSnap();
  const { set, setFilters } = useStore();
  const [type, setType] = useState<AssetType | "all">("all");
  const list = snap.assets.filter((a) => type === "all" || a.type === type);
  const usage = (id: string) => snap.nodes.filter((n) => isUnit(snap.production, n) && n.assetIds.includes(id)).length;
  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>Biblioteca</h1>
          <p className="sf-muted">Reparto, props, localizaciones y estilo de la producción. Se enlazan a escenas y planos y viajan como referencia en cada generación.</p>
        </div>
        <Button variant="create"><IconPlus size={15} /> Nuevo</Button>
      </div>
      <Segmented value={type} onChange={setType} items={TYPES.map((t) => ({ id: t.id, label: t.label }))} />
      <div className="assets">
        {list.map((a) => (
          <div key={a.id} className="asset">
            <div className="asset__img">{a.imageUrl ? <img src={a.imageUrl} alt="" /> : null}</div>
            <div className="asset__body">
              <div className="asset__row"><b>{a.name}</b><Pill>{TYPES.find((t) => t.id === a.type)?.label}</Pill></div>
              <p className="sf-muted sf-small">{a.description}</p>
              {a.type !== "style" ? (
                <button className="link sf-small" onClick={() => { setFilters({ assetId: a.id }); set({ view: "board" }); }}>
                  Aparece en {usage(a.id)} planos →
                </button>
              ) : <span className="sf-faint sf-small">Se aplica a toda la producción</span>}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

export function TeamView() {
  const snap = useSnap();
  const { set } = useStore();
  const online = new Set(snap.presence.map((p) => p.uid));
  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>Equipo · {snap.workspace.name}</h1>
          <p className="sf-muted">Todos ven la misma producción en tiempo real. Cada miembro genera con su propia cuenta de Magnific y sus créditos.</p>
        </div>
        <Button variant="primary" onClick={() => set({ modal: "invite" })}><IconPlus size={15} /> Invitar</Button>
      </div>
      <div className="mycard">
        <Avatar name={snap.me.displayName} size={36} />
        <div className="grow">
          <b>Tu cuenta de Magnific</b>
          <div className="sf-muted sf-small">{snap.me.magnificConnected ? "Conectada · tus generaciones consumen tus créditos" : "Sin conectar · puedes ver, cortar, comentar y aprobar, pero no generar"}</div>
        </div>
        {snap.me.magnificConnected ? (
          <span className="credits"><IconBolt size={15} /> {(snap.me.magnificCredits ?? 0).toLocaleString("es-ES")}</span>
        ) : null}
        <Button size="sm"><IconPlugConnected size={14} /> {snap.me.magnificConnected ? "Reconectar" : "Conectar Magnific"}</Button>
      </div>
      <table className="team">
        <thead><tr><th>Miembro</th><th>Rol</th><th>Magnific</th><th>Asignados</th><th /></tr></thead>
        <tbody>
          {snap.members.map((m) => (
            <tr key={m.uid}>
              <td><div className="team__who"><Avatar name={m.displayName} size={26} /><div><b>{m.displayName}</b><div className="sf-faint sf-small">{m.email}</div></div></div></td>
              <td><Pill>{ROLE_LABEL[m.role]}</Pill></td>
              <td>{m.magnificConnected ? <span className="ok"><IconCheck size={13} /> Conectado</span> : <span className="sf-faint">—</span>}</td>
              <td className="sf-muted">{snap.nodes.filter((n) => n.assigneeIds.includes(m.uid)).length}</td>
              <td>{online.has(m.uid) ? <span className={cx("sf-small", "online")}><span className="live-dot" /> En línea</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
