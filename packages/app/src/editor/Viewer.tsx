/**
 * The editor's viewer (docs/INTERFAZ.md §4): plays the montage as it is,
 * without rendering anything. The picture is the top video track's at the
 * playhead (nested blocks opened up); the sound, every audio track's. Videos
 * of a different size fit inside the montage's frame, keeping their shape.
 * The demo's stills stand for their videos.
 */

import { useEffect, useMemo, useRef } from "react";
import { IconPlayerPauseFilled, IconPlayerPlayFilled, IconPlayerSkipBackFilled, IconPlayerSkipForwardFilled, IconPlayerTrackNextFilled, IconPlayerTrackPrevFilled } from "@tabler/icons-react";
import { editDuration, flattenEdit, pictureAt, timecode, type Edit, type PlayPart } from "@sweetflow/domain";
import { cx, IconButton } from "@sweetflow/ui";
import type { Snapshot } from "../data/source";
import { useStore } from "../state/store";
import { editLookup, shotPlay } from "./model";
import { useTransport } from "./transport";

const isReal = (url?: string) => !!url && !url.startsWith("data:image");

/** Where in its file a part is at time `t` of the montage, and what it plays. */
function partAt(snap: Snapshot, p: PlayPart, t: number) {
  const play = shotPlay(snap, p.nodeId);
  return { play, fileTime: (play?.fileIn ?? 0) + p.srcIn + (t - p.start) };
}

export function Viewer({ edit, onStep }: { edit: Edit; onStep: (dir: -1 | 1, big: boolean) => void }) {
  const snap = useStore((s) => s.snap)!;
  const playhead = useStore((s) => s.editTime);
  const peek = useTransport((s) => s.peek);
  // With the razor over a clip, the frame under the pointer; else the playhead's.
  const time = peek ?? playhead;
  const rate = useTransport((s) => (s.peek === null ? s.rate : 0));
  const setRate = useTransport((s) => s.set);
  const parts = useMemo(() => flattenEdit(edit, editLookup(snap)), [edit, snap]);
  const total = editDuration(edit);
  const top = pictureAt(parts.video, time);
  const shown = top ? partAt(snap, top, time) : null;
  // The next picture, loaded ahead so the cut does not wait.
  const next = useMemo(() => parts.video.find((p) => p.start > time + 1e-6 && p.start - time < 4 && p !== top) ?? null, [parts, time, top]);
  const audio = parts.audio.filter((p) => time >= p.start - 1e-9 && time < p.end - 1e-9);
  const f = edit.format;

  return (
    <div className="viewer">
      <div className="viewer__stage">
        <div className="viewer__frame" style={{ aspectRatio: `${f.width} / ${f.height}` }}>
          {shown?.play?.media && isReal(shown.play.media.url) ? (
            <Picture key={`${top!.clipId}:${top!.start}`} url={shown.play.media.url!} fileTime={shown.fileTime} playing={rate > 0} rate={rate} />
          ) : shown?.play?.poster ? (
            <img className="viewer__still" src={shown.play.poster} alt="" draggable={false} />
          ) : (
            <span className="viewer__empty">{edit.clips.length ? "" : "Arrastra planos o niveles a la línea de tiempo"}</span>
          )}
          {next && !(top && next.nodeId === top.nodeId) ? <Preload snap={snap} part={next} /> : null}
          {audio.map((p) => {
            const a = partAt(snap, p, time);
            return a.play?.media && isReal(a.play.media.url) ? <Sound key={`${p.clipId}:${p.start}`} url={a.play.media.url!} fileTime={a.fileTime} playing={rate > 0} rate={rate} /> : null;
          })}
        </div>
      </div>
      <div className="viewer__bar">
        <span className={cx("viewer__tc", peek !== null && "viewer__tc--peek")} title={peek !== null ? "Bajo la cuchilla" : "Cabezal"}>{timecode(time, f.fps)}</span>
        <span className="grow" />
        <IconButton label="Al principio (Inicio)" onClick={() => useStore.getState().set({ editTime: 0 })}><IconPlayerSkipBackFilled size={15} /></IconButton>
        <IconButton label="Fotograma anterior (←)" onClick={() => onStep(-1, false)}><IconPlayerTrackPrevFilled size={15} /></IconButton>
        <IconButton label={rate ? "Pausa (K)" : "Reproducir (espacio)"} onClick={() => setRate(useTransport.getState().rate ? 0 : 1)} className="viewer__play">
          {rate ? <IconPlayerPauseFilled size={17} /> : <IconPlayerPlayFilled size={17} />}
        </IconButton>
        <IconButton label="Fotograma siguiente (→)" onClick={() => onStep(1, false)}><IconPlayerTrackNextFilled size={15} /></IconButton>
        <IconButton label="Al final (Fin)" onClick={() => useStore.getState().set({ editTime: total })}><IconPlayerSkipForwardFilled size={15} /></IconButton>
        <span className="grow" />
        <span className="viewer__tc sf-faint" title="Duración del montaje">{timecode(total, f.fps)}</span>
      </div>
    </div>
  );
}

/** Keeps a media element where the montage says: playing along, or still on the exact frame. */
function useSync(ref: React.RefObject<HTMLVideoElement | null>, fileTime: number, playing: boolean, rate: number) {
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!playing) {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - fileTime) > 1e-4) v.currentTime = fileTime;
      return;
    }
    v.playbackRate = Math.abs(rate) || 1;
    // Only when it drifts: setting the time while playing makes it stutter.
    if (Math.abs(v.currentTime - fileTime) > 0.15) v.currentTime = fileTime;
    if (v.paused) void v.play().catch(() => undefined);
  }, [ref, fileTime, playing, rate]);
}

function Picture({ url, fileTime, playing, rate }: { url: string; fileTime: number; playing: boolean; rate: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useSync(ref, fileTime, playing, rate);
  // The picture is silent: its sound plays from its audio clip (unlinked, it can go).
  return <video ref={ref} className="viewer__video" src={url} muted playsInline preload="auto" />;
}

function Sound({ url, fileTime, playing, rate }: { url: string; fileTime: number; playing: boolean; rate: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useSync(ref, fileTime, playing, rate);
  return <video ref={ref} className="viewer__sound" src={url} playsInline preload="auto" />;
}

/** The next video, loading at its first frame. */
function Preload({ snap, part }: { snap: Snapshot; part: PlayPart }) {
  const { play, fileTime } = partAt(snap, part, part.start);
  const url = play?.media?.url;
  if (!isReal(url)) return null;
  return <video className="viewer__preload" src={`${url}#t=${fileTime}`} muted playsInline preload="auto" />;
}
