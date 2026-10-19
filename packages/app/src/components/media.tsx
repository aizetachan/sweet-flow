import { useEffect, useRef, useState, type MouseEvent } from "react";
import { IconMaximize, IconMessagePlus, IconMusic, IconPhoto, IconPlayerPauseFilled, IconPlayerPlayFilled, IconVideo } from "@tabler/icons-react";
import { formatTc, round1, takeDuration, type Media, type Take } from "@sweetflow/domain";
import { cx, Spinner } from "@sweetflow/ui";
import { MarkLayer, type Mark, type ShownMark } from "./marks";
import { useStore } from "../state/store";

/**
 * The progress shown while a job runs (docs/INTERFAZ.md §2.0). Providers seldom
 * say how far they are (Magnific only says «in progress»), so it also moves on
 * with the time gone by: quickly at first, slower and slower, never back and
 * never at 100 until the piece is there. The provider's figure wins when ahead.
 */
export function useShownProgress(m?: Media | null): number {
  const running = !!m && m.status === "rendering";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 700);
    return () => clearInterval(t);
  }, [running]);
  if (!m) return 0;
  if (!running) return m.progress;
  const secs = Math.max(0, (now - m.createdAt) / 1000);
  const len = Number((m.generation?.params as { durationSec?: number } | undefined)?.durationSec) || 5;
  // About how long each kind takes; a video, longer the longer it is.
  const tau = m.kind === "video" ? 45 + len * 12 : m.kind === "audio" ? 25 : 18;
  const guess = 5 + 90 * (1 - Math.exp(-secs / tau));
  return Math.min(97, Math.max(m.progress, Math.floor(guess)));
}

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
    void probe(url).then((d) => {
      if (alive) setRead(d);
      // Recorded once, so the scene's and sequence's totals count it.
      if (d > 0 && media) useStore.getState().source.noteDuration?.(media.id, d);
    });
    return () => { alive = false; };
  }, [known, url]);
  return known ?? (url ? read ?? probed.get(url) ?? 0 : 0);
}

/**
 * Card/version thumbnail. With a take: its poster at the in-point and its own
 * duration. `preview`: over a real video, the width of the cover is its
 * timeline — moving the mouse left and right scrubs through it, silently
 * (only its stretch, for a take); leaving goes back to the first frame.
 */
