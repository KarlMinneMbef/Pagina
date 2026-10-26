/**
 * Cibles d'un sommaire : portée globale / par section (voir `collectTocTargets`).
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { SectionBreak } from "../SectionBreak";
import { TocMarker, collectTocTargets } from "../TocMarker";

function makeEditor(md: string): Editor {
  return new Editor({
    extensions: [StarterKit, SectionBreak, TocMarker, Markdown.configure({ html: true })],
    content: md,
  });
}

/** Cibles du sommaire posé en TÊTE du document (avant toute section). */
function targetsAtTop(md: string): string[] {
  const ed = makeEditor(md);
  return collectTocTargets(ed.state.doc, 0).map((t) => t.text);
}

describe("sommaire global — titres avant la première section", () => {
  it("sans section : tous les titres", () => {
    expect(targetsAtTop("## A\n\n### A1\n\n## B\n")).toEqual(["A", "A1", "B"]);
  });

  it("avec sections : les titres qui précèdent la première section PUIS les sections (pas seulement les sections)", () => {
    const md = "## A\n\n## B\n\n<!-- section: %7B%22title%22%3A%22Annexe%22%2C%22restart%22%3Atrue%7D -->\n\n## Dans l'annexe\n";
    expect(targetsAtTop(md)).toEqual(["A", "B", "Annexe"]);
  });

  it("section dès le début : seules les sections sont listées (vue d'ensemble d'un recueil)", () => {
    const s = (t: string) => `<!-- section: ${encodeURIComponent(JSON.stringify({ title: t, restart: true }))} -->`;
    const md = `${s("Partie 1")}\n\n## a\n\n${s("Partie 2")}\n\n## b\n`;
    expect(targetsAtTop(md)).toEqual(["Partie 1", "Partie 2"]);
  });
});
