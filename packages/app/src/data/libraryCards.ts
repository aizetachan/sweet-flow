/**
 * The library's cards as the breakdown of shots sees them (docs/INTERFAZ.md
 * §2.8): each card is an asset (character, place, prop, style…) a shot or
 * scene can be linked to, with its first chosen image as its picture.
 */

import type { Asset, Media, ProdNode } from "@sweetflow/domain";

export function assetsFromLibrary(library: ProdNode[], media: Media[]): Asset[] {
  return library.flatMap((n) => {
    if (n.lib?.kind !== "card") return [];
    const own = media.filter((m) => m.nodeId === n.id && !m.archived && m.status === "ready");
    const cover = own.find((m) => m.chosen) ?? own[0];
    const imageUrl = cover?.thumbUrl ?? cover?.url;
    return [{ id: n.id, productionId: n.productionId, type: n.lib.type, name: n.title, description: n.notes, ...(imageUrl ? { imageUrl } : {}) }];
  });
}
