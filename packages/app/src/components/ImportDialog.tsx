/**
 * «Importar» (docs/INTERFAZ.md §2.0): bring in what the person already has —
 * their creations in Magnific, or files from the computer — as new shots in
 * a row or as new versions of a shot. Nothing is generated: no credits.
 */

import { useEffect, useRef, useState } from "react";
import { IconChevronRight, IconFolder, IconMusic, IconPhoto, IconSearch, IconUpload, IconVideo } from "@tabler/icons-react";
import { codeOf, formatTc, type MediaKind } from "@sweetflow/domain";
import { Button, cx, Modal, Segmented, Spinner } from "@sweetflow/ui";
import { useSnap, useStore, type ImportTarget } from "../state/store";
import { importKind, type ImportItem, type RemoteCreation, type RemoteFolder } from "../data/source";

/** Brings the items in where `target` says, and tells what happened. */
export function runImport(target: ImportTarget, items: ImportItem[]): void {
  const { source, notify, select, snap } = useStore.getState();
  const ok = items.filter((i) => importKind(i));
  const skipped = items.length - ok.length;
  if (!ok.length) return notify("Solo se pueden importar imágenes, vídeos y audios.");
  try {
    if ("nodeId" in target) {
      for (const i of ok) source.importMedia(target.nodeId, i);
      const n = snap?.nodes.find((x) => x.id === target.nodeId);
      notify(`${ok.length === 1 ? "Importada una versión" : `Importadas ${ok.length} versiones`}${n && snap ? ` en ${codeOf(snap.production, n)}` : ""}.${skipped ? ` ${skipped} no eran imagen, vídeo ni audio.` : ""}`);
    } else {
      const ids = source.importShots(target.rowId, ok, target.before, target.groupId);
      if (ids[0]) select(ids[0]);
      notify(`${ids.length === 1 ? "Un plano nuevo" : `${ids.length} planos nuevos`} con lo importado.${skipped ? ` ${skipped} no eran imagen, vídeo ni audio.` : ""}`);
    }
  } catch (err) {
    notify(err instanceof Error ? err.message : String(err));
  }
}

/** Files dragged in from the computer (not cards being moved). */
export const hasFiles = (dt: DataTransfer | null) => !!dt && [...dt.types].includes("Files");

type Tab = "magnific" | "computer";

export function ImportDialog() {
  const snap = useSnap();
  const target = useStore((s) => s.importTo);
  const { source, set } = useStore();
  const canBrowse = !!source.browseCreations;
  const [tab, setTab] = useState<Tab>(canBrowse ? "magnific" : "computer");
  if (!target) return null;
  const close = () => set({ importTo: null });
  const p = snap.production;
  const node = "nodeId" in target ? snap.nodes.find((n) => n.id === target.nodeId) : undefined;
  const row = "rowId" in target ? snap.nodes.find((n) => n.id === target.rowId) : undefined;
  const where = node ? `Como versión nueva de ${codeOf(p, node)}` : row ? `Como planos nuevos en ${codeOf(p, row)}` : "";
  const done = (items: ImportItem[]) => {
    close();
    runImport(target, items);
  };
  return (
    <Modal title="Importar" onClose={close} width={860}>
      <div className="imp__top">
        <Segmented<Tab> value={tab} onChange={setTab} items={[
          ...(canBrowse ? [{ id: "magnific" as const, label: "De Magnific" }] : []),
          { id: "computer", label: "Del ordenador" },
        ]} />
        <span className="sf-faint sf-small">{where} · cada elemento, {node ? "una versión" : "un plano"}</span>
      </div>
      {tab === "magnific" ? <FromMagnific onImport={done} /> : <FromComputer onImport={done} />}
    </Modal>
  );
}

function FromComputer({ onImport }: { onImport: (items: ImportItem[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className={cx("imp__drop", over && "imp__drop--over")}
      onDragOver={(e) => { if (hasFiles(e.dataTransfer)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onImport([...e.dataTransfer.files].map((file) => ({ file }))); }}>
      <IconUpload size={28} stroke={1.4} />
      <b>Suelta aquí imágenes, vídeos o audios</b>
      <span className="sf-faint sf-small">o</span>
      <Button onClick={() => input.current?.click()}>Elegir archivos</Button>
      <input ref={input} type="file" multiple accept="image/*,video/*,audio/*" hidden
        onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) onImport(files.map((file) => ({ file }))); }} />
    </div>
  );
}

type KindFilter = "all" | MediaKind;

