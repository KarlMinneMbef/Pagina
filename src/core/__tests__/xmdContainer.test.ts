import { describe, it, expect } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  assetPathFor,
  EMPTY_COMMENTS,
  imageMimeOf,
  isSafeEntryName,
  looksLikeZip,
  newPackage,
  packXmd,
  referencedAssets,
  slugBaseName,
  unpackXmd,
} from "../xmd/container";

const GEN = { app: "Pagina", version: "test" };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);

describe("conteneur .xmd", () => {
  it("aller-retour : le Markdown, les images et les annexes survivent", () => {
    const pkg = newPackage("# Titre\n\n![plan](images/plan-aaaa1111.png)\n");
    pkg.assets["images/plan-aaaa1111.png"] = { bytes: PNG, mime: "image/png" };
    const bytes = packXmd(pkg, GEN);
    expect(looksLikeZip(bytes)).toBe(true);
    const back = unpackXmd(bytes);
    expect(back.markdown).toBe(pkg.markdown);
    expect(Array.from(back.assets["images/plan-aaaa1111.png"].bytes)).toEqual(Array.from(PNG));
    expect(back.assets["images/plan-aaaa1111.png"].mime).toBe("image/png");
    expect(back.comments).toBe(EMPTY_COMMENTS);
  });

  it("le ZIP contient bien document.md, manifest.json, comments.json, history.json", () => {
    const files = unzipSync(packXmd(newPackage("texte"), GEN));
    expect(Object.keys(files).sort()).toEqual(["comments.json", "document.md", "history.json", "manifest.json"]);
    expect(strFromU8(files["document.md"])).toBe("texte");
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest).toMatchObject({ format: "pagina-xmd", formatVersion: 1, main: "document.md" });
  });

  it("une image que le texte ne référence plus n'est pas embarquée", () => {
    const pkg = newPackage("![a](images/garde.png)\n");
    pkg.assets["images/garde.png"] = { bytes: PNG, mime: "image/png" };
    pkg.assets["images/orpheline.png"] = { bytes: PNG, mime: "image/png" };
    const files = unzipSync(packXmd(pkg, GEN));
    expect(files["images/garde.png"]).toBeTruthy();
    expect(files["images/orpheline.png"]).toBeUndefined();
  });

  it("commentaires, historique et fichiers inconnus sont conservés tels quels", () => {
    const zip = zipSync({
      "manifest.json": strToU8(JSON.stringify({ format: "pagina-xmd", main: "document.md" })),
      "document.md": strToU8("x"),
      "comments.json": strToU8('{"version":1,"comments":[{"id":"c1"}]}'),
      "history.json": strToU8('{"version":1,"revisions":[{"id":"r1"}]}'),
      "futur/donnees.bin": new Uint8Array([9, 9]),
    });
    const pkg = unpackXmd(zip);
    expect(pkg.comments).toContain("c1");
    expect(pkg.history).toContain("r1");
    const again = unzipSync(packXmd(pkg, GEN));
    expect(Array.from(again["futur/donnees.bin"])).toEqual([9, 9]);
    expect(strFromU8(again["comments.json"])).toContain("c1");
  });

  it("un .md renommé en .xmd (pas un ZIP) est lu comme du Markdown", () => {
    const pkg = unpackXmd(strToU8("# Simple texte\n"));
    expect(pkg.markdown).toBe("# Simple texte\n");
    expect(Object.keys(pkg.assets)).toEqual([]);
  });

  it("tolère l'absence de manifeste (premier .md de la racine) et refuse un ZIP sans document", () => {
    expect(unpackXmd(zipSync({ "notes.md": strToU8("n") })).markdown).toBe("n");
    expect(() => unpackXmd(zipSync({ "images/a.png": PNG }))).toThrow(/aucun document/);
  });

  it("un contenu corrompu donne une erreur lisible", () => {
    const bytes = packXmd(newPackage("x"), GEN).slice(0, 40);
    expect(() => unpackXmd(bytes)).toThrow(/illisible/);
  });

  it("noms d'entrée dangereux écartés (zip-slip)", () => {
    expect(isSafeEntryName("images/a.png")).toBe(true);
    for (const bad of ["../x.png", "images/../../x", "/etc/passwd", "C:\\x.png", ""]) expect(isSafeEntryName(bad)).toBe(false);
    const pkg = unpackXmd(zipSync({ "document.md": strToU8("x"), "../evil.png": PNG }));
    expect(Object.keys(pkg.assets)).toEqual([]);
  });
});

describe("images", () => {
  it("repère les images référencées (Markdown et HTML)", () => {
    const md = "![a](images/a.png) puis ![b](images/b%20c.png \"titre\") et <img src=\"images/d.jpg\" width=\"50%\"> ![ext](https://x.org/e.png)";
    const found = referencedAssets(md);
    expect(found.has("images/a.png")).toBe(true);
    expect(found.has("images/b c.png")).toBe(true);
    expect(found.has("images/d.jpg")).toBe(true);
  });

  it("types MIME et noms sûrs", () => {
    expect(imageMimeOf("x.PNG")).toBe("image/png");
    expect(imageMimeOf("x.jpeg")).toBe("image/jpeg");
    expect(imageMimeOf("x.pdf")).toBeNull();
    expect(slugBaseName("Plan étage 1 (final).PNG")).toBe("plan-etage-1-final");
    expect(slugBaseName("---.png")).toBe("image");
  });

  it("le même contenu donne le même chemin, un contenu différent un autre", async () => {
    const a = await assetPathFor("Plan.png", PNG);
    const b = await assetPathFor("autre nom.png", PNG);
    const c = await assetPathFor("Plan.png", new Uint8Array([1, 2, 3]));
    expect(a).toMatch(/^images\/plan-[0-9a-f]{8}\.png$/);
    expect(a.split("-").pop()).toBe(b.split("-").pop());
    expect(a).not.toBe(c);
  });
});
