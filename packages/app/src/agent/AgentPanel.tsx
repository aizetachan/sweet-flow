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
import { IconBrandOpenai, IconRefresh, IconTerminal2 } from "@tabler/icons-react";
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
        {/* One click starts that AI in this terminal. */}
        <button className="agent__ai" title="Claude Code: arrancarlo en esta terminal" aria-label="Claude Code" onClick={() => run("claude")} disabled={ended}>
          <ClaudeMark />
        </button>
        <button className="agent__ai" title="Codex (OpenAI): arrancarlo en esta terminal" aria-label="Codex" onClick={() => run("codex")} disabled={ended}>
          <IconBrandOpenai size={17} stroke={1.6} />
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

/** Claude's official mark (from Simple Icons, CC0), in its orange. */
function ClaudeMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#d97757" d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}
