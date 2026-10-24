import { describe, it, expect, beforeEach } from "vitest";
import { extractDocumentConfig } from "../pageLayout";
import {
  ALL_STYLE_PARTS,
  addUserDocumentStyle,
  applyStyleToLayout,
  builtinDocumentStyles,
  describeStyle,
  extractStyleLayout,
  loadUserDocumentStyles,
  parseDocumentStyleFile,
  removeUserDocumentStyle,
  serializeDocumentStyle,
  stylePartsPresent,
} from "../documentStyles";

const base = () => extractDocumentConfig("").layout;

describe("styles de document", () => {
  beforeEach(() => localStorage.clear());

  it("extrait seulement les éléments demandés, sans les propriétés du document", () => {
    const layout = { ...base(), author: "Karl", documentVersion: "B" };
    const full = extractStyleLayout(layout, ALL_STYLE_PARTS);
    expect(full.marginLeftMm).toBe(layout.marginLeftMm);
    expect(full.headingStyles).toBeDefined();
    expect((full as Record<string, unknown>).author).toBeUndefined();
    expect((full as Record<string, unknown>).documentProperties).toBeUndefined();

    const onlyPage = extractStyleLayout(layout, ["page"]);
    expect(onlyPage.headingStyles).toBeUndefined();
    expect(onlyPage.paperSize).toBe("A4");
  });

  it("applique un style en conservant les propriétés du document et les éléments non cochés", () => {
    const style = builtinDocumentStyles().find((s) => s.name.includes("CCTP"))!;
    const layout = { ...base(), author: "Karl", documentVersion: "B", marginLeftMm: 33 };
    const out = applyStyleToLayout(layout, style, ["headings", "border"]);
    expect(out.author).toBe("Karl");
    expect(out.documentVersion).toBe("B");
    expect(out.marginLeftMm).toBe(33); // élément « page » non coché
    expect(out.headingStyles[1].numbering).toBe("decimal");
    expect(out.pageBorder.enabled).toBe(true);
    // le style source n'est pas modifié par l'application (copie profonde)
    out.headingStyles[1].color = "#ffffff";
    expect(style.layout.headingStyles![1].color).not.toBe("#ffffff");
  });

  it("l'élément Page remplace un format personnalisé par celui du style", () => {
    const style = builtinDocumentStyles()[0];
    const layout = { ...base(), widthMm: 100, heightMm: 150 };
    const out = applyStyleToLayout(layout, style, ["page"]);
    expect(out.widthMm).toBeUndefined();
    expect(out.heightMm).toBeUndefined();
    expect(out.paperSize).toBe("A4");
  });

  it("un style sans un élément ne touche pas cet élément même s'il est coché", () => {
    const style = { name: "Partiel", layout: { fontSize: "12pt" } };
    const layout = { ...base(), marginTopMm: 40 };
    const out = applyStyleToLayout(layout, style, ALL_STYLE_PARTS);
    expect(out.fontSize).toBe("12pt");
    expect(out.marginTopMm).toBe(40);
    expect(stylePartsPresent(style)).toEqual(["font"]);
  });

  it("les styles intégrés sont complets et décrits", () => {
    const all = builtinDocumentStyles();
    expect(all.length).toBeGreaterThanOrEqual(4);
    for (const s of all) {
      expect(s.builtin).toBe(true);
      expect(stylePartsPresent(s).length).toBeGreaterThanOrEqual(5);
      expect(describeStyle(s).length).toBeGreaterThan(3);
    }
  });

  it("stocke les styles utilisateur (ajout, remplacement à nom égal, suppression)", () => {
    addUserDocumentStyle({ name: "A", layout: { fontSize: "9pt" } });
    addUserDocumentStyle({ name: "B", layout: { fontSize: "11pt" } });
    addUserDocumentStyle({ name: "A", layout: { fontSize: "12pt" } });
    expect(loadUserDocumentStyles().map((s) => `${s.name}:${s.layout.fontSize}`)).toEqual(["B:11pt", "A:12pt"]);
    removeUserDocumentStyle("B");
    expect(loadUserDocumentStyles().map((s) => s.name)).toEqual(["A"]);
  });

  it("aller-retour fichier ; refuse un fichier qui n'est pas un style Pagina", () => {
    const style = { name: "Mon style", description: "test", layout: extractStyleLayout(base(), ALL_STYLE_PARTS) };
    const relu = parseDocumentStyleFile(serializeDocumentStyle(style));
    expect(relu).toEqual(style);
    expect(parseDocumentStyleFile("pas du json")).toBeNull();
    expect(parseDocumentStyleFile('{"kind":"autre","name":"x","layout":{}}')).toBeNull();
    expect(parseDocumentStyleFile('{"kind":"pagina-document-style","name":"","layout":{}}')).toBeNull();
    expect(parseDocumentStyleFile('{"kind":"pagina-document-style","name":"x","layout":[]}')).toBeNull();
  });
});
