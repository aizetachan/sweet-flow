/**
 * The assistant's window (docs/INTERFAZ.md §0.2), as a chat: the AI chosen in
 * the header (Claude or OpenAI), the production's conversations in tabs
 * (closed ones in the history, to take up again), the messages, and the box
 * to write with the model and the permissions under it. The terminal stays
 * as its own view, to sign in or type anything.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconHistory,
  IconLoader2,
  IconBrandOpenai,
  IconPlayerStopFilled,
  IconPlus,
  IconTerminal2,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { cx } from "@sweetflow/ui";
import { ClaudeMark, TerminalView } from "../Terminal";
import { Markdown } from "./Markdown";
import { AI_NAME, MODELS, startChat, useChat, type Ai, type Conversation, type Item } from "./store";

const AI_KEY = "sweetflow:assistant-ai";
const readAi = (): Ai => {
  try {
    return localStorage.getItem(AI_KEY) === "codex" ? "codex" : "claude";
  } catch {
    return "claude";
  }
};

export function ChatApp() {
  const ctx = useChat((s) => s.ctx);
  const book = useChat((s) => (s.ctx ? s.books[s.ctx.productionId] : undefined));
  const running = useChat((s) => s.running);
  const st = useChat.getState();
  const [view, setView] = useState<"chat" | "terminal">("chat");
  const [termUsed, setTermUsed] = useState(false);
  const [run, setRun] = useState<{ cmd: string; seq: number } | null>(null);
  const [pick, setPick] = useState<Ai>(readAi);
  const [have, setHave] = useState<Record<Ai, boolean | null>>({ claude: null, codex: null });

  useEffect(() => {
    document.title = "Asistente · Sweetflow";
    startChat();
    for (const ai of ["claude", "codex"] as const) void window.sweetflow?.chat?.available(ai).then((ok) => setHave((h) => ({ ...h, [ai]: ok })));
  }, []);

  const tabs = book?.convs.filter((c) => c.open) ?? [];
  const conv = book?.convs.find((c) => c.id === book.activeId && c.open) ?? null;
  // The header shows the AI of the conversation open (or the one picked for the next).
  const ai = conv?.ai ?? pick;

  const choose = (next: Ai) => {
    setPick(next);
    try {
      localStorage.setItem(AI_KEY, next);
    } catch {
      // Only a convenience.
    }
    setView("chat");
    if (!ctx || !book) return;
    // An empty conversation changes its AI; one already talking keeps it, and a new one starts.
    if (conv && !conv.items.length) st.patch(conv.id, { ai: next, model: "" });
    else if (!conv || conv.ai !== next) st.newConv(next);
  };

  const showTerminal = (cmd?: string) => {
    setTermUsed(true);
    setView("terminal");
    if (cmd) setRun({ cmd, seq: Date.now() });
  };

  return (
    <main className={cx("agent", window.sweetflow?.platform === "darwin" && "agent--mac")} aria-label="Asistente">
      <header className="agent__head">
        <div className="agent__where">
          <span className="agent__title">Asistente</span>
          <span className="agent__prod">{ctx ? ctx.productionName : "Sin producción abierta"}</span>
        </div>
        <span className="grow" />
        <button className={cx("agent__ai agent__ai--claude", ai === "claude" && view === "chat" && "is-on")} title="Claude" aria-label="Claude" aria-pressed={ai === "claude"} onClick={() => choose("claude")}>
          <ClaudeMark size={16} />
        </button>
        <button className={cx("agent__ai agent__ai--openai", ai === "codex" && view === "chat" && "is-on")} title="OpenAI (Codex)" aria-label="OpenAI" aria-pressed={ai === "codex"} onClick={() => choose("codex")}>
          <IconBrandOpenai size={17} stroke={1.6} />
        </button>
        <span className="agent__sep" />
        <History />
        <button className={cx("agent__icon", view === "terminal" && "is-on")} title={view === "terminal" ? "Volver al chat" : "Terminal (para entrar con tu cuenta o escribir comandos)"} onClick={() => (view === "terminal" ? setView("chat") : showTerminal())}>
          <IconTerminal2 size={16} stroke={1.6} />
        </button>
      </header>

      {view === "chat" ? (
        <nav className="chat__tabs" aria-label="Conversaciones">
          <div className="chat__tablist">
            {tabs.map((c) => (
              <div key={c.id} className={cx("chat__tab", c.id === conv?.id && "is-on")} onClick={() => st.setActive(c.id)} title={c.title}>
                <span className={cx("chat__tabai", `chat__tabai--${c.ai}`)}>{c.ai === "claude" ? <ClaudeMark size={11} /> : <IconBrandOpenai size={12} stroke={1.8} />}</span>
                <span className="chat__tabname">{c.title}</span>
                {running[c.id] ? <span className="chat__busy" title="Trabajando" /> : null}
                {c.items.some((i) => i.k === "approval" && i.state === "pending") ? <span className="chat__ask" title="Espera tu permiso" /> : null}
                <button className="chat__tabx" title="Cerrar (queda en el historial)" onClick={(e) => (e.stopPropagation(), st.closeConv(c.id))}><IconX size={11} /></button>
              </div>
            ))}
          </div>
          <button className="chat__new" title={`Nueva conversación con ${AI_NAME[ai]}`} disabled={!ctx || !book} onClick={() => st.newConv(ai)}><IconPlus size={14} /></button>
        </nav>
      ) : null}

      {termUsed ? <TerminalView visible={view === "terminal"} run={run} /> : null}

      {view === "chat" ? (
        !ctx ? (
          <Empty>Abre una producción en la ventana principal de Sweetflow: cada producción tiene sus conversaciones.</Empty>
        ) : !book ? (
          <Empty>Cargando…</Empty>
        ) : !conv ? (
          <Empty>
            <p>Habla con {AI_NAME[ai]} sobre «{ctx.productionName}»: puede leer la producción y cambiarla por ti.</p>
            {have[ai] === false ? <p className="sf-faint">No encuentro {ai === "claude" ? "Claude Code" : "Codex"} en este ordenador.</p> : null}
            <button className="chat__cta" onClick={() => st.newConv(ai)}><IconPlus size={14} /> Nueva conversación</button>
          </Empty>
        ) : (
          <Thread conv={conv} busy={!!running[conv.id]} missing={have[conv.ai] === false} onLogin={() => showTerminal(conv.ai === "claude" ? "claude" : "codex login")} />
        )
      ) : null}
    </main>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="chat__empty">{children}</div>;
}

// ---------- a conversation ----------

function Thread({ conv, busy, missing, onLogin }: { conv: Conversation; busy: boolean; missing: boolean; onLogin: () => void }) {
  const st = useChat.getState();
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const goto = (code: string) => void window.sweetflow?.agent?.goto?.(code);

  // Follows the end while it is there (scrolled up, it stays).
  useLayoutEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [conv.items, busy]);
  useEffect(() => {
    stick.current = true;
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conv.id]);

  const last = conv.items.at(-1);
  const thinking = busy && !(last?.k === "text" && last.streaming) && !(last?.k === "approval" && last.state === "pending");

  return (
    <>
      <div className="chat__list" ref={list} onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}>
        {!conv.items.length ? <div className="chat__hello">Pregunta lo que quieras sobre la producción, o pide cambios: «pon SH0030 en revisión», «crea tres planos en SC010»…</div> : null}
        {conv.items.map((it) => <Message key={it.id} item={it} conv={conv} onCode={goto} onLogin={onLogin} />)}
        {thinking ? <div className="chat__thinking"><span /><span /><span /></div> : null}
      </div>
      <Composer conv={conv} busy={busy} missing={missing} onSend={(t) => void st.send(t)} onStop={st.stop} />
    </>
  );
}

const TOOL_LABEL: Record<string, string> = {
  get_context: "Mirar qué hay abierto",
  list_productions: "Ver las producciones",
  open_production: "Abrir una producción",
  get_tree: "Leer el árbol",
  get_node: "Leer un nodo",
  create_nodes: "Crear nodos",
  update_nodes: "Cambiar nodos",
  trash_nodes: "Mandar a la papelera",
  add_comment: "Comentar",
  navigate: "Mover la app",
  assemble_montage: "Montar en el editor",
  undo: "Deshacer",
};

function toolLabel(name: string): string {
  const own = /^mcp__sweetflow__(.+)$/.exec(name)?.[1];
  if (own) return TOOL_LABEL[own] ?? own;
  return name.replace(/^mcp__[^_]+__/, "");
}

/** The interesting part of what a tool is given, short. */
function describe(input: Record<string, unknown>): string {
  const show = (v: unknown): string => (Array.isArray(v) ? v.map(show).join(", ") : typeof v === "object" && v ? JSON.stringify(v) : String(v));
  const KEYS: Record<string, string> = { nodes: "", node: "", parent: "en", titles: "", title: "título", notes: "notas", status: "estado", assignees: "personas", text: "", view: "vista", production: "", command: "", file_path: "", pattern: "", url: "", query: "" };
  const parts = Object.entries(input)
    .filter(([k]) => k in KEYS)
    .map(([k, v]) => (KEYS[k] ? `${KEYS[k]}: ${show(v)}` : show(v)));
  const s = parts.join(" · ");
  return s.length > 140 ? `${s.slice(0, 138)}…` : s;
}

