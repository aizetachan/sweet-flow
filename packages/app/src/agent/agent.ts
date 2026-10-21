/**
 * The assistant (docs/INTERFAZ.md §0.2): whether its panel is open, and this
 * window answering the connector's requests with the tools (tools.ts).
 * Desktop app only: a browser can't open a terminal.
 */

import { create } from "zustand";
import { TOOLS, runTool } from "./tools";

/** The desktop shell can open the assistant's terminal (older builds can't). */
export const hasAssistant = () => typeof window !== "undefined" && !!window.sweetflow?.terminal && !!window.sweetflow.agent;

export const useAssistant = create<{ open: boolean; started: boolean; toggle: () => void; close: () => void }>((set, get) => ({
  open: false,
  /** Opened once: the terminal stays alive while the panel is hidden. */
  started: false,
  toggle: () => set({ open: !get().open, started: true }),
  close: () => set({ open: false }),
}));

let answering = false;

/** This window answers the connector (only the one that opened a terminal gets asked). */
export function answerAgent(): void {
  const agent = window.sweetflow?.agent;
  if (!agent || answering) return;
  answering = true;
  agent.onCall((id, call) => {
    if (call.kind === "list") return agent.reply(id, TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })));
    void runTool(call.name, call.args).then((r) => agent.reply(id, r));
  });
}
