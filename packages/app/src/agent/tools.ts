/**
 * The connector's tools (docs/INTERFAZ.md §0.2): what an AI assistant in the
 * app's terminal can read and do. Each tool works through the store and the
 * open DataSource, exactly as the interface does: changes show live, go to
 * the log as the user's and undo with ⌘Z. Answers are short text for the AI.
 */

import { childrenOf, codeOf, descendantsOf, editDuration, levelOf, timecode, type Id, type ProdNode } from "@sweetflow/domain";
import { useStore, type View } from "../state/store";
import { memberName, statusOf } from "../state/selectors";
import type { DataSource, Snapshot } from "../data/source";
import { isInTrash } from "../data/library";
import { assemble } from "../editor/actions";
import { editName, levelEdit } from "../editor/model";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>): string | Promise<string>;
}

/** A failure the AI should read (wrong node, nothing open…). */
class ToolError extends Error {}

const st = () => useStore.getState();

function snapOrFail(): Snapshot {
  const s = st();
  if (s.phase !== "production" || !s.snap) throw new ToolError("No hay ninguna producción abierta. Usa list_productions y open_production.");
  return s.snap;
}

// ---------- naming nodes ----------

const ref = (s: Snapshot, n: ProdNode) => `${codeOf(s.production, n)} «${n.title}»`;

function codePathOf(s: Snapshot, n: ProdNode): string {
  const parts: string[] = [];
  for (let cur: ProdNode | undefined = n; cur; cur = cur.parentId ? s.nodes.find((x) => x.id === cur!.parentId) : undefined) parts.unshift(codeOf(s.production, cur));
  return parts.join("/");
}

/** A node by its id, its code path (SC010/SQ010/SH0010), its code or its exact title. */
function resolve(s: Snapshot, key: unknown): ProdNode {
  if (typeof key !== "string" || !key.trim()) throw new ToolError("Falta el nodo (id, código o título).");
  const k = key.trim();
  const byId = s.nodes.find((n) => n.id === k);
  if (byId) return byId;
  const up = k.toUpperCase();
  const byPath = s.nodes.filter((n) => codePathOf(s, n).toUpperCase() === up || codePathOf(s, n).toUpperCase().endsWith(`/${up}`));
  if (byPath.length === 1) return byPath[0]!;
  const byTitle = s.nodes.filter((n) => n.title.trim().toLowerCase() === k.toLowerCase());
  if (!byPath.length && byTitle.length === 1) return byTitle[0]!;
  const many = byPath.length ? byPath : byTitle;
  if (many.length) throw new ToolError(`«${k}» es ambiguo: ${many.slice(0, 12).map((n) => `${codePathOf(s, n)} (id ${n.id})`).join(", ")}. Usa la ruta de códigos o el id.`);
  throw new ToolError(`No encuentro el nodo «${k}». Mira get_tree.`);
}

const resolveAll = (s: Snapshot, keys: unknown): ProdNode[] => {
  const list = Array.isArray(keys) ? keys : [keys];
  return list.map((k) => resolve(s, k));
};

function statusByName(s: Snapshot, name: unknown): Id {
  const n = String(name ?? "").trim().toLowerCase();
  const all = s.production.statuses.filter((x) => !x.archived);
  const hit = all.find((x) => x.name.toLowerCase() === n) ?? all.find((x) => x.id === name) ?? all.find((x) => x.name.toLowerCase().startsWith(n));
  if (!hit) throw new ToolError(`No hay ningún estado «${String(name)}». Estados: ${all.map((x) => x.name).join(", ")}.`);
  return hit.id;
}

function membersByName(s: Snapshot, names: unknown): Id[] {
  const list = Array.isArray(names) ? names : [names];
  return list.map((raw) => {
    const n = String(raw).trim().toLowerCase();
    const m = s.members.find((x) => x.email.toLowerCase() === n || x.uid === raw || x.displayName.toLowerCase() === n) ?? s.members.find((x) => x.displayName.toLowerCase().includes(n));
    if (!m) throw new ToolError(`No hay nadie llamado «${String(raw)}» en la producción. Personas: ${s.members.map((x) => x.displayName).join(", ")}.`);
    return m.uid;
  });
}

function line(s: Snapshot, n: ProdNode): string {
  const who = n.assigneeIds.length ? ` · ${n.assigneeIds.map((u) => memberName(s, u)).join(", ")}` : "";
  return `${codeOf(s.production, n)} «${n.title}» [${statusOf(s, n).name}]${who} (id ${n.id})`;
}

