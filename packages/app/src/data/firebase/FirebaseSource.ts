/**
 * DataSource backed by Firebase (docs/ARCHITECTURE.md §3–§4).
 *
 * - Reads: Firestore listeners per collection of the open production, merged
 *   into one Snapshot. Presence comes from the Realtime Database.
 * - Simple intents: field-level writes, allowed by firestore.rules.
 * - Structural intents (create/insert/move/delete nodes, levels): callable
 *   Functions, which number and renumber in transactions.
 *
 * Intents are fire-and-forget (the DataSource contract is synchronous): the
 * UI updates when the listeners deliver the change. Ids that the UI needs
 * right away (createNode) are allocated on the client and passed along.
 */

import type {
  Activity,
  Asset,
  Comment,
  Id,
  LevelDef,
  Media,
  Member,
  Presence,
  ProdNode,
  Production,
  Role,
  RowItem,
  Segment,
  StatusDef,
  Take,
  Workspace,
} from "@sweetflow/domain";
import {
  CALLABLES,
  type CreateNodeRequest,
  type CreateNodeResponse,
  type DeleteSubtreeRequest,
  type JobDoc,
  type MoveNodeRequest,
  type UpdateLevelsRequest,
} from "@sweetflow/functions/api";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import {
  onDisconnect,
  onValue,
  ref as dbRef,
  remove,
  serverTimestamp,
  set as dbSet,
} from "firebase/database";
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { ALL_FEATURES, type DataSource, type GenerateArgs, type MirrorState, type Placement, type Snapshot } from "../source";
import { createClient, type FirebaseClient } from "./client";
import { readFirebaseConfig } from "./config";
import { NotImplemented } from "./errors";

const LAST_PRODUCTION_KEY = "sweetflow.productionId";
const ACTIVITY_LIMIT = 200;
const UNLINKED: MirrorState = { status: "unlinked", pending: 0 };

/** Media as stored: Storage paths instead of resolved URLs. */
type MediaDoc = Media & { storagePath?: string; thumbPath?: string; proxyPath?: string };

/** Live state assembled from the listeners; Snapshot is derived from it. */
interface Live {
  user: User | null;
  /** productions/{prodId}/members/{uid} where uid = me → my productions. */
  myProductionIds: Id[];
  productions: Record<Id, Production>;
  productionId: Id | null;
  workspace: Workspace | null;
  /** Workspace members (profile), merged with production roles. */
  wsMembers: Member[];
  prodRoles: Record<Id, Role>;
  nodes: ProdNode[];
  media: MediaDoc[];
  takes: Take[];
  comments: Comment[];
  assets: Asset[];
  activity: Activity[];
  presence: Presence[];
}

const fromDoc = <T>(d: QueryDocumentSnapshot<DocumentData>): T => ({ ...d.data(), id: d.id }) as T;

export class FirebaseSource implements DataSource {
  private fb: FirebaseClient;
  private listeners = new Set<(s: Snapshot) => void>();
  private live: Live = {
    user: null,
    myProductionIds: [],
    productions: {},
    productionId: null,
    workspace: null,
    wsMembers: [],
    prodRoles: {},
    nodes: [],
    media: [],
    takes: [],
    comments: [],
    assets: [],
    activity: [],
    presence: [],
  };
  private last: Snapshot | null = null;
  /** Listener groups, torn down when the user or the production changes. */
  private userSubs: Unsubscribe[] = [];
  private prodSubs: Unsubscribe[] = [];
  private wsSubs: Unsubscribe[] = [];
  private productionSubs = new Map<Id, Unsubscribe>();
  /** Node I'm on, re-sent when the RTDB connection comes back. */
  private presenceNodeId: Id | undefined;
  /** Storage path → download URL. */
  private urls = new Map<string, string>();

  constructor(fb: FirebaseClient = createClient(readFirebaseConfig())) {
    this.fb = fb;
    onAuthStateChanged(this.fb.auth, (user) => this.onUser(user));
  }

  // ---------- session (not part of DataSource; used by the login screen) ----------

  signIn(email: string, password: string): Promise<unknown> {
    return signInWithEmailAndPassword(this.fb.auth, email, password);
  }

  signOut(): Promise<void> {
    return signOut(this.fb.auth);
  }

  // ---------- subscription ----------

  subscribe(cb: (s: Snapshot) => void): () => void {
    this.listeners.add(cb);
    if (this.last) cb(this.last);
    return () => this.listeners.delete(cb);
  }