export function Thumb({ media, take, pending, className, preview, badge = true }: { media?: Media; take?: Take; pending?: Media; className?: string; preview?: boolean; /** The camera + length tag on the cover. */ badge?: boolean }) {
  const poster = take?.thumbUrl ?? media?.thumbUrl ?? media?.url;
  const length = useDuration(media);
  const dur = take ? takeDuration(take) : length || undefined;
  const video = useRef<HTMLVideoElement>(null);
  const start = take?.inSec ?? 0;
  const playable = preview && isRealVideo(media) && !take?.thumbUrl;
  const end = take?.outSec ?? length;
  const [at, setAt] = useState<number | null>(null);
  const hover = playable
    ? {
        onMouseMove: (e: MouseEvent<HTMLDivElement>) => {
          const v = video.current;
          if (!v || !end) return;
          const r = e.currentTarget.getBoundingClientRect();
          const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          v.currentTime = start + f * (end - start);
          setAt(f);
        },
        onMouseLeave: () => {
          const v = video.current;
          if (v) v.currentTime = start;
          setAt(null);
        },
      }
    : {};
  return (
    <div className={cx("thumb", playable && "thumb--preview", className)} {...hover}>
      {media?.kind === "audio" && media.status === "ready" ? (
        <div className="thumb__empty thumb__audio"><IconMusic size={20} stroke={1.5} /></div>
      ) : poster ? (
        isRealVideo(media) && !take?.thumbUrl ? (
          <video ref={video} src={`${media!.url}#t=${start}`} muted playsInline preload="metadata" />
        ) : <img src={poster} alt="" draggable={false} />
      ) : (
        <div className="thumb__empty">{pending ? null : <IconPhoto size={20} stroke={1.5} />}</div>
      )}
      {at !== null ? <span className="thumb__scrub" style={{ width: `${at * 100}%` }} /> : null}
      {badge && media?.kind === "video" ? (
        <span className="thumb__badge" title={take ? "Duración del tramo" : "Duración del clip"}><IconVideo size={11} /> {dur ? `${dur}s` : ""}</span>
      ) : null}
      {pending ? <JobProgress media={pending} /> : null}
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
  markers,
  pins,
  onPoint,
  onComment,
  commenting,
}: {
  media: Media;
  time: number;
  playing: boolean;
  onTime: (t: number) => void;
  onPlaying: (p: boolean) => void;
  /** Optional in/out loop (preview a take). */
  range?: { inSec: number; outSec: number };
  /** Comments at moments of the video, on the timeline (a click goes there). */
  markers?: Array<{ id: string; atSec: number; color?: string; title?: string; on?: boolean; onClick?: () => void; resolved?: boolean }>;
  /** Comments marked at points or areas of the image or frame (numbered; the author's can be moved). */
  pins?: ShownMark[];
  /** While set, a click on the picture marks a point there, a drag an area (0–1). */
  onPoint?: (m: Mark) => void;
  /** Shows a comment button on the controls (comment without going to Revisión). */
  onComment?: () => void;
  commenting?: boolean;
}) {
  const shown = useShownProgress(media);
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
  const box = useRef<HTMLDivElement>(null);
  const fullscreen = () => {
    const el = box.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };
  return (
    <div className="player" ref={box}>
      {pins?.length || onPoint ? <MarkLayer marks={pins} onMark={onPoint} /> : null}
      {media.kind === "audio" && media.status === "ready" ? (
        <div className="player__audio">
          <IconMusic size={28} stroke={1.4} />
          {media.url && !media.url.startsWith("data:image") ? <audio src={media.url} controls preload="metadata" /> : <span className="sf-faint sf-small">Audio de ejemplo (demo)</span>}
        </div>
      ) : isRealVideo(media) ? (
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
          <div className="player__empty"><Spinner /> {media.status === "queued" ? "En cola" : `Generando… ${shown}%`}</div>
        )
      )}
      {media.kind === "video" && media.url ? (
        // The usual controls: play/pause, a timeline to jump anywhere, the time, full screen.
        <div className="player__hud" onClick={(e) => e.stopPropagation()}>
          <button className="player__play" onClick={() => {
            if (!playing && time >= (range?.outSec ?? dur) - 0.05) onTime(range?.inSec ?? 0);
            onPlaying(!playing);
          }} aria-label={playing ? "Pausa" : "Reproducir"}>
            {playing ? <IconPlayerPauseFilled size={14} /> : <IconPlayerPlayFilled size={14} />}
          </button>
          <span className="sf-mono player__tc">{formatTc(time)}</span>
          <span className="player__track">
          {markers?.map((m) => {
            const a = range?.inSec ?? 0;
            const b = range?.outSec ?? dur;
            if (!b || m.atSec < a || m.atSec > b) return null;
            return (
              <button key={m.id} className={cx("player__mark", m.resolved && "player__mark--done", m.on && "player__mark--on")}
                style={{ left: `${((m.atSec - a) / (b - a)) * 100}%`, ...(m.color && !m.resolved ? { background: m.color } : {}) }}
                title={`${m.title ?? "Comentario"} · ${formatTc(m.atSec)}`} onClick={() => { onPlaying(false); onTime(m.atSec); m.onClick?.(); }} />
            );
          })}
          <input className="player__seek" type="range" aria-label="Línea de tiempo"
            min={range?.inSec ?? 0} max={range?.outSec ?? (dur || 0.1)} step={0.05} value={Math.min(Math.max(time, range?.inSec ?? 0), range?.outSec ?? dur)}
            style={{ ["--p" as string]: `${(((time - (range?.inSec ?? 0)) / Math.max(0.1, (range?.outSec ?? dur) - (range?.inSec ?? 0))) * 100).toFixed(2)}%` }}
            onChange={(e) => onTime(+e.target.value)} />
          </span>
          <span className="sf-mono player__tc sf-faint">{formatTc(range?.outSec ?? dur)}</span>
          {onComment ? <button className={cx("player__btn", commenting && "player__btn--on")} aria-label="Comentar aquí" title="Comentar en este momento" onClick={onComment}><IconMessagePlus size={14} /></button> : null}
          <button className="player__btn" aria-label="Pantalla completa" title="Pantalla completa" onClick={fullscreen}><IconMaximize size={14} /></button>
        </div>
      ) : media.kind === "image" && media.url ? (
        // A still has no timeline: just comment and full screen, bottom right.
        <div className="player__hud player__hud--mini" onClick={(e) => e.stopPropagation()}>
          {onComment ? <button className={cx("player__btn", commenting && "player__btn--on")} aria-label="Comentar aquí" title="Comentar la imagen" onClick={onComment}><IconMessagePlus size={14} /></button> : null}
          <button className="player__btn" aria-label="Pantalla completa" title="Pantalla completa" onClick={fullscreen}><IconMaximize size={14} /></button>
        </div>
      ) : null}
    </div>
  );
}

/** Spinner, percentage and bar of a job, on its thumbnail. */
function JobProgress({ media }: { media: Media }) {
  const shown = useShownProgress(media);
  return (
    <div className="thumb__job">
      <Spinner />
      <span>{media.status === "queued" ? "En cola" : `${shown}%`}</span>
      <div className="thumb__bar" style={{ width: `${shown}%` }} />
    </div>
  );
}