const VIEWS: Record<string, View> = { biblioteca: "library", library: "library", produccion: "board", producción: "board", board: "board", editor: "editor", papelera: "trash", trash: "trash" };
const VIEW_NAME: Record<View, string> = { library: "Biblioteca", board: "Producción", editor: "Editor", trash: "Papelera" };

// ---------- the tools ----------

const nodeArg = { type: "string", description: "El nodo: su id, su código (SH0010), su ruta de códigos (SC010/SQ010/SH0010) o su título exacto." };

export const TOOLS: ToolDef[] = [
  {
    name: "get_context",
    description: "Qué hay abierto ahora en Sweetflow: quién es el usuario, la producción, la vista, el nodo seleccionado, los niveles, los estados y las personas.",
    inputSchema: { type: "object", properties: {} },
    run: () => {
      const s = st();
      const me = s.lib?.me ?? s.snap?.me;
      const out = [`Usuario: ${me?.displayName ?? "—"} <${me?.email ?? ""}>`];
      if (s.phase !== "production" || !s.snap) return [...out, "Ninguna producción abierta (está en el inicio).", "Usa list_productions y open_production."].join("\n");
      const snap = s.snap;
      const sel = snap.nodes.find((n) => n.id === s.selectedId);
      out.push(
        `Producción: «${snap.production.name}» (id ${s.productionId})`,
        `Vista: ${VIEW_NAME[s.view]}`,
        `Seleccionado: ${sel ? `${codePathOf(snap, sel)} «${sel.title}» (id ${sel.id})` : "nada"}`,
        `Niveles: ${snap.production.levels.map((l) => `${l.name} (${l.prefix})`).join(" › ")}`,
        `Estados: ${snap.production.statuses.filter((x) => !x.archived).map((x) => x.name).join(", ")}`,
        `Personas: ${snap.members.map((m) => `${m.displayName} <${m.email}>`).join(", ")}`,
        `Nodos: ${snap.nodes.filter((n) => !n.lib).length}`,
      );
      if (s.view === "editor") {
        const ref = s.editorPath.at(-1);
        const e = ref && "nodeId" in ref ? levelEdit(snap, ref.nodeId) : null;
        if (e) out.push(`Montaje abierto: ${editName(snap, e)}, ${timecode(editDuration(e), e.format.fps)} (${e.clips.length} clips)`);
      }
      return out.join("\n");
    },
  },
  {
    name: "list_productions",
    description: "Las producciones que el usuario puede ver, con su id.",
    inputSchema: { type: "object", properties: {} },
    run: () => {
      const lib = st().lib;
      if (!lib) return "La biblioteca aún se está cargando.";
      const byId = new Map(lib.entries.map((e) => [e.id, e]));
      const prods = lib.entries.filter((e) => e.kind === "production" && !isInTrash(byId, e));
      const path = (id: Id | null): string => {
        const e = id ? byId.get(id) : undefined;
        return e ? `${path(e.parentId)}${e.name}/` : "";
      };
      return prods.length ? prods.map((p) => `«${p.name}» (id ${p.id})${p.parentId ? ` en ${path(p.parentId).slice(0, -1)}` : ""}`).join("\n") : "No hay producciones.";
    },
  },
  {
    name: "open_production",
    description: "Abre una producción en la app (por su id o su nombre exacto).",
    inputSchema: { type: "object", properties: { production: { type: "string", description: "Id o nombre de la producción." } }, required: ["production"] },
    run: async (a) => {
      const lib = st().lib;
      const key = String(a.production ?? "").trim();
      const hit = lib?.entries.find((e) => e.kind === "production" && (e.id === key || e.name.toLowerCase() === key.toLowerCase()));
      if (!hit) throw new ToolError(`No encuentro la producción «${key}». Mira list_productions.`);
      st().openProduction(hit.id);
      // Wait for it to load.
      for (let i = 0; i < 50 && !(st().productionId === hit.id && st().snap); i++) await new Promise((r) => setTimeout(r, 100));
      return st().snap ? `Abierta «${hit.name}».` : `Abriendo «${hit.name}»…`;
    },
  },
  {
    name: "get_tree",
    description: "El árbol de la producción (o de un nodo): código, título, estado, personas asignadas e id de cada nodo, sangrado por nivel.",
    inputSchema: { type: "object", properties: { node: { ...nodeArg, description: "Opcional: solo lo que hay dentro de este nodo." }, depth: { type: "number", description: "Opcional: cuántos niveles bajar." } } },
    run: (a) => {
      const s = snapOrFail();
      const live = s.nodes.filter((n) => !n.lib);
      const root = a.node ? resolve(s, a.node) : null;
      const max = typeof a.depth === "number" ? a.depth : 99;
      const out: string[] = [];
      if (root) out.push(line(s, root));
      const walk = (parent: Id | null, d: number) => {
        if (d > max) return;
        for (const n of childrenOf(live, parent)) {
          out.push(`${"  ".repeat(d - (root ? 0 : 1))}${line(s, n)}`);
          if (out.length > 600) return;
          walk(n.id, d + 1);
        }
      };
      walk(root?.id ?? null, 1);
      if (out.length > 600) out.push("… (cortado: pide un nodo concreto)");
      return out.length ? out.join("\n") : "La producción está vacía.";
    },
  },
  {
    name: "get_node",
    description: "Todo sobre un nodo: nivel, estado, personas, notas, lo que contiene, sus versiones y sus comentarios.",
    inputSchema: { type: "object", properties: { node: nodeArg }, required: ["node"] },
    run: (a) => {
      const s = snapOrFail();
      const n = resolve(s, a.node);
      const kids = childrenOf(s.nodes, n.id);
      const media = s.media.filter((m) => m.nodeId === n.id && !m.archived).sort((x, y) => x.version - y.version);
      const take = s.takes.find((t) => t.id === n.selectedTakeId);
      const comments = s.comments.filter((c) => c.nodeId === n.id);
      return [
        `${codePathOf(s, n)} «${n.title}» (id ${n.id})`,
        `Nivel: ${levelOf(s.production, n).name}`,
        `Estado: ${statusOf(s, n).name}`,
        `Personas: ${n.assigneeIds.map((u) => memberName(s, u)).join(", ") || "nadie"}`,
        `Notas: ${n.notes.trim() || "—"}`,
        kids.length ? `Contiene (${kids.length}): ${kids.map((k) => codeOf(s.production, k)).join(", ")}` : "No contiene nodos.",
        media.length ? `Versiones: ${media.map((m) => `${m.kind} v${String(m.version).padStart(3, "0")}${take?.mediaId === m.id ? " (elegida)" : ""}${m.status !== "ready" ? ` [${m.status}]` : ""}`).join(", ")}` : "Sin versiones.",
        comments.length ? `Comentarios:\n${comments.map((c) => `- ${memberName(s, c.authorId)}${c.resolved ? " (resuelto)" : ""}: ${c.text}`).join("\n")}` : "Sin comentarios.",
      ].join("\n");
    },
  },
  {
    name: "create_nodes",
    description: "Crea nodos dentro de otro (o en la raíz, del primer nivel). Uno por título, en orden, al final. Devuelve sus códigos.",
    inputSchema: {
      type: "object",
      properties: { parent: { ...nodeArg, description: "Dónde crearlos; vacío: en la raíz." }, titles: { type: "array", items: { type: "string" }, description: "Títulos de los nodos nuevos." } },
      required: ["titles"],
    },
    run: (a) => {
      const s = snapOrFail();
      const parent = a.parent ? resolve(s, a.parent) : null;
      const titles = (Array.isArray(a.titles) ? a.titles : [a.titles]).map((t) => String(t ?? "").trim()).filter(Boolean);
      if (!titles.length) throw new ToolError("Faltan los títulos.");
      const ids = titles.map((t) => st().source.createNode(parent?.id ?? null, t));
      const now = st().snap!;
      return `Creados: ${ids.map((id) => now.nodes.find((n) => n.id === id)).filter((n): n is ProdNode => !!n).map((n) => `${ref(now, n)} (id ${n.id})`).join(", ")}.`;
    },
  },
  {
    name: "update_nodes",
    description: "Cambia uno o varios nodos: título, notas, estado (por su nombre) o personas asignadas (por nombre o email; sustituye las que había).",
    inputSchema: {
      type: "object",
      properties: {
        nodes: { type: "array", items: { type: "string" }, description: "Los nodos (id, código, ruta o título)." },
        title: { type: "string" },
        notes: { type: "string" },
        status: { type: "string", description: "Nombre del estado (ver get_context)." },
        assignees: { type: "array", items: { type: "string" } },
      },
      required: ["nodes"],
    },
    run: (a) => {
      const s = snapOrFail();
      const nodes = resolveAll(s, a.nodes);
      const patch: Parameters<DataSource["updateNode"]>[1] = {};
      if (typeof a.title === "string") patch.title = a.title;
      if (typeof a.notes === "string") patch.notes = a.notes;
      if (a.status !== undefined) patch.statusId = statusByName(s, a.status);
      if (a.assignees !== undefined) patch.assigneeIds = membersByName(s, a.assignees);
      if (!Object.keys(patch).length) throw new ToolError("No hay nada que cambiar.");
      for (const n of nodes) st().source.updateNode(n.id, patch);
      return `Cambiados: ${nodes.map((n) => codeOf(s.production, n)).join(", ")}.`;
    },
  },
  {
    name: "trash_nodes",
    description: "Manda nodos (con todo lo que contienen) a la papelera de la producción. Se pueden restaurar. Confírmalo antes con el usuario.",
    inputSchema: { type: "object", properties: { nodes: { type: "array", items: { type: "string" } } }, required: ["nodes"] },
    run: (a) => {
      const s = snapOrFail();
      const nodes = resolveAll(s, a.nodes);
      const inside = new Set(nodes.flatMap((n) => descendantsOf(s.nodes, n.id).map((d) => d.id)));
      st().trashNodes(nodes.map((n) => n.id));
      return `A la papelera: ${nodes.map((n) => codeOf(s.production, n)).join(", ")}${inside.size ? ` (con ${inside.size} nodos dentro)` : ""}.`;
    },
  },
  {
    name: "add_comment",
    description: "Escribe un comentario en un nodo, como el usuario.",
    inputSchema: { type: "object", properties: { node: nodeArg, text: { type: "string" } }, required: ["node", "text"] },
    run: (a) => {
      const s = snapOrFail();
      const n = resolve(s, a.node);
      const text = String(a.text ?? "").trim();
      if (!text) throw new ToolError("Falta el texto.");
      st().source.addComment({ nodeId: n.id, text });
      return `Comentado en ${ref(s, n)}.`;
    },
  },
  {
    name: "navigate",
    description: "Lleva la app a una vista (biblioteca, produccion, editor, papelera) y, opcionalmente, selecciona un nodo (en el editor, abre su montaje).",
    inputSchema: { type: "object", properties: { view: { type: "string", enum: ["biblioteca", "produccion", "editor", "papelera"] }, node: nodeArg } },
    run: (a) => {
      const s = snapOrFail();
      const view = a.view ? VIEWS[String(a.view).toLowerCase()] : undefined;
      if (a.view && !view) throw new ToolError("Vista desconocida: biblioteca, produccion, editor o papelera.");
      const n = a.node ? resolve(s, a.node) : null;
      if (view) st().set({ view });
      if (n && (view ?? st().view) === "editor") st().set({ editorPath: [{ nodeId: n.id }], editSel: [], editTime: 0 });
      else if (n) st().select(n.id);
      return `Ahora en ${VIEW_NAME[st().view]}${n ? `, en ${ref(s, n)}` : ""}.`;
    },
  },
  {
    name: "assemble_montage",
    description: "«Montar» en el editor: pone en el montaje de un nivel (o de toda la producción) sus planos o bloques en orden, y lo abre.",
    inputSchema: { type: "object", properties: { node: { ...nodeArg, description: "El nivel a montar; vacío: la producción entera." } } },
    run: (a) => {
      const s = snapOrFail();
      const n = a.node ? resolve(s, a.node) : null;
      st().set({ view: "editor", editorPath: [{ nodeId: n?.id ?? null }], editSel: [], editTime: 0 });
      assemble(levelEdit(s, n?.id ?? null));
      const e = levelEdit(st().snap!, n?.id ?? null);
      return `Montado ${editName(st().snap!, e)}: ${e.clips.length} clips, ${timecode(editDuration(e), e.format.fps)}.`;
    },
  },
  {
    name: "undo",
    description: "Deshace el último cambio de la producción (como ⌘Z).",
    inputSchema: { type: "object", properties: {} },
    run: () => {
      snapOrFail();
      const label = st().source.undo();
      return label ? `Deshecho: ${label}.` : "No hay nada que deshacer.";
    },
  },
];

/** Runs a tool by name; mistakes come back as text the AI can act on. */
export async function runTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { text: `Herramienta desconocida: ${name}`, isError: true };
  try {
    return { text: await tool.run(args ?? {}) };
  } catch (e) {
    return { text: e instanceof Error ? e.message : String(e), isError: true };
  }
}
