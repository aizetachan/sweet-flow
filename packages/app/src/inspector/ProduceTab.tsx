import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconArchiveOff, IconAspectRatio, IconMessagePlus, IconBolt, IconCheck, IconClock, IconCut, IconMusic, IconPhoto, IconPhotoDown, IconPhotoScan,
  IconPhotoUp, IconPlus, IconRepeat, IconSparkles, IconTrash, IconVideo, IconVolume, IconVolumeOff, IconWand, IconX,
} from "@tabler/icons-react";
import {
  ancestorsOf,
  codeOf,
  formatTc,
  isUnit,
  levelOf,
  takeDuration,
  versionTag,
  type Id,
  type Media,
  type ProdNode,
  type Take,
} from "@sweetflow/domain";
import { Avatar, Button, cx, Segmented } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { usePanel } from "./panel";
import { OnStage } from "./stage";
import { memberName } from "../state/selectors";
import { modelsFor, nearest, REF_LABEL, specOf, type GenKind, type RefType } from "../data/models";
import type { GenerateArgs } from "../data/source";
import { Popover } from "../components/Popover";
import { Composer } from "./ReviewTab";
import type { Mark } from "../components/marks";
import { Player, Thumb } from "../components/media";


/** One thing in a shot's gallery: a version generated here, or a stretch of another video placed here. */
interface GalleryItem {
  key: string;
  media: Media;
  /** This node's take of it, if any (the chosen one is what the shot is). */
  take?: Take;
  /** A stretch of another node's video (cut into shots). */
  foreign: boolean;
}

