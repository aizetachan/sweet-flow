/**
 * Folder-mirror engine — utility process entry (docs/ARCHITECTURE.md §5.2).
 *
 * Placeholder: receives a MessagePort from the main process and answers
 * pings. Phase 4 replaces this with the real engine (Firestore listener,
 * Storage downloads, atomic writes, manifest-driven renames).
 */

import type { MessagePortMain } from "electron";
import type { MirrorRequest, MirrorResponse } from "../shared/mirror";

function serve(port: MessagePortMain): void {
  port.on("message", (e) => {
    const msg = e.data as MirrorRequest;
    if (msg.type === "ping") {
      const reply: MirrorResponse = { type: "pong", at: msg.at, pid: process.pid };
      port.postMessage(reply);
    }
  });
  port.start();
  console.info("[mirror] ready");
}

process.parentPort.on("message", (e) => {
  const [port] = e.ports;
  if (port) serve(port);
});
