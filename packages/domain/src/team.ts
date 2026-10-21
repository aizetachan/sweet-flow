/**
 * The team of a team folder (docs/USUARIOS.md §2): who owns it, who is in it
 * and which dashboard folders or productions each member has. Like every log
 * of Sweet Flow, events from any number of devices are folded in stamp order;
 * the rules of who may do what are applied while folding, so an event written
 * by someone without the right to it is simply ignored.
 *
 * People are their Magnific email (lower case). Access is "all" or a list of
 * dashboard entries (folders or productions); an entry gives everything
 * inside it.
 */

import type { Id, Millis } from "./types";
import type { Stamp } from "./clock";

/** Everything, or these dashboard folders and productions (with what is inside). */
export type Access = "all" | Id[];

/**
 * A member's role in the team. An admin may do what the owner does (invite,
 * change access, remove, settings, theme) except naming or removing admins;
 * they have everything.
 */
export type TeamRole = "admin" | "member";

export interface TeamMember {
  /** Magnific email, lower case: who they are. */
  email: string;
  /** Absent: a member. */
  role?: "admin";
  name: string;
  /** The Dropbox or Drive account the folders are shared with, when it is another email. */
  storageEmail?: string;
  access: Access;
  /** Email of whoever invited them. */
  invitedBy: string;
  invitedAt: Millis;
}

/** How the app looks (docs/INTERFAZ.md §1.4): the accent that replaces the corporate blue ("#rrggbb"). */
export interface Theme {
  accent: string;
}

/** Who, besides the owner, may use a theme of their own instead of the team's. */
export type ThemeFreedom = "everyone" | "nobody";

/** Who may change the team's theme: the owner and the admins, or everyone in the team. */
export type ThemeEditors = "admins" | "everyone";

export interface Team {
  owner: { email: string; name: string } | null;
  /** Whether members may invite more people (to what they have themselves). On by default. */
  membersCanInvite: boolean;
  members: TeamMember[];
  /** The team's look, set by the owner; null: the corporate blue. */
  theme: Theme | null;
  /** Whether members may set their own theme. Everyone by default. */
  themeFreedom: ThemeFreedom;
  /** Who may change the team's theme. The owner and the admins by default. */
  themeEditors: ThemeEditors;
}

export type TeamEventBody =
  /** The first one to claim the folder owns it; later claims are ignored. */
  | { type: "team.claimed"; name: string }
  | { type: "team.settings"; membersCanInvite: boolean }
  /** The team's theme (null: back to the corporate blue): the owner's, or anyone's in the team when the owner allows it. */
  | { type: "team.theme"; theme: Theme | null }
  /** Only the owner's and the admins' count. */
  | { type: "team.themeFreedom"; freedom: ThemeFreedom }
  | { type: "team.themeEditors"; editors: ThemeEditors }
  /** Invite, or give more to someone already in (their access grows). */
  | { type: "member.invited"; email: string; name?: string; storageEmail?: string; access: Access }
  /** Replace what someone has. */
  | { type: "member.access"; email: string; access: Access }
  /** Make a member an admin (they get everything) or a member again. Only the owner's count. */
  | { type: "member.role"; email: string; role: TeamRole }
  | { type: "member.removed"; email: string };

export type TeamEvent = TeamEventBody & {
  v: number;
  at: Stamp;
  /** Email of who wrote it. */
  by: string;
  byName?: string;
  /** Millis when written (shown as «invitado el…»). */
  ts: Millis;
};

/** Whether `inner` is `outer` or inside it, in the dashboard. */
export type Within = (inner: Id, outer: Id) => boolean;

export const normEmail = (e: string) => e.trim().toLowerCase();

/** Whether access `a` includes everything in access `b`. */
export function covers(a: Access, b: Access, within: Within): boolean {
  if (a === "all") return true;
  if (b === "all") return false;
  return b.every((id) => a.some((outer) => within(id, outer)));
}

function union(a: Access, b: Access, within: Within): Access {
  if (a === "all" || b === "all") return "all";
  const all = [...new Set([...a, ...b])];
  // Drop what another entry of the list already includes.
  return all.filter((id) => !all.some((o) => o !== id && within(id, o)));
}