function FromMagnific({ onImport }: { onImport: (items: ImportItem[]) => void }) {
  const source = useStore((s) => s.source);
  const [path, setPath] = useState<RemoteFolder[]>([]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<KindFilter>("video");
  const [items, setItems] = useState<RemoteCreation[]>([]);
  const [folders, setFolders] = useState<RemoteFolder[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // In the order they were picked: that is the order of the new shots.
  const [picked, setPicked] = useState<RemoteCreation[]>([]);
  const folder = path.at(-1)?.id ?? null;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      source.browseCreations!({ folder, search, kind: kind === "all" ? undefined : kind, page })
        .then((r) => {
          if (!alive) return;
          setItems((old) => (page === 1 ? r.items : [...old, ...r.items]));
          if (page === 1) setFolders(r.folders);
          setMore(r.more);
        })
        .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)))
        .finally(() => alive && setLoading(false));
    }, search ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [source, folder, search, kind, page]);

  const reset = () => setPage(1);
  const toggle = (c: RemoteCreation) => setPicked((old) => (old.some((x) => x.id === c.id) ? old.filter((x) => x.id !== c.id) : [...old, c]));

  return (
    <div className="imp">
      <div className="imp__bar">
        <label className="imp__search">
          <IconSearch size={14} />
          <input className="sf-input" placeholder="Buscar en tus creaciones" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} />
        </label>
        <Segmented<KindFilter> value={kind} onChange={(k) => { setKind(k); reset(); }} items={[
          { id: "all", label: "Todo" },
          { id: "video", label: <><IconVideo size={13} /> Vídeo</> },
          { id: "image", label: <><IconPhoto size={13} /> Imagen</> },
          { id: "audio", label: <><IconMusic size={13} /> Audio</> },
        ]} />
      </div>
      <div className="imp__crumbs">
        <button className={cx("link", !path.length && "is-on")} onClick={() => { setPath([]); reset(); }}>Recientes</button>
        {path.map((f, i) => (
          <span key={f.id} className="imp__crumb">
            <IconChevronRight size={12} className="sf-faint" />
            <button className={cx("link", i === path.length - 1 && "is-on")} onClick={() => { setPath(path.slice(0, i + 1)); reset(); }}>{f.name}</button>
          </span>
        ))}
      </div>
      {folders.length && !search ? (
        <div className="imp__folders">
          {folders.map((f) => (
            <button key={f.id} className="imp__folder" onClick={() => { setPath([...path, f]); reset(); }}><IconFolder size={14} /> {f.name}</button>
          ))}
        </div>
      ) : null}
      {error ? <p className="note">{/not|conect|401/i.test(error) ? "Conecta tu cuenta de Magnific (en Ajustes) para ver tus creaciones." : error}</p> : null}
      <div className="vpick imp__grid">
        {items.map((c) => {
          const n = picked.findIndex((x) => x.id === c.id);
          return (
            <button key={c.id} className={cx("vpick__item", n >= 0 && "vpick__item--on")} onClick={() => toggle(c)} title={c.name}>
              <span className="thumb imp__thumb">
                {c.thumbUrl ? <img src={c.thumbUrl} alt="" loading="lazy" /> : c.kind === "audio" ? <IconMusic size={22} /> : null}
                {n >= 0 ? <span className="imp__n">{n + 1}</span> : null}
                {c.kind === "video" && c.durationSec ? <span className="imp__dur">{formatTc(c.durationSec)}</span> : null}
              </span>
              <span className="imp__name">{c.kind === "video" ? <IconVideo size={12} /> : c.kind === "audio" ? <IconMusic size={12} /> : <IconPhoto size={12} />} {c.name}</span>
            </button>
          );
        })}
      </div>
      {loading ? <div className="imp__more"><Spinner /></div> : more ? <div className="imp__more"><Button size="sm" variant="ghost" onClick={() => setPage(page + 1)}>Ver más</Button></div> : null}
      {!loading && !error && !items.length ? <p className="note">No hay nada aquí{search ? ` con «${search}»` : ""}.</p> : null}
      <div className="imp__foot">
        <span className="sf-faint sf-small">{picked.length ? `${picked.length} elegido${picked.length === 1 ? "" : "s"}, en este orden` : "Elige uno o varios"}</span>
        <Button variant="primary" disabled={!picked.length} onClick={() => onImport(picked.map((creation) => ({ creation })))}>
          Importar{picked.length ? ` ${picked.length}` : ""}
        </Button>
      </div>
    </div>
  );
}
