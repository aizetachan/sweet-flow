import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  IconFileImport,
  IconArchiveOff, IconArrowUpRight, IconAspectRatio, IconMessagePlus, IconBolt, IconCheck, IconClock, IconCut, IconMusic, IconPhoto, IconPhotoDown, IconPhotoScan,
  IconPhotoUp, IconPlus, IconRepeat, IconSparkles, IconTrash, IconVideo, IconVolume, IconVolumeOff, IconWand, IconX,
} from "@tabler/icons-react";
import {
  ancestorsOf,

  formatTc,
  isUnit,
  levelOf,
  takeDuration,
  versionTag,
  type Id,
  type Media,
  type ProdNode,
  type Take,
  type LevelDef,
} from "@sweetflow/domain";
import { Avatar, Button, cx, Spinner } from "@sweetflow/ui";
import { useSnap, useStore } from "../state/store";
import { usePanel } from "./panel";
import { OnStage } from "./stage";
import { memberName } from "../state/selectors";
import { modelsFor, nearest, REF_LABEL, specOf, useModelsVersion, type GenKind, type RefType } from "../data/models";
import { refreshCatalog } from "../integrations/magnific/catalog";
import { mentionsIn, PromptTags, type Mentions } from "./PromptTags";
import { draggedMedia, MEDIA_DRAG } from "../library/LibraryBoard";
import { kindOfFile, type GenerateArgs, type ImportItem, type RemoteCreation } from "../data/source";
import { Popover } from "../components/Popover";
import { Composer } from "./ReviewTab";
import { hasFiles, runImport } from "../components/ImportDialog";
import type { Mark } from "../components/marks";
import { Player, Thumb } from "../components/media";
import { nameOf } from "../state/names";


/** One thing in a shot's gallery: a version generated here, or a stretch of another video placed here. */
interface GalleryItem {
  key: string;
  media: Media;
  /** This node's take of it, if any (the chosen one is what the shot is). */
  take?: Take;
  /** A stretch of another node's video (cut into shots). */
  foreign: boolean;
}

/** What the library's nodes allow when generating: everything, videos up to 15 s. */
const LIB_LEVEL_DEF: LevelDef = { id: "lib", name: "Ficha", prefix: "", step: 1, pad: 1, canGenerate: true, maxVideoSec: 15 };

