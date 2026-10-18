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

/**
 * A link into the app: a dashboard folder or a production (`entryId`), and in
 * a production a shot (`nodeId`, with `mediaId` in its viewer).
 */
export function appLink(entryId: Id, nodeId?: Id, mediaId?: Id): string {
  const parts = [entryId, ...(nodeId ? [nodeId] : []), ...(nodeId && mediaId ? [mediaId] : [])].map(encodeURIComponent).join("/");
  return `${location.href.split("#")[0]}#/abrir/${parts}`;
}

/** Reads `#/abrir/<entry>[/<node>[/<media>]]` (or an older `#/plano/…`), if the address is one. */
export function parseAppLink(hash: string): { entryId: Id; nodeId?: Id; mediaId?: Id } | null {
  const m = /^#\/(?:abrir|plano)\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(hash);
  if (!m) return null;
  const d = (x?: string) => (x ? decodeURIComponent(x) : undefined);
  return { entryId: decodeURIComponent(m[1]!), nodeId: d(m[2]), mediaId: d(m[3]) };
}

/** Copies the link to a dashboard folder or production. */
export function copyEntryLink(entryId: Id, name: string): void {
  void navigator.clipboard?.writeText(appLink(entryId));
  useStore.getState().notify(`Enlace a «${name}» copiado: lleva ahí desde el dashboard (para quien tenga la carpeta del equipo).`);
}

export function copyShotLink(node: ProdNode, media?: Media): void {
  const { productionId, snap, notify } = useStore.getState();
  if (!productionId || !snap) return;
  void navigator.clipboard?.writeText(appLink(productionId, node.id, media?.id));
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
export async function copyMedia(_node: ProdNode, media: Media): Promise<void> {
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

  // A video or audio: as a file from the desktop app. A browser only puts text
  // and images on the clipboard: it tries the file anyway, then copies a link to it.
  const desktop = window.sweetflow;
  const owner = [...snap.nodes, ...snap.shelf].find((n) => n.id === media.nodeId);
  const base = productionId ? library.pathOf?.(productionId) ?? null : null;
  if (!desktop?.copyFile || !media.file || !owner || base === null) {
    const what = media.kind === "audio" ? "audio" : "vídeo";
    try {
      const blob = await (await fetch(media.url)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "video/mp4"]: blob })]);
      return notify(`${what[0]!.toUpperCase()}${what.slice(1)} copiado.`);
    } catch {
      // The provider's own address works anywhere it is pasted; a file of this computer does not.
      const remote = media.remote?.url;
      if (remote) {
        await navigator.clipboard.writeText(remote);
        return notify(`El navegador no deja copiar el archivo de ${what}: se ha copiado su enlace directo, para pegarlo donde quieras. En la app de escritorio se copia el archivo.`);
      }
      return notify(`El navegador no deja copiar archivos de ${what}. Usa «Descargar» o la app de escritorio, que sí lo copia.`);
    }
  }
  const rel = [base, folderPath(snap.production, [...snap.nodes, ...snap.shelf], owner, snap.groups), "_media", media.file].filter(Boolean).join("/");
  withTeamRoot((root) => {
    desktop.copyFile!(`${root}/${rel}`)
      .then(() => notify(`${media.file} copiado: pégalo en otra app (Finder, Premiere…).`))
      .catch((err) => notify(`No se ha podido copiar: ${err instanceof Error ? err.message : String(err)}`));
  });
}

/** The image as PNG (the only image type every clipboard takes); any format the browser can show. */
async function toPng(url: string): Promise<Blob> {
  const blob = await (await fetch(url)).blob();
  if (blob.type === "image/png") return blob;
  const src = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((ok, fail) => {
      img.onload = () => ok();
      img.onerror = () => fail(new Error("no se pudo leer la imagen"));
      img.src = src;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || 1920;
    canvas.height = img.naturalHeight || 1080;
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no se pudo convertir"))), "image/png"));
  } finally {
    URL.revokeObjectURL(src);
  }
}