/** The team from its events, from any number of devices, in any order. Deterministic. */
export function foldTeam(events: Iterable<TeamEvent>, within: Within): Team {
  const sorted = [...events].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const team: Team = { owner: null, membersCanInvite: true, members: [], theme: null, themeFreedom: "everyone", themeEditors: "admins" };
  const byEmail = new Map<string, TeamMember>();
  const isOwner = (email: string) => team.owner?.email === email;
  for (const e of sorted) {
    const by = normEmail(e.by);
    const actor = byEmail.get(by);
    // The owner, or an admin: they run the team.
    const manager = isOwner(by) || actor?.role === "admin";
    // Who may invite or change someone's access, with what.
    const mayGrant = (access: Access) => manager || (!!actor && team.membersCanInvite && covers(actor.access, access, within));
    // Admins are touched only by the owner.
    const mayTouch = (m: TeamMember) => (m.role === "admin" ? isOwner(by) : manager || m.invitedBy === by);
    switch (e.type) {
      case "team.claimed":
        if (!team.owner) team.owner = { email: by, name: e.name || by };
        break;
      case "team.settings":
        if (manager) team.membersCanInvite = e.membersCanInvite;
        break;
      case "team.theme":
        if (manager || (team.themeEditors === "everyone" && !!actor)) team.theme = e.theme && isHex(e.theme.accent) ? { accent: e.theme.accent.toLowerCase() } : null;
        break;
      case "team.themeFreedom":
        if (manager && (e.freedom === "everyone" || e.freedom === "nobody")) team.themeFreedom = e.freedom;
        break;
      case "team.themeEditors":
        // "owner": written before there were admins; it meant the same.
        if (manager && ((e.editors as string) === "owner" || e.editors === "admins" || e.editors === "everyone")) team.themeEditors = e.editors === "everyone" ? "everyone" : "admins";
        break;
      case "member.invited": {
        const email = normEmail(e.email);
        if (!email || isOwner(email) || !mayGrant(e.access)) break;
        const cur = byEmail.get(email);
        byEmail.set(email, cur
          ? { ...cur, access: union(cur.access, e.access, within), name: e.name || cur.name, ...(e.storageEmail ? { storageEmail: normEmail(e.storageEmail) } : {}) }
          : { email, name: e.name || email, ...(e.storageEmail && normEmail(e.storageEmail) !== email ? { storageEmail: normEmail(e.storageEmail) } : {}), access: e.access, invitedBy: by, invitedAt: e.ts });
        break;
      }
      case "member.access": {
        const email = normEmail(e.email);
        const cur = byEmail.get(email);
        if (!cur || cur.role === "admin" || !(manager || (cur.invitedBy === by && mayGrant(e.access)))) break;
        byEmail.set(email, { ...cur, access: e.access });
        break;
      }
      case "member.role": {
        const email = normEmail(e.email);
        const cur = byEmail.get(email);
        if (!cur || !isOwner(by)) break;
        // An admin has everything; made a member again, they keep it until it is changed.
        if (e.role === "admin") byEmail.set(email, { ...cur, role: "admin", access: "all" });
        else if (e.role === "member") {
          const { role: _r, ...rest } = cur;
          byEmail.set(email, rest);
        }
        break;
      }
      case "member.removed": {
        const email = normEmail(e.email);
        const cur = byEmail.get(email);
        if (cur && mayTouch(cur)) byEmail.delete(email);
        break;
      }
    }
  }
  // In the order they were invited (the fold goes in stamp order, so ties keep it).
  team.members = [...byEmail.values()].sort((a, b) => a.invitedAt - b.invitedAt);
  return team;
}

/** What someone has: the owner everything; null when not in the team. A team nobody owns yet is open. */
export function accessOf(team: Team, email: string): Access | null {
  const e = normEmail(email);
  if (!team.owner || team.owner.email === e) return "all";
  return team.members.find((m) => m.email === e)?.access ?? null;
}

/** Whether someone can see (and work on) a dashboard entry. */
export function canSee(team: Team, email: string, entryId: Id, within: Within): boolean {
  const a = accessOf(team, email);
  return a === "all" || (!!a && a.some((outer) => within(entryId, outer)));
}

/** Whether someone runs the team: the owner or an admin. */
export function isTeamManager(team: Team, email: string | null): boolean {
  if (!team.owner || !email) return false;
  const e = normEmail(email);
  return team.owner.email === e || team.members.some((m) => m.email === e && m.role === "admin");
}

/** Whether someone can invite: the owner and admins, or members when allowed. */
export function canInvite(team: Team, email: string): boolean {
  const a = accessOf(team, email);
  if (!a) return false;
  return !team.owner || isTeamManager(team, email) || team.membersCanInvite;
}

/** Whether `by` can remove (or change) `email`: the owner; admins and whoever invited them, except admins (only the owner). */
export function canRemove(team: Team, by: string, email: string): boolean {
  const m = team.members.find((x) => x.email === normEmail(email));
  if (!m) return false;
  if (team.owner?.email === normEmail(by)) return true;
  return m.role !== "admin" && (isTeamManager(team, by) || m.invitedBy === normEmail(by));
}

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Whether someone may change the team's theme: the owner and admins, or every member when allowed. Nobody while nobody owns the team. */
export function canSetTeamTheme(team: Team, email: string | null): boolean {
  if (!team.owner || !email) return false;
  const e = normEmail(email);
  return isTeamManager(team, e) || (team.themeEditors === "everyone" && team.members.some((m) => m.email === e));
}

/** Whether someone may use a theme of their own: the owner always; members if the owner lets them. A team nobody owns yet is open. */
export function canPersonalizeTheme(team: Team, email: string | null): boolean {
  if (!team.owner) return true;
  if (isTeamManager(team, email)) return true;
  return team.themeFreedom === "everyone";
}

/**
 * The theme someone sees: their own when they may have one and set it, else
 * the team's; null: the corporate blue. Without a team, just their own.
 */
export function themeFor(team: Team | null, email: string | null, own: Theme | null): Theme | null {
  if (!team) return own;
  if (own && canPersonalizeTheme(team, email)) return own;
  return team.theme;
}

/**
 * Dashboard entries shared on their own (in someone's access list): each one
 * is a folder of its own at the storage service, and keeps its own copy of
 * the dashboard and team logs so the people who only have it can work.
 */
export function shareRoots(team: Team): Id[] {
  return [...new Set(team.members.flatMap((m) => (m.access === "all" ? [] : m.access)))];
}