export function ProduceTab({ node }: { node: ProdNode }) {
  const snap = useSnap();
  const { source, notify } = useStore();
  const { activeMediaId, setPanel, playhead, playing } = usePanel();
  const [showArchived, setShowArchived] = useState(false);
  // The library's desk and cards always generate (docs/INTERFAZ.md §2.8).
  const level = node.lib ? LIB_LEVEL_DEF : levelOf(snap.production, node);

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
  /** Out to the row: a new shot right after this one, with that version (the file stays put). */
  const extract = (i: GalleryItem) => {
    const id = source.extractToRow(node.id, i.media.id, i.foreign && i.take ? { inSec: i.take.inSec, outSec: i.take.outSec } : undefined);
    const made = id ? useStore.getState().snap?.nodes.find((n) => n.id === id) : undefined;
    if (!id) return;
    notify(`${i.foreign ? "Tramo" : versionTag(i.media.version)} sacado a la fila${made ? ` como ${nameOf(snap.production, made)}` : ""}.`, {
      label: "Ver",
      run: () => { useStore.getState().select(id); useStore.getState().set({ notice: null }); },
    });
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
  // Files dropped anywhere on the panel: new versions of this shot (docs/INTERFAZ.md §2.0).
  const [filesOver, setFilesOver] = useState(false);
  return (
    <div className={cx("tab", filesOver && "files-over")}
      onDragOver={(e) => { if (!hasFiles(e.dataTransfer)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setFilesOver(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFilesOver(false); }}
      onDrop={(e) => { if (!hasFiles(e.dataTransfer)) return; e.preventDefault(); setFilesOver(false); runImport({ nodeId: node.id }, [...e.dataTransfer.files].map((file) => ({ file }))); }}>
      {level.canGenerate ? <GenerateBox node={node} /> : (
        <p className="note">En este nivel no se genera: agrupa y conserva los montajes de sus {snap.production.levels[snap.production.levels.indexOf(level) + 1]?.name.toLowerCase()}s.</p>
      )}

      {/* Nothing here yet: the wide window's stage shows the node's cover instead. */}
      {items.length || archivedCount ? <OnStage>
      {active ? (
        <section className="sec sec--viewer">
          <Player media={active.media} time={time} playing={playing} range={active.foreign ? active.take : undefined}
            onTime={(t) => setPanel({ playhead: t })} onPlaying={(v) => setPanel({ playing: v })}
            pins={quick && quickPoint ? [{ id: "new", ...quickPoint, label: snap.me.displayName.trim().slice(0, 1).toUpperCase(), on: true, onMove: setQuickPoint }] : undefined}
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

      {/* In the library the group's images are all on the board: no gallery here (docs/INTERFAZ.md §2.8). */}
      {!node.lib ? (
      <section className="sec">
        <div className="sec__head">
          <h4>Galería</h4>
          <button className="link sf-small gal__import" title="Una versión nueva desde Magnific o desde el ordenador (también puedes soltar archivos aquí)"
            onClick={() => useStore.getState().set({ importTo: { nodeId: node.id } })}><IconFileImport size={13} /> Importar</button>
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
                  <span className="version__label" title={i.foreign ? `Tramo de ${from ? nameOf(snap.production, from) : "—"}` : undefined}>{i.foreign ? `Tramo de ${from ? nameOf(snap.production, from) : "—"}` : versionTag(m.version)}</span>
                  {isChosen ? <span className="version__chosen"><IconCheck size={10} stroke={3} /> Elegida</span> : <Avatar name={memberName(snap, m.createdBy)} size={14} />}
                </span>
                {ready && !m.archived ? (
                  // All three on the right: out to the row, choose (green while it is the chosen one), remove.
                  <span className={cx("version__acts", isChosen && "version__acts--show")} onClick={(e) => e.stopPropagation()}>
                    {isUnit(snap.production, node) ? (
                      <button className="version__act" title="Sacar a la fila: un plano nuevo, al lado de este, con esta versión" onClick={() => extract(i)}><IconArrowUpRight size={13} /></button>
                    ) : null}
                    {m.kind !== "audio" ? (
                      <button className={cx("version__act", isChosen && "version__act--on")} title={isChosen ? "Es la elegida del plano" : "Elegir: el plano pasa a ser esta"}
                        onClick={() => { if (!isChosen) choose(i); }}><IconCheck size={13} stroke={isChosen ? 3 : 2} /></button>
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
      ) : null}
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
          {take ? `${formatTc(take.inSec)} → ${formatTc(take.outSec)} · ${takeDuration(take)}s · de ${from ? nameOf(snap.production, from) : "—"} ${versionTag(media.version)}${from?.shelvedAt !== undefined ? " (en Vídeos editados)" : ""}` : (
            <>{g?.model} · {memberName(snap, media.createdBy)} · {new Date(media.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</>
          )}
        </span>
        {!take && g?.credits ? <span className="sf-faint sf-small" title={`Créditos de ${memberName(snap, g.launchedBy)}`}><IconBolt size={11} /> {g.credits}</span> : null}
        <span className="mmeta__spacer" />
        {!take && media.status === "ready" && media.kind === "video" ? (
          <Button size="sm" onClick={() => setPanel({ tab: "cut", activeMediaId: media.id })}><IconCut size={13} /> Cortar</Button>
        ) : null}
      </div>
      {g?.prompt ? (
        // A click copies it, to paste it elsewhere.
        <p className="mmeta__prompt" title="Clic para copiar el prompt" onClick={() => {
          void navigator.clipboard?.writeText(g.prompt);
          useStore.getState().notify("Prompt copiado.");
        }}>{g.prompt}</p>
      ) : null}
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
  const level = node.lib ? LIB_LEVEL_DEF : levelOf(snap.production, node);
  const unit = isUnit(snap.production, node);
  const [kind, setKind] = useState<GenKind>(unit || node.lib ? "image" : "video");
  const [model, setModel] = useState(modelsFor(kind)[0]!.name);
  // The live catalog and the models chosen in Ajustes › Modelos.
  useModelsVersion();
  useEffect(() => {
    refreshCatalog().catch((e: unknown) => console.warn("[models]", e));
  }, []);
  const shown = modelsFor(kind);
  useEffect(() => {
    if (!shown.some((m) => m.name === model)) setModel(shown[0]!.name);
  }, [shown, model]);
  const spec = specOf(kind, model);
  const [prompt, setPrompt] = useState("");
  // Library groups called with «@» and the images picked for each (docs/INTERFAZ.md §2.8).
  const [mentions, setMentions] = useState<Mentions>({});
  const [count, setCount] = useState(1);
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState<string | undefined>(undefined);
  const [dur, setDur] = useState(5);
  const [sound, setSound] = useState(true);
  const [instrumental, setInstrumental] = useState(false);
  const [loop, setLoop] = useState(false);
  const [start, setStart] = useState<Id | null>(null);
  const [end, setEnd] = useState<Id | null>(null);
  // Each slot holds a media id of the production, or an «up:» key of a file being sent (`ups`).
  const [refs, setRefs] = useState<Array<{ type: RefType; mediaId: Id }>>([]);
  const ref = useRefFiles(node);

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
    ...(start ? (isUp(start) ? { sourceRef: ref.ups[start]?.ref } : { sourceMediaId: start }) : {}),
    ...(start && end ? (isUp(end) ? { endRef: ref.ups[end]?.ref } : { endMediaId: end }) : {}),
    ...(refs.length ? { references: refs.map((r) => (isUp(r.mediaId) ? { type: r.type, ref: ref.ups[r.mediaId]?.ref } : r)) } : {}),
    ...(called.length ? { mentions: called } : {}),
  });
  // Images of the groups called that the provider doesn't have yet go up first.
  const called = mentionsIn(prompt, mentions);
  useEffect(() => {
    for (const c of called) for (const id of c.mediaIds) {
      const m = snap.media.find((x) => x.id === id);
      if (m && !m.remote?.id && !ref.sending.includes(id) && snap.me.magnificConnected) ref.media(m);
    }
  }, [called.map((c) => c.mediaIds.join(",")).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  // Files still on their way to the provider (or that failed) hold Generate back.
  const inUse = [start, start ? end : null, ...refs.map((r) => r.mediaId), ...called.flatMap((c) => c.mediaIds)].filter((v): v is string => !!v);
  const waiting = inUse.some((v) => (isUp(v) ? !ref.ups[v]?.ref : ref.sending.includes(v)));
  const failed = inUse.some((v) => isUp(v) && !!ref.ups[v]?.error);

  /** A library card's chosen images as references (a style card as style, when the model takes it), up to the model's maximum. */
  const addFromCard = (ids: Id[], card: ProdNode) => {
    const type: RefType = card.lib?.kind === "card" && card.lib.type === "style" && refTypes.includes("style") ? "style" : "image";
    // The style slot takes one image: the card's first chosen.
    if (type === "style") ids = ids.slice(0, 1);
    const room = (spec.references?.max ?? 0) - refs.filter((r) => !(type === "style" && r.type === "style")).length;
    const fresh = ids.filter((id) => !refs.some((r) => r.mediaId === id)).slice(0, Math.max(0, room));
    if (fresh.length < ids.length) useStore.getState().notify(`${spec.name} admite ${spec.references?.max ?? 0} referencias: se han añadido ${fresh.length} de «${card.title}».`);
    setRefs([...refs.filter((r) => !(type === "style" && r.type === "style")), ...fresh.map((mediaId) => ({ type, mediaId }))]);
  };

  /** Library images dropped: the provider gets them first if it doesn't have them. */
  const libMedia = (ids: Id[]) => {
    const list = ids.map((id) => snap.media.find((m) => m.id === id)).filter((m): m is Media => !!m && m.kind === "image" && m.status === "ready");
    for (const m of list) ref.media(m);
    return list.map((m) => m.id);
  };
  /** Library images as references (or as the start frame, when the model has no references). */
  const addMedia = (raw: Id[]) => {
    const ids = libMedia(raw);
    if (!ids.length) return;
    if (refTypes.includes("image") && !start) {
      const room = (spec.references?.max ?? 0) - refs.length;
      const fresh = ids.filter((id) => !refs.some((r) => r.mediaId === id)).slice(0, Math.max(0, room));
      if (fresh.length < ids.length) useStore.getState().notify(`${spec.name} admite ${spec.references?.max ?? 0} referencias.`);
      setRefs([...refs, ...fresh.map((mediaId) => ({ type: "image" as RefType, mediaId }))]);
    } else if (spec.startFrame && !refs.length) {
      if (!start) setStart(ids[0]!);
      else if (spec.endFrame && !end) setEnd(ids[0]!);
    } else useStore.getState().notify(`${spec.name} no admite más imágenes como referencia.`);
  };

  /** Files dropped on the references: each where the model takes it (references first, then the frames). */
  const dropFiles = (files: RefItem[]) => {
    let list = refs;
    let s0 = start;
    let e0 = end;
    const max = spec.references?.max ?? 0;
    for (const f of files) {
      const k = kindOfItem(f);
      if (!k) {
        useStore.getState().notify(`${f.name}: solo imágenes, vídeos y audios.`);
        continue;
      }
      const t: RefType = k;
      if (refTypes.includes(t) && !s0 && list.length < max) {
        const key = ref.send(f);
        list = [...list, { type: t, mediaId: key }];
      } else if (k === "image" && spec.startFrame && !list.length && !s0) {
        s0 = ref.send(f);
      } else if (k === "image" && spec.endFrame && s0 && !e0) {
        e0 = ref.send(f);
      } else {
        useStore.getState().notify(`${spec.name} no admite más ${k === "image" ? "imágenes" : k === "video" ? "vídeos" : "audios"} como referencia.`);
      }
    }
    setRefs(list);
    setStart(s0);
    setEnd(e0);
  };

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
          // Ajustes › Integraciones, without leaving the production.
          st.set({ modal: "settings", settingsTab: "integrations" });
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
      {/* Kind as three icon buttons, and the model on the same row. */}
      <div className="gen__head">
        <div className="gen__kinds" role="radiogroup" aria-label="Tipo">
          {([["image", "Imagen", IconPhoto], ["video", "Vídeo", IconVideo], ["audio", "Audio", IconMusic]] as const).map(([id, label, Icon]) => (
            <button key={id} role="radio" aria-checked={kind === id} aria-label={label} title={label} className={cx("gen__kind", kind === id && "is-on")}
              onClick={() => { setKind(id); setModel(modelsFor(id)[0]!.name); }}>
              <Icon size={16} stroke={1.7} />
            </button>
          ))}
        </div>
        <select className="sf-select gen__model" value={model} onChange={(e) => setModel(e.target.value)} title="Modelo">
          {shown.map((m) => <option key={m.name}>{m.name}</option>)}
        </select>
      </div>

      {spec.startFrame || refTypes.length ? (
        <>
          <div className="gen__label">
            Referencias
            {spec.references && refTypes.includes("image") ? <span className="sf-faint">{refs.length}/{spec.references.max}</span> : null}
          </div>
          <div className="gen__refs" {...fileDrop(dropFiles, undefined, addMedia)}>
            {spec.startFrame ? (
              <RefSlot ctx={ref} label="Imagen inicial" icon={<IconPhotoUp size={16} />} accept={["image"]} node={node} value={start} disabled={refs.length > 0}
                disabledHint="No se combina con referencias" onPick={(id) => setStart(id)} onFiles={([f]) => f && setStart(ref.send(f))} onMedia={(ids) => { const [id] = libMedia(ids); if (id) setStart(id); }} onClear={() => { setStart(null); setEnd(null); }} />
            ) : null}
            {spec.endFrame ? (
              <RefSlot ctx={ref} label="Imagen final" icon={<IconPhotoDown size={16} />} accept={["image"]} node={node} value={end} disabled={!start}
                disabledHint="Primero la imagen inicial" onPick={(id) => setEnd(id)} onFiles={([f]) => f && setEnd(ref.send(f))} onMedia={(ids) => { const [id] = libMedia(ids); if (id) setEnd(id); }} onClear={() => setEnd(null)} />
            ) : null}
            {refTypes.includes("style") ? (
              <RefSlot ctx={ref} label="Estilo" icon={<IconSparkles size={16} />} accept={["image"]} node={node}
                value={refs.find((r) => r.type === "style")?.mediaId ?? null} disabled={usesFrames} disabledHint="No se combina con imagen inicial"
                onPick={(id) => setRefs([...refs.filter((r) => r.type !== "style"), { type: "style", mediaId: id }])}
                onFiles={([f]) => f && kindOfItem(f) === "image" && setRefs([...refs.filter((r) => r.type !== "style"), { type: "style", mediaId: ref.send(f) }])}
                onMedia={(ids) => { const [id] = libMedia(ids); if (id) setRefs([...refs.filter((r) => r.type !== "style"), { type: "style", mediaId: id }]); }}
                onClear={() => setRefs(refs.filter((r) => r.type !== "style"))} />
            ) : null}
            {refs.filter((r) => r.type !== "style").map((r) => (
              <RefSlot ctx={ref} key={r.mediaId} label={REF_LABEL[r.type]} accept={[r.type === "audio" ? "audio" : r.type === "video" ? "video" : "image"]} node={node} value={r.mediaId}
                onPick={() => undefined} onClear={() => setRefs(refs.filter((x) => x !== r))} />
            ))}
            {kind !== "video" && refTypes.some((t) => t !== "style") && refs.length < (spec.references?.max ?? 0) ? (
              <RefSlot ctx={ref} label="Añadir" icon={<IconPlus size={16} />} node={node} value={null} disabled={usesFrames} disabledHint="No se combina con imagen inicial" onFiles={dropFiles} onMedia={addMedia} onPickMany={addFromCard}
                accept={refTypes.filter((t) => t !== "style").map((t) => (t === "audio" ? "audio" : t === "video" ? "video" : "image"))}
                onPick={(id, k) => setRefs([...refs, { type: k === "video" ? "video" : k === "audio" ? "audio" : "image", mediaId: id }])} onClear={() => undefined} />
            ) : null}
          </div>
          {/* Video: like Magnific, «Añadir media» is its own wide row under the frames, with what the model takes. */}
          {kind === "video" && refTypes.length > 0 && refs.length < (spec.references?.max ?? 0) ? (
            <RefSlot ctx={ref} wide label="Añadir media" node={node} value={null} disabled={usesFrames} disabledHint="No se combina con imagen inicial ni final" onFiles={dropFiles} onMedia={addMedia} onPickMany={addFromCard}
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
      <PromptTags value={prompt} onChange={setPrompt} placeholder={snap.library.some((n) => n.lib?.kind === "card") ? `${placeholder} (@ para llamar a un grupo de la biblioteca)` : placeholder} mentions={mentions} setMentions={setMentions} />

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

      {failed ? <p className="sf-small gen__warn">Una referencia no se ha podido subir: quítala o cámbiala.</p> : null}
      <Button variant="create" block disabled={waiting || failed} title={waiting ? "Subiendo referencias a Magnific…" : undefined} onClick={() => {
        const p = prompt.trim() || fallback;
        if (!p || waiting || failed) return;
        source.generate({ ...args(), prompt: p });
        setPanel({ activeMediaId: null, playhead: 0 });
        setPrompt("");
      }}>
        <IconWand size={15} /> {waiting ? "Subiendo referencias…" : <>Generar{count > 1 ? ` ${count}` : ""}</>}
        <span className="gen__cost" title={cost === null && source.estimate ? "Calculando el coste…" : "Créditos que gasta"}><IconBolt size={12} /> {cost ?? (source.estimate ? "…" : guess)}</span>
      </Button>
    </section>
  );
}

type Pickable = "image" | "video" | "audio";

/** A file of this computer on its way to the provider, as a reference. */
interface RefUpload {
  kind: Pickable;
  name: string;
  preview: string;
  ref?: string;
  error?: string;
  /** Picked from Magnific: its preview is a URL, not a local file. */
  remote?: boolean;
}

/** A reference from outside the production: a file of this computer or a Magnific creation. */
type RefItem = File | RemoteCreation;
const kindOfItem = (x: RefItem): Pickable | null => (x instanceof File ? kindOfFile(x) : (x.kind as Pickable));
const asRefItem = (i: ImportItem): RefItem => ("file" in i ? i.file : i.creation);

const isUp = (v: string) => v.startsWith("up:");
let upSeq = 0;

/**
 * References from this computer (docs/INTERFAZ.md §2.5), like Magnific's own
 * box: a dropped or chosen file is sent to Magnific right away and its slot
 * shows it meanwhile; media of the production that Magnific doesn't have yet
 * is sent the first time it is picked.
 */
function useRefFiles(node: ProdNode) {
  const source = useStore((s) => s.source);
  const notify = useStore((s) => s.notify);
  const [ups, setUps] = useState<Record<string, RefUpload>>({});
  const [sending, setSending] = useState<Id[]>([]);
  const fail = (e: unknown) => (e instanceof Error ? e.message : String(e));
  useEffect(() => () => Object.values(ups).forEach((u) => !u.remote && URL.revokeObjectURL(u.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    ups,
    sending,
    /** Starts sending a file; returns the key its slot holds. */
    send(item: RefItem): string {
      const key = `up:${++upSeq}`;
      // From Magnific: already there, nothing to send.
      if (!(item instanceof File)) {
        setUps((u) => ({ ...u, [key]: { kind: item.kind as Pickable, name: item.name, preview: item.thumbUrl ?? item.url, ref: item.id, remote: true } }));
        return key;
      }
      const file = item;
      setUps((u) => ({ ...u, [key]: { kind: kindOfFile(file) ?? "image", name: file.name, preview: URL.createObjectURL(file) } }));
      source.uploadReference(node.id, file).then(
        (r) => setUps((u) => (u[key] ? { ...u, [key]: { ...u[key]!, ref: r.ref } } : u)),
        (e: unknown) => {
          setUps((u) => (u[key] ? { ...u, [key]: { ...u[key]!, error: fail(e) } } : u));
          notify(fail(e));
        },
      );
      return key;
    },
    /** Media of the production picked: sent first if the provider doesn't have it. */
    media(m: Media): void {
      if (m.remote?.id) return;
      setSending((l) => [...l, m.id]);
      source.uploadReference(node.id, { mediaId: m.id })
        .catch((e: unknown) => notify(fail(e)))
        .finally(() => setSending((l) => l.filter((x) => x !== m.id)));
    },
  };
}
type RefCtx = ReturnType<typeof useRefFiles>;

/** Accept files dragged from the computer. */
function fileDrop(onFiles: (files: File[]) => void, on?: (over: boolean) => void, onMedia?: (ids: Id[]) => void) {
  // Files from this computer, or images dragged from the library (docs/INTERFAZ.md §2.8).
  // Library images first: dragging an <img> can also look like a file to the browser.
  const isMedia = (e: DragEvent) => !!onMedia && e.dataTransfer.types.includes(MEDIA_DRAG);
  const ours = (e: DragEvent) => isMedia(e) || hasFiles(e.dataTransfer);
  const accept = (e: DragEvent) => {
    if (!ours(e)) return;
    e.preventDefault();
    e.stopPropagation();
    // «copy» is allowed by both: files, and library images (copyMove).
    e.dataTransfer.dropEffect = "copy";
    on?.(true);
  };
  return {
    // Both: the drop target is chosen on enter, and kept while hovering.
    onDragEnter: accept,
    onDragOver: accept,
    onDragLeave: () => on?.(false),
    onDrop: (e: DragEvent) => {
      if (!ours(e)) return;
      e.preventDefault();
      e.stopPropagation();
      on?.(false);
      if (!isMedia(e)) return onFiles([...e.dataTransfer.files]);
      let ids = draggedMedia();
      if (!ids.length) {
        try {
          ids = JSON.parse(e.dataTransfer.getData(MEDIA_DRAG)) as Id[];
        } catch {
          ids = [];
        }
      }
      if (ids.length) onMedia?.(ids);
    },
  };
}

/**
 * One reference slot: empty (dashed, its label), or the picked media with ×.
 * Picks from what the production has (this shot, its scene, then the rest),
 * or from this computer: «Subir del ordenador», or a file dropped on it.
 */
function RefSlot({ ctx, label, icon, accept, node, value, disabled, disabledHint, onPick, onPickMany, onFiles, onMedia, onClear, wide }: {
  ctx: RefCtx;
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
  /** A library card picked: its chosen images (slots that take several). */
  onPickMany?: (mediaIds: Id[], card: ProdNode) => void;
  onFiles?: (items: RefItem[]) => void;
  /** Library images dropped on it. */
  onMedia?: (mediaIds: Id[]) => void;
  onClear: () => void;
}) {
  const snap = useSnap();
  const [over, setOver] = useState(false);
  // A library group opened in the list, and the images marked in it.
  const [openCard, setOpenCard] = useState<{ card: ProdNode; refs: Media[]; all: Media[] } | null>(null);
  const [marks, setMarks] = useState<Id[]>([]);
  const drop = onFiles && !disabled ? fileDrop(onFiles, setOver, onMedia) : {};
  const up = value && isUp(value) ? ctx.ups[value] : undefined;
  const picked = value && !up ? snap.media.find((m) => m.id === value) : undefined;
  if (up || picked) {
    const busy = up ? !up.ref && !up.error : ctx.sending.includes(value!);
    return (
      <span className={cx("gen__ref gen__ref--on", up?.error && "gen__ref--bad")} title={up ? `${label} · ${up.name}${up.error ? ` · ${up.error}` : ""}` : label} {...drop}>
        {up ? (
          <span className="thumb">{up.kind === "video" ? <video src={up.preview} muted /> : up.kind === "image" ? <img src={up.preview} alt="" /> : <IconMusic size={18} />}</span>
        ) : <Thumb media={picked} badge={false} />}
        {busy ? <span className="gen__ref-busy"><Spinner /></span> : null}
        <span className="gen__ref-label">{up?.error ? "Error" : label}</span>
        <button className="gen__ref-x" aria-label="Quitar" onClick={onClear}><IconX size={11} /></button>
      </span>
    );
  }
  const where = (m: Media) => (m.nodeId === node.id ? 0 : m.nodeId === node.parentId || snap.nodes.find((n) => n.id === m.nodeId)?.parentId === node.parentId ? 1 : 2);
  // The library's images are picked by card, below (docs/INTERFAZ.md §2.8).
  const libIds = new Set(snap.library.map((n) => n.id));
  const options = snap.media
    .filter((m) => m.status === "ready" && !m.archived && accept.includes(m.kind as Pickable) && !libIds.has(m.nodeId))
    .sort((a, b) => where(a) - where(b) || b.createdAt - a.createdAt)
    .slice(0, 48);
  // Library cards that can go here: their chosen images (or all of them, if none is chosen yet).
  const cards = accept.includes("image")
    ? snap.library.flatMap((card) => {
        if (card.lib?.kind !== "card") return [];
        const imgs = snap.media.filter((m) => m.nodeId === card.id && m.kind === "image" && m.status === "ready" && !m.archived);
        const refs = imgs.some((m) => m.chosen) ? imgs.filter((m) => m.chosen) : imgs;
        return refs.length ? [{ card, refs, all: imgs }] : [];
      })
    : [];
  return (
    <Popover float className="gen__picker" button={({ open, toggle }) => (
      <button className={cx("gen__ref", wide && "gen__ref--wide", (open || over) && "is-on")} disabled={disabled}
        title={disabled ? disabledHint : `${label}: elige de la producción, súbelo del ordenador o arrastra un archivo aquí`} onClick={toggle} {...drop}>
        {icon ?? <IconPlus size={16} />}
        <span className="gen__ref-label">{label}</span>
      </button>
    )}>
      <>
          <div className="menu__title gen__pick-head">
            {label}
            {onFiles ? (
              <>
                <span className="grow" />
                {/* Like Importar in a shot: from Magnific or from this computer (docs/INTERFAZ.md §2.0.2). */}
                <button className="link gen__pick-upload" onClick={() => {
                  const files = onFiles;
                  useStore.getState().set({ importTo: { label: `Como referencia: ${label}`, kinds: accept, refs: (items) => files(items.map(asRefItem)) } });
                }}><IconFileImport size={13} /> Importar</button>
              </>
            ) : null}
          </div>
          {options.length ? (
            <div className="gen__pick-grid">
              {options.map((m) => {
                const n = [...snap.nodes, ...snap.shelf].find((x) => x.id === m.nodeId);
                return (
                  <button key={m.id} className="menu__item gen__pick gen__pick--img" onClick={() => { ctx.media(m); onPick(m.id, m.kind as Pickable); }}
                    data-tip={`${n ? nameOf(snap.production, n) : "—"} · ${versionTag(m.version)}`}>
                    <Thumb media={m} badge={false} />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="sf-faint sf-small gen__pick-empty">Aún no hay {accept.map((k) => (k === "image" ? "imágenes" : k === "video" ? "vídeos" : "audios")).join(" ni ")} en la producción. Súbelo del ordenador o arrástralo aquí.</p>
          )}
          {cards.length ? (
            <>
              <div className="menu__title">De la biblioteca</div>
              {openCard ? (
                // A group opened: its images, to pick the ones that go (docs/INTERFAZ.md §2.8).
                <div className="gen__libpick">
                  <div className="gen__libpick-head">
                    <button className="link" onClick={() => { setOpenCard(null); setMarks([]); }}>← {openCard.card.title}</button>
                    <span className="sf-faint sf-small">{onPickMany ? "Marca las que quieras añadir" : "Elige una"}</span>
                  </div>
                  <div className="gen__pick-grid">
                    {openCard.all.map((m) => {
                      const on = marks.includes(m.id);
                      return onPickMany ? (
                        <button key={m.id} data-tip={`${openCard.card.title} · ${versionTag(m.version)}`} className={cx("gen__pick gen__libimg", on && "is-on")} onClick={() => setMarks(on ? marks.filter((x) => x !== m.id) : [...marks, m.id])}>
                          <Thumb media={m} badge={false} />
                          {on ? <span className="gen__libcheck"><IconCheck size={11} stroke={3} /></span> : null}
                        </button>
                      ) : (
                        <button key={m.id} data-tip={`${openCard.card.title} · ${versionTag(m.version)}`} className="menu__item gen__pick gen__libimg" onClick={() => { ctx.media(m); onPick(m.id, "image"); setOpenCard(null); }}>
                          <Thumb media={m} badge={false} />
                        </button>
                      );
                    })}
                  </div>
                  {onPickMany ? (
                    <button className="menu__item gen__libadd" disabled={!marks.length} onClick={() => {
                      const list = openCard.all.filter((m) => marks.includes(m.id));
                      for (const m of list) ctx.media(m);
                      onPickMany(list.map((m) => m.id), openCard.card);
                      setOpenCard(null);
                      setMarks([]);
                    }}>
                      {marks.length ? `Seleccionar ${marks.length}` : "Seleccionar"}
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="gen__pick-grid">
                  {cards.map((c) => (
                    <button key={c.card.id} className="gen__pick gen__libgroup" title={`${c.card.title}: ${c.all.length} ${c.all.length === 1 ? "imagen" : "imágenes"}`}
                      onClick={() => { setOpenCard(c); setMarks(c.all.filter((m) => m.chosen).map((m) => m.id)); }}>
                      <Thumb media={c.refs[0]} badge={false} />
                      <span className="sf-small">{c.card.title} · {c.all.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : null}
      </>
    </Popover>
  );
}
