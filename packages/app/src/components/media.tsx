import { useEffect, useRef, useState } from "react";
import { IconPhoto, IconPlayerPauseFilled, IconPlayerPlayFilled, IconVideo } from "@tabler/icons-react";
import { formatTc, round1, takeDuration, type Media, type Take } from "@sweetflow/domain";
import { cx, Spinner } from "@sweetflow/ui";

const isRealVideo = (m?: Media) => !!m?.url && m.kind === "video" && !m.url.startsWith("data:image");

/** Durations read from the files themselves, by URL. */
const probed = new Map<string, number>();
const probing = new Map<string, Promise<number>>();

function probe(url: string): Promise<number> {
  let p = probing.get(url);
  if (!p) {
    p = new Promise<number>((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? round1(v.duration) : 0);
      v.onerror = () => resolve(0);
      v.src = url;
    }).then((d) => (probed.set(url, d), d));
    probing.set(url, p);
  }
  return p;
}

/**
 * A video's length: what the provider said, or read from the file when it
 * said nothing (Magnific does not always return it).
 */
export function useDuration(media?: Media): number {
  const known = media?.durationSec;
  const url = media?.kind === "video" && isRealVideo(media) ? media.url : undefined;
  const [read, setRead] = useState(() => (url ? probed.get(url) : undefined));
  useEffect(() => {
    if (known || !url) return;
    let alive = true;
    void probe(url).then((d) => alive && setRead(d));
    return () => { alive = false; };
  }, [known, url]);
  return known ?? (url ? read ?? probed.get(url) ?? 0 : 0);
}

/** Card/version thumbnail. With a take: its poster at the in-point and its own duration. */
export function Thumb({ media, take, pending, className }: { media?: Media; take?: Take; pending?: Media; className?: string }) {
  const poster = take?.thumbUrl ?? media?.thumbUrl ?? media?.url;
  const length = useDuration(media);
  const dur = take ? takeDuration(take) : length || undefined;
  return (
    <div className={cx("thumb", className)}>
      {poster ? (
        isRealVideo(media) && !take?.thumbUrl ? <video src={`${media!.url}#t=${take?.inSec ?? 0}`} muted preload="metadata" /> : <img src={poster} alt="" draggable={false} />
      ) : (
        <div className="thumb__empty">{pending ? null : <IconPhoto size={20} stroke={1.5} />}</div>
      )}
      {media?.kind === "video" ? (
        <span className="thumb__badge" title={take ? "Duración del tramo" : "Duración del clip"}><IconVideo size={11} /> {dur ? `${dur}s` : ""}</span>
      ) : null}
      {pending ? (
        <div className="thumb__job">
          <Spinner />
          <span>{pending.status === "queued" ? "En cola" : `${pending.progress}%`}</span>
          <div className="thumb__bar" style={{ width: `${pending.progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Viewer. Real video files play natively; demo stills simulate playback
 * (slow push-in + running timecode) so cutting can be validated without files.
 * Controlled: the parent owns `time` and `playing`.
 */
export function Player({
  media,
  time,
  playing,
  onTime,
  onPlaying,
  range,
}: {
  media: Media;
  time: number;
  playing: boolean;
  onTime: (t: number) => void;
  onPlaying: (p: boolean) => void;
  /** Optional in/out loop (preview a take). */
  range?: { inSec: number; outSec: number };
}) {
  const dur = useDuration(media);
  const video = useRef<HTMLVideoElement>(null);
  const timeRef = useRef(time);
  timeRef.current = time;

  useEffect(() => {
    if (media.kind !== "video" || !playing || isRealVideo(media)) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const end = range?.outSec ?? dur;
      let t = timeRef.current + (now - last) / 1000;
      last = now;
      if (t >= end) {
        t = end;
        onPlaying(false);
      }
      onTime(t);
      if (t < end) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, media, dur, range?.outSec]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (Math.abs(v.currentTime - time) > 0.25) v.currentTime = time;
    if (playing && v.paused) void v.play();
    if (!playing && !v.paused) v.pause();
  }, [time, playing]);

  const p = dur ? time / dur : 0;
  return (
    <div className="player">
      {isRealVideo(media) ? (
        <video ref={video} src={media.url} onEnded={() => onPlaying(false)} onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          // A take plays only its stretch.
          if (range && t >= range.outSec) {
            e.currentTarget.pause();
            onPlaying(false);
            return onTime(range.outSec);
          }
          onTime(t);
        }} />
      ) : media.url ? (
        <img src={media.url} alt="" draggable={false} style={media.kind === "video" ? { transform: `scale(${1 + p * 0.12}) translate(${-p * 2}%, ${p * 1}%)` } : undefined} />
      ) : (
        media.status === "failed" ? (
          <div className="player__empty player__empty--failed">No se ha podido generar{media.error ? `: ${media.error}` : "."}</div>
        ) : (
          <div className="player__empty"><Spinner /> {media.status === "queued" ? "En cola" : `Generando… ${media.progress}%`}</div>
        )
      )}
      {media.kind === "video" && media.url ? (
        <div className="player__hud">
          <button className="player__play" onClick={() => {
            if (!playing && time >= (range?.outSec ?? dur) - 0.05) onTime(range?.inSec ?? 0);
            onPlaying(!playing);
          }} aria-label={playing ? "Pausa" : "Reproducir"}>
            {playing ? <IconPlayerPauseFilled size={14} /> : <IconPlayerPlayFilled size={14} />}
          </button>
          <span className="sf-mono">{formatTc(time)} / {formatTc(dur)}</span>
        </div>
      ) : null}
    </div>
  );
}
