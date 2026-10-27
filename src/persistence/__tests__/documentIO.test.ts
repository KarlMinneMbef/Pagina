/**
 * documentIO : relie le conteneur au disque. Le disque (fileService) est simulé par un petit système de fichiers en mémoire.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { unzipSync, strFromU8 } from "fflate";

const files = new Map<string, Uint8Array | string>();
vi.mock("../fileService", () => ({
  readBinaryFile: async (p: string) => {
    const v = files.get(p);
    if (v === undefined) throw new Error("absent " + p);
    return typeof v === "string" ? new TextEncoder().encode(v) : v;
  },
  readTextFile: async (p: string) => {
    const v = files.get(p);
    if (typeof v !== "string") throw new Error("absent " + p);
    return v;
  },
  writeBinaryFile: async (p: string, b: Uint8Array) => void files.set(p, b),
  writeTextFile: async (p: string, t: string) => void files.set(p, t),
  pathExists: async (p: string) => files.has(p),
}));

import { loadDocument, saveDocument, formatOf } from "../documentIO";

const PNG = new Uint8Array([9, 8, 7]);

describe("documentIO", () => {
  beforeEach(() => files.clear());

  it("format d'après l'extension", () => {
    expect(formatOf("a.XMD")).toBe("xmd");
    expect(formatOf("a.md")).toBe("md");
  });

  it(".xmd : écriture d'un conteneur ZIP puis relecture à l'identique", async () => {
    await saveDocument("C:/d/a.xmd", {
      raw: "# Titre\n\n![i](images/i-1.png)\n",
      assets: { "images/i-1.png": { bytes: PNG, mime: "image/png" } },
      comments: '{"version":1,"comments":[{"id":"c"}]}',
      history: '{"version":1,"revisions":[]}',
      extras: {},
    });
    const zip = unzipSync(files.get("C:/d/a.xmd") as Uint8Array);
    expect(Object.keys(zip).sort()).toEqual(["comments.json", "document.md", "history.json", "images/i-1.png", "manifest.json"]);
    const back = await loadDocument("C:/d/a.xmd");
    expect(back.format).toBe("xmd");
    expect(back.raw).toContain("# Titre");
    expect(Array.from(back.assets["images/i-1.png"].bytes)).toEqual([9, 8, 7]);
    expect(back.comments).toContain('"id":"c"');
  });

  it(".md : les images relatives sont lues à côté du fichier ; une image absente est ignorée", async () => {
    files.set("C:/d/a.md", "![ok](images/ok.png) ![ko](images/ko.png) ![web](https://x.org/w.png)\n");
    files.set("C:/d/images/ok.png", PNG);
    const doc = await loadDocument("C:/d/a.md");
    expect(doc.format).toBe("md");
    expect(Object.keys(doc.assets)).toEqual(["images/ok.png"]);
  });

  it("enregistrer en .md extrait les images dans images/ (sans réécrire celles qui existent déjà)", async () => {
    files.set("C:/d/images/deja.png", new Uint8Array([1]));
    await saveDocument("C:/d/b.md", {
      raw: "![a](images/neuve.png) ![b](images/deja.png)\n",
      assets: { "images/neuve.png": { bytes: PNG, mime: "image/png" }, "images/deja.png": { bytes: PNG, mime: "image/png" } },
      comments: "{}",
      history: "{}",
      extras: {},
    });
    expect(files.get("C:/d/b.md")).toContain("![a]");
    expect(Array.from(files.get("C:/d/images/neuve.png") as Uint8Array)).toEqual([9, 8, 7]);
    expect(Array.from(files.get("C:/d/images/deja.png") as Uint8Array)).toEqual([1]); // intacte
  });

  it("un .xmd qui n'est qu'un .md renommé est lu comme du texte", async () => {
    files.set("C:/d/r.xmd", "# Juste du Markdown\n");
    const doc = await loadDocument("C:/d/r.xmd");
    expect(doc.raw).toBe("# Juste du Markdown\n");
    expect(strFromU8(new TextEncoder().encode(doc.raw))).toContain("Markdown");
  });
});