  private patch(next: Partial<Live>): void {
    this.live = { ...this.live, ...next };
    const snap = this.buildSnapshot();
    if (!snap) return;
    this.last = snap;
    for (const l of this.listeners) l(snap);
  }

  /** Null until the open production, its workspace and my profile are loaded. */
  private buildSnapshot(): Snapshot | null {
    const l = this.live;
    const production = l.productionId ? l.productions[l.productionId] : undefined;
    const uid = l.user?.uid;
    if (!production || !l.workspace || !uid) return null;

    const members = l.wsMembers
      .filter((m) => l.prodRoles[m.uid])
      .map((m) => ({ ...m, role: l.prodRoles[m.uid]! }));
    const me = members.find((m) => m.uid === uid);
    if (!me) return null;

    return {
      workspace: l.workspace,
      me,
      members,
      productions: l.myProductionIds.flatMap((id) => (l.productions[id] ? [l.productions[id]!] : [])),
      production,
      nodes: l.nodes,
      // The production trash lands with stage C; until then deletes are for good.
      trash: [],
      shelf: [],
      groups: [],
      media: l.media.map((m) => this.withUrls(m)),
      takes: l.takes,
      comments: l.comments,
      assets: l.assets,
      activity: l.activity,
      presence: l.presence,
      // The mirror engine lands in phase 4 (apps/desktop utility process).
      mirror: UNLINKED,
      features: ALL_FEATURES,
    };
  }

  // ---------- listeners ----------

  private onUser(user: User | null): void {
    for (const u of [...this.userSubs, ...this.prodSubs, ...this.wsSubs, ...this.productionSubs.values()]) u();
    this.userSubs = [];
    this.prodSubs = [];
    this.wsSubs = [];
    this.productionSubs.clear();
    this.last = null;
    this.patch({ user, myProductionIds: [], productions: {}, productionId: null, workspace: null });
    if (!user) return;

    // Every production I'm a member of (collection-group query on members).
    const mine = query(collectionGroup(this.fb.db, "members"), where("uid", "==", user.uid));
    this.userSubs.push(
      onSnapshot(mine, (snap) => {
        const ids = snap.docs
          .filter((d) => d.ref.parent.parent?.parent.id === "productions")
          .map((d) => d.ref.parent.parent!.id);
        this.watchProductions(ids);
        const remembered = readLastProduction();
        const current = this.live.productionId;
        const next = current && ids.includes(current) ? current : remembered && ids.includes(remembered) ? remembered : ids[0];
        this.patch({ myProductionIds: ids });
        if (next && next !== current) this.openProduction(next);
      }, this.fail),
    );
  }

  /** One doc listener per production (names for the switcher). */
  private watchProductions(ids: Id[]): void {
    for (const [id, unsub] of this.productionSubs) {
      if (!ids.includes(id)) {
        unsub();
        this.productionSubs.delete(id);
      }
    }
    for (const id of ids) {
      if (this.productionSubs.has(id)) continue;
      this.productionSubs.set(
        id,
        onSnapshot(doc(this.fb.db, "productions", id), (d) => {
          if (!d.exists()) return;
          const p = { ...d.data(), id: d.id } as Production;
          const prev = this.live.productions[id];
          this.patch({ productions: { ...this.live.productions, [id]: p } });
          if (id === this.live.productionId && prev?.workspaceId !== p.workspaceId) this.watchWorkspace(p.workspaceId);
        }, this.fail),
      );
    }
  }

  private watchWorkspace(wsId: Id): void {
    for (const u of this.wsSubs) u();
    const ws = doc(this.fb.db, "workspaces", wsId);
    this.wsSubs = [
      onSnapshot(ws, (d) => d.exists() && this.patch({ workspace: { ...d.data(), id: d.id } as Workspace }), this.fail),
      onSnapshot(collection(ws, "members"), (s) => this.patch({ wsMembers: s.docs.map((d) => ({ ...d.data(), uid: d.id }) as Member) }), this.fail),
    ];
  }

  private col(name: string) {
    return collection(this.fb.db, "productions", this.prodId(), name);
  }

  // ---------- configuration ----------

