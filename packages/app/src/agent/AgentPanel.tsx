/**
 * The assistant's window (docs/INTERFAZ.md §0.2): narrow, like a phone, and
 * movable anywhere (another screen too), holding a real terminal. The user starts Claude Code (or Codex, or
 * any AI with a terminal) there, signed in with their own account, and it
 * controls the app through its connector.
 */

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { IconRefresh, IconSparkles, IconTerminal2 } from "@tabler/icons-react";
import { cx, IconButton } from "@sweetflow/ui";

/** The terminal's colours, from the app's theme. */
function theme(): Terminal["options"]["theme"] {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    background: v("--bg-1", "#121214"),
    foreground: v("--fg-1", "#e4e4e7"),
    cursor: v("--brand-300", "#6cb6ff"),
    cursorAccent: v("--bg-1", "#121214"),
    selectionBackground: "#6cb6ff44",
  };
}

export function AgentPanel() {
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const session = useRef<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    const t = term.current;
    const api = window.sweetflow?.terminal;
    if (!t || !api) return;
    setEnded(false);
    setError(null);
    t.reset();
    try {
      fit.current?.fit();
      const { id } = await api.open(t.cols, t.rows);
      session.current = id;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    const api = window.sweetflow?.terminal;
    if (!host.current || !api) return;
    const css = getComputedStyle(document.documentElement);
    const t = new Terminal({
      fontFamily: css.getPropertyValue("--mono").trim() || "Menlo, monospace",
      fontSize: 12,
      lineHeight: 1.15,
      cursorBlink: true,
      allowProposedApi: false,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: theme(),
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(host.current);
    // What is typed here is for the terminal: the app's own keys (⌘Z, Supr, the editor's…) stay out.
    const panel = host.current.parentElement!;
    const keep = (e: KeyboardEvent) => e.stopPropagation();
    panel.addEventListener("keydown", keep);
    term.current = t;
    fit.current = f;
    const offData = api.onData((id, data) => id === session.current && t.write(data));
    const offExit = api.onExit((id) => {
      if (id !== session.current) return;
      session.current = null;
      setEnded(true);
    });
    t.onData((data) => session.current && api.write(session.current, data));
    t.onResize(({ cols, rows }) => session.current && api.resize(session.current, cols, rows));
    const ro = new ResizeObserver(() => {
      if (host.current?.offsetWidth) f.fit();
    });
    ro.observe(host.current);
    void start();
    return () => {
      ro.disconnect();
      panel.removeEventListener("keydown", keep);
      offData();
      offExit();
      if (session.current) api.close(session.current);
      session.current = null;
      t.dispose();
      term.current = null;
    };
    // start is stable enough: it only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The window comes to the front: the keys go to the terminal.
  useEffect(() => {
    document.title = "Asistente · Sweetflow";
    const focus = () => term.current?.focus();
    window.addEventListener("focus", focus);
    requestAnimationFrame(focus);
    return () => window.removeEventListener("focus", focus);
  }, []);

  const run = (cmd: string) => {
    const api = window.sweetflow?.terminal;
    if (!session.current || !api) return;
    api.write(session.current, `${cmd}\r`);
    term.current?.focus();
  };

  return (
    <main className={cx("agent", window.sweetflow?.platform === "darwin" && "agent--mac")} aria-label="Asistente">
      <header className="agent__head">
        <IconTerminal2 size={16} stroke={1.7} />
        <span className="agent__title">Asistente</span>
        <span className="grow" />
        <button className="agent__quick" title="Arrancar Claude Code en esta terminal" onClick={() => run("claude")} disabled={ended}>
          <IconSparkles size={13} /> Claude Code
        </button>
        <IconButton label="Nueva sesión (cierra la actual)" onClick={() => {
          const api = window.sweetflow?.terminal;
          if (session.current && api) api.close(session.current);
          session.current = null;
          void start();
        }}><IconRefresh size={15} /></IconButton>
      </header>
      <div className="agent__term" ref={host} onMouseDown={() => term.current?.focus()} />
      {ended || error ? (
        <div className="agent__ended">
          <span>{error ? `No se pudo abrir la terminal: ${error}` : "La sesión ha terminado."}</span>
          <button className="agent__quick" onClick={() => void start()}>Abrir otra</button>
        </div>
      ) : null}
    </main>
  );
}
