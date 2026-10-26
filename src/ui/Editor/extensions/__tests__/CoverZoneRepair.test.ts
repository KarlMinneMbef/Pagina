/**
 * Une zone page de garde sans marqueur de fin étend « page de garde » à tout le document (en-tête/pied masqués
 * partout). Elle doit être refermée automatiquement.
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { ParagraphMarkdown } from "../ParagraphMarkdown";
import { CoverZoneStart, CoverZoneEnd, CoverZoneRepair, unclosedCoverZoneEnds } from "../CoverZone";
import { PageBreak } from "../PageBreak";

function makeEditor(md: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false }, paragraph: false }),
      ParagraphMarkdown,
      CoverZoneStart,
      CoverZoneEnd,
      CoverZoneRepair,
      PageBreak,
      Markdown.configure({ html: true }),
    ],
    content: md,
  });
}

const tops = (ed: Editor) => {
  const names: string[] = [];
  ed.state.doc.forEach((n) => names.push(n.type.name));
  return names;
};

describe("CoverZoneRepair — zone page de garde non refermée", () => {
  it("détecte une zone ouverte et propose de la fermer avant le saut de page suivant", () => {
    const ed = new Editor({
      extensions: [StarterKit.configure({ paragraph: false }), ParagraphMarkdown, CoverZoneStart, CoverZoneEnd, PageBreak, Markdown.configure({ html: true })],
      content: "<!-- coverzone-start -->\n\nTitre\n\n<!-- pagebreak -->\n\nSuite du document\n",
    });
    expect(tops(ed)).toEqual(["coverZoneStart", "paragraph", "pageBreak", "paragraph"]);
    const ends = unclosedCoverZoneEnds(ed.state.doc);
    expect(ends).toHaveLength(1);
    // La fin se place AVANT le saut de page (position du nœud pageBreak).
    let pageBreakPos = -1;
    ed.state.doc.forEach((n, off) => {
      if (n.type.name === "pageBreak") pageBreakPos = off;
    });
    expect(ends[0]).toBe(pageBreakPos);
  });

  it("referme automatiquement à l'ouverture : la zone s'arrête avant le saut de page", async () => {
    const ed = makeEditor("<!-- coverzone-start -->\n\nTitre\n\n<!-- pagebreak -->\n\nSuite du document\n");
    await Promise.resolve(); // la réparation à la création passe par une micro-tâche
    expect(tops(ed)).toEqual(["coverZoneStart", "paragraph", "coverZoneEnd", "pageBreak", "paragraph"]);
    expect(unclosedCoverZoneEnds(ed.state.doc)).toEqual([]);
  });

  it("sans saut de page : refermée en fin de document", async () => {
    const ed = makeEditor("<!-- coverzone-start -->\n\nTitre\n\nSuite\n");
    await Promise.resolve();
    // (+ le paragraphe vide final que l'éditeur garde toujours après un bloc non éditable)
    expect(tops(ed)).toEqual(["coverZoneStart", "paragraph", "paragraph", "coverZoneEnd", "paragraph"]);
  });

  it("deux zones dont la première est ouverte : refermée avant la seconde", async () => {
    const ed = makeEditor("<!-- coverzone-start -->\n\nA\n\n<!-- coverzone-start -->\n\nB\n\n<!-- coverzone-end -->\n");
    await Promise.resolve();
    expect(tops(ed)).toEqual(["coverZoneStart", "paragraph", "coverZoneEnd", "coverZoneStart", "paragraph", "coverZoneEnd", "paragraph"]);
  });

  it("une zone déjà fermée n'est pas touchée ; la suppression accidentelle du marqueur de fin est réparée", async () => {
    const ed = makeEditor("<!-- coverzone-start -->\n\nTitre\n\n<!-- coverzone-end -->\n\n<!-- pagebreak -->\n\nSuite\n");
    await Promise.resolve();
    expect(tops(ed)).toEqual(["coverZoneStart", "paragraph", "coverZoneEnd", "pageBreak", "paragraph"]);
    // Suppr accidentel : le marqueur de fin disparaît...
    let endPos = -1;
    ed.state.doc.forEach((n, off) => {
      if (n.type.name === "coverZoneEnd") endPos = off;
    });
    ed.view.dispatch(ed.state.tr.delete(endPos, endPos + 1));
    // ... et le garde-fou le remet (avant le saut de page).
    expect(tops(ed)).toEqual(["coverZoneStart", "paragraph", "coverZoneEnd", "pageBreak", "paragraph"]);
  });
});
