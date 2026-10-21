/**
 * The assistant's chat (docs/INTERFAZ.md §0.2): the conversations of each
 * production, in tabs, kept on this computer to take up again; and what the
 * AI writes (its JSON events) turned into messages.
 */

import { create } from "zustand";

export type Ai = "claude" | "codex";
export type Permission = "ask" | "auto";

export type Item =
  | { k: "user"; id: string; text: string }
  | { k: "text"; id: string; text: string; streaming?: boolean }
  | { k: "tool"; id: string; name: string; input: Record<string, unknown>; result?: string; error?: boolean; done?: boolean }
  | { k: "approval"; id: string; req: string; tool: string; input: Record<string, unknown>; state: "pending" | "allowed" | "denied" }
  | { k: "error"; id: string; text: string; login?: boolean }
  | { k: "note"; id: string; text: string };

export interface Conversation {
  id: string;
  title: string;
  ai: Ai;
  /** Empty: the AI's own default. */
  model: string;
  permission: Permission;
  /** The AI's session, to go on with it. */
  session: string | null;
  items: Item[];
  /** Shown as a tab (closed ones stay in the history). */
  open: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A production's chat. */
export interface Book {
  activeId: string | null;
  convs: Conversation[];
}

export interface Context {
  productionId: string;
  productionName: string;
  selection: string | null;
}

export const MODELS: Record<Ai, Array<{ id: string; label: string }>> = {
  // Claude Code's aliases: always the latest of each.
  claude: [
    { id: "", label: "Por defecto" },
    { id: "fable", label: "Fable" },
    { id: "opus", label: "Opus" },
    { id: "sonnet", label: "Sonnet" },
    { id: "haiku", label: "Haiku" },
  ],
  codex: [{ id: "", label: "Por defecto" }],
};

export const AI_NAME: Record<Ai, string> = { claude: "Claude", codex: "Codex" };

/** Tools of the AI that are its own plumbing: not shown. */
const HIDDEN = new Set(["ToolSearch", "mcp__sweetflow__approve", "TodoWrite"]);

const chat = () => window.sweetflow?.chat;
const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

/** Per conversation, while it runs: the streamed texts waiting for their final version. */
const live = new Map<string, { msg: string | null; blocks: Map<number, string>; pending: Map<string, string[]> }>();

interface ChatState {
  ctx: Context | null;
  books: Record<string, Book>;
  /** Conversations working now. */
  running: Record<string, true>;
  setCtx: (ctx: Context | null) => void;
  newConv: (ai: Ai) => void;
  setActive: (id: string) => void;
  closeConv: (id: string) => void;
  reopen: (id: string) => void;
  remove: (id: string) => void;
  patch: (id: string, p: Partial<Pick<Conversation, "ai" | "model" | "permission" | "title">>) => void;
  send: (text: string) => Promise<void>;
  stop: () => void;
  answer: (conv: string, itemId: string, allow: boolean) => void;
}

/** Where a conversation is (any production loaded). */
function findConv(books: Record<string, Book>, id: string): { pid: string; conv: Conversation } | null {
  for (const [pid, b] of Object.entries(books)) {
    const conv = b.convs.find((c) => c.id === id);
    if (conv) return { pid, conv };
  }
  return null;
}

export const useChat = create<ChatState>((set, get) => {
  /** Changes one conversation (wherever it is) and saves its production. */
  const edit = (id: string, fn: (c: Conversation) => Conversation) => {
    const hit = findConv(get().books, id);
    if (!hit) return;
    const book = get().books[hit.pid]!;
    const next = fn(hit.conv);
    set({ books: { ...get().books, [hit.pid]: { ...book, convs: book.convs.map((c) => (c.id === id ? { ...next, updatedAt: Date.now() } : c)) } } });
    save(hit.pid);
  };
  const editBook = (pid: string, fn: (b: Book) => Book) => {
    const book = get().books[pid];
    if (!book) return;
    set({ books: { ...get().books, [pid]: fn(book) } });
    save(pid);
  };
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const save = (pid: string) => {
    clearTimeout(timers.get(pid));
    timers.set(
      pid,
      setTimeout(() => {
        const book = get().books[pid];
        if (!book) return;
        // What is mid-way (a text arriving, a question) is not kept as such.
        const clean: Book = { ...book, convs: book.convs.map((c) => ({ ...c, items: c.items.map((i) => (i.k === "text" && i.streaming ? { ...i, streaming: false } : i.k === "approval" && i.state === "pending" ? { ...i, state: "denied" as const } : i)) })) };
        void chat()?.save(pid, JSON.stringify({ v: 1, ...clean }));
      }, 400),
    );
  };
  const push = (id: string, item: Item) => edit(id, (c) => ({ ...c, items: [...c.items, item] }));
  const active = (): Conversation | null => {
    const { ctx, books } = get();
    const book = ctx ? books[ctx.productionId] : undefined;
    return book?.convs.find((c) => c.id === book.activeId) ?? null;
  };

  return {
    ctx: null,
    books: {},
    running: {},
    setCtx: (ctx) => {
      set({ ctx });
      if (!ctx || get().books[ctx.productionId]) return;
      void chat()
        ?.load(ctx.productionId)
        .then((raw) => {
          let book: Book = { activeId: null, convs: [] };
          try {
            if (raw) {
              const d = JSON.parse(raw) as Book;
              book = { activeId: d.activeId ?? null, convs: Array.isArray(d.convs) ? d.convs : [] };
            }
          } catch {
            // A damaged file: start again.
          }
          if (!get().books[ctx.productionId]) set({ books: { ...get().books, [ctx.productionId]: book } });
        });
    },
    newConv: (ai) => {
      const ctx = get().ctx;
      if (!ctx || !get().books[ctx.productionId]) return;
      const prev = active();
      const conv: Conversation = {
        id: uid(),
        title: "Nueva conversación",
        ai,
        model: prev?.ai === ai ? prev.model : "",
        permission: prev?.permission ?? "ask",
        session: null,
        items: [],
        open: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      editBook(ctx.productionId, (b) => ({ activeId: conv.id, convs: [...b.convs, conv] }));
    },
    setActive: (id) => {
      const hit = findConv(get().books, id);
      if (hit) editBook(hit.pid, (b) => ({ ...b, activeId: id }));
    },
    closeConv: (id) => {
      const hit = findConv(get().books, id);
      if (!hit) return;
      editBook(hit.pid, (b) => {
        const open = b.convs.filter((c) => c.open && c.id !== id);
        const i = b.convs.filter((c) => c.open).findIndex((c) => c.id === id);
        const nextActive = b.activeId === id ? (open[Math.min(i, open.length - 1)]?.id ?? null) : b.activeId;
        return { activeId: nextActive, convs: b.convs.map((c) => (c.id === id ? { ...c, open: false } : c)) };
      });
    },
    reopen: (id) => {
      const hit = findConv(get().books, id);
      if (hit) editBook(hit.pid, (b) => ({ activeId: id, convs: b.convs.map((c) => (c.id === id ? { ...c, open: true } : c)) }));
    },
    remove: (id) => {
      const hit = findConv(get().books, id);
      if (!hit || get().running[id]) return;
      editBook(hit.pid, (b) => ({ activeId: b.activeId === id ? (b.convs.find((c) => c.open && c.id !== id)?.id ?? null) : b.activeId, convs: b.convs.filter((c) => c.id !== id) }));
    },
    patch: (id, p) => edit(id, (c) => ({ ...c, ...p })),

    send: async (text) => {
      const { ctx } = get();
      const conv = active();
      if (!ctx || !conv || get().running[conv.id] || !text.trim()) return;
      const first = !conv.items.some((i) => i.k === "user");
      edit(conv.id, (c) => ({ ...c, title: first ? title(text) : c.title, items: [...c.items, { k: "user", id: uid(), text }] }));
      set({ running: { ...get().running, [conv.id]: true } });
      live.set(conv.id, { msg: null, blocks: new Map(), pending: new Map() });
      // What the app has open goes with each message, so «this shot» needs no name.
      const where = `[Sweetflow · producción «${ctx.productionName}»${ctx.selection ? ` · seleccionado: ${ctx.selection}` : ""}]`;
      try {
        await chat()!.send({ conv: conv.id, ai: conv.ai, model: conv.model, session: conv.session, permission: conv.permission, text: `${where}\n\n${text}` });
      } catch (e) {
        const { [conv.id]: _, ...rest } = get().running;
        set({ running: rest });
        push(conv.id, { k: "error", id: uid(), text: cleanErr(e) });
      }
    },
    stop: () => {
      const conv = active();
      if (conv && get().running[conv.id]) chat()?.stop(conv.id);
    },
    answer: (conv, itemId, allow) => {
      const hit = findConv(get().books, conv);
      const item = hit?.conv.items.find((i) => i.id === itemId);
      if (!item || item.k !== "approval" || item.state !== "pending") return;
      chat()?.answer(item.req, allow);
      edit(conv, (c) => ({ ...c, items: c.items.map((i) => (i.id === itemId ? { ...item, state: allow ? "allowed" : "denied" } : i)) }));
    },
  };
});

const title = (text: string) => {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 38 ? `${t.slice(0, 36)}…` : t;
};

const cleanErr = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");

const LOGIN = /log ?in|invalid api key|authenticat|not logged|credential|401/i;

/** Turns one of the AI's events into the conversation's messages. */
function onEvent(convId: string, ev: Record<string, unknown>): void {
  const st = useChat.getState();
  const hit = findConv(st.books, convId);
  if (!hit) return;
  const rt = live.get(convId) ?? { msg: null, blocks: new Map(), pending: new Map() };
  live.set(convId, rt);
  const conv = hit.conv;
  const items = [...conv.items];
  let session = conv.session;
  const update = (id: string, fn: (i: Item) => Item) => {
    const k = items.findIndex((i) => i.id === id);
    if (k >= 0) items[k] = fn(items[k]!);
  };

  if (conv.ai === "claude") {
    const type = ev.type as string;
    if (type === "system" && ev.subtype === "init" && typeof ev.session_id === "string") session = ev.session_id;
    else if (type === "stream_event") {
      const e = ev.event as { type: string; index?: number; message?: { id: string }; content_block?: { type: string }; delta?: { type: string; text?: string } };
      if (e.type === "message_start") {
        rt.msg = e.message?.id ?? null;
        rt.blocks = new Map();
      } else if (e.type === "content_block_start" && e.content_block?.type === "text" && rt.msg) {
        const id = `${rt.msg}:${e.index ?? 0}`;
        rt.blocks.set(e.index ?? 0, id);
        rt.pending.set(rt.msg, [...(rt.pending.get(rt.msg) ?? []), id]);
        items.push({ k: "text", id, text: "", streaming: true });
      } else if (e.type === "content_block_delta" && e.delta?.type === "text_delta") {
        const id = rt.blocks.get(e.index ?? 0);
        if (id) update(id, (i) => (i.k === "text" ? { ...i, text: i.text + (e.delta!.text ?? "") } : i));
      }
    } else if (type === "assistant") {
      const m = ev.message as { id: string; content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }> };
      for (const b of m.content ?? []) {
        if (b.type === "text" && b.text) {
          const queue = rt.pending.get(m.id) ?? [];
          const id = queue.shift();
          rt.pending.set(m.id, queue);
          if (id && items.some((i) => i.id === id)) update(id, (i) => ({ ...i, text: b.text!, streaming: false }) as Item);
          else items.push({ k: "text", id: `${m.id}:t${items.length}`, text: b.text });
        } else if (b.type === "tool_use" && b.id && b.name && !HIDDEN.has(b.name)) {
          if (!items.some((i) => i.id === b.id)) items.push({ k: "tool", id: b.id, name: b.name, input: b.input ?? {} });
        }
      }
    } else if (type === "user") {
      const m = ev.message as { content: Array<{ type: string; tool_use_id?: string; content?: unknown; is_error?: boolean }> };
      for (const b of Array.isArray(m?.content) ? m.content : []) {
        if (b.type !== "tool_result" || !b.tool_use_id) continue;
        const text = Array.isArray(b.content) ? b.content.map((c: { text?: string }) => c.text ?? "").join("\n") : String(b.content ?? "");
        update(b.tool_use_id, (i) => (i.k === "tool" ? { ...i, result: text, error: !!b.is_error, done: true } : i));
      }
    } else if (type === "result") {
      if (typeof ev.session_id === "string") session = ev.session_id;
      if (ev.is_error || (ev.subtype && ev.subtype !== "success")) {
        const text = String(ev.result ?? ev.subtype ?? "Algo ha fallado.");
        items.push({ k: "error", id: crypto.randomUUID(), text, login: LOGIN.test(text) });
      }
    }
  } else {
    // Codex: its `exec --json` events.
    const type = ev.type as string;
    const item = ev.item as { id?: string; type?: string; text?: string; server?: string; tool?: string; arguments?: unknown; result?: unknown; status?: string; command?: string; aggregated_output?: string; exit_code?: number } | undefined;
    if (type === "thread.started" && typeof ev.thread_id === "string") session = ev.thread_id;
    else if ((type === "item.started" || type === "item.completed") && item?.id) {
      const done = type === "item.completed";
      if (item.type === "agent_message" && done && item.text) items.push({ k: "text", id: item.id, text: item.text });
      else if (item.type === "mcp_tool_call" || item.type === "command_execution") {
        const name = item.type === "mcp_tool_call" ? `mcp__${item.server}__${item.tool}` : "Bash";
        const input = (item.type === "mcp_tool_call" ? (item.arguments ?? {}) : { command: item.command }) as Record<string, unknown>;
        const result = item.type === "mcp_tool_call" ? (typeof item.result === "string" ? item.result : item.result ? JSON.stringify(item.result) : undefined) : item.aggregated_output;
        const error = item.status === "failed" || (item.exit_code !== undefined && item.exit_code !== 0);
        if (items.some((i) => i.id === item.id)) update(item.id, (i) => (i.k === "tool" ? { ...i, result, error, done } : i));
        else items.push({ k: "tool", id: item.id, name, input, result, error, done });
      }
    } else if (type === "turn.failed" || type === "error") {
      const text = String((ev.error as { message?: string } | undefined)?.message ?? ev.message ?? "Algo ha fallado.");
      items.push({ k: "error", id: crypto.randomUUID(), text, login: LOGIN.test(text) });
    }
  }
  useChat.setState({ books: replaceConv(st.books, hit.pid, { ...conv, items, session }) });
  saveSoon(hit.pid);
}

function replaceConv(books: Record<string, Book>, pid: string, conv: Conversation): Record<string, Book> {
  const b = books[pid]!;
  return { ...books, [pid]: { ...b, convs: b.convs.map((c) => (c.id === conv.id ? { ...conv, updatedAt: Date.now() } : c)) } };
}

/** Saving after events goes through a no-op patch (the store's own debounce). */
function saveSoon(pid: string): void {
  const book = useChat.getState().books[pid];
  const any = book?.convs[0];
  if (any) useChat.getState().patch(any.id, {});
}

function onExit(convId: string, code: number | null, err: string): void {
  const st = useChat.getState();
  const { [convId]: _, ...rest } = st.running;
  useChat.setState({ running: rest });
  live.delete(convId);
  const hit = findConv(st.books, convId);
  if (!hit) return;
  const items = hit.conv.items.map((i) => (i.k === "text" && i.streaming ? { ...i, streaming: false } : i.k === "tool" && !i.done ? { ...i, done: true } : i.k === "approval" && i.state === "pending" ? { ...i, state: "denied" as const } : i));
  const lastUser = items.map((i) => i.k).lastIndexOf("user");
  const answered = items.slice(lastUser + 1).some((i) => i.k === "text" || i.k === "error");
  if (code !== 0 && !answered) {
    const text = err || (code === null ? "Se ha detenido." : `Ha terminado con un error (${code}).`);
    items.push(code === null || /SIGINT|interrupt/i.test(err) ? { k: "note", id: crypto.randomUUID(), text: "Detenido." } : { k: "error", id: crypto.randomUUID(), text: text.slice(-600), login: LOGIN.test(text) });
  }
  useChat.setState({ books: replaceConv(st.books, hit.pid, { ...hit.conv, items }) });
  saveSoon(hit.pid);
}

function onApprove(convId: string, req: string, q: { tool_name: string; input: Record<string, unknown> }): void {
  const st = useChat.getState();
  const hit = findConv(st.books, convId);
  if (!hit) return window.sweetflow?.chat?.answer(req, false);
  const item: Item = { k: "approval", id: crypto.randomUUID(), req, tool: q.tool_name, input: q.input ?? {}, state: "pending" };
  useChat.setState({ books: replaceConv(st.books, hit.pid, { ...hit.conv, items: [...hit.conv.items, item] }) });
}

let listening = false;
/** Starts taking the AI's events and the main window's context (once). */
export function startChat(): void {
  const c = chat();
  const agent = window.sweetflow?.agent;
  if (!c || !agent?.getContext || listening) return;
  listening = true;
  c.onEvent((conv, ev) => onEvent(conv, ev as Record<string, unknown>));
  c.onExit(onExit);
  c.onApprove(onApprove);
  agent.onContext?.((ctx) => useChat.getState().setCtx(ctx));
  void agent.getContext().then((ctx) => useChat.getState().setCtx(ctx));
}
