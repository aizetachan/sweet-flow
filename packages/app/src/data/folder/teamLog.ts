/**
 * The team of a team folder (docs/USUARIOS.md §2), as a log in
 * `.sweetflow/team/` (rules in `@sweetflow/domain` team.ts). It is copied to
 * every folder shared on its own, so whoever only has one of them still knows
 * who is in the team and what they may do.
 */

import {
  canInvite,
  foldTeam,
  formatStamp,
  hlcObserve,
  hlcTick,
  normEmail,
  parseStamp,
  ZERO_HLC,
  type Access,
  type Hlc,
  type Team,
  type TeamEvent,
  type TeamEventBody,
  type TeamRole,
  type Theme,
  type ThemeEditors,
  type ThemeFreedom,
} from "@sweetflow/domain";
import type { FolderFs } from "./fs";
import { FolderLog } from "./folderLog";
import type { ShareInfo } from "./folderEntries";

/** What the team needs from the dashboard: what is inside what, and the shared folders. */
export interface TeamHost {
  within(inner: string, outer: string): boolean;
  sharedPlaces(): Array<{ id: string; path: string }>;
  readonly mounted: ShareInfo | null;
}
import { POLL_MS } from "./FolderLogStore";

export interface Person {
  email: string;
  name: string;
}

export class TeamLog {
  private log: FolderLog<TeamEvent>;
  private team: Team = { owner: null, membersCanInvite: true, members: [], theme: null, themeFreedom: "everyone", themeEditors: "admins" };
  private clock: Hlc = ZERO_HLC;
  private writing: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private seeded = new Set<string>();

  constructor(
    private readonly fs: FolderFs,
    private readonly deviceId: string,
    private readonly entries: TeamHost,
    /** Who I am (my Magnific account); null without one. */
    private readonly me: () => Person | null,
  ) {
    this.log = new FolderLog(fs, "team", deviceId);
  }

  async init(): Promise<void> {
    await this.read();
  }

  /** Reads again (the shared folders known may have changed); true when something new came in. */
  reread(): Promise<boolean> {
    return this.read();
  }

  state(): Team {
    return this.team;
  }

  /** Who opens a team folder nobody owns yet becomes its owner (not from a shared folder). */
  claimIfNeeded(): void {
    const me = this.me();
    if (this.team.owner || !me?.email || this.entries.mounted) return;
    this.write({ type: "team.claimed", name: me.name });
  }

  invite(p: { email: string; name?: string; storageEmail?: string; access: Access }): void {
    this.write({ type: "member.invited", email: normEmail(p.email), ...(p.name ? { name: p.name } : {}), ...(p.storageEmail ? { storageEmail: normEmail(p.storageEmail) } : {}), access: p.access });
  }

  setAccess(email: string, access: Access): void {
    this.write({ type: "member.access", email: normEmail(email), access });
  }

  remove(email: string): void {
    this.write({ type: "member.removed", email: normEmail(email) });
  }

  setRole(email: string, role: TeamRole): void {
    this.write({ type: "member.role", email: normEmail(email), role });
  }

  setMembersCanInvite(on: boolean): void {
    this.write({ type: "team.settings", membersCanInvite: on });
  }

  setTheme(theme: Theme | null): void {
    this.write({ type: "team.theme", theme });
  }

  setThemeFreedom(freedom: ThemeFreedom): void {
    this.write({ type: "team.themeFreedom", freedom });
  }

  setThemeEditors(editors: ThemeEditors): void {
    this.write({ type: "team.themeEditors", editors });
  }

  canInvite(): boolean {
    const me = this.me();
    return !!me?.email && canInvite(this.team, me.email);
  }

  /** Gives each shared folder the team's log the first time (call after the dashboard's). */
  async syncShares(): Promise<void> {
    this.log.setBases(this.entries.sharedPlaces().map((p) => p.path));
    for (const { id, path } of this.entries.sharedPlaces()) {
      if (this.seeded.has(id)) continue;
      this.seeded.add(id);
      await this.log.append(path, this.log.all().sort((a, b) => (a.at < b.at ? -1 : 1)));
    }
  }

  flushed(): Promise<void> {
    return this.writing;
  }

  watch(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Fold again (the dashboard changed: what is inside what). */
  refold(): void {
    this.team = foldTeam(this.log.all(), (i, o) => this.entries.within(i, o));
  }

  // ---------- internals ----------

  /** Every event goes to every place: the team is the same for everyone in it. */
  private write(body: TeamEventBody): void {
    const me = this.me();
    if (!me?.email) throw new Error("Conecta Magnific: tu cuenta de Magnific es quien eres en el equipo.");
    const now = Date.now();
    this.clock = hlcTick(this.clock, now);
    const e = { ...body, v: 1, at: formatStamp(this.clock, this.deviceId), by: normEmail(me.email), byName: me.name, ts: now } as TeamEvent;
    this.log.add([e]);
    this.refold();
    for (const l of this.listeners) l();
    const places = ["", ...this.entries.sharedPlaces().map((p) => p.path)];
    this.writing = this.writing
      .then(async () => {
        for (const place of places) await this.log.append(place, [e], now);
      })
      .catch((err) => console.error("[equipo] no se pudo guardar", err));
  }

  private async read(): Promise<boolean> {
    this.log.setBases(this.entries.sharedPlaces().map((p) => p.path));
    const changed = await this.log.read();
    if (changed) {
      const last = this.log.all().map((e) => e.at).sort().at(-1);
      const seen = last ? parseStamp(last) : null;
      if (seen) this.clock = hlcObserve(this.clock, seen.clock, Date.now());
    }
    this.refold();
    return changed;
  }

  private polling: ReturnType<typeof setTimeout> | null = null;

  startPolling(): void {
    if (this.polling) return;
    let last = "";
    const tick = async () => {
      try {
        this.log.setBases(this.entries.sharedPlaces().map((p) => p.path));
        const s = await this.log.signature();
        if (s !== last) {
          last = s;
          if (await this.read()) for (const l of this.listeners) l();
        }
      } catch (err) {
        console.warn("[equipo] no se pudo revisar", err);
      }
      if (this.polling) this.polling = setTimeout(tick, this.fs.pollMs ?? POLL_MS);
    };
    this.polling = setTimeout(tick, this.fs.pollMs ?? POLL_MS);
  }

  stopPolling(): void {
    if (this.polling) clearTimeout(this.polling);
    this.polling = null;
  }
}