export function ProduceTab({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { source, notify } = useStore();
  const { activeMediaId, setPanel, playhead, playing } = usePanel();
  const [showArchived, setShowArchived] = useState(false);
  const level = levelOf(snap.production, node);

  // The gallery (docs/INTERFAZ.md §2.0): versions generated here and stretches placed here, in one place.
  const mine = snap.takes.filter((t) => t.nodeId === node.id);
  const all = snap.media.filter((m) => m.nodeId === node.id).sort((a, b) => b.createdAt - a.createdAt);
  const archivedCount = all.filter((m) => m.archived).length;
  const items: GalleryItem[] = [
    ...mine.flatMap((t) => {
      const m = snap.media.find((x) => x.id === t.mediaId);
      return m && m.nodeId !== node.id ? [{ key: `t:${t.id}`, media: m, take: t, foreign: true }] : [];
    }),
    ...all.filter((m) => showArchived || !m.archived).map((m) => ({ key: `m:${m.id}`, media: m, take: mine.find((t) => t.mediaId === m.id), foreign: false })),
  ];
  const chosen = items.find((i) => i.take && i.take.id === node.selectedTakeId);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [quick, setQuick] = useState(false);
  const [quickPoint, setQuickPoint] = useState<Mark | null>(null);
  useEffect(() => { setActiveKey(null); setQuick(false); setQuickPoint(null); }, [node.id]);
  const active = items.find((i) => i.key === activeKey) ?? items.find((i) => i.media.id === activeMediaId) ?? chosen ?? items[0];

  /** The shot becomes this one: its take (made whole if it had none) is the chosen one. */
  const choose = (i: GalleryItem) => {
    if (i.take) return source.selectTake(node.id, i.take.id);
    source.placeTakes(i.media.id, [{ segment: { inSec: 0, outSec: i.media.durationSec ?? 0 }, target: { nodeId: node.id } }]);
    const made = useStore.getState().snap?.takes.find((t) => t.nodeId === node.id && t.mediaId === i.media.id);
    if (made) source.selectTake(node.id, made.id);
  };
  /** Out of the gallery: a stretch is taken off; a version is archived (kept in its folder), with Deshacer. */
  const usedElsewhere = (m: Media) => snap.takes.some((t) => t.mediaId === m.id && t.nodeId !== node.id);
  const remove = (i: GalleryItem) => {
    if (i.foreign) {
      if (i.take) source.removeTake(i.take.id);
      return;
    }
    if (i.take) source.removeTake(i.take.id);
    source.setArchived(i.media.id, true);
    notify(`${versionTag(i.media.version)} fuera de la galería (se conserva en la carpeta).`, {
      label: "Deshacer",
      run: () => { source.setArchived(i.media.id, false); useStore.getState().set({ notice: null }); },
    });
  };

  const time = active?.take && active.foreign ? Math.max(playhead, active.take.inSec) : playhead;
  return (
    <div className="tab">
      {level.canGenerate ? <GenerateBox node={node} /> : (
        <p className="note">En este nivel no se genera: agrupa y conserva los montajes de sus {snap.production.levels[snap.production.levels.indexOf(level) + 1]?.name.toLowerCase()}s.</p>
      )}

      {/* Nothing here yet: the wide window's stage shows the node's cover instead. */}
      {items.length || archivedCount ? <OnStage>
      {active ? (
        <section className="sec sec--viewer">
          <Player media={active.media} time={time} playing={playing} range={active.foreign ? active.take : undefined}
            onTime={(t) => setPanel({ playhead: t })} onPlaying={(v) => setPanel({ playing: v })}
            pins={quick && quickPoint ? [{ id: "new", ...quickPoint, n: 1, on: true, onMove: setQuickPoint }] : undefined}
            onPoint={quick && active.media.kind !== "audio" ? setQuickPoint : undefined}
            onComment={active.media.status === "ready" ? () => { setQuick(!quick); setQuickPoint(null); setPanel({ playing: false }); } : undefined}
            commenting={quick} />
          {/* Comment right here, without going to Revisión: the moment and (with a click on the picture) the point. */}
          {quick ? (
            <div className="quickc">
              <div className="quickc__head sf-small">
                <IconMessagePlus size={13} /> Comentar {versionTag(active.media.version)}{active.media.kind === "video" ? ` en ${formatTc(time)}` : ""}
                <span className="sf-faint">{quickPoint ? (quickPoint.w ? "· área marcada" : "· punto marcado") : active.media.kind !== "audio" ? "· clic o arrastra sobre la imagen para señalar" : ""}</span>
                <button className="quickc__x" aria-label="Cerrar" onClick={() => { setQuick(false); setQuickPoint(null); }}><IconX size={12} /></button>
              </div>
              <Composer node={node} mediaId={active.media.id} isVideo={active.media.kind === "video"} playhead={time} mark={quickPoint} onClearMark={() => setQuickPoint(null)}
                autoFocus compact onTyping={() => setPanel({ playing: false })} onCancel={() => { setQuick(false); setQuickPoint(null); }}
                onSent={() => {
                  setQuick(false);
                  setQuickPoint(null);
                  notify("Comentario añadido.", { label: "Ver en Revisión", run: () => { setPanel({ tab: "review" }); useStore.getState().set({ notice: null }); } });
                }} />
            </div>
          ) : null}
          <MediaMeta media={active.media} take={active.foreign ? active.take : undefined} />
        </section>
      ) : null}

      <section className="sec">
        <div className="sec__head">
          <h4>Galería</h4>
          {archivedCount ? (
            <button className="link sf-small" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? "Ocultar las quitadas" : `Ver las quitadas (${archivedCount})`}
            </button>
          ) : null}
        </div>
        <div className="versions">
          {items.map((i) => {
            const m = i.media;
            const isChosen = !!chosen && chosen.key === i.key;
            const from = i.foreign ? [...snap.nodes, ...snap.shelf].find((n) => n.id === m.nodeId) : undefined;
            const ready = m.status === "ready";
            return (
              <div key={i.key} className={cx("version", i.key === active?.key && "version--on", m.archived && "version--archived", isChosen && "version--chosen")}
                onClick={() => { setActiveKey(i.key); setPanel({ activeMediaId: m.id, playhead: i.foreign && i.take ? i.take.inSec : 0, playing: false }); }}>
                <Thumb media={ready ? m : undefined} take={i.foreign ? i.take : undefined} pending={m.status === "queued" || m.status === "rendering" ? m : undefined} badge={false} preview />
                <span className="version__tag">
                  {m.kind === "video" ? <IconVideo size={11} /> : m.kind === "audio" ? <IconMusic size={11} /> : <IconPhoto size={11} />}
                  <span className="version__label" title={i.foreign ? `Tramo de ${from ? codeOf(snap.production, from) : "—"}` : undefined}>{i.foreign ? `Tramo de ${from ? codeOf(snap.production, from) : "—"}` : versionTag(m.version)}</span>
                  {isChosen ? <span className="version__chosen"><IconCheck size={10} stroke={3} /> Elegida</span> : <Avatar name={memberName(snap, m.createdBy)} size={14} />}
                </span>
                {ready && !m.archived ? (
                  <span className="version__acts" onClick={(e) => e.stopPropagation()}>
                    {!isChosen && m.kind !== "audio" ? (
                      <button className="version__act" title="Elegir: el plano pasa a ser esta" onClick={() => choose(i)}><IconCheck size={13} /></button>
                    ) : null}
                    <button className="version__act" disabled={!i.foreign && usedElsewhere(m)}
                      title={i.foreign ? "Quitar este tramo del plano (el vídeo original se conserva)" : usedElsewhere(m) ? "No se puede quitar: otros planos usan tramos de esta versión" : "Quitar de la galería (se conserva en la carpeta)"}
                      onClick={() => remove(i)}><IconTrash size={13} /></button>
                  </span>
                ) : m.archived ? (
                  <span className="version__acts" onClick={(e) => e.stopPropagation()}>
                    <button className="version__act" title="Volver a la galería" onClick={() => source.setArchived(m.id, false)}><IconArchiveOff size={13} /></button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      </OnStage> : null}
    </div>
  );
}

/** What the viewer shows: version, model, who and when, credits; Cortar for a video; the prompt. */
function MediaMeta({ media, take }: { media: Media; take?: Take }) {
  const snap = useSnap();
  const { setPanel } = usePanel();
  const g = media.generation;
  const from = take ? [...snap.nodes, ...snap.shelf].find((n) => n.id === media.nodeId) : undefined;
  return (
    <div className="mmeta">
      <div className="mmeta__row">
        <span className="mmeta__v">{take ? "Tramo" : versionTag(media.version)}</span>
        <span className="sf-muted sf-small">
          {take ? `${formatTc(take.inSec)} → ${formatTc(take.outSec)} · ${takeDuration(take)}s · de ${from ? codeOf(snap.production, from) : "—"} ${versionTag(media.version)}${from?.shelvedAt !== undefined ? " (en Vídeos editados)" : ""}` : (
            <>{g?.model} · {memberName(snap, media.createdBy)} · {new Date(media.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</>
          )}
        </span>
        {!take && g?.credits ? <span className="sf-faint sf-small" title={`Créditos de ${memberName(snap, g.launchedBy)}`}><IconBolt size={11} /> {g.credits}</span> : null}
        <span className="mmeta__spacer" />
        {!take && media.status === "ready" && media.kind === "video" ? (
          <Button size="sm" onClick={() => setPanel({ tab: "cut", activeMediaId: media.id })}><IconCut size={13} /> Cortar</Button>
        ) : null}
      </div>
      {g?.prompt ? <p className="mmeta__prompt">{g.prompt}</p> : null}
      {media.status === "failed" ? <p className="mmeta__error">{media.error ?? "No se ha podido generar."}</p> : null}
    </div>
  );
}

/**
 * The generate box (docs/INTERFAZ.md §2.5), laid out like Magnific's: kind,
 * model, references, prompt, the model's own settings and Generate. It only
 * offers what the chosen model allows (data/models.ts).
 */
function GenerateBox({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { source } = useStore();
  const { setPanel } = usePanel();
  const level = levelOf(snap.production, node);
  const unit = isUnit(snap.production, node);
  const [kind, setKind] = useState<GenKind>(unit ? "image" : "video");
  const [model, setModel] = useState(modelsFor(kind)[0]!.name);
  const spec = specOf(kind, model);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(1);
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState<string | undefined>(undefined);
  const [dur, setDur] = useState(5);
  const [sound, setSound] = useState(true);
  const [instrumental, setInstrumental] = useState(false);
  const [loop, setLoop] = useState(false);
  const [start, setStart] = useState<Id | null>(null);
  const [end, setEnd] = useState<Id | null>(null);
  const [refs, setRefs] = useState<Array<{ type: RefType; mediaId: Id }>>([]);

  // Video lengths: what the model allows, up to this level's maximum (Ajustes › Niveles).
  const durations = useMemo(() => {
    const all = spec.durations ?? [];
    if (kind !== "video") return all;
    const capped = all.filter((d) => d <= level.maxVideoSec);
    return capped.length ? capped : all.slice(0, 1);
  }, [spec, kind, level.maxVideoSec]);

  // Changing model or kind keeps each setting only if the new model allows it.
  useEffect(() => {
    if (!spec.aspectRatios.includes(ratio)) setRatio(spec.aspectRatios[0] ?? "16:9");
    if (spec.resolutions && (!resolution || !spec.resolutions.includes(resolution))) setResolution(spec.resolutions[0]);
    if (!spec.resolutions) setResolution(undefined);
    if (durations.length && !durations.includes(dur)) setDur(nearest(durations, kind === "audio" ? 30 : 5));
    setCount((c) => Math.min(c, spec.maxCount));
    if (!spec.startFrame) setStart(null);
    if (!spec.endFrame) setEnd(null);
    setRefs((r) => (spec.references ? r.filter((x) => spec.references!.types.includes(x.type)).slice(0, spec.references.max) : []));
  }, [spec]); // eslint-disable-line react-hooks/exhaustive-deps

  const fallback = ancestorsOf(snap.nodes, node).map((a) => [a.title, a.notes].filter(Boolean).join(": ")).filter(Boolean).join(". ");
  const args = (): GenerateArgs => ({
    nodeId: node.id,
    kind,
    prompt: prompt.trim() || fallback || "x",
    model,
    count,
    ...(spec.aspectRatios.length ? { aspectRatio: ratio } : {}),
    ...(resolution ? { resolution } : {}),
    ...(spec.durations ? { durationSec: dur } : {}),
    ...(spec.sound ? { sound } : {}),
    ...(spec.instrumental ? { instrumental } : {}),
    ...(spec.loop ? { loop } : {}),
    ...(start ? { sourceMediaId: start } : {}),
    ...(start && end ? { endMediaId: end } : {}),
    ...(refs.length ? { references: refs } : {}),
  });

  const guess = (kind === "video" ? Math.round(dur * 9) : kind === "audio" ? Math.round(dur / 3) : 8) * count;
  const [cost, setCost] = useState<number | null>(null);
  // Real cost from the provider when the source can ask (Magnific's simulate_cost); a guess otherwise.
  useEffect(() => {
    if (!source.estimate) return setCost(null);
    let alive = true;
    setCost(null);
    const t = setTimeout(() => {
      void source.estimate!({ ...args(), count: 1 }).then((c) => alive && setCost(c === null ? null : c * count));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [source, node.id, kind, model, dur, ratio, resolution, sound, count, start, end, refs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!snap.me.magnificConnected) {
    return (
      <div className="note note--cta">
        <IconBolt size={16} /> Conecta tu cuenta de Magnific para generar con tus créditos.
        <Button size="sm" variant="primary" onClick={() => {
          const st = useStore.getState();
          if (st.lib?.mode === "demo") return st.set({ modal: "team" });
          // Connected from the dashboard's Settings › Integrations.
          st.set({ dashSection: "settings", settingsTab: "integrations" });
          st.requestLeave();
        }}>Conectar</Button>
      </div>
    );
  }

  const usesFrames = !!(start || end);
  const refTypes = spec.references?.types ?? [];
  const placeholder = kind === "audio"
    ? spec.audio === "sfx" ? "Describe el sonido: qué suena, dónde y cómo de cerca…" : "Describe el estilo, el ambiente y los instrumentos…"
    : fallback ? `Vacío = ${fallback.slice(0, 120)}…` : kind === "video" ? "Describe el vídeo…" : "Describe la imagen…";

  return (
    <section className="gen">
      <Segmented<GenKind>
        value={kind}
        onChange={(k) => { setKind(k); setModel(modelsFor(k)[0]!.name); }}
        items={[
          { id: "image", label: <><IconPhoto size={13} /> Imagen</> },
          { id: "video", label: <><IconVideo size={13} /> Vídeo</> },
          { id: "audio", label: <><IconMusic size={13} /> Audio</> },
        ]}
      />

      <div className="gen__label">Modelo</div>
      <select className="sf-select" value={model} onChange={(e) => setModel(e.target.value)}>
        {modelsFor(kind).map((m) => <option key={m.name}>{m.name}</option>)}
      </select>

      {spec.startFrame || refTypes.length ? (
        <>
          <div className="gen__label">
            Referencias
            {spec.references && refTypes.includes("image") ? <span className="sf-faint">{refs.length}/{spec.references.max}</span> : null}
          </div>
          <div className="gen__refs">
            {spec.startFrame ? (
              <RefSlot label="Imagen inicial" icon={<IconPhotoUp size={16} />} accept={["image"]} node={node} value={start} disabled={refs.length > 0}
                disabledHint="No se combina con referencias" onPick={(id) => setStart(id)} onClear={() => { setStart(null); setEnd(null); }} />
            ) : null}
            {spec.endFrame ? (
              <RefSlot label="Imagen final" icon={<IconPhotoDown size={16} />} accept={["image"]} node={node} value={end} disabled={!start}
                disabledHint="Primero la imagen inicial" onPick={(id) => setEnd(id)} onClear={() => setEnd(null)} />
            ) : null}
            {refTypes.includes("style") ? (
              <RefSlot label="Estilo" icon={<IconSparkles size={16} />} accept={["image"]} node={node}
                value={refs.find((r) => r.type === "style")?.mediaId ?? null} disabled={usesFrames} disabledHint="No se combina con imagen inicial"
                onPick={(id) => setRefs([...refs.filter((r) => r.type !== "style"), { type: "style", mediaId: id }])}
                onClear={() => setRefs(refs.filter((r) => r.type !== "style"))} />
            ) : null}
            {refs.filter((r) => r.type !== "style").map((r) => (
              <RefSlot key={r.mediaId} label={REF_LABEL[r.type]} accept={[r.type === "audio" ? "audio" : r.type === "video" ? "video" : "image"]} node={node} value={r.mediaId}
                onPick={() => undefined} onClear={() => setRefs(refs.filter((x) => x !== r))} />
            ))}
            {kind !== "video" && refTypes.some((t) => t !== "style") && refs.length < (spec.references?.max ?? 0) ? (
              <RefSlot label="Añadir" icon={<IconPlus size={16} />} node={node} value={null} disabled={usesFrames} disabledHint="No se combina con imagen inicial"
                accept={refTypes.filter((t) => t !== "style").map((t) => (t === "audio" ? "audio" : t === "video" ? "video" : "image"))}
                onPick={(id, k) => setRefs([...refs, { type: k === "video" ? "video" : k === "audio" ? "audio" : "image", mediaId: id }])} onClear={() => undefined} />
            ) : null}
          </div>
          {/* Video: like Magnific, «Añadir media» is its own wide row under the frames, with what the model takes. */}
          {kind === "video" && refTypes.length > 0 && refs.length < (spec.references?.max ?? 0) ? (
            <RefSlot wide label="Añadir media" node={node} value={null} disabled={usesFrames} disabledHint="No se combina con imagen inicial ni final"
              icon={<span className="gen__media-icons">
                {refTypes.includes("image") ? <span><IconPhoto size={14} /></span> : null}
                {refTypes.includes("video") ? <span><IconVideo size={14} /></span> : null}
                {refTypes.includes("audio") ? <span><IconMusic size={14} /></span> : null}
                <span><IconPlus size={14} /></span>
              </span>}
              accept={refTypes.filter((t) => t !== "style").map((t) => (t === "audio" ? "audio" : t === "video" ? "video" : "image"))}
              onPick={(id, k) => setRefs([...refs, { type: k === "video" ? "video" : k === "audio" ? "audio" : "image", mediaId: id }])} onClear={() => undefined} />
          ) : null}
        </>
      ) : null}

      <div className="gen__label">Prompt</div>
      <textarea className="sf-textarea" rows={4} placeholder={placeholder} value={prompt} onChange={(e) => setPrompt(e.target.value)} />

      <div className="gen__opts">
        {spec.maxCount > 1 ? (
          <span className="gen__pill gen__count" title="Cuántas versiones">
            <button onClick={() => setCount(Math.max(1, count - 1))} disabled={count <= 1} aria-label="Menos">−</button>
            <span>{count}</span>
            <button onClick={() => setCount(Math.min(spec.maxCount, count + 1))} disabled={count >= spec.maxCount} aria-label="Más">+</button>
          </span>
        ) : null}
        {durations.length ? (
          durations.length === 1 ? <span className="gen__pill" title="Duración fija de este modelo"><IconClock size={13} /> {durations[0]}"</span> : (
            <label className="gen__pill" title="Duración">
              <IconClock size={13} />
              <select value={dur} onChange={(e) => setDur(+e.target.value)}>{durations.map((d) => <option key={d} value={d}>{d}"</option>)}</select>
            </label>
          )
        ) : null}
        {spec.aspectRatios.length ? (
          <label className="gen__pill" title="Proporción">
            <IconAspectRatio size={13} />
            <select value={ratio} onChange={(e) => setRatio(e.target.value)}>{spec.aspectRatios.map((r) => <option key={r}>{r}</option>)}</select>
          </label>
        ) : null}
        {spec.resolutions ? (
          <label className="gen__pill" title="Resolución">
            <IconPhotoScan size={13} />
            <select value={resolution} onChange={(e) => setResolution(e.target.value)}>{spec.resolutions.map((r) => <option key={r}>{r}</option>)}</select>
          </label>
        ) : null}
        {spec.sound ? (
          <button className={cx("gen__pill", sound && "gen__pill--on")} title="Sonido generado con el vídeo" onClick={() => setSound(!sound)}>
            {sound ? <IconVolume size={13} /> : <IconVolumeOff size={13} />} {sound ? "ON" : "OFF"}
          </button>
        ) : null}
        {spec.instrumental ? (
          <button className={cx("gen__pill", instrumental && "gen__pill--on")} title="Instrumental: sin voces" onClick={() => setInstrumental(!instrumental)}>
            <IconMusic size={13} /> Instrumental {instrumental ? "ON" : "OFF"}
          </button>
        ) : null}
        {spec.loop ? (
          <button className={cx("gen__pill", loop && "gen__pill--on")} title="Que el sonido se repita sin cortes" onClick={() => setLoop(!loop)}>
            <IconRepeat size={13} /> Bucle {loop ? "ON" : "OFF"}
          </button>
        ) : null}
      </div>

      <Button variant="create" block onClick={() => {
        const p = prompt.trim() || fallback;
        if (!p) return;
        source.generate({ ...args(), prompt: p });
        setPanel({ activeMediaId: null, playhead: 0 });
        setPrompt("");
      }}>
        <IconWand size={15} /> Generar{count > 1 ? ` ${count}` : ""}
        <span className="gen__cost" title={cost === null && source.estimate ? "Calculando el coste…" : "Créditos que gasta"}><IconBolt size={12} /> {cost ?? (source.estimate ? "…" : guess)}</span>
      </Button>
    </section>
  );
}

type Pickable = "image" | "video" | "audio";

/**
 * One reference slot: empty (dashed, its label), or the picked media with ×.
 * Picks from what the production has: this shot, its scene, then the rest.
 * Only media the provider made can be sent to it.
 */
function RefSlot({ label, icon, accept, node, value, disabled, disabledHint, onPick, onClear, wide }: {
  /** The wide «Añadir media» row of videos. */
  wide?: boolean;
  label: string;
  icon?: ReactNode;
  accept: Pickable[];
  node: ProdNode;
  value: Id | null;
  disabled?: boolean;
  disabledHint?: string;
  onPick: (mediaId: Id, kind: Pickable) => void;
  onClear: () => void;
}) {
  const snap = useSnap();
  const demo = useStore((s) => s.lib?.mode === "demo");
  const picked = value ? snap.media.find((m) => m.id === value) : undefined;
  if (picked) {
    return (
      <span className="gen__ref gen__ref--on" title={label}>
        <Thumb media={picked} badge={false} />
        <span className="gen__ref-label">{label}</span>
        <button className="gen__ref-x" aria-label="Quitar" onClick={onClear}><IconX size={11} /></button>
      </span>
    );
  }
  const where = (m: Media) => (m.nodeId === node.id ? 0 : m.nodeId === node.parentId || snap.nodes.find((n) => n.id === m.nodeId)?.parentId === node.parentId ? 1 : 2);
  const options = snap.media
    .filter((m) => m.status === "ready" && !m.archived && accept.includes(m.kind as Pickable) && (demo || !!m.remote?.id))
    .sort((a, b) => where(a) - where(b) || b.createdAt - a.createdAt)
    .slice(0, 48);
  return (
    <Popover className="gen__picker" button={({ open, toggle }) => (
      <button className={cx("gen__ref", wide && "gen__ref--wide", open && "is-on")} disabled={disabled} title={disabled ? disabledHint : `${label}: elegir de la producción`} onClick={toggle}>
        {icon ?? <IconPlus size={16} />}
        <span className="gen__ref-label">{label}</span>
      </button>
    )}>
      <div className="menu__title">{label}</div>
      {options.length ? (
        <div className="gen__pick-grid">
          {options.map((m) => {
            const n = [...snap.nodes, ...snap.shelf].find((x) => x.id === m.nodeId);
            return (
              <button key={m.id} className="menu__item gen__pick" onClick={() => onPick(m.id, m.kind as Pickable)} title={n ? `${codeOf(snap.production, n)} ${versionTag(m.version)}` : ""}>
                <Thumb media={m} badge={false} />
                <span className="sf-small">{n ? codeOf(snap.production, n) : "—"} {versionTag(m.version)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="sf-faint sf-small gen__pick-empty">Aún no hay {accept.map((k) => (k === "image" ? "imágenes" : k === "video" ? "vídeos" : "audios")).join(" ni ")} generados con Magnific en la producción.</p>
      )}
    </Popover>
  );
}
