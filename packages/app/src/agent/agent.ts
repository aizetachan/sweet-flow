/**
 * The assistant (docs/INTERFAZ.md §0.2): its own window, with the terminal
 * (AgentPanel), and this main window answering the connector's requests with
 * the tools (tools.ts). Desktop app only: a browser can't open a terminal.
 */

import { codeOf } from "@sweetflow/domain";
import { useStore } from "../state/store";
import { TOOLS, runTool } from "./tools";

/** The desktop shell can open the assistant (older builds can't). */
export const hasAssistant = () => typeof window !== "undefined" && !!window.sweetflow?.terminal && !!window.sweetflow.agent?.openWindow;

/** Opens the assistant's window, or brings it to the front. */
export function openAssistant(): void {
  void window.sweetflow?.agent?.openWindow?.();
}

let answering = false;

/** This window (the main one, with the production open) answers the connector. */
export function answerAgent(): void {
  const agent = window.sweetflow?.agent;
  if (!agent?.serve || answering) return;
  answering = true;
  agent.onCall((id, call) => {
    if (call.kind === "list") return agent.reply(id, TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })));
    void runTool(call.name, call.args).then((r) => agent.reply(id, r));
  });
  agent.serve();
  // What is open here goes to the assistant's window: its chats are per production.
  let last = "";
  const tell = () => {
    const s = useStore.getState();
    const node = s.snap?.nodes.find((n) => n.id === s.selectedId);
    const ctx =
      s.phase === "production" && s.snap && s.productionId
        ? { productionId: s.productionId, productionName: s.snap.production.name, selection: node ? `${codeOf(s.snap.production, node)} «${node.title}»` : null }
        : null;
    const key = JSON.stringify(ctx);
    if (key === last) return;
    last = key;
    agent.context?.(ctx);
  };
  tell();
  useStore.subscribe(tell);
}
