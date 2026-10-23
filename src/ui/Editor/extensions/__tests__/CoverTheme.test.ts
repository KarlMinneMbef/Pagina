/**
 * Thème visuel des pages de garde : le fichier reste du Markdown PUR, le thème
 * vit dans le marqueur de début et se projette en décoration (data-cover-theme).
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { ParagraphMarkdown } from "../ParagraphMarkdown";
import {
  CoverZoneStart,
  CoverZoneEnd,
  parseCoverZoneStartMarker,
  formatCoverZoneStartMarker,
  coverZoneContentOffsets,
  isInCoverZoneContent,
} from "../CoverZone";
import { CoverTheme } from "../CoverTheme";
import { DocField } from "../DocField";

function getMarkdown(ed: Editor): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ed.storage as any).markdown.getMarkdown() as string;
}

function makeEditor(markdown: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false }, paragraph: false }),
      ParagraphMarkdown,
      CoverZoneStart,
      CoverZoneEnd,
      CoverTheme,
      DocField,
      Markdown.configure({ html: true }),
    ],
    content: markdown,
  });
}

describe("CoverZone — thème visuel (Markdown pur + marqueur)", () => {
  it("lit et écrit le marqueur de début avec thème et en-tête", () => {
    const none = { marginTopMm: null, marginLeftMm: null, marginRightMm: null, marginBottomMm: null };
    expect(parseCoverZoneStartMarker("<!-- coverzone-start -->")).toEqual({ headerFooter: false, theme: "", ...none });
    expect(parseCoverZoneStartMarker("<!-- coverzone-start header -->")).toEqual({ headerFooter: true, theme: "", ...none });
    expect(parseCoverZoneStartMarker("<!-- coverzone-start theme=chantier -->")).toEqual({ headerFooter: false, theme: "chantier", ...none });
    expect(parseCoverZoneStartMarker("<!-- coverzone-start header theme=moderne -->")).toEqual({ headerFooter: true, theme: "moderne", ...none });
    expect(parseCoverZoneStartMarker("<!-- autre commentaire -->")).toBeNull();
    expect(formatCoverZoneStartMarker({ headerFooter: true, theme: "moderne" })).toBe("<!-- coverzone-start header theme=moderne -->");
    expect(formatCoverZoneStartMarker({})).toBe("<!-- coverzone-start -->");
  });

  it("lit et écrit les marges de la page de garde (mm, ordre libre, jetons inconnus ignorés)", () => {
    const m = parseCoverZoneStartMarker("<!-- coverzone-start margin-left=0 theme=chantier margin-top=12.5 futur=1 margin-right=5 margin-bottom=8 -->");
    expect(m).toEqual({ headerFooter: false, theme: "chantier", marginTopMm: 12.5, marginLeftMm: 0, marginRightMm: 5, marginBottomMm: 8 });
    expect(formatCoverZoneStartMarker(m!)).toBe("<!-- coverzone-start theme=chantier margin-top=12.5 margin-left=0 margin-right=5 margin-bottom=8 -->");
  });

  it("aller-retour des marges dans le Markdown de l'éditeur", () => {
    const md = "<!-- coverzone-start margin-top=10 margin-left=0 -->\n\nTexte\n\n<!-- coverzone-end -->\n";
    const out = getMarkdown(makeEditor(md));
    expect(out).toContain("<!-- coverzone-start margin-top=10 margin-left=0 -->");
  });

  it("aller-retour : le thème survit et le contenu reste du Markdown pur (aucun HTML)", () => {
    const md =
      "<!-- coverzone-start theme=chantier -->\n\n# {{title}}\n\n## {{subject}}\n\nRédigé par : {{author}}\n\n<!-- coverzone-end -->\n";
    const out = getMarkdown(makeEditor(md));
    expect(out).toContain("<!-- coverzone-start theme=chantier -->");
    expect(out).toContain("# {{title}}");
    expect(out).toContain("## {{subject}}");
    expect(out).not.toMatch(/<p |style=/);
  });

  it("décore les blocs de la zone avec data-cover-theme, pas ceux d'en dehors", () => {
    const ed = makeEditor(
      "Avant\n\n<!-- coverzone-start theme=chantier -->\n\n# Titre\n\nTexte\n\n<!-- coverzone-end -->\n\nAprès",
    );
    const html = ed.view.dom.innerHTML;
    expect(html.match(/data-cover-theme="chantier"/g)?.length).toBe(2);
    expect(html).toMatch(/<p>Avant<\/p>/);
    expect(html).toMatch(/<p>Après<\/p>/);
  });

  it("repère le contenu d'une zone (marqueurs exclus) pour écarter ses titres du sommaire", () => {
    const ed = makeEditor(
      "# Chapitre\n\n<!-- coverzone-start -->\n\n# Titre couverture\n\n<!-- coverzone-end -->\n\n# Chapitre 2",
    );
    const offsets = coverZoneContentOffsets(ed.state.doc);
    const headings: { text: string; inCover: boolean }[] = [];
    ed.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") headings.push({ text: node.textContent, inCover: isInCoverZoneContent(ed.state.doc, pos, offsets) });
      return true;
    });
    expect(headings).toEqual([
      { text: "Chapitre", inCover: false },
      { text: "Titre couverture", inCover: true },
      { text: "Chapitre 2", inCover: false },
    ]);
  });
});