function Message({ item, conv, onCode, onLogin }: { item: Item; conv: Conversation; onCode: (c: string) => void; onLogin: () => void }) {
  const [open, setOpen] = useState(false);
  switch (item.k) {
    case "user":
      return <div className="chat__user">{item.text}</div>;
    case "text":
      return <div className={cx("chat__text", item.streaming && "is-streaming")}><Markdown text={item.text} onCode={onCode} /></div>;
    case "tool": {
      const detail = item.result?.split("\n").find((l) => l.trim()) ?? "";
      return (
        <div className={cx("chat__tool", item.error && "is-error")}>
          <button className="chat__toolrow" onClick={() => setOpen(!open)}>
            <span className="chat__toolicon">{!item.done ? <IconLoader2 size={13} className="chat__spin" /> : item.error ? <IconAlertTriangle size={13} /> : <IconCheck size={13} />}</span>
            <span className="chat__toolname">{toolLabel(item.name)}</span>
            <span className="chat__tooldetail">{item.done ? detail : describe(item.input)}</span>
            {item.result ? <IconChevronDown size={13} className={cx("chat__toolchev", open && "is-open")} /> : null}
          </button>
          {open && item.result ? <pre className="chat__toolout">{item.result}</pre> : null}
        </div>
      );
    }
    case "approval":
      return (
        <div className={cx("chat__approve", `is-${item.state}`)}>
          <div className="chat__approveq">
            {item.state === "pending" ? "¿Le dejas" : item.state === "allowed" ? "Permitido:" : "No permitido:"} <strong>{toolLabel(item.tool).toLowerCase()}</strong>
            {item.state === "pending" ? "?" : ""}
          </div>
          {describe(item.input) ? <div className="chat__approvewhat">{describe(item.input)}</div> : null}
          {item.state === "pending" ? (
            <div className="chat__approvebtns">
              <button className="chat__btn" onClick={() => useChat.getState().answer(conv.id, item.id, false)}>Rechazar</button>
              <button className="chat__btn chat__btn--primary" onClick={() => useChat.getState().answer(conv.id, item.id, true)}>Permitir</button>
            </div>
          ) : null}
        </div>
      );
    case "error":
      return (
        <div className="chat__error">
          <IconAlertTriangle size={14} />
          <div>
            <div>{item.text}</div>
            {item.login ? <button className="chat__btn" onClick={onLogin}>Entrar con tu cuenta en la terminal</button> : null}
          </div>
        </div>
      );
    case "note":
      return <div className="chat__note">{item.text}</div>;
  }
}

