/**
 * «Cambiar portada» (docs/INTERFAZ.md §1): the image a production's card
 * shows, for the whole team. One of the production's own images, or one of
 * this computer (it goes to the desk of its library). The card keeps a small
 * copy, so every device shows it without reaching the file.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { IconPhotoOff, IconUpload } from "@tabler/icons-react";
import { Button, Modal, Spinner, cx } from "@sweetflow/ui";
import type { Media } from "@sweetflow/domain";
import type { LibraryEntry } from "../data/library";
import { useStore } from "../state/store";

/** The card's copy: 640 × 360 (16:9), cropped to fill, as a JPEG data URL. */
async function coverThumb(src: string | File): Promise<string> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const W = 640, H = 360;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}

export function CoverDialog({ entry, onClose }: { entry: LibraryEntry; onClose: () => void }) {
  const library = useStore((s) => s.library);
  const notify = useStore((s) => s.notify);
  const hasCover = useStore((s) => !!s.lib?.summaries[entry.id]?.thumbUrl);
  const [media, setMedia] = useState<Media[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Its images, read without opening it for work (nothing is written).
  useEffect(() => {
    const src = library.openReadOnly?.(entry.id) ?? library.open(entry.id);
    const off = src.subscribe((snap) => setMedia(snap.media));
    return () => {
      off();
      src.dispose?.();
    };
  }, [library, entry.id]);

  const images = useMemo(
    () => (media ?? []).filter((m) => m.kind === "image" && m.status === "ready" && !m.archived && (m.thumbUrl ?? m.url)).sort((a, b) => b.createdAt - a.createdAt),
    [media],
  );

  const apply = async (key: string, run: () => Promise<void>, done: string) => {
    setBusy(key);
    try {
      await run();
      notify(done);
      onClose();
    } catch (err) {
      console.error("[portada]", err);
      notify("No se ha podido usar esa imagen como portada.");
      setBusy(null);
    }
  };
  const pickMedia = (m: Media) =>
    void apply(m.id, async () => library.setCover(entry.id, { thumb: await coverThumb((m.url ?? m.thumbUrl)!), mediaId: m.id }), `Portada de «${entry.name}» cambiada.`);
  const pickFile = (file: File) =>
    void apply("file", async () => library.setCover(entry.id, { thumb: await coverThumb(file), file }), `Portada de «${entry.name}» cambiada.`);
  const clear = () => void apply("clear", () => library.setCover(entry.id, null), `«${entry.name}» vuelve a mostrar sus iniciales.`);

  return (
    <Modal title={`Portada de «${entry.name}»`} onClose={onClose} width={640}>
      <p className="sf-muted sf-small cover__lead">Elige una imagen de la producción o sube una de tu ordenador. La verá todo el equipo en el dashboard.</p>
      {media === null ? (
        <div className="cover__empty"><Spinner /></div>
      ) : images.length ? (
        <div className="cover__grid">
          {images.map((m) => (
            <button key={m.id} className={cx("cover__item", busy === m.id && "is-busy")} disabled={!!busy} onClick={() => pickMedia(m)} title="Usar como portada">
              <img src={m.thumbUrl ?? m.url} alt="" />
              {busy === m.id ? <span className="cover__spin"><Spinner /></span> : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="cover__empty sf-muted sf-small">Esta producción aún no tiene imágenes. Sube una de tu ordenador.</div>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) pickFile(f);
      }} />
      <div className="modal-actions">
        {hasCover ? <Button variant="ghost" disabled={!!busy} onClick={clear}><IconPhotoOff size={15} /> Quitar portada</Button> : null}
        <span className="grow" />
        <Button onClick={onClose} disabled={!!busy}>Cancelar</Button>
        <Button variant="primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy === "file" ? <Spinner /> : <IconUpload size={15} />} Subir del ordenador
        </Button>
      </div>
    </Modal>
  );
}
