import { IconArrowsExchange, IconCut, IconHierarchy, IconMessageCircle, IconUserPlus, IconWand } from "@tabler/icons-react";
import { descendantsOf, type ActivityKind, type ProdNode } from "@sweetflow/domain";
import { Avatar } from "@sweetflow/ui";
import { useSnap } from "../state/store";
import { memberName } from "../state/selectors";

const ICON: Record<ActivityKind, typeof IconWand> = {
  status: IconArrowsExchange,
  generate: IconWand,
  take: IconCut,
  comment: IconMessageCircle,
  structure: IconHierarchy,
  assign: IconUserPlus,
};

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

export function ActivityTab({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const scope = new Set([node.id, ...descendantsOf(snap.nodes, node.id).map((d) => d.id)]);
  const items = snap.activity.filter((a) => a.nodeId && scope.has(a.nodeId)).sort((a, b) => b.at - a.at);
  return (
    <div className="tab">
      {items.length === 0 ? <p className="note">Todavía no hay actividad aquí.</p> : null}
      <div className="feed">
        {items.map((a) => {
          const I = ICON[a.kind];
          const n = snap.nodes.find((x) => x.id === a.nodeId);
          return (
            <div key={a.id} className="feed__item">
              <Avatar name={memberName(snap, a.actorId)} size={22} />
              <div>
                <div><b>{memberName(snap, a.actorId)}</b> {a.text}{n && n.id !== node.id ? <span className="sf-muted"> en {n.title}</span> : null}</div>
                <div className="sf-faint sf-small"><I size={11} /> {ago(a.at)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
