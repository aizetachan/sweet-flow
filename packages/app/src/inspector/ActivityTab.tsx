/**
 * Actividad (docs/INTERFAZ.md §2.6): the history of a node, made readable.
 * A summary on top (versions, comments, status and since when); categories
 * to filter; repeated actions by the same person close in time merged into
 * one line («generó 3 versiones», «dejó 4 comentarios»); days apart.
 */

import { useState } from "react";
import { IconArrowsExchange, IconCut, IconHierarchy, IconMessageCircle, IconUserPlus, IconWand } from "@tabler/icons-react";
import { descendantsOf, type Activity, type ActivityKind, type ProdNode } from "@sweetflow/domain";
import { Avatar, cx } from "@sweetflow/ui";
import { useSnap } from "../state/store";
import { memberName, memberPerson, statusOf } from "../state/selectors";

const ICON: Record<ActivityKind, typeof IconWand> = {
  status: IconArrowsExchange,
  generate: IconWand,
  take: IconCut,
  comment: IconMessageCircle,
  structure: IconHierarchy,
  assign: IconUserPlus,
};

type Category = "all" | "versions" | "review" | "status" | "shot";
const CATEGORIES: Array<{ id: Category; label: string; kinds: ActivityKind[] }> = [
  { id: "all", label: "Todo", kinds: [] },
  { id: "versions", label: "Versiones", kinds: ["generate", "take"] },
  { id: "review", label: "Revisión", kinds: ["comment"] },
  { id: "status", label: "Estado", kinds: ["status"] },
  { id: "shot", label: "Plano", kinds: ["structure", "assign"] },
];

/** Same person, same kind of action, within this long: one line. */
const MERGE_MS = 20 * 60_000;

interface Line {
  key: string;
  kind: ActivityKind;
  actorId: string;
  at: number;
  text: string;
  nodeId?: string;
}

/** What an action is, to merge the same ones ("generó", "comentó", "editó las notas"…). */
function verbOf(a: Activity): string {
  if (a.kind === "generate" && a.text.startsWith("generó")) return "generate";
  if (a.kind === "comment" && a.text.startsWith("comentó")) return "comment";
  if (a.kind === "comment" && a.text.startsWith("respondió")) return "reply";
  if (a.kind === "status") return "status";
  if (a.text.startsWith("le puso de título") || a.text === "quitó el título") return "title";
  if (a.text.endsWith("las notas")) return "notes";
  return `${a.kind}:${a.text}`;
}

function merged(items: Activity[]): Line[] {
  const asc = [...items].sort((a, b) => a.at - b.at);
  const out: Array<Line & { group: Activity[]; verb: string }> = [];
  for (const a of asc) {
    const verb = verbOf(a);
    const last = out.at(-1);
    if (last && last.verb === verb && last.actorId === a.actorId && last.nodeId === a.nodeId && a.at - last.at < MERGE_MS) {
      last.group.push(a);
      last.at = a.at;
      continue;
    }
    out.push({ key: a.id, kind: a.kind, actorId: a.actorId, at: a.at, text: a.text, nodeId: a.nodeId, group: [a], verb });
  }
  return out.map((l) => ({ ...l, text: summarise(l.verb, l.group) })).reverse();
}

function summarise(verb: string, group: Activity[]): string {
  const n = group.length;
  const last = group.at(-1)!;
  if (n === 1) return last.text;
  switch (verb) {
    case "generate": {
      const tags = group.map((g) => /v\d{3}/.exec(g.text)?.[0]).filter(Boolean);
      const model = /con ([^)]+)\)/.exec(last.text)?.[1];
      const range = tags.length > 1 ? ` (${tags[0]}–${tags.at(-1)})` : "";
      return `generó ${n} versiones${range}${model ? ` con ${model}` : ""}`;
    }
    case "comment":
      return `dejó ${n} comentarios`;
    case "reply":
      return `respondió ${n} veces`;
    case "status": {
      const first = /a (.+)$/.exec(group[0]!.text)?.[1];
      const end = /a (.+)$/.exec(last.text)?.[1];
      return first && end && first !== end ? `cambió el estado: ${first} → ${end}` : last.text;
    }
    case "title":
    case "notes":
      return last.text;
    default:
      return `${last.text} (${n} veces)`;
  }
}

function dayOf(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Hoy";
  if (same(d, y)) return "Ayer";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

const time = (t: number) => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

export function ActivityTab({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const [cat, setCat] = useState<Category>("all");
  const scope = new Set([node.id, ...descendantsOf(snap.nodes, node.id).map((d) => d.id)]);
  const all = snap.activity.filter((a) => a.nodeId && scope.has(a.nodeId));
  const kinds = CATEGORIES.find((c) => c.id === cat)!.kinds;
  const lines = merged(kinds.length ? all.filter((a) => kinds.includes(a.kind)) : all);

  // The summary: what this shot has been through.
  const versions = snap.media.filter((m) => scope.has(m.nodeId) && m.status !== "failed").length;
  const roots = snap.comments.filter((c) => scope.has(c.nodeId) && !c.parentId);
  const open = roots.filter((c) => !c.resolved).length;
  const st = statusOf(snap, node);
  const since = [...all].filter((a) => a.kind === "status" && a.nodeId === node.id).sort((a, b) => b.at - a.at)[0];

  // Days apart.
  const days: Array<{ day: string; lines: Line[] }> = [];
  for (const l of lines) {
    const day = dayOf(l.at);
    if (days.at(-1)?.day !== day) days.push({ day, lines: [] });
    days.at(-1)!.lines.push(l);
  }

  return (
    <div className="tab">
      <div className="asum">
        <div className="asum__item"><b>{versions}</b><span>versión{versions === 1 ? "" : "es"}</span></div>
        <div className="asum__item"><b>{open}</b><span>comentario{open === 1 ? "" : "s"} abierto{open === 1 ? "" : "s"}</span></div>
        <div className="asum__item"><b>{roots.length - open}</b><span>resuelto{roots.length - open === 1 ? "" : "s"}</span></div>
        <div className="asum__item asum__item--status">
          <span className="sf-pill__dot" style={{ background: st.color }} /> <b>{st.name}</b>
          <span>{since ? `desde ${dayOf(since.at).toLowerCase()} ${time(since.at)}` : "desde el principio"}</span>
        </div>
      </div>

      <div className="acats">
        {CATEGORIES.map((c) => {
          const count = c.kinds.length ? all.filter((a) => c.kinds.includes(a.kind)).length : all.length;
          return (
            <button key={c.id} className={cx("acats__chip", cat === c.id && "is-on")} onClick={() => setCat(c.id)} disabled={!count && c.id !== "all"}>
              {c.label} <span className="sf-faint">{count}</span>
            </button>
          );
        })}
      </div>

      {lines.length === 0 ? <p className="note">Todavía no hay actividad aquí.</p> : null}
      <div className="feed">
        {days.map((d) => (
          <div key={d.day} className="feed__day">
            <div className="feed__dayhead">{d.day}</div>
            {d.lines.map((l) => {
              const I = ICON[l.kind];
              const n = snap.nodes.find((x) => x.id === l.nodeId);
              return (
                <div key={l.key} className="feed__item">
                  <Avatar {...memberPerson(snap, l.actorId)} size={22} />
                  <div>
                    <div><b>{memberName(snap, l.actorId)}</b> {l.text}{n && n.id !== node.id ? <span className="sf-muted"> en {n.title || "otro plano"}</span> : null}</div>
                    <div className="sf-faint sf-small"><I size={11} /> {time(l.at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
