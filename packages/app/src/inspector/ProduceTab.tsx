import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconArchive, IconArchiveOff, IconAspectRatio, IconBolt, IconCheck, IconClock, IconCut, IconMusic, IconPhoto, IconPhotoDown, IconPhotoScan,
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
} from "@sweetflow/domain";
import { Avatar, Button, cx, IconButton, Segmented } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { usePanel } from "./panel";
import { OnStage } from "./stage";
import { memberName } from "../state/selectors";
import { modelsFor, nearest, REF_LABEL, specOf, type GenKind, type RefType } from "../data/models";
import type { GenerateArgs } from "../data/source";
import { Popover } from "../components/Popover";
import { Player, Thumb } from "../components/media";


export function ProduceTab({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { activeMediaId, setPanel, playhead, playing } = usePanel();
  const [showArchived, setShowArchived] = useState(false);
  const all = snap.media.filter((m) => m.nodeId === node.id).sort((a, b) => b.createdAt - a.createdAt);
  const own = all.filter((m) => showArchived || !m.archived);
  const archivedCount = all.filter((m) => m.archived).length;
  const active = own.find((m) => m.id === activeMediaId) ?? own[0];
  const level = levelOf(snap.production, node);

  return (
    <div className="tab">
      {level.canGenerate ? <GenerateBox node={node} /> : (
        <p className="note">En este nivel no se genera: agrupa y conserva los montajes de sus {snap.production.levels[snap.production.levels.indexOf(level) + 1]?.name.toLowerCase()}s.</p>
      )}

      {/* Made from a stretch of another video (cut into shots): play that stretch. */}
      {!own.length ? <TakeViewer node={node} /> : null}

      {/* Nothing generated here: the wide window's stage shows the node's cover instead. */}
      {own.length ? <OnStage>
      {active ? (
        <section className="sec sec--viewer">
          <Player media={active} time={playhead} playing={playing} onTime={(t) => setPanel({ playhead: t })} onPlaying={(v) => setPanel({ playing: v })} />
          <MediaMeta media={active} node={node} />
        </section>
      ) : null}

      {own.length ? (
        <section className="sec">
          <div className="sec__head">
            <h4>Versiones generadas aquí</h4>
            {archivedCount ? (
              <button className="link sf-small" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? "Ocultar archivadas" : `Ver archivadas (${archivedCount})`}
              </button>
            ) : null}
          </div>
          <div className="versions">
            {own.map((m) => (
              <button key={m.id} className={cx("version", m.id === active?.id && "version--on", m.archived && "version--archived")} onClick={() => setPanel({ activeMediaId: m.id, playhead: 0, playing: false })}>
                <Thumb media={m.status === "ready" ? m : undefined} pending={m.status === "queued" || m.status === "rendering" ? m : undefined} />
                <span className="version__tag">
                  {m.kind === "video" ? <IconVideo size={11} /> : m.kind === "audio" ? <IconMusic size={11} /> : <IconPhoto size={11} />} {versionTag(m.version)}
                  <Avatar name={memberName(snap, m.createdBy)} size={14} />
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      </OnStage> : null}

      <TakesHere node={node} />
    </div>
  );
}

function MediaMeta({ media, node }: { media: Media; node: ProdNode }) {
  const snap = useSnap();
  const { source } = useStore();
  const { setPanel } = usePanel();
  const inUse = snap.takes.some((t) => t.mediaId === media.id);
  const unit = isUnit(snap.production, node);
  const g = media.generation;
  return (
    <div className="mmeta">
      <div className="mmeta__row">
        <span className="mmeta__v">{versionTag(media.version)}</span>
        <span className="sf-muted sf-small">{g?.model} · {memberName(snap, media.createdBy)} · {new Date(media.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        {g?.credits ? <span className="sf-faint sf-small" title={`Créditos de ${memberName(snap, g.launchedBy)}`}><IconBolt size={11} /> {g.credits}</span> : null}
        <span className="mmeta__spacer" />
        {media.status === "ready" && media.kind === "video" ? (
          <Button size="sm" onClick={() => setPanel({ tab: "cut", activeMediaId: media.id })}><IconCut size={13} /> Cortar</Button>
        ) : null}
        {media.status === "ready" && media.kind !== "audio" && (unit || media.kind === "image") ? (
          <Button size="sm" variant="primary" onClick={() => source.placeTakes(media.id, [{ segment: { inSec: 0, outSec: media.durationSec ?? 0 }, target: { nodeId: node.id } }])}>
            <IconCheck size={13} /> Usar como toma
          </Button>
        ) : null}
        <IconButton
          label={inUse ? "No se puede archivar: tiene tomas colocadas" : media.archived ? "Recuperar" : "Archivar (se conserva, no se replica)"}
          disabled={inUse && !media.archived}
          onClick={() => source.setArchived(media.id, !media.archived)}
        >
          {media.archived ? <IconArchiveOff size={15} /> : <IconArchive size={15} />}
        </IconButton>
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
            {refTypes.some((t) => t !== "style") && refs.length < (spec.references?.max ?? 0) ? (
              <RefSlot label="Añadir" icon={<IconPlus size={16} />} node={node} value={null} disabled={usesFrames} disabledHint="No se combina con imagen inicial"
                accept={refTypes.filter((t) => t !== "style").map((t) => (t === "audio" ? "audio" : t === "video" ? "video" : "image"))}
                onPick={(id, k) => setRefs([...refs, { type: k === "video" ? "video" : k === "audio" ? "audio" : "image", mediaId: id }])} onClear={() => undefined} />
            ) : null}
          </div>
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
function RefSlot({ label, icon, accept, node, value, disabled, disabledHint, onPick, onClear }: {
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
      <button className={cx("gen__ref", open && "is-on")} disabled={disabled} title={disabled ? disabledHint : `${label}: elegir de la producción`} onClick={toggle}>
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

/** The chosen take of a node with no media of its own, playing just its stretch. */
function TakeViewer({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const take = node.selectedTakeId ? snap.takes.find((t) => t.id === node.selectedTakeId) : undefined;
  const media = take ? snap.media.find((m) => m.id === take.mediaId) : undefined;
  const [time, setTime] = useState(take?.inSec ?? 0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setTime(take?.inSec ?? 0); setPlaying(false); }, [take?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!take || !media) return null;
  const from = [...snap.nodes, ...snap.shelf].find((n) => n.id === media.nodeId);
  const shelved = from?.shelvedAt !== undefined;
  return (
    <OnStage>
      <section className="sec sec--viewer">
        <Player media={media} time={time} playing={playing} range={take} onTime={setTime} onPlaying={setPlaying} />
        <div className="mmeta">
          <div className="mmeta__row">
            <span className="mmeta__v">Tramo</span>
            <span className="sf-muted sf-small">
              {media.kind === "video" ? `${formatTc(take.inSec)} → ${formatTc(take.outSec)} · ${takeDuration(take)}s · ` : ""}
              de {from ? codeOf(snap.production, from) : "—"} {versionTag(media.version)}{shelved ? " · en Vídeos editados" : ""}
            </span>
          </div>
        </div>
      </section>
    </OnStage>
  );
}

function TakesHere({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { source } = useStore();
  const { setPanel } = usePanel();
  const takes = snap.takes.filter((t) => t.nodeId === node.id).sort((a, b) => b.createdAt - a.createdAt);
  if (!takes.length) return null;
  return (
    <section className="sec">
      <div className="sec__head"><h4>Tomas en {codeOf(snap.production, node)}</h4><span className="sf-faint sf-small">la elegida es la que cuenta en el montaje</span></div>
      {takes.map((t) => {
        const m = snap.media.find((x) => x.id === t.mediaId);
        const from = m ? [...snap.nodes, ...snap.shelf].find((n) => n.id === m.nodeId) : undefined;
        const on = node.selectedTakeId === t.id;
        return (
          <div key={t.id} className={cx("take", on && "take--on")}>
            <button className="take__thumb" onClick={() => m && setPanel({ activeMediaId: m.nodeId === node.id ? m.id : null, playhead: t.inSec })}>
              <Thumb media={m} take={t} />
            </button>
            <div className="take__meta">
              <div>{from ? `${codeOf(snap.production, from)} ${m ? versionTag(m.version) : ""}` : "—"}</div>
              <div className="sf-faint sf-small">{m?.kind === "video" ? `${formatTc(t.inSec)} → ${formatTc(t.outSec)} · ${takeDuration(t)}s` : "imagen"} · {memberName(snap, t.createdBy)}</div>
            </div>
            <Button size="sm" variant={on ? "primary" : "default"} onClick={() => source.selectTake(node.id, t.id)}>{on ? <><IconCheck size={12} /> Elegida</> : "Elegir"}</Button>
            <IconButton size="sm" label="Quitar toma (el original se conserva)" onClick={() => source.removeTake(t.id)}><IconTrash size={13} /></IconButton>
          </div>
        );
      })}
    </section>
  );
}
