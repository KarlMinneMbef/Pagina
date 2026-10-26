import { describe, it, expect, vi } from "vitest";

const existing = new Set<string>();
vi.mock("../../persistence/fileService", () => ({ pathExists: async (p: string) => existing.has(p) }));

import { freeXmdPath, titleOf, xmdPathFor } from "../xmd/paths";

describe("chemins .xmd", () => {
  it("titre d'un chemin Windows ou POSIX", () => {
    expect(titleOf("C:\\docs\\CCTP lot 2.xmd")).toBe("CCTP lot 2.xmd");
    expect(titleOf("/home/a/b.md")).toBe("b.md");
  });

  it("le .xmd est à côté du .md, même nom", () => {
    expect(xmdPathFor("C:\\docs\\rapport.md")).toBe("C:\\docs\\rapport.xmd");
    expect(xmdPathFor("C:\\docs\\rapport.MD", " (2)")).toBe("C:\\docs\\rapport (2).xmd");
  });

  it("jamais d'écrasement : premier nom libre", async () => {
    existing.clear();
    expect(await freeXmdPath("C:\\d\\a.md")).toBe("C:\\d\\a.xmd");
    existing.add("C:\\d\\a.xmd");
    expect(await freeXmdPath("C:\\d\\a.md")).toBe("C:\\d\\a (2).xmd");
    existing.add("C:\\d\\a (2).xmd");
    expect(await freeXmdPath("C:\\d\\a.md")).toBe("C:\\d\\a (3).xmd");
  });
});
