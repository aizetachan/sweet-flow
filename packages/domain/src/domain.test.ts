import { describe, expect, it } from "vitest";
import {
  childrenOf,
  codeFor,
  defaultLevels,
  folderName,
  folderPath,
  mediaFileName,
  numberBetween,
  renumbered,
  roleOf,
  safeTitle,
  segmentsFromCuts,
  type ProdNode,
  type Production,
} from "./index";

let n = 0;
const id = (p: string) => `${p}${n++}`;

function fixture() {
  const levels = defaultLevels(id);
  const p: Production = { id: "p", workspaceId: "w", name: "T", levels, statuses: [], createdAt: 0, updatedAt: 0 };
  const node = (parentId: string | null, lv: number, number: number, title: string): ProdNode => ({
    id: id("n"), productionId: "p", parentId, levelId: levels[lv]!.id, number, title, notes: "",
    statusId: "s", assigneeIds: [], assetIds: [], updatedAt: 0, updatedBy: "u",
  });
  const sq = node(null, 0, 10, "Apertura");
  const sc = node(sq.id, 1, 10, "Persecución en el puerto");
  const sh = node(sc.id, 2, 10, "Plano general");
  return { p, nodes: [sq, sc, sh], sq, sc, sh, node };
}

describe("naming", () => {
  it("builds codes with padding", () => {
    expect(codeFor({ id: "", name: "", prefix: "SH", step: 10, pad: 4, canGenerate: true, maxVideoSec: 1 }, 15)).toBe("SH0015");
  });

  it("produces cross-platform folder names", () => {
    expect(folderName("SC010", "Persecución en el puerto")).toBe("SC010_Persecucion-en-el-puerto");
    expect(folderName("SH0010", 'Niño: "¿qué?" / <toma>*')).toBe("SH0010_Nino-que-toma");
    expect(folderName("SH0010", "   ")).toBe("SH0010");
    expect(folderName("SH0010", "con.")).toBe("SH0010_con");
    expect(safeTitle("a".repeat(80)).length).toBe(32);
  });

  it("names media files by code only", () => {
    expect(mediaFileName("SC010", "video", 3, ".mp4")).toBe("SC010_vid_v003.mp4");
  });
});

describe("tree", () => {
  it("derives roles and folder paths from levels", () => {
    const { p, nodes, sq, sc, sh } = fixture();
    expect([roleOf(p, sq), roleOf(p, sc), roleOf(p, sh)]).toEqual(["group", "production", "unit"]);
    expect(folderPath(p, nodes, sh)).toBe("SQ010_Apertura/SC010_Persecucion-en-el-puerto/SH0010_Plano-general");
  });

  it("inserts in numbering gaps and renumbers when full", () => {
    const { node, sc } = fixture();
    const a = node(sc.id, 2, 10, "a");
    const b = node(sc.id, 2, 20, "b");
    const c = node(sc.id, 2, 21, "c");
    expect(numberBetween(a, b, 10)).toBe(15);
    expect(numberBetween(b, c, 10)).toBeNull();
    expect([...renumbered([c, a, b], 10).values()]).toEqual([10, 20, 30]);
    expect(childrenOf([b, a], sc.id).map((x) => x.title)).toEqual(["a", "b"]);
  });
});

describe("cuts", () => {
  it("turns cut points into contiguous segments", () => {
    expect(segmentsFromCuts(30, [12.04, 4.2, 4.2, 0, 31])).toEqual([
      { inSec: 0, outSec: 4.2 },
      { inSec: 4.2, outSec: 12 },
      { inSec: 12, outSec: 30 },
    ]);
  });
});
