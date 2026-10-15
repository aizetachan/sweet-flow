/**
 * Demo production used by MockSource: an episode of a series organised as
 * Secuencia › Escena › Plano, with scene-level 30 s clips already cut into
 * shots, keyframes, reviews in progress and a small team.
 */

import {
  defaultLevels,
  defaultStatuses,
  type Activity,
  type Asset,
  type Comment,
  type Id,
  type Media,
  type Member,
  type ProdNode,
  type Production,
  type Take,
  type Workspace,
} from "@sweetflow/domain";
import { frame, type Mood } from "./frames";

let seq = 0;
export const newId = (p: string) => `${p}_${(Date.now() + seq).toString(36)}${(seq++).toString(36)}`;

const H = 3600_000;
const now = Date.now();

export interface Seed {
  workspace: Workspace;
  me: Member;
  members: Member[];
  productions: Production[];
  production: Production;
  nodes: ProdNode[];
  media: Media[];
  takes: Take[];
  comments: Comment[];
  assets: Asset[];
  activity: Activity[];
  /** Demo-only: visual mood per media, to draw take posters. */
  moods: Record<Id, Mood>;
}

export function buildSeed(): Seed {
  const workspace: Workspace = { id: "ws_1", name: "Estudio Norte", createdAt: now - 40 * 24 * H };
  const me: Member = { uid: "u_me", email: "tu@estudio.com", displayName: "Tú", role: "owner", magnificConnected: true, magnificCredits: 18450 };
  const members: Member[] = [
    me,
    { uid: "u_laura", email: "laura@estudio.com", displayName: "Laura Méndez", role: "supervisor", magnificConnected: true, magnificCredits: 9200 },
    { uid: "u_marc", email: "marc@estudio.com", displayName: "Marc Soler", role: "artist", magnificConnected: true, magnificCredits: 3150 },
    { uid: "u_iris", email: "iris@estudio.com", displayName: "Iris Navarro", role: "artist", magnificConnected: false },
    { uid: "u_cli", email: "produccion@cliente.tv", displayName: "Productora Mar", role: "viewer", magnificConnected: false },
  ];

  const levels = defaultLevels(newId);
  const statuses = defaultStatuses(newId);
  const st = (name: string) => statuses.find((s) => s.name === name)!.id;
  const [LSQ, LSC, LSH] = levels.map((l) => l.id) as [Id, Id, Id];

  const production: Production = {
    id: "prod_mareas",
    workspaceId: workspace.id,
    name: "Mareas · Ep. 01 «La partida»",
    format: "Serie · 45 min",
    levels,
    statuses,
    createdAt: now - 20 * 24 * H,
    updatedAt: now,
  };
  const productions: Production[] = [
    production,
    { ...production, id: "prod_mareas2", name: "Mareas · Ep. 02 «Bajamar»", updatedAt: now - 3 * 24 * H },
    { ...production, id: "prod_spot", name: "Spot Faro Norte 30\"", format: "Spot · 30 s", updatedAt: now - 9 * 24 * H },
  ];

  const nodes: ProdNode[] = [];
  const media: Media[] = [];
  const takes: Take[] = [];
  const comments: Comment[] = [];
  const activity: Activity[] = [];
  const moods: Record<Id, Mood> = {};

  const assets: Asset[] = [
    { id: "a_elena", productionId: production.id, type: "cast", name: "Elena", description: "34 años, farera. Chubasquero amarillo, pelo recogido.", imageUrl: frame("elena", "dawn") },
    { id: "a_tomas", productionId: production.id, type: "cast", name: "Tomás", description: "Pescador, 60 años, barba gris, jersey de lana.", imageUrl: frame("tomas", "storm") },
    { id: "a_nina", productionId: production.id, type: "cast", name: "Nina", description: "Hija de Elena, 9 años.", imageUrl: frame("nina", "noon") },
    { id: "a_faro", productionId: production.id, type: "location", name: "Faro de Punta Gris", description: "Faro sobre acantilado, linterna giratoria.", imageUrl: frame("faro", "dusk") },
    { id: "a_muelle", productionId: production.id, type: "location", name: "Muelle viejo", description: "Muelle de madera, barcas de colores.", imageUrl: frame("muelle", "noon") },
    { id: "a_farol", productionId: production.id, type: "prop", name: "Farol de aceite", description: "Farol de latón, cristal ahumado.", imageUrl: frame("farol", "interior") },
    { id: "a_red", productionId: production.id, type: "prop", name: "Red de pesca", description: "Red verde con flotadores naranjas.", imageUrl: frame("red", "noon") },
    { id: "a_style", productionId: production.id, type: "style", name: "Look «Mareas»", description: "35 mm, grano fino, tonos fríos con acentos ámbar.", imageUrl: frame("look", "night") },
  ];

  const node = (parentId: Id | null, levelId: Id, number: number, title: string, statusName: string, extra: Partial<ProdNode> = {}): ProdNode => {
    const n: ProdNode = {
      id: newId("n"),
      productionId: production.id,
      parentId,
      levelId,
      number,
      title,
      notes: "",
      statusId: st(statusName),
      assigneeIds: [],
      assetIds: [],
      updatedAt: now - Math.random() * 48 * H,
      updatedBy: "u_laura",
      ...extra,
    };
    nodes.push(n);
    return n;
  };

  const addMedia = (n: ProdNode, kind: "image" | "video", mood: Mood, version: number, opts: Partial<Media> & { by?: Id; prompt?: string; dur?: number } = {}): Media => {
    const url = frame(`${n.id}-${kind}-${version}`, mood);
    const m: Media = {
      id: newId("m"),
      productionId: production.id,
      nodeId: n.id,
      kind,
      version,
      origin: "generated",
      status: "ready",
      progress: 100,
      url,
      thumbUrl: url,
      durationSec: kind === "video" ? opts.dur ?? 5 : undefined,
      width: 1920,
      height: 1080,
      archived: false,
      generation: {
        provider: "magnific",
        model: kind === "video" ? "Seedance 2.0" : "Nano Banana Pro",
        prompt: opts.prompt ?? `${n.title}. ${n.notes}`.trim(),
        credits: kind === "video" ? 45 : 8,
        launchedBy: opts.by ?? "u_marc",
      },
      createdBy: opts.by ?? "u_marc",
      createdAt: now - (10 - version) * 3 * H,
      ...opts,
    };
    media.push(m);
    moods[m.id] = mood;
    return m;
  };

  const take = (n: ProdNode, m: Media, inSec: number, outSec: number, by: Id = "u_marc"): Take => {
    const t: Take = { id: newId("tk"), productionId: production.id, nodeId: n.id, mediaId: m.id, inSec, outSec, thumbUrl: frame(`${m.id}@${inSec}`, moods[m.id] ?? "noon"), createdBy: by, createdAt: m.createdAt + H };
    takes.push(t);
    if (!n.selectedTakeId) n.selectedTakeId = t.id;
    return t;
  };

  const comment = (n: ProdNode, authorId: Id, text: string, m?: Media, atSec?: number, ago = 2): void => {
    comments.push({ id: newId("c"), productionId: production.id, nodeId: n.id, mediaId: m?.id, atSec, text, authorId, resolved: false, createdAt: now - ago * H });
  };

  // ---- SQ010 Apertura ----
  const sq1 = node(null, LSQ, 10, "Apertura", "En curso");
  const sc11 = node(sq1.id, LSC, 10, "Faro al amanecer", "En revisión", {
    notes: "EXT. FARO — AMANECER. Elena sube la escalera exterior del faro mientras el sol rompe sobre el mar.",
    assetIds: ["a_elena", "a_faro"],
    assigneeIds: ["u_marc"],
  });
  const clip11 = addMedia(sc11, "video", "dawn", 1, { dur: 30, prompt: "Amanecer en el faro de Punta Gris, Elena sube la escalera exterior, plano secuencia que termina en la linterna.", by: "u_marc" });
  addMedia(sc11, "video", "dawn", 2, { dur: 30, prompt: "Variante más cálida, cámara más lenta.", by: "u_marc" });
  const shots11 = [
    ["General del faro", 0, 6.5, "Aprobado"],
    ["Elena sube la escalera", 6.5, 13, "Aprobado"],
    ["Detalle mano en barandilla", 13, 17.2, "En revisión"],
    ["La linterna se enciende", 17.2, 24, "Retake"],
    ["Contraplano al mar", 24, 30, "En revisión"],
  ] as const;
  shots11.forEach(([title, i, o, s], k) => {
    const sh = node(sc11.id, LSH, (k + 1) * 10, title, s, { assetIds: k === 3 ? ["a_faro", "a_farol"] : ["a_elena"], assigneeIds: ["u_marc"] });
    take(sh, clip11, i, o);
  });
  const sh14 = nodes.find((n) => n.title === "La linterna se enciende")!;
  comment(sh14, "u_laura", "La luz de la linterna entra demasiado pronto, que arranque en el 20.0 aprox.", clip11, 19.4, 5);
  comment(sh14, "u_marc", "Vale, regenero con el farol de aceite como referencia.", undefined, undefined, 4);
  addMedia(sh14, "image", "dusk", 1, { prompt: "Linterna del faro encendiéndose, primer plano, cristal ahumado.", by: "u_marc" });
  const sh13 = nodes.find((n) => n.title === "Detalle mano en barandilla")!;
  comment(sh13, "u_cli", "Muy bonito este detalle 👌", clip11, 14.1, 20);

  const sc12 = node(sq1.id, LSC, 20, "El muelle", "En curso", {
    notes: "EXT. MUELLE VIEJO — DÍA. Tomás prepara las redes. Nina corre por el muelle.",
    assetIds: ["a_tomas", "a_nina", "a_muelle", "a_red"],
    assigneeIds: ["u_iris"],
  });
  const clip12 = addMedia(sc12, "video", "noon", 1, { dur: 24, prompt: "Muelle viejo a mediodía, Tomás repara redes, Nina corre entre barcas.", by: "u_laura" });
  [["Establecimiento muelle", "Aprobado"], ["Tomás y las redes", "En curso"], ["Nina corre", "En curso"], ["Mirada de Tomás", "Pendiente"]].forEach(([t, s], k) => {
    const sh = node(sc12.id, LSH, (k + 1) * 10, t!, s!, { assigneeIds: ["u_iris"], assetIds: k === 1 ? ["a_tomas", "a_red"] : k === 2 ? ["a_nina"] : [] });
    if (k === 0) take(sh, clip12, 0, 7.4, "u_laura");
    if (k === 1) {
      take(sh, clip12, 7.4, 15, "u_laura");
      addMedia(sh, "image", "noon", 1, { by: "u_iris" });
      addMedia(sh, "image", "noon", 2, { by: "u_iris" });
    }
    if (k === 2) addMedia(sh, "image", "noon", 1, { by: "u_iris" });
  });

  const sc13 = node(sq1.id, LSC, 30, "Casa de Elena", "Pendiente", {
    notes: "INT. CASA DE ELENA — NOCHE. Elena y Nina cenan a la luz del farol.",
    assetIds: ["a_elena", "a_nina", "a_farol"],
  });
  [["Mesa de la cocina"], ["Nina pregunta por su padre"], ["Elena no contesta"]].forEach(([t], k) => {
    const sh = node(sc13.id, LSH, (k + 1) * 10, t!, "Pendiente");
    if (k === 0) addMedia(sh, "image", "interior", 1, { by: "u_me" });
  });

  // ---- SQ020 La tormenta ----
  const sq2 = node(null, LSQ, 20, "La tormenta", "En curso");
  const sc21 = node(sq2.id, LSC, 10, "Mar abierto", "En curso", {
    notes: "EXT. MAR ABIERTO — NOCHE. El pesquero de Tomás lucha contra olas enormes.",
    assetIds: ["a_tomas"],
    assigneeIds: ["u_marc", "u_iris"],
  });
  const clip21 = addMedia(sc21, "video", "storm", 1, { dur: 30, by: "u_marc", prompt: "Pesquero en tormenta nocturna, olas de 6 metros, relámpagos." });
  const rendering: Media = addMedia(sc21, "video", "storm", 2, { dur: 30, by: "u_marc", prompt: "Misma tormenta, cámara a ras de agua." });
  rendering.status = "rendering";
  rendering.progress = 62;
  rendering.url = undefined;
  rendering.thumbUrl = undefined;
  [["Ola gigante", 0, 5.8, "En revisión"], ["Cubierta inundada", 5.8, 12.5, "En curso"], ["Tomás al timón", 12.5, 20, "En curso"], ["Relámpago", 20, 23, "Pendiente"]].forEach(([t, i, o, s], k) => {
    const sh = node(sc21.id, LSH, (k + 1) * 10, t as string, s as string, { assigneeIds: ["u_marc"] });
    if (k < 3) take(sh, clip21, i as number, o as number);
  });

  const sc22 = node(sq2.id, LSC, 20, "Puente del pesquero", "Pendiente", { notes: "INT. PUENTE — NOCHE. Radio crepita, Tomás pide ayuda." });
  [["Radio"], ["Tomás grita al micro"]].forEach(([t], k) => node(sc22.id, LSH, (k + 1) * 10, t!, "Pendiente"));

  // ---- SQ030 Regreso ----
  const sq3 = node(null, LSQ, 30, "Regreso", "Pendiente");
  const sc31 = node(sq3.id, LSC, 10, "Puerto de noche", "Pendiente", { notes: "EXT. PUERTO — NOCHE. Elena espera con el farol." });
  [["Elena en el espigón"], ["Luz en el horizonte"], ["Reencuentro"]].forEach(([t], k) => {
    const sh = node(sc31.id, LSH, (k + 1) * 10, t!, "Pendiente");
    if (k === 0) addMedia(sh, "image", "night", 1, { by: "u_laura" });
  });
  const sc32 = node(sq3.id, LSC, 20, "Despedida", "Pendiente", { notes: "EXT. MUELLE — ATARDECER. Final del episodio." });
  [["Plano general final"]].forEach(([t], k) => node(sc32.id, LSH, (k + 1) * 10, t!, "Pendiente"));

  const sh11 = nodes.find((n) => n.title === "General del faro")!;
  activity.push(
    { id: newId("ac"), productionId: production.id, nodeId: sh14.id, kind: "status", actorId: "u_laura", text: "cambió el estado de Aprobado a Retake", at: now - 5 * H },
    { id: newId("ac"), productionId: production.id, nodeId: sc11.id, kind: "take", actorId: "u_marc", text: "repartió 5 tramos del clip v001 a los planos", at: now - 7 * H },
    { id: newId("ac"), productionId: production.id, nodeId: sc11.id, kind: "generate", actorId: "u_marc", text: "generó un vídeo de 30 s (v002)", at: now - 6 * H },
    { id: newId("ac"), productionId: production.id, nodeId: sh11.id, kind: "status", actorId: "u_laura", text: "aprobó el plano", at: now - 4 * H },
    { id: newId("ac"), productionId: production.id, nodeId: sc21.id, kind: "generate", actorId: "u_marc", text: "lanzó la generación de 30 s (v002)", at: now - 0.3 * H },
  );

  return { workspace, me, members, productions, production, nodes, media, takes, comments, assets, activity, moods };
}