  openProduction(productionId: Id): void {
    for (const u of this.prodSubs) u();
    this.prodSubs = [];
    writeLastProduction(productionId);
    this.patch({ productionId, nodes: [], media: [], takes: [], comments: [], assets: [], activity: [], presence: [], prodRoles: {} });

    const p = this.live.productions[productionId];
    if (p) this.watchWorkspace(p.workspaceId);

    // TODO(fase 1): media/takes/comments only for what is visible (the open
    // scene, the selected shot) instead of the whole production (§4).
    const list = <K extends keyof Live>(key: K, name: string) =>
      onSnapshot(this.col(name), (s) => this.patch({ [key]: s.docs.map(fromDoc) } as Partial<Live>), this.fail);

    this.prodSubs.push(
      list("nodes", "nodes"),
      list("media", "media"),
      list("takes", "takes"),
      list("comments", "comments"),
      list("assets", "assets"),
      onSnapshot(
        query(this.col("activity"), orderBy("at", "desc"), limit(ACTIVITY_LIMIT)),
        (s) => this.patch({ activity: s.docs.map(fromDoc<Activity>) }),
        this.fail,
      ),
      onSnapshot(
        this.col("members"),
        (s) => this.patch({ prodRoles: Object.fromEntries(s.docs.map((d) => [d.id, d.get("role") as Role])) }),
        this.fail,
      ),
      this.watchPresence(productionId),
    );
  }

  updateLevels(levels: LevelDef[]): void {
    this.call<UpdateLevelsRequest>(CALLABLES.updateLevels, { productionId: this.prodId(), levels });
  }

  updateStatuses(statuses: StatusDef[]): void {
    this.write(updateDoc(doc(this.fb.db, "productions", this.prodId()), { statuses, updatedAt: Date.now() }));
  }

  // ---------- structure (callable Functions) ----------

  createNode(parentId: Id | null, title = ""): Id {
    const nodeId = this.newId("nodes");
    this.call<CreateNodeRequest>(CALLABLES.createNode, { productionId: this.prodId(), nodeId, parentId, title });
    return nodeId;
  }

  insertAfter(nodeId: Id): Id {
    const after = this.node(nodeId);
    const id = this.newId("nodes");
    this.call<CreateNodeRequest>(CALLABLES.createNode, { productionId: this.prodId(), nodeId: id, parentId: after.parentId, afterId: nodeId });
    return id;
  }

  moveNodes(_ids: Id[], _parentId: Id | null, _beforeId: Id | null): void {
    throw new NotImplemented("Reordenar arrastrando", "etapa C");
  }

  setNodeNumber(_nodeId: Id, _number: number): void {
    throw new NotImplemented("Cambiar el número del código", "etapa C");
  }

  moveNode(nodeId: Id, dir: -1 | 1): void {
    this.call<MoveNodeRequest>(CALLABLES.moveNode, { productionId: this.prodId(), nodeId, dir });
  }

  trashNode(_nodeId: Id): void {
    throw new NotImplemented("Papelera de la producción", "etapa C");
  }

  restoreNode(_nodeId: Id): number | undefined {
    throw new NotImplemented("Papelera de la producción", "etapa C");
  }

  splitIntoShots(_mediaId: Id, _segments: Segment[]): Id[] {
    throw new NotImplemented("Cortar en planos", "etapa C");
  }

  unshelveNode(_nodeId: Id): number | undefined {
    throw new NotImplemented("Vídeos editados", "etapa C");
  }

  groupShots(_ids: Id[], _target: { shotId: Id } | { groupId: Id }): Id | undefined {
    throw new NotImplemented("Grupos de planos", "etapa C");
  }

  ungroupShots(_ids: Id[]): void {
    throw new NotImplemented("Grupos de planos", "etapa C");
  }

  placeInRow(_moving: RowItem[], _rowId: Id, _before: RowItem | null, _groupId: Id | null): void {
    throw new NotImplemented("Reordenar con grupos", "etapa C");
  }

  dissolveGroup(_groupId: Id): void {
    throw new NotImplemented("Grupos de planos", "etapa C");
  }

  renameGroup(_groupId: Id, _name: string): void {
    throw new NotImplemented("Grupos de planos", "etapa C");
  }

  deleteNode(nodeId: Id): void {
    this.call<DeleteSubtreeRequest>(CALLABLES.deleteSubtree, { productionId: this.prodId(), nodeId });
  }

  updateNode(nodeId: Id, patch: Partial<Pick<ProdNode, "title" | "notes" | "statusId" | "assigneeIds" | "assetIds">>): void {
    const prev = this.node(nodeId);
    this.write(updateDoc(doc(this.col("nodes"), nodeId), { ...patch, ...this.stamp() }));
    if (patch.statusId && patch.statusId !== prev.statusId) {
      const name = (id: Id) => this.production().statuses.find((s) => s.id === id)?.name ?? "?";
      this.log("status", `cambió el estado de ${name(prev.statusId)} a ${name(patch.statusId)}`, nodeId);
    }
  }

