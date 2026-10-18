/**
 * Getting a shot's media out of the app (docs/INTERFAZ.md §2): copy it to
 * paste in another app, download it, or copy a link that opens the app on
 * that shot and version for someone of the team.
 *
 * Copying: an image goes on the clipboard as an image anywhere. A video or
 * audio file can only be put on the clipboard as a file by the desktop app
 * (browsers do not allow it); in a browser it is downloaded instead.
 */

import { folderPath, mediaFileName, codeOf, versionTag, type Id, type Media, type ProdNode } from "@sweetflow/domain";
import { useStore } from "../state/store";
import { withTeamRoot } from "./reveal";

/** A link that opens the app on `nodeId` (and `mediaId` in its viewer). */
export function shotLink(productionId: Id, nodeId: Id, mediaId?: Id): string {
  const parts = [productionId, nodeId, ...(mediaId ? [mediaId] : [])].map(encodeURIComponent).join("/");
  return `${location.href.split("#")[0]}#/plano/${parts}`;
}

/** Reads `#/plano/<production>/<node>[/<media>]`, if the address is one. */
export function parseShotLink(hash: string): { productionId: Id; nodeId: Id; mediaId?: Id } | null {
  const m = /^#\/plano\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/.exec(hash);
  if (!m) return null;
  return { productionId: decodeURIComponent(m[1]!), nodeId: decodeURIComponent(m[2]!), mediaId: m[3] ? decodeURIComponent(m[3]) : undefined };
}

export function copyShotLink(node: ProdNode, media?: Media): void {
  const { productionId, snap, notify } = useStore.getState();
  if (!productionId || !snap) return;
  void navigator.clipboard?.writeText(shotLink(productionId, node.id, media?.id));
  notify(`Enlace a ${codeOf(snap.production, node)}${media ? ` ${versionTag(media.version)}` : ""} copiado: abre la app en ese plano (para quien tenga la carpeta del equipo).`);
}

/** Its file name on disk (as saved in `_media/`), or one made from its code. */
function fileNameOf(node: ProdNode, media: Media): string {
  const { snap } = useStore.getState();
  if (media.file) return media.file;
  const ext = media.kind === "video" ? "mp4" : media.kind === "audio" ? "mp3" : "png";
  return mediaFileName(snap ? codeOf(snap.production, node) : "media", media.kind, media.version, ext);
}

export function downloadMedia(node: ProdNode, media: Media): void {
  if (!media.url) return useStore.getState().notify("Esa versión aún no tiene archivo.");
  const a = document.createElement("a");
  a.href = media.url;
  a.download = fileNameOf(node, media);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Copies the media to paste it in another app (see the module comment). */
export async function copyMedia(node: ProdNode, media: Media): Promise<void> {
  const { snap, notify, library, productionId } = useStore.getState();
  if (!snap || !media.url) return notify("Esa versión aún no tiene archivo.");

  if (media.kind === "image") {
    try {
      const png = await toPng(media.url);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      return notify("Imagen copiada: pégala en otra app.");
    } catch (err) {
      return notify(`No se ha podido copiar la imagen: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // A video or audio: as a file, from the desktop app; downloaded in a browser.
  const desktop = window.sweetflow;
  const owner = [...snap.nodes, ...snap.shelf].find((n) => n.id === media.nodeId);
  const base = productionId ? library.pathOf?.(productionId) ?? null : null;
  if (!desktop?.copyFile || !media.file || !owner || base === null) {
    downloadMedia(node, media);
    return notify(desktop ? "Se ha descargado: aún no está en la carpeta del equipo para copiarlo." : "El navegador no deja copiar vídeos: se ha descargado. En la app de escritorio se copia para pegarlo directamente.");
  }
  const rel = [base, folderPath(snap.production, [...snap.nodes, ...snap.shelf], owner, snap.groups), "_media", media.file].filter(Boolean).join("/");
  withTeamRoot((root) => {
    desktop.copyFile!(`${root}/${rel}`)
      .then(() => notify(`${media.file} copiado: pégalo en otra app (Finder, Premiere…).`))
      .catch((err) => notify(`No se ha podido copiar: ${err instanceof Error ? err.message : String(err)}`));
  });
}

/** The image as PNG (the only image type every clipboard takes). */
async function toPng(url: string): Promise<Blob> {
  const blob = await (await fetch(url)).blob();
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no se pudo convertir"))), "image/png"));
}
