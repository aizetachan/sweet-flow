import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { isUnit, type AssetType } from "@sweetflow/domain";
import { Button, Pill, Segmented } from "@sweetflow/ui";
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