  // ---------- production ----------

  /** Requests a job; onJobCreated queues it and the worker fills `mediaId` (§6). */
  generate(a: GenerateArgs): void {
    const jobId = this.newId("jobs");
    const job: JobDoc = {
      id: jobId,
      productionId: this.prodId(),
      nodeId: a.nodeId,
      type: "generate",
      status: "requested",
      mediaId: this.newId("media"),
      input: stripUndefined({ kind: a.kind, prompt: a.prompt, model: a.model, durationSec: a.durationSec, sourceMediaId: a.sourceMediaId }),
      createdBy: this.uid(),
      createdAt: Date.now(),
    };
    this.write(setDoc(doc(this.col("jobs"), jobId), job));
    this.log("generate", `lanzó ${a.kind === "video" ? `un vídeo de ${a.durationSec ?? 5}s` : "una imagen"}`, a.nodeId);
  }

  setArchived(mediaId: Id, archived: boolean): void {
    // Media with placed takes is protected (§5.1). Rules can't check this;
    // a Function will enforce it server-side.
    if (archived && this.live.takes.some((t) => t.mediaId === mediaId)) return;
    this.write(updateDoc(doc(this.col("media"), mediaId), { archived }));
  }

  placeTakes(mediaId: Id, placements: Placement[]): void {
    const run = async () => {
      const filled = new Set<Id>();
      for (const pl of placements) {
        let nodeId: Id;
        if ("nodeId" in pl.target) {
          nodeId = pl.target.nodeId;
        } else {
          nodeId = this.newId("nodes");
          await this.callAsync<CreateNodeRequest, CreateNodeResponse>(CALLABLES.createNode, {
            productionId: this.prodId(),
            nodeId,
            parentId: pl.target.newChildOf,
            title: `Corte ${pl.segment.inSec}–${pl.segment.outSec}s`,
          });
        }
        const take: Take = {
          id: this.newId("takes"),
          productionId: this.prodId(),
          nodeId,
          mediaId,
          inSec: pl.segment.inSec,
          outSec: pl.segment.outSec,
          createdBy: this.uid(),
          createdAt: Date.now(),
        };
        await setDoc(doc(this.col("takes"), take.id), take);
        const target = this.live.nodes.find((n) => n.id === nodeId);
        if (!filled.has(nodeId) && !target?.selectedTakeId) {
          filled.add(nodeId);
          await updateDoc(doc(this.col("nodes"), nodeId), { selectedTakeId: take.id, ...this.stamp() });
        }
      }
      const origin = this.live.media.find((m) => m.id === mediaId);
      this.log("take", `colocó ${placements.length} tramo${placements.length > 1 ? "s" : ""}`, origin?.nodeId);
    };
    this.write(run());
  }

  selectTake(nodeId: Id, takeId: Id): void {
    this.write(updateDoc(doc(this.col("nodes"), nodeId), { selectedTakeId: takeId, ...this.stamp() }));
  }

  removeTake(takeId: Id): void {
    const t = this.live.takes.find((x) => x.id === takeId);
    if (!t) return;
    const run = async () => {
      const node = this.live.nodes.find((n) => n.id === t.nodeId);
      if (node?.selectedTakeId === takeId) {
        const next = this.live.takes.find((x) => x.nodeId === t.nodeId && x.id !== takeId);
        await updateDoc(doc(this.col("nodes"), t.nodeId), { selectedTakeId: next?.id ?? deleteField(), ...this.stamp() });
      }
      await deleteDoc(doc(this.col("takes"), takeId));
    };
    this.write(run());
  }

  // ---------- review ----------

  addComment(nodeId: Id, text: string, mediaId?: Id, atSec?: number): void {
    const id = this.newId("comments");
    const c: Comment = stripUndefined({ id, productionId: this.prodId(), nodeId, mediaId, atSec, text, authorId: this.uid(), resolved: false, createdAt: Date.now() });
    this.write(setDoc(doc(this.col("comments"), id), c));
  }

  setCommentResolved(commentId: Id, resolved: boolean): void {
    this.write(updateDoc(doc(this.col("comments"), commentId), { resolved }));
  }

  // ---------- collaboration & mirror ----------

