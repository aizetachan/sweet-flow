/**
 * A video clip's picture on the timeline when its file has no poster: its
 * first frame, taken from the file itself on this computer (one at a time,
 * small, kept).
 */

import { useEffect, useState } from "react";

const done = new Map<string, string | null>();
let queue: Promise<unknown> = Promise.resolve();

function grab(url: string, at: number): Promise<string | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.crossOrigin = "anonymous";
    const end = (r: string | null) => {
      v.removeAttribute("src");
      v.load();
      resolve(r);
    };
    v.onloadeddata = () => {
      v.currentTime = Math.min(Math.max(0, at), Math.max(0, (v.duration || at) - 0.05));
    };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        c.height = 90;
        c.width = Math.round((90 * (v.videoWidth || 16)) / (v.videoHeight || 9));
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        end(c.toDataURL("image/jpeg", 0.7));
      } catch {
        end(null);
      }
    };
    v.onerror = () => end(null);
    setTimeout(() => end(null), 8000);
    v.src = url;
  });
}

/** The frame at `at` (s) of a video file, once taken (null while it is, or when it can't be). */
export function useFramePoster(url: string | undefined, at: number): string | null {
  const key = url ? `${url}@${at.toFixed(2)}` : "";
  const [src, setSrc] = useState(() => (key ? done.get(key) ?? null : null));
  useEffect(() => {
    if (!url) return;
    if (done.has(key)) return setSrc(done.get(key)!);
    let alive = true;
    const job = queue.then(() => (done.has(key) ? done.get(key)! : grab(url, at).then((r) => (done.set(key, r), r))));
    queue = job.catch(() => null);
    void job.then((r) => alive && setSrc(r));
    return () => {
      alive = false;
    };
  }, [key, url, at]);
  return src;
}
