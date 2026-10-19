/**
 * The Actividad tab in local mode (docs/INTERFAZ.md §2.6): the whole history
 * of each node, read from the production's event log — versions generated,
 * chosen and cut, status, notes, people, comments, and comments taken to a
 * newer version.
 */

import { codeFor, parseStamp, versionTag, type Activity, type Id, type LogEvent, type LogState } from "@sweetflow/domain";

const KIND = { image: "una imagen", video: "un vídeo", audio: "un audio" } as const;

export function activityFrom(events: LogEvent[], s: LogState): Activity[] {
  const p = s.production;
  if (!p) return [];
  const statusName = (id?: Id) => p.statuses.find((x) => x.id === id)?.name ?? "—";
  const media = new Map(s.media.map((m) => [m.id, m]));
  const takes = new Map(s.takes.map((t) => [t.id, t]));
  const comments = new Map<Id, { nodeId: Id; mediaId?: Id }>();
  const levelOf = (levelId: Id) => p.levels.find((l) => l.id === levelId);
  const out: Activity[] = [];
  const add = (at: string, wall: number, nodeId: Id | undefined, kind: Activity["kind"], actorId: Id, text: string) =>
    out.push({ id: at, productionId: p.id, nodeId, kind, actorId, text, at: wall });

  for (const e of [...events].sort((a, b) => (a.at < b.at ? -1 : 1))) {
    const wall = parseStamp(e.at)?.clock.wall ?? 0;
    const ver = (id?: Id) => {
      const m = id ? media.get(id) : undefined;
      return m ? versionTag(m.version) : "una versión";
    };
    switch (e.type) {
      case "node.created": {
        const l = levelOf(e.node.levelId);
        add(e.at, wall, e.node.id, "structure", e.userId, `creó ${l ? codeFor(l, e.node.number) : "el elemento"}`);
        break;
      }
      case "node.updated": {
        const pt = e.patch;
        if (pt.statusId) add(e.at, wall, e.id, "status", e.userId, `cambió el estado a ${statusName(pt.statusId)}`);
        if (pt.title !== undefined) add(e.at, wall, e.id, "structure", e.userId, pt.title ? `le puso de título «${pt.title}»` : "quitó el título");
        if (pt.notes !== undefined) add(e.at, wall, e.id, "structure", e.userId, pt.notes ? "editó las notas" : "borró las notas");
        if (pt.assigneeIds) add(e.at, wall, e.id, "assign", e.userId, pt.assigneeIds.length ? "cambió los responsables" : "quitó los responsables");
        if (pt.forClient !== undefined) add(e.at, wall, e.id, "structure", e.userId, pt.forClient ? "lo mostró al cliente" : "dejó de mostrarlo al cliente");
        if (pt.selectedTakeId) {
          const t = takes.get(pt.selectedTakeId);
          add(e.at, wall, e.id, "take", e.userId, `eligió ${t ? ver(t.mediaId) : "una versión"} para el plano`);
        }
        break;
      }
      case "node.moved":
        add(e.at, wall, e.id, "structure", e.userId, e.number !== undefined ? "se movió (con código nuevo)" : "se movió de sitio");
        break;
      case "node.shelved":
        add(e.at, wall, e.id, "take", e.userId, "cortó su vídeo en planos (el original, a Vídeos editados)");
        break;
      case "node.unshelved":
        add(e.at, wall, e.id, "take", e.userId, "volvió a la fila desde Vídeos editados");
        break;
      case "node.trashed":
        add(e.at, wall, e.id, "structure", e.userId, "lo mandó a la papelera");
        break;
      case "node.restored":
        add(e.at, wall, e.id, "structure", e.userId, "lo restauró de la papelera");
        break;
      case "media.added":
        if (e.media.origin === "uploaded") add(e.at, wall, e.media.nodeId, "generate", e.userId, `importó ${versionTag(e.media.version)} (${KIND[e.media.kind]} ${e.media.remote ? "de Magnific" : "del ordenador"})`);
        else add(e.at, wall, e.media.nodeId, "generate", e.userId, `generó ${versionTag(e.media.version)} (${KIND[e.media.kind]}${e.media.generation?.model ? ` con ${e.media.generation.model}` : ""})`);
        break;
      case "media.updated":
        if (e.patch.status === "failed") add(e.at, wall, media.get(e.id)?.nodeId, "generate", e.userId, `${ver(e.id)} no se pudo generar`);
        if (e.patch.archived === true) add(e.at, wall, media.get(e.id)?.nodeId, "generate", e.userId, `quitó ${ver(e.id)} de la galería`);
        break;
      case "take.added":
        add(e.at, wall, e.take.nodeId, "take", e.userId, `colocó un tramo de ${ver(e.take.mediaId)}`);
        break;
      case "comment.added":
        comments.set(e.comment.id, { nodeId: e.comment.nodeId, mediaId: e.comment.mediaId });
        add(e.at, wall, e.comment.nodeId, "comment", e.userId, `${e.comment.parentId ? "respondió" : `comentó ${ver(e.comment.mediaId)}`}: «${e.comment.text.slice(0, 80)}${e.comment.text.length > 80 ? "…" : ""}»`);
        break;
      case "comment.updated": {
        const c = comments.get(e.id);
        if (!c) break;
        if (e.patch.resolved !== undefined) add(e.at, wall, c.nodeId, "comment", e.userId, e.patch.resolved ? "resolvió un comentario" : "reabrió un comentario");
        if (e.patch.mediaId) {
          add(e.at, wall, c.nodeId, "comment", e.userId, `llevó un comentario de ${ver(c.mediaId)} a ${ver(e.patch.mediaId)}`);
          c.mediaId = e.patch.mediaId;
        }
        break;
      }
      case "comment.deleted": {
        const c = comments.get(e.id);
        if (c) add(e.at, wall, c.nodeId, "comment", e.userId, "borró un comentario");
        break;
      }
      default:
        break;
    }
  }
  return out;
}