// ---------- writing ----------

function Composer({ conv, busy, missing, onSend, onStop }: { conv: Conversation; busy: boolean; missing: boolean; onSend: (t: string) => void; onStop: () => void }) {
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const st = useChat.getState();
  const models = MODELS[conv.ai];
  const custom = !!conv.model && !models.some((m) => m.id === conv.model);
  const [other, setOther] = useState(custom);

  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);
  useEffect(() => area.current?.focus(), [conv.id]);

  const submit = () => {
    if (!text.trim() || busy || missing) return;
    onSend(text);
    setText("");
  };

  return (
    <div className="chat__compose">
      <div className="chat__box">
        <textarea ref={area} rows={1} value={text} placeholder={missing ? `No encuentro ${conv.ai === "claude" ? "Claude Code" : "Codex"} en este ordenador` : `Escribe a ${AI_NAME[conv.ai]}…`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }} />
        {busy ? (
          <button className="chat__send chat__send--stop" title="Parar" onClick={onStop}><IconPlayerStopFilled size={13} /></button>
        ) : (
          <button className="chat__send" title="Enviar (Intro)" disabled={!text.trim() || missing} onClick={submit}><IconArrowUp size={16} stroke={2.2} /></button>
        )}
      </div>
      <div className="chat__opts">
        <span className={cx("chat__optai", `chat__tabai--${conv.ai}`)}>{conv.ai === "claude" ? <ClaudeMark size={12} /> : <IconBrandOpenai size={13} stroke={1.8} />}</span>
        {other ? (
          <input className="chat__model chat__model--input" autoFocus={!conv.model} placeholder="Nombre del modelo" defaultValue={conv.model}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v || models.some((m) => m.id === v)) setOther(false);
              st.patch(conv.id, { model: /^[\w.:-]{1,64}$/.test(v) ? v : "" });
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} />
        ) : (
          <label className="chat__select" title="Modelo">
            <select value={conv.model} onChange={(e) => (e.target.value === "__other" ? setOther(true) : st.patch(conv.id, { model: e.target.value }))}>
              {models.map((m) => <option key={m.id} value={m.id}>{AI_NAME[conv.ai]} · {m.label}</option>)}
              <option value="__other">Otro modelo…</option>
            </select>
            <IconChevronDown size={12} />
          </label>
        )}
        <label className="chat__select" title={conv.permission === "ask" ? "Te pregunta antes de cambiar nada" : "Decide sola con su modo automático"}>
          <select value={conv.permission} onChange={(e) => st.patch(conv.id, { permission: e.target.value as "ask" | "auto" })}>
            <option value="ask">Preguntar antes de cambiar</option>
            <option value="auto">Automático</option>
          </select>
          <IconChevronDown size={12} />
        </label>
      </div>
    </div>
  );
}

