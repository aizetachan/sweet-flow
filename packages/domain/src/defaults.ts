import type { LevelDef, Role, StatusDef } from "./types";

export function defaultLevels(id: (p: string) => string): LevelDef[] {
  return [
    { id: id("lv"), name: "Secuencia", prefix: "SQ", step: 10, pad: 3, canGenerate: false, maxVideoSec: 30 },
    { id: id("lv"), name: "Escena", prefix: "SC", step: 10, pad: 3, canGenerate: true, maxVideoSec: 30 },
    { id: id("lv"), name: "Plano", prefix: "SH", step: 10, pad: 4, canGenerate: true, maxVideoSec: 15 },
  ];
}

/** Default status flow. Configurable per production; transitions are free. */
export function defaultStatuses(id: (p: string) => string): StatusDef[] {
  return [
    { id: id("st"), name: "Pendiente", color: "#737373", category: "todo", order: 0 },
    { id: id("st"), name: "En curso", color: "#e6b85c", category: "active", order: 1 },
    { id: id("st"), name: "En revisión", color: "#6f8bf7", category: "review", order: 2 },
    { id: id("st"), name: "Retake", color: "#ec6a6a", category: "active", order: 3 },
    { id: id("st"), name: "Aprobado", color: "#3cd39f", category: "done", order: 4 },
  ];
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Propietario",
  admin: "Admin",
  supervisor: "Supervisor",
  artist: "Artista",
  viewer: "Cliente",
};

const RANK: Record<Role, number> = { viewer: 0, artist: 1, supervisor: 2, admin: 3, owner: 4 };

export const can = {
  edit: (r: Role) => RANK[r] >= RANK.artist,
  approve: (r: Role) => RANK[r] >= RANK.supervisor,
  manage: (r: Role) => RANK[r] >= RANK.admin,
  comment: (_r: Role) => true,
};
