import { describe, expect, it } from "vitest";
import { folderDepth, type LibraryEntry } from "./library";

const entry = (id: string, parentId: string | null, kind: LibraryEntry["kind"] = "folder", trashedAt?: number): LibraryEntry => ({ id, kind, name: id, parentId, createdAt: 0, updatedAt: 0, trashedAt });

describe("folderDepth", () => {
  it("counts levels of folders, not how many there are", () => {
    const entries = [entry("a", null), entry("b", "a"), entry("c", "a"), entry("d", "a"), entry("e", "b"), entry("p", "e", "production")];
    expect(folderDepth(entries, "a")).toBe(2);
    expect(folderDepth(entries, "b")).toBe(1);
    expect(folderDepth(entries, "e")).toBe(0);
  });

  it("ignores productions and trashed folders", () => {
    const entries = [entry("a", null), entry("p", "a", "production"), entry("t", "a", "folder", 1)];
    expect(folderDepth(entries, "a")).toBe(0);
  });
});
