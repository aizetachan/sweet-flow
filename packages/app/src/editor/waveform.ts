/**
 * The sound's real wave on the timeline's audio clips (docs/INTERFAZ.md §4):
 * each file's sound is decoded once on this computer and kept as its
 * loudness every hundredth of a second; a clip draws the stretch it uses.
 */

import { useEffect, useState } from "react";

/** Loudness buckets per second. */
export const PEAKS_PER_SEC = 100;

type Peaks = Float32Array | "none";
const done = new Map<string, Peaks>();
const pending = new Map<string, Promise<Peaks>>();
let ctx: AudioContext | null = null;

async function decode(url: string): Promise<Peaks> {
  try {
    const bytes = await (await fetch(url)).arrayBuffer();
    ctx ??= new AudioContext();
    const buf = await ctx.decodeAudioData(bytes);
    const per = Math.max(1, Math.floor(buf.sampleRate / PEAKS_PER_SEC));
    const n = Math.ceil(buf.length / per);
    const out = new Float32Array(n);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        let m = out[i]!;
        const end = Math.min(data.length, (i + 1) * per);
        for (let j = i * per; j < end; j++) {
          const v = Math.abs(data[j]!);
          if (v > m) m = v;
        }
        out[i] = m;
      }
    }
    // Kept as it is (full scale 1), so a quiet file looks quiet; nothing at all: no sound.
    let top = 0;
    for (const v of out) if (v > top) top = v;
    return top < 1e-3 ? "none" : out;
  } catch {
    // No sound in it, or it can't be read here.
    return "none";
  }
}

/** A file's loudness (null while it is read; "none": it has no sound). */
export function usePeaks(url: string | undefined): Peaks | null {
  const [peaks, setPeaks] = useState<Peaks | null>(() => (url ? done.get(url) ?? null : "none"));
  useEffect(() => {
    if (!url) return setPeaks("none");
    const have = done.get(url);
    if (have) return setPeaks(have);
    let alive = true;
    let p = pending.get(url);
    if (!p) {
      p = decode(url).then((r) => (done.set(url, r), r));
      pending.set(url, p);
    }
    void p.then((r) => alive && setPeaks(r));
    return () => {
      alive = false;
    };
  }, [url]);
  return peaks;
}