// ---------- the history ----------

function History() {
  const book = useChat((s) => (s.ctx ? s.books[s.ctx.productionId] : undefined));
  const running = useChat((s) => s.running);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const all = useMemo(() => [...(book?.convs ?? [])].sort((a, b) => b.updatedAt - a.updatedAt), [book]);
  const st = useChat.getState();
  return (
    <div className="agent__histwrap" ref={box}>
      <button className={cx("agent__icon", open && "is-on")} title="Historial de conversaciones de esta producción" disabled={!book} onClick={() => setOpen(!open)}>
        <IconHistory size={16} stroke={1.6} />
      </button>
      {open ? (
        <div className="agent__hist">
          {all.length ? all.map((c) => (
            <div key={c.id} className={cx("agent__histrow", c.open && "is-open")} onClick={() => (st.reopen(c.id), setOpen(false))}>
              <span className={cx("chat__tabai", `chat__tabai--${c.ai}`)}>{c.ai === "claude" ? <ClaudeMark size={11} /> : <IconBrandOpenai size={12} stroke={1.8} />}</span>
              <span className="agent__histname">{c.title}</span>
              <span className="agent__histdate">{when(c.updatedAt)}</span>
              {!running[c.id] ? <button className="agent__histdel" title="Borrar la conversación" onClick={(e) => (e.stopPropagation(), st.remove(c.id))}><IconTrash size={12} /></button> : null}
            </div>
          )) : <div className="agent__histempty">Aún no hay conversaciones en esta producción.</div>}
        </div>
      ) : null}
    </div>
  );
}

function when(t: number): string {
  const d = new Date(t);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
