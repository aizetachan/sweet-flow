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

export interface TeamMember {
  /** Magnific email, lower case: who they are. */
  email: string;
  name: string;
  /** The Dropbox or Drive account the folders are shared with, when it is another email. */
  storageEmail?: string;
  access: Access;
  /** Email of whoever invited them. */
  invitedBy: string;
  invitedAt: Millis;
}

export interface Team {
  owner: { email: string; name: string } | null;
  /** Whether members may invite more people (to what they have themselves). On by default. */
  membersCanInvite: boolean;
  members: TeamMember[];
}

export type TeamEventBody =
  /** The first one to claim the folder owns it; later claims are ignored. */
  | { type: "team.claimed"; name: string }
  | { type: "team.settings"; membersCanInvite: boolean }
  /** Invite, or give more to someone already in (their access grows). */
  | { type: "member.invited"; email: string; name?: string; storageEmail?: string; access: Access }
  /** Replace what someone has. */
  | { type: "member.access"; email: string; access: Access }
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
  const team: Team = { owner: null, membersCanInvite: true, members: [] };
  const byEmail = new Map<string, TeamMember>();
  const isOwner = (email: string) => team.owner?.email === email;
  for (const e of sorted) {
    const by = normEmail(e.by);
    const actor = byEmail.get(by);
    // Who may invite or change someone's access, with what.
    const mayGrant = (access: Access) => isOwner(by) || (!!actor && team.membersCanInvite && covers(actor.access, access, within));
    switch (e.type) {
      case "team.claimed":
        if (!team.owner) team.owner = { email: by, name: e.name || by };
        break;
      case "team.settings":
        if (isOwner(by)) team.membersCanInvite = e.membersCanInvite;
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
        if (!cur || !(isOwner(by) || (cur.invitedBy === by && mayGrant(e.access)))) break;
        byEmail.set(email, { ...cur, access: e.access });
        break;
      }
      case "member.removed": {
        const email = normEmail(e.email);
        const cur = byEmail.get(email);
        if (cur && (isOwner(by) || cur.invitedBy === by)) byEmail.delete(email);
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

/** Whether someone can invite: the owner, or members when the owner allows it. */
export function canInvite(team: Team, email: string): boolean {
  const a = accessOf(team, email);
  if (!a) return false;
  return !team.owner || team.owner.email === normEmail(email) || team.membersCanInvite;
}

/** Whether `by` can remove `email` from the team (the owner, or who invited them). */
export function canRemove(team: Team, by: string, email: string): boolean {
  const m = team.members.find((x) => x.email === normEmail(email));
  return !!m && (team.owner?.email === normEmail(by) || m.invitedBy === normEmail(by));
}

/**
 * Dashboard entries shared on their own (in someone's access list): each one
 * is a folder of its own at the storage service, and keeps its own copy of
 * the dashboard and team logs so the people who only have it can work.
 */
export function shareRoots(team: Team): Id[] {
  return [...new Set(team.members.flatMap((m) => (m.access === "all" ? [] : m.access)))];
}
