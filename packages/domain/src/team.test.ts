import { describe, expect, it } from "vitest";
import { accessOf, canInvite, canPersonalizeTheme, canRemove, canSetTeamTheme, isTeamManager, canSee, foldTeam, shareRoots, themeFor, type TeamEvent, type TeamEventBody, type Within } from "./team";

// Dashboard: F1 › F2 › P1, and P2 at the top.
const parent: Record<string, string | null> = { F1: null, F2: "F1", P1: "F2", P2: null };
const within: Within = (inner, outer) => {
  for (let x: string | null | undefined = inner; x; x = parent[x]) if (x === outer) return true;
  return false;
};
let n = 0;
const ev = (by: string, body: TeamEventBody): TeamEvent => ({ ...body, v: 1, at: `0000000000${String(++n).padStart(4, "0")}-0000-dev`, by, ts: n });

describe("team", () => {
  it("the first claim owns the folder; the owner has everything", () => {
    const t = foldTeam([ev("ana@x.com", { type: "team.claimed", name: "Ana" }), ev("bea@x.com", { type: "team.claimed", name: "Bea" })], within);
    expect(t.owner?.email).toBe("ana@x.com");
    expect(accessOf(t, "ANA@x.com")).toBe("all");
    expect(accessOf(t, "bea@x.com")).toBeNull();
  });

  it("a team nobody claimed yet is open to whoever has the folder", () => {
    const t = foldTeam([], within);
    expect(accessOf(t, "x@x.com")).toBe("all");
    expect(canInvite(t, "x@x.com")).toBe(true);
  });

  it("members see what they were given, with what is inside", () => {
    const t = foldTeam([
      ev("ana@x.com", { type: "team.claimed", name: "Ana" }),
      ev("ana@x.com", { type: "member.invited", email: "Bea@X.com", name: "Bea", storageEmail: "bea@gmail.com", access: ["F2"] }),
    ], within);
    expect(t.members[0]).toMatchObject({ email: "bea@x.com", storageEmail: "bea@gmail.com", invitedBy: "ana@x.com" });
    expect(canSee(t, "bea@x.com", "P1", within)).toBe(true);
    expect(canSee(t, "bea@x.com", "F1", within)).toBe(false);
    expect(canSee(t, "bea@x.com", "P2", within)).toBe(false);
    expect(shareRoots(t)).toEqual(["F2"]);
  });

  it("members invite only to what they have, and only if the owner allows it", () => {
    const base = [
      ev("ana@x.com", { type: "team.claimed", name: "Ana" }),
      ev("ana@x.com", { type: "member.invited", email: "bea@x.com", access: ["F2"] }),
    ];
    const inside = ev("bea@x.com", { type: "member.invited", email: "cris@x.com", access: ["P1"] });
    const outside = ev("bea@x.com", { type: "member.invited", email: "dani@x.com", access: ["P2"] });
    const all = ev("bea@x.com", { type: "member.invited", email: "eva@x.com", access: "all" });
    expect(foldTeam([...base, inside, outside, all], within).members.map((m) => m.email)).toEqual(["bea@x.com", "cris@x.com"]);

    // The owner turns it off: from then on Bea can't invite.
    const off = ev("ana@x.com", { type: "team.settings", membersCanInvite: false });
    const later = ev("bea@x.com", { type: "member.invited", email: "fer@x.com", access: ["P1"] });
    const t = foldTeam([...base, off, later], within);
    expect(t.members.map((m) => m.email)).toEqual(["bea@x.com"]);
    expect(canInvite(t, "bea@x.com")).toBe(false);
    // Only the owner changes the setting.
    expect(foldTeam([...base, ev("bea@x.com", { type: "team.settings", membersCanInvite: false })], within).membersCanInvite).toBe(true);
  });

  it("inviting again adds to what someone has", () => {
    const t = foldTeam([
      ev("ana@x.com", { type: "team.claimed", name: "Ana" }),
      ev("ana@x.com", { type: "member.invited", email: "bea@x.com", access: ["P1"] }),
      ev("ana@x.com", { type: "member.invited", email: "bea@x.com", access: ["P2"] }),
      ev("ana@x.com", { type: "member.invited", email: "bea@x.com", access: ["F1"] }),
    ], within);
    // F1 already includes P1.
    expect(t.members[0]!.access).toEqual(["P2", "F1"]);
  });

  it("the owner or whoever invited removes or changes someone", () => {
    const base = [
      ev("ana@x.com", { type: "team.claimed", name: "Ana" }),
      ev("ana@x.com", { type: "member.invited", email: "bea@x.com", access: ["F1"] }),
      ev("bea@x.com", { type: "member.invited", email: "cris@x.com", access: ["P1"] }),
      ev("ana@x.com", { type: "member.invited", email: "dani@x.com", access: ["P2"] }),
    ];
    const t = foldTeam(base, within);
    expect(canRemove(t, "bea@x.com", "cris@x.com")).toBe(true);
    expect(canRemove(t, "bea@x.com", "dani@x.com")).toBe(false);
    const after = foldTeam([
      ...base,
      ev("bea@x.com", { type: "member.removed", email: "dani@x.com" }),
      ev("bea@x.com", { type: "member.access", email: "cris@x.com", access: ["F2"] }),
      ev("ana@x.com", { type: "member.removed", email: "ana@x.com" }),
    ], within);
    expect(after.members.map((m) => [m.email, m.access])).toEqual([["bea@x.com", ["F1"]], ["cris@x.com", ["F2"]], ["dani@x.com", ["P2"]]]);
    expect(after.owner?.email).toBe("ana@x.com");
  });

  it("does not depend on the order the events arrive in", () => {
    const evs = [
      ev("ana@x.com", { type: "team.claimed", name: "Ana" }),
      ev("ana@x.com", { type: "member.invited", email: "bea@x.com", access: ["F2"] }),
      ev("bea@x.com", { type: "member.invited", email: "cris@x.com", access: ["P1"] }),
    ];
    expect(foldTeam([...evs].reverse(), within)).toEqual(foldTeam(evs, within));
  });

  it("only the owner sets the team's theme and whether members may have their own", () => {
    const t = foldTeam([
      ev("ana@x.com", { type: "team.claimed", name: "Ana" }),
      ev("ana@x.com", { type: "member.invited", email: "bea@x.com", access: "all" }),
      ev("ana@x.com", { type: "team.theme", theme: { accent: "#E0559B" } }),
      // Not the owner: ignored.
      ev("bea@x.com", { type: "team.theme", theme: { accent: "#00ff00" } }),
      ev("bea@x.com", { type: "team.themeFreedom", freedom: "nobody" }),
    ], within);
    expect(t.theme).toEqual({ accent: "#e0559b" });
    expect(t.themeFreedom).toBe("everyone");
    expect(canPersonalizeTheme(t, "bea@x.com")).toBe(true);
    expect(themeFor(t, "bea@x.com", { accent: "#2fb38a" })).toEqual({ accent: "#2fb38a" });
    expect(themeFor(t, "bea@x.com", null)).toEqual({ accent: "#e0559b" });
  });

  it("with members locked, they see the team's theme; the owner keeps their own", () => {
    const t = foldTeam([
      ev("ana@x.com", { type: "team.claimed", name: "Ana" }),
      ev("ana@x.com", { type: "team.theme", theme: { accent: "#e0559b" } }),
      ev("ana@x.com", { type: "team.themeFreedom", freedom: "nobody" }),
      ev("ana@x.com", { type: "team.theme", theme: { accent: "not a colour" } }),
    ], within);
    expect(t.theme).toBeNull();
    expect(canPersonalizeTheme(t, "bea@x.com")).toBe(false);
    expect(themeFor(t, "bea@x.com", { accent: "#2fb38a" })).toBeNull();
    expect(themeFor(t, "ANA@x.com", { accent: "#2fb38a" })).toEqual({ accent: "#2fb38a" });
    expect(themeFor(null, null, { accent: "#2fb38a" })).toEqual({ accent: "#2fb38a" });
  });

  it("members change the team's theme only when the owner lets them", () => {
    const base = [
      ev("ana@x.com", { type: "team.claimed", name: "Ana" }),
      ev("ana@x.com", { type: "member.invited", email: "bea@x.com", access: ["F1"] }),
    ];
    const locked = foldTeam([...base, ev("bea@x.com", { type: "team.theme", theme: { accent: "#ef3732" } })], within);
    expect(locked.theme).toBeNull();
    expect(canSetTeamTheme(locked, "bea@x.com")).toBe(false);
    expect(canSetTeamTheme(locked, "ana@x.com")).toBe(true);
    const open = foldTeam([
      ...base,
      ev("ana@x.com", { type: "team.themeEditors", editors: "everyone" }),
      ev("bea@x.com", { type: "team.theme", theme: { accent: "#ef3732" } }),
      // Outsiders and members changing the rules: ignored.
      ev("eve@x.com", { type: "team.theme", theme: { accent: "#00ff00" } }),
      ev("bea@x.com", { type: "team.themeEditors", editors: "admins" }),
    ], within);
    expect(open.theme).toEqual({ accent: "#ef3732" });
    expect(open.themeEditors).toBe("everyone");
    expect(canSetTeamTheme(open, "bea@x.com")).toBe(true);
    expect(canSetTeamTheme(open, "eve@x.com")).toBe(false);
  });

  it("admins run the team like the owner, but only the owner names or removes admins", () => {
    const t = foldTeam([
      ev("ana@x.com", { type: "team.claimed", name: "Ana" }),
      ev("ana@x.com", { type: "member.invited", email: "bea@x.com", access: ["F2"] }),
      ev("ana@x.com", { type: "member.invited", email: "cris@x.com", access: ["P2"] }),
      ev("ana@x.com", { type: "member.invited", email: "dani@x.com", access: ["P2"] }),
      // Bea is not an admin yet: she can't name one.
      ev("bea@x.com", { type: "member.role", email: "cris@x.com", role: "admin" }),
      ev("ana@x.com", { type: "member.role", email: "bea@x.com", role: "admin" }),
      ev("ana@x.com", { type: "team.settings", membersCanInvite: false }),
      // As admin: she invites to anything, changes access and settings, removes members.
      ev("bea@x.com", { type: "member.invited", email: "eva@x.com", access: ["F1"] }),
      ev("bea@x.com", { type: "member.access", email: "cris@x.com", access: ["F1"] }),
      ev("bea@x.com", { type: "member.removed", email: "dani@x.com" }),
      ev("bea@x.com", { type: "team.theme", theme: { accent: "#ef3732" } }),
      // But she can't name admins.
      ev("bea@x.com", { type: "member.role", email: "cris@x.com", role: "admin" }),
    ], within);
    const bea = t.members.find((m) => m.email === "bea@x.com")!;
    expect(bea).toMatchObject({ role: "admin", access: "all" });
    expect(isTeamManager(t, "bea@x.com")).toBe(true);
    expect(canInvite(t, "bea@x.com")).toBe(true);
    expect(canInvite(t, "cris@x.com")).toBe(false);
    expect(t.members.map((m) => m.email)).toEqual(["bea@x.com", "cris@x.com", "eva@x.com"]);
    expect(t.members.find((m) => m.email === "cris@x.com")).toMatchObject({ access: ["F1"] });
    expect(t.members.find((m) => m.email === "cris@x.com")?.role).toBeUndefined();
    expect(t.theme).toEqual({ accent: "#ef3732" });
    expect(canRemove(t, "bea@x.com", "cris@x.com")).toBe(true);
    expect(canRemove(t, "ana@x.com", "bea@x.com")).toBe(true);
  });

  it("an admin can't remove or change another admin; the owner can make them members again", () => {
    const t = foldTeam([
      ev("ana@x.com", { type: "team.claimed", name: "Ana" }),
      ev("ana@x.com", { type: "member.invited", email: "bea@x.com", access: ["F2"] }),
      ev("ana@x.com", { type: "member.invited", email: "cris@x.com", access: ["P2"] }),
      ev("ana@x.com", { type: "member.role", email: "bea@x.com", role: "admin" }),
      ev("ana@x.com", { type: "member.role", email: "cris@x.com", role: "admin" }),
      ev("bea@x.com", { type: "member.removed", email: "cris@x.com" }),
      ev("bea@x.com", { type: "member.access", email: "cris@x.com", access: ["P2"] }),
      ev("ana@x.com", { type: "member.role", email: "bea@x.com", role: "member" }),
    ], within);
    expect(t.members.find((m) => m.email === "cris@x.com")).toMatchObject({ role: "admin", access: "all" });
    expect(canRemove(t, "cris@x.com", "bea@x.com")).toBe(true);
    expect(canRemove(t, "bea@x.com", "cris@x.com")).toBe(false);
    const bea = t.members.find((m) => m.email === "bea@x.com")!;
    expect(bea.role).toBeUndefined();
    // She keeps everything until it is changed.
    expect(bea.access).toBe("all");
  });
});