  setPresence(nodeId: Id | undefined): void {
    const uid = this.live.user?.uid;
    const prodId = this.live.productionId;
    this.presenceNodeId = nodeId;
    if (!uid || !prodId) return;
    this.write(dbSet(dbRef(this.fb.rtdb, `presence/${prodId}/${uid}`), stripUndefined({ at: serverTimestamp(), nodeId })));
  }

  linkFolder(): void {
    // Folder picking works today through window.sweetflow.pickFolder(); the
    // mirror engine that fills it arrives in phase 4.
    throw new NotImplemented("Vincular carpeta", "fase 4");
  }

  /** Presence of everyone in the production; mine is removed on disconnect. */
  private watchPresence(prodId: Id): Unsubscribe {
    const uid = this.uid();
    const mine = dbRef(this.fb.rtdb, `presence/${prodId}/${uid}`);
    const connected = dbRef(this.fb.rtdb, ".info/connected");
    const offConnected = onValue(connected, (s) => {
      if (s.val() !== true) return;
      void onDisconnect(mine)
        .remove()
        .then(() => dbSet(mine, stripUndefined({ at: serverTimestamp(), nodeId: this.presenceNodeId })))
        .catch(this.fail);
    });
    const offAll = onValue(
      dbRef(this.fb.rtdb, `presence/${prodId}`),
      (s) => {
        const val = (s.val() ?? {}) as Record<Id, { at: number; nodeId?: Id }>;
        this.patch({ presence: Object.entries(val).map(([id, p]) => ({ uid: id, nodeId: p.nodeId, at: p.at })) });
      },
      this.fail,
    );
    return () => {
      offConnected();
      offAll();
      void remove(mine).catch(() => undefined);
    };
  }

  // ---------- helpers ----------

  private uid(): Id {
    const uid = this.live.user?.uid;
    if (!uid) throw new Error("No hay sesión iniciada.");
    return uid;
  }

  private prodId(): Id {
    const id = this.live.productionId;
    if (!id) throw new Error("No hay ninguna producción abierta.");
    return id;
  }

  private production(): Production {
    return this.live.productions[this.prodId()]!;
  }

  private node(id: Id): ProdNode {
    const n = this.live.nodes.find((x) => x.id === id);
    if (!n) throw new Error(`Nodo desconocido: ${id}`);
    return n;
  }

  private newId(collectionName: string): Id {
    return doc(this.col(collectionName)).id;
  }

  private stamp() {
    return { updatedAt: Date.now(), updatedBy: this.uid() };
  }

  private log(kind: Activity["kind"], text: string, nodeId?: Id): void {
    const id = this.newId("activity");
    const a: Activity = stripUndefined({ id, productionId: this.prodId(), nodeId, kind, actorId: this.uid(), text, at: Date.now() });
    this.write(setDoc(doc(this.col("activity"), id), a));
  }

  private call<Req>(name: string, data: Req): void {
    this.write(this.callAsync(name, data));
  }

  private async callAsync<Req, Res = unknown>(name: string, data: Req): Promise<Res> {
    const res = await httpsCallable<Req, Res>(this.fb.functions, name)(data);
    return res.data;
  }

  /** Writes resolve later; failures are reported, never thrown at the UI. */
  private write(p: Promise<unknown>): void {
    p.catch(this.fail);
  }

  private fail = (err: unknown): void => {
    console.error("[FirebaseSource]", err);
  };

  /** Fills url/thumbUrl from Storage paths, resolving each path once. */
  private withUrls(m: MediaDoc): Media {
    const url = m.url ?? this.resolveUrl(m.proxyPath ?? m.storagePath);
    const thumbUrl = m.thumbUrl ?? this.resolveUrl(m.thumbPath);
    return { ...m, url, thumbUrl };
  }

  private resolveUrl(path: string | undefined): string | undefined {
    if (!path) return undefined;
    const hit = this.urls.get(path);
    if (hit !== undefined) return hit || undefined;
    this.urls.set(path, ""); // in flight
    getDownloadURL(storageRef(this.fb.storage, path))
      .then((u) => {
        this.urls.set(path, u);
        this.patch({});
      })
      .catch((err) => {
        this.urls.delete(path);
        this.fail(err);
      });
    return undefined;
  }
}

/** Firestore and RTDB reject `undefined` values. */
function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function readLastProduction(): Id | null {
  try {
    return localStorage.getItem(LAST_PRODUCTION_KEY);
  } catch {
    return null;
  }
}

function writeLastProduction(id: Id): void {
  try {
    localStorage.setItem(LAST_PRODUCTION_KEY, id);
  } catch {
    // private mode / storage disabled: not remembering is fine
  }
}
