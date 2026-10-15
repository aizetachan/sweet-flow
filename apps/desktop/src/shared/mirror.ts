/** Messages between the main process and the mirror utility process. */

export type MirrorRequest = { type: "ping"; at: number };

export type MirrorResponse = { type: "pong"; at: number; pid: number };
