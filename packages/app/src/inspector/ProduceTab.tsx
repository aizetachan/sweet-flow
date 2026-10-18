import { useEffect, useState } from "react";
import { IconArchive, IconArchiveOff, IconBolt, IconCheck, IconCut, IconPhoto, IconTrash, IconVideo, IconWand } from "@tabler/icons-react";
import {
  ancestorsOf,
  codeOf,
  formatTc,
  isUnit,
  levelOf,
  takeDuration,
  versionTag,
  type Media,
  type MediaKind,
  type ProdNode,
} from "@sweetflow/domain";
import { Avatar, Button, cx, IconButton, Segmented } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { usePanel } from "./panel";
import { OnStage } from "./stage";
import { memberName } from "../state/selectors";
import { MODELS } from "../data/generation";
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
                  {m.kind === "video" ? <IconVideo size={11} /> : <IconPhoto size={11} />} {versionTag(m.version)}
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
        {media.status === "ready" && (unit || media.kind === "image") ? (
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

function GenerateBox({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { source } = useStore();
  const { setPanel } = usePanel();
  const level = levelOf(snap.production, node);
  const unit = isUnit(snap.production, node);
  const [kind, setKind] = useState<MediaKind>(unit ? "image" : "video");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS.image[0]!);
  const [dur, setDur] = useState(Math.min(level.maxVideoSec, unit ? 5 : 30));
  const [from, setFrom] = useState("");
  const images = snap.media.filter((m) => m.kind === "image" && m.status === "ready" && !m.archived && (m.nodeId === node.id || m.nodeId === node.parentId));
  const fallback = ancestorsOf(snap.nodes, node).map((a) => [a.title, a.notes].filter(Boolean).join(": ")).filter(Boolean).join(". ");
  const guess = kind === "video" ? Math.round(dur * 9) : 8;
  const [cost, setCost] = useState<number | null>(null);
  // Real cost from the provider when the source can ask (Magnific's simulate_cost); a guess otherwise.
  useEffect(() => {
    if (!source.estimate) return setCost(null);
    let alive = true;
    setCost(null);
    const t = setTimeout(() => {
      void source.estimate!({ nodeId: node.id, kind, prompt: prompt.trim() || fallback || "x", model, durationSec: kind === "video" ? dur : undefined }).then((c) => alive && setCost(c));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [source, node.id, kind, model, dur]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!snap.me.magnificConnected) {
    return (
      <div className="note note--cta">
        <IconBolt size={16} /> Conecta tu cuenta de Magnific para generar con tus créditos.
        <Button size="sm" variant="primary" onClick={() => {
          const st = useStore.getState();
          if (st.lib?.mode === "demo") return st.set({ view: "team" });
          // Connected from the dashboard's Settings › Integrations.
          st.set({ dashSection: "settings", settingsTab: "integrations" });
          st.requestLeave();
        }}>Conectar</Button>
      </div>
    );
  }

  return (
    <section className="gen">
      <div className="gen__row">
        <Segmented<MediaKind>
          value={kind}
          onChange={(k) => { setKind(k); setModel(MODELS[k === "video" ? "video" : "image"][0]!); }}
          items={[{ id: "image", label: <><IconPhoto size={13} /> Imagen</> }, { id: "video", label: <><IconVideo size={13} /> Vídeo</> }]}
        />
        <select className="sf-select gen__model" value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS[kind === "video" ? "video" : "image"].map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <textarea className="sf-textarea" rows={3} placeholder={fallback ? `Vacío = ${fallback.slice(0, 120)}…` : "Describe el plano…"} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      {kind === "video" ? (
        <div className="gen__row">
          <label className="gen__dur">
            <span className="sf-small sf-muted">Duración</span>
            <input type="range" min={2} max={level.maxVideoSec} value={dur} onChange={(e) => setDur(+e.target.value)} />
            <span className="sf-mono">{dur}s</span>
          </label>
          {images.length ? (
            <select className="sf-select" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">Sin imagen inicial</option>
              {images.map((m) => {
                const n = snap.nodes.find((x) => x.id === m.nodeId)!;
                return <option key={m.id} value={m.id}>Desde {codeOf(snap.production, n)} {versionTag(m.version)}</option>;
              })}
            </select>
          ) : null}
        </div>
      ) : null}
      <Button variant="create" block onClick={() => {
        const p = prompt.trim() || fallback;
        if (!p) return;
        source.generate({ nodeId: node.id, kind, prompt: p, model, durationSec: kind === "video" ? dur : undefined, sourceMediaId: from || undefined });
        setPanel({ activeMediaId: null, playhead: 0 });
        setPrompt("");
      }}>
        <IconWand size={15} /> Generar {kind === "video" ? `${dur}s de vídeo` : "imagen"}
        <span className="gen__cost" title={cost === null && source.estimate ? "Calculando el coste…" : "Créditos que gasta"}><IconBolt size={12} /> {cost ?? (source.estimate ? "…" : guess)}</span>
      </Button>
    </section>
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
