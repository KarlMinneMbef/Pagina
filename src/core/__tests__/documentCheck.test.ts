import { describe, it, expect } from "vitest";
import { checkDocument, repairDocument, backupPathFor } from "../documentCheck";
import { withDocumentConfig, extractDocumentConfig } from "../pageLayout";

const DEFAULT_PAGE_LAYOUT = extractDocumentConfig("").layout;

const START = "<!-- coverzone-start -->";
const END = "<!-- coverzone-end -->";
const PB = "<!-- pagebreak -->";

const ids = (raw: string) => checkDocument(raw).map((p) => p.check);

describe("documentCheck — page de garde", () => {
  it("un document sain n'a aucun problème", () => {
    expect(checkDocument(`${START}\n\n# {{title}}\n\n${END}\n\n${PB}\n\ntexte\n`)).toEqual([]);
  });

  it("referme une zone avant le saut de page suivant", () => {
    const raw = `${START}\n\n# {{title}}\n\n${PB}\n\ntexte\n`;
    expect(ids(raw)).toEqual(["cover-zone"]);
    const { text, applied } = repairDocument(raw);
    expect(text).toBe(`${START}\n\n# {{title}}\n\n${END}\n${PB}\n\ntexte\n`);
    expect(applied).toEqual(["Page de garde"]);
    expect(checkDocument(text)).toEqual([]);
  });

  it("referme en fin de fichier à défaut de saut de page", () => {
    const { text } = repairDocument(`${START}\n\n# T\n`);
    expect(text.trimEnd().endsWith(END)).toBe(true);
    expect(checkDocument(text)).toEqual([]);
  });

  it("referme une zone ouverte quand une autre commence", () => {
    const raw = `${START}\n\na\n\n${START}\n\nb\n\n${END}\n`;
    const { text } = repairDocument(raw);
    expect(checkDocument(text)).toEqual([]);
    expect(text.match(/coverzone-end/g)).toHaveLength(2);
  });

  it("retire un marqueur de fin orphelin", () => {
    const raw = `texte\n\n${END}\n\nsuite\n`;
    expect(ids(raw)).toEqual(["cover-zone"]);
    expect(repairDocument(raw).text).toBe("texte\n\n\nsuite\n");
  });

  it("ignore les marqueurs écrits dans un bloc de code", () => {
    expect(checkDocument("```\n" + START + "\n```\n")).toEqual([]);
  });
});

describe("documentCheck — réglages de mise en page", () => {
  const clean = () => withDocumentConfig(DEFAULT_PAGE_LAYOUT, "# Titre\n");

  it("un fichier écrit par l'application est sain", () => {
    expect(checkDocument(clean())).toEqual([]);
  });

  it("un fichier sans commentaire de config n'est pas un problème", () => {
    expect(checkDocument("# Titre\n")).toEqual([]);
  });

  it("supprime la copie en double des réglages", () => {
    const raw = clean() + "\n" + clean().split("\n")[1] + "\n";
    expect(ids(raw)).toEqual(["config"]);
    const { text } = repairDocument(raw);
    expect(text.match(/pagina:config/g)).toHaveLength(1);
    expect(checkDocument(text)).toEqual([]);
  });

  it("supprime un commentaire de réglages illisible resté dans le texte", () => {
    const raw = clean() + "\n<!-- pagina:config {pas du json} -->\nsuite\n";
    expect(ids(raw)).toContain("config");
    const { text } = repairDocument(raw);
    expect(text).not.toContain("pas du json");
    expect(text).toContain("suite");
    expect(checkDocument(text)).toEqual([]);
  });

  it("réécrit proprement un commentaire coupé par un `-->` (ancien format)", () => {
    const layout = { ...DEFAULT_PAGE_LAYOUT, header: { ...DEFAULT_PAGE_LAYOUT.header, text: "<!-- empty-line -->" } };
    const good = withDocumentConfig(layout, "# Titre\n");
    // Ancien comportement : JSON écrit tel quel, `-->` non échappé.
    const broken = good.replace(/--\\u003e/g, "-->");
    expect(broken).not.toBe(good);
    expect(ids(broken)).toEqual(["config"]);
    const { text } = repairDocument(broken);
    expect(checkDocument(text)).toEqual([]);
    const { layout: relu, content } = extractDocumentConfig(text);
    expect(relu.header.text).toBe("<!-- empty-line -->");
    expect(content.trim()).toBe("# Titre");
  });
});

describe("documentCheck — sauts de section", () => {
  it("accepte les options URI-encodées et le JSON littéral", () => {
    const enc = encodeURIComponent(JSON.stringify({ title: "Lot 2", restart: true }));
    expect(checkDocument(`<!-- section: ${enc} -->\n<!-- section: {"title":"x","restart":false} -->\n<!-- section -->\n`)).toEqual([]);
  });

  it("signale et normalise des options illisibles", () => {
    const raw = "a\n\n<!-- section: {titre: oups} -->\n\nb\n";
    expect(ids(raw)).toEqual(["section"]);
    expect(repairDocument(raw).text).toBe("a\n\n<!-- section -->\n\nb\n");
  });
});

describe("documentCheck — copie de sauvegarde", () => {
  it("nomme la copie à côté du fichier, avec la date", () => {
    const d = new Date(2026, 9, 26, 15, 30);
    expect(backupPathFor("C:\\docs\\cctp.md", d)).toBe("C:\\docs\\cctp.avant-reparation-20261026-1530.md");
    expect(backupPathFor("/tmp/a.b/notes", d)).toBe("/tmp/a.b/notes.avant-reparation-20261026-1530.md");
  });
});
