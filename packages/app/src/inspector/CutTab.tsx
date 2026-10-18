import { useEffect, useMemo, useRef, useState } from "react";
import { IconCut, IconCornerDownRight, IconPlayerPlay } from "@tabler/icons-react";
import {
  ancestorsOf,
  childrenOf,
  codeOf,
  formatTc,
  isUnit,
  levelIndex,
  round1,
  segmentsFromCuts,
  versionTag,
  type Id,
  type ProdNode,
} from "@sweetflow/domain";
import { Button, cx, IconButton, Spinner } from "@sweetflow/ui";
import type { Placement } from "../data/source";
import { useSnap, useStore } from "../state/store";
import { colorSlot } from "../state/selectors";
import { usePanel } from "./panel";
import { OnStage } from "./stage";
import { Player, useDuration } from "../components/media";

const KEEP = "__keep__";
const NEW = "__new__";

/**
 * Non-destructive cutter. Cut points split a clip into segments. A shot's own
 * video is cut into shots (docs/INTERFAZ.md §2.3): the kept segments become
 * shots in its place and the whole video goes to «Vídeos editados». A clip of
 * a scene or sequence is shared out instead: each segment goes to a child, a
 * new child, or stays in the node. The original media is never modified.
 */
export function CutTab({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { source } = useStore();
  const { activeMediaId, playhead, playing, setPanel, mode } = usePanel();
  const live = useRef({ playhead, playing });
  const p = snap.production;
  const lineage = new Set(ancestorsOf(snap.nodes, node).map((a) => a.id));
  const clips = snap.media
    .filter((m) => m.kind === "video" && m.status === "ready" && !m.archived && lineage.has(m.nodeId))
    .sort((a, b) => b.createdAt - a.createdAt);
  const fed = (id: Id) => snap.takes.filter((t) => t.mediaId === id).length;
  // A shot made of a stretch of another video (cut before) is edited within that stretch.
  const myTake = node.selectedTakeId ? snap.takes.find((t) => t.id === node.selectedTakeId) : undefined;
  const takeMedia = myTake ? snap.media.find((m) => m.id === myTake.mediaId && m.kind === "video" && m.status === "ready") : undefined;
  const inTake = !!takeMedia && takeMedia.nodeId !== node.id && isUnit(p, node);
  const media = inTake ? takeMedia : clips.find((m) => m.id === activeMediaId) ?? [...clips].sort((a, b) => fed(b.id) - fed(a.id))[0];
  const [cuts, setCuts] = useState<number[]>([]);
  const [dest, setDest] = useState<Record<number, string>>({});
  /** Segments left out when cutting a shot into shots. */
  const [drop, setDrop] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState(false);
  useEffect(() => { setCuts([]); setDest({}); setDrop({}); }, [media?.id]);

  // Cuts are applied at the node that owns the clip; destinations are its children.
  const owner = inTake ? node : media ? snap.nodes.find((n) => n.id === media.nodeId)! : node;
  const kids = childrenOf(snap.nodes, owner.id);
  const childLevel = p.levels[levelIndex(p, owner) + 1];
  const full = useDuration(media);
  // In a stretch, times on the timeline count from its in-point (base); what is saved is in the video's own time.
  const base = inTake ? myTake!.inSec : 0;
  const dur = inTake ? round1(myTake!.outSec - myTake!.inSec) : full;
  const ph = Math.min(dur, Math.max(0, playhead - base));
  live.current = { playhead: playhead - base, playing };
  const segments = useMemo(() => segmentsFromCuts(dur, cuts), [dur, cuts]);
  useEffect(() => setDrop({}), [segments.length]);
  const placed = media ? snap.takes.filter((t) => t.mediaId === media.id) : [];

  // Space = play/pause, C = cut at playhead. Floating panels leave shortcuts to the main panel.
  useEffect(() => {
    if (mode === "floating") return;
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "c" || e.key === "C") setCuts((c) => [...c, round1(live.current.playhead)]);
      if (e.key === " ") { e.preventDefault(); setPanel({ playing: !live.current.playing }); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [mode, setPanel]);

  if (!media) return <div className="tab"><p className="note">No hay clips de vídeo listos en esta rama.</p></div>;

  const destOf = (i: number): string => dest[i] ?? kids[i]?.id ?? (childLevel ? NEW : KEEP);
  const nameOf = (id: Id) => {
    const n = snap.nodes.find((x) => x.id === id);
    return n ? `${codeOf(p, n)} ${n.title}` : "";
  };

  const place = (indexes: number[]) => {
    const placements: Placement[] = indexes.map((i) => {
      const d = destOf(i);
      const segment = segments[i]!;
      if (d === NEW) return { segment, target: { newChildOf: owner.id } };
      return { segment, target: { nodeId: d === KEEP ? owner.id : d } };
    });
    source.placeTakes(media.id, placements);
    setCuts([]);
    setDest({});
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  };

  // A shot's own video: the kept segments become shots, the video goes to «Vídeos editados».
  const splitting = inTake || (isUnit(p, owner) && media.nodeId === owner.id);
  const kept = segments.flatMap((s, i) => (drop[i] ? [] : [s]));
  const scene = owner.parentId ? snap.nodes.find((n) => n.id === owner.parentId) : undefined;
  const split = () => {
    const before = codeOf(p, owner);
    if (inTake) {
      // It keeps the first stretch; the rest go right after it. The original video is not touched.
      const ids = source.splitTakeShot(node.id, kept.map((s) => ({ inSec: round1(s.inSec + base), outSec: round1(s.outSec + base) })));
      if (ids.length) useStore.getState().notify(`${before} cortado en ${ids.length} plano${ids.length > 1 ? "s" : ""}: se queda con el primer tramo y los demás van a su lado.`);
      setCuts([]);
      return;
    }
    const ids = source.splitIntoShots(media.id, kept);
    if (!ids.length) return;
    const { select, notify } = useStore.getState();
    select(ids[0]!, "produce");
    notify(`${before} pasó a Vídeos editados${scene ? ` de ${codeOf(p, scene)}` : ""} · ${ids.length} plano${ids.length > 1 ? "s" : ""} nuevo${ids.length > 1 ? "s" : ""}.`, {
      label: "Deshacer",
      run: () => {
        for (const id of ids) source.trashNode(id);
        source.unshelveNode(owner.id);
        useStore.getState().select(owner.id, "cut");
        useStore.getState().set({ notice: null });
      },
    });
  };

  // Ruler marks that fit the length: every second for a short clip, every 10 s for a long one.
  const tick = dur <= 8 ? 1 : dur <= 20 ? 2 : dur <= 60 ? 5 : 10;

  const seek = (t: number) => setPanel({ playhead: base + Math.max(0, Math.min(dur, t)), playing: false });

  return (
    <div className="tab">
      <div className="cut__source">
        <select className="sf-select" value={media.id} onChange={(e) => setPanel({ activeMediaId: e.target.value, playhead: 0, playing: false })}>
          {(inTake ? [media] : clips).map((m) => {
            const n = snap.nodes.find((x) => x.id === m.nodeId)!;
            return <option key={m.id} value={m.id}>{codeOf(p, n)} · {versionTag(m.version)}{m.id === media.id ? ` · ${dur}s` : m.durationSec ? ` · ${m.durationSec}s` : ""}</option>;
          })}
        </select>
        {inTake ? <span className="sf-small sf-muted"><IconCornerDownRight size={12} /> su tramo {formatTc(myTake!.inSec)}–{formatTc(myTake!.outSec)}</span> : owner.id !== node.id ? <span className="sf-small sf-muted"><IconCornerDownRight size={12} /> clip de {codeOf(p, owner)}</span> : null}
      </div>

      <OnStage>
        <Player media={media} time={inTake ? base + ph : playhead} playing={playing} range={inTake ? myTake : undefined} onTime={(t) => setPanel({ playhead: t })} onPlaying={(v) => setPanel({ playing: v })} />
      </OnStage>

      <div className="tl">
        <div className="tl__ruler">
          {dur > 0 ? Array.from({ length: Math.floor(dur / tick) + 1 }, (_, i) => (
            <span key={i} style={{ left: `${((i * tick) / dur) * 100}%` }}>{i * tick}s</span>
          )) : null}
        </div>
        <div className="tl__track" onMouseDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          seek(((e.clientX - r.left) / r.width) * dur);
        }}>
          {segments.map((s, i) => (
            <div key={i} className={`tl__seg seg-c${i % 6}`} style={{ left: `${(s.inSec / dur) * 100}%`, width: `${((s.outSec - s.inSec) / dur) * 100}%` }}>
              <span>{i + 1}</span>
            </div>
          ))}
          {cuts.map((c) => (
            <button key={c} className="tl__cut" style={{ left: `${(c / dur) * 100}%` }} title={`Quitar corte en ${formatTc(c)}`}
              onMouseDown={(e) => { e.stopPropagation(); setCuts(cuts.filter((x) => x !== c)); }} />
          ))}
          <div className="tl__head" style={{ left: `${(ph / dur) * 100}%` }} />
        </div>
        {placed.length && !inTake ? (
          <div className="tl__placed" title="Tramos ya colocados de este clip">
            {placed.map((t) => {
              return (
                <span key={t.id} className={`seg-c${colorSlot(snap, t.nodeId)}`} style={{ left: `${(t.inSec / dur) * 100}%`, width: `${((t.outSec - t.inSec) / dur) * 100}%` }} title={`${nameOf(t.nodeId)} · ${formatTc(t.inSec)}–${formatTc(t.outSec)}`}>
                  {codeOf(p, snap.nodes.find((n) => n.id === t.nodeId) ?? owner)}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="cut__bar">
        <input className="cut__scrub" type="range" min={0} max={dur} step={0.1} value={ph} onChange={(e) => seek(+e.target.value)} />
        <span className="sf-mono">{formatTc(ph)}</span>
        <Button size="sm" onClick={() => setCuts([...cuts, round1(ph)])} disabled={ph <= 0 || ph >= dur}>
          <IconCut size={13} /> Cortar <span className="sf-kbd">C</span>
        </Button>
      </div>

      <section className="sec">
        <div className="sec__head">
          <h4>{segments.length} tramo{segments.length > 1 ? "s" : ""}</h4>
          <span className="sf-faint sf-small">el original no se modifica</span>
        </div>
        {splitting ? segments.map((s, i) => (
          <label key={`${s.inSec}-${s.outSec}`} className={cx("segrow segrow--pick", drop[i] && "segrow--off")}>
            <span className={`segrow__n seg-c${i % 6}`}>{i + 1}</span>
            <IconButton size="sm" label="Ver tramo" onClick={(e) => { e.preventDefault(); setPanel({ playhead: s.inSec, playing: true }); }}><IconPlayerPlay size={12} /></IconButton>
            <span className="sf-mono segrow__tc">{formatTc(s.inSec)}–{formatTc(s.outSec)} <span className="sf-faint">{round1(s.outSec - s.inSec)}s</span></span>
            <span className="segrow__keep">
              <input type="checkbox" checked={!drop[i]} onChange={(e) => setDrop({ ...drop, [i]: !e.target.checked })} />
              {drop[i] ? "Descartar" : "Plano"}
            </span>
          </label>
        )) : segments.map((s, i) => (
          <div key={`${s.inSec}-${s.outSec}`} className="segrow">
            <span className={`segrow__n seg-c${i % 6}`}>{i + 1}</span>
            <IconButton size="sm" label="Ver tramo" onClick={() => setPanel({ playhead: s.inSec, playing: true })}><IconPlayerPlay size={12} /></IconButton>
            <span className="sf-mono segrow__tc">{formatTc(s.inSec)}–{formatTc(s.outSec)} <span className="sf-faint">{round1(s.outSec - s.inSec)}s</span></span>
            <select className="sf-select" value={destOf(i)} onChange={(e) => setDest({ ...dest, [i]: e.target.value })}>
              <option value={KEEP}>{isUnit(p, owner) ? `Toma de ${codeOf(p, owner)}` : `Mantener en ${codeOf(p, owner)}`}</option>
              {kids.map((k) => <option key={k.id} value={k.id}>→ {codeOf(p, k)} {k.title}</option>)}
              {childLevel ? <option value={NEW}>→ Nuevo {childLevel.name.toLowerCase()}</option> : null}
            </select>
          </div>
        ))}
        {splitting ? (
          <>
            <Button variant="primary" block disabled={segments.length < 2 || !kept.length} onClick={split}>
              <IconCut size={14} /> {kept.length > 1 ? `Crear ${kept.length} planos` : kept.length ? "Crear 1 plano" : "Elige algún tramo"}
            </Button>
            <p className="sf-faint sf-small">
              {segments.length < 2
                ? <>Pulsa <span className="sf-kbd">C</span> o «Cortar» donde empieza cada plano.</>
                : inTake ? <>{codeOf(p, owner)} se queda con el primer tramo marcado y los demás salen como planos a su lado; el vídeo original no se toca.</>
                : <>Los tramos marcados sustituyen a {codeOf(p, owner)} en la fila; el vídeo completo pasa a «Vídeos editados»{scene ? ` de ${codeOf(p, scene)}` : ""}.</>}
            </p>
          </>
        ) : (
          <Button variant="primary" block onClick={() => place(segments.map((_, i) => i))}>
            {done ? <><Spinner /> Colocado y sincronizando…</> : segments.length > 1 ? `Colocar los ${segments.length} tramos` : "Colocar"}
          </Button>
        )}
        {segments.length === 1 && !isUnit(p, owner) ? (
          <p className="sf-faint sf-small">Pulsa <span className="sf-kbd">C</span> o «Cortar» en el punto del timeline donde empieza cada plano.</p>
        ) : null}
      </section>
      <div className={cx("sf-faint sf-small")}>Atajos: <span className="sf-kbd">Espacio</span> reproducir · <span className="sf-kbd">C</span> cortar · clic en un corte para quitarlo</div>
    </div>
  );
}
