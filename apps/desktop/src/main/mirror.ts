/**
 * Lifecycle of the folder-mirror utility process (docs/ARCHITECTURE.md §5.2).
 * Phase 0 only establishes the process boundary and a MessagePort channel;
 * the engine itself lands in phase 4.
 */

import { MessageChannelMain, utilityProcess, type MessagePortMain, type UtilityProcess } from "electron";
import path from "node:path";
import type { MirrorRequest, MirrorResponse } from "../shared/mirror";

let child: UtilityProcess | null = null;
let port: MessagePortMain | null = null;

export function startMirror(): void {
  if (child) return;
  child = utilityProcess.fork(path.join(__dirname, "mirror.cjs"), [], { serviceName: "Sweetflow Mirror" });

  const { port1, port2 } = new MessageChannelMain();
  port = port1;
  port.on("message", (e) => {
    const msg = e.data as MirrorResponse;
    if (msg.type === "pong") console.info(`[mirror] pong from pid ${msg.pid} in ${Date.now() - msg.at} ms`);
  });
  port.start();
  child.postMessage({ type: "init" }, [port2]);

  child.on("exit", (code) => {
    console.info(`[mirror] exited with code ${code}`);
    child = null;
    port = null;
  });

  send({ type: "ping", at: Date.now() });
}

export function send(msg: MirrorRequest): void {
  port?.postMessage(msg);
}

export function stopMirror(): void {
  child?.kill();
  child = null;
  port = null;
}
