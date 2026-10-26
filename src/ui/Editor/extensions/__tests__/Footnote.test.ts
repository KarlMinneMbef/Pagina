/**
 * Un tableau écrit en HTML qui contient une note de fin de document garde l'attribut `id="1"` sur le `<sup>` ;
 * Tiptap le convertissait en NOMBRE, ce qui faisait échouer le rendu (« Invalid array passed to renderSpec »,
 * écran blanc à l'ouverture du document, 2026-10-26).
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { FootnoteReference, FootnoteDefinition } from "../Footnote";

function makeEditor(content: string): Editor {
  return new Editor({
    extensions: [StarterKit, FootnoteReference, FootnoteDefinition, Markdown.configure({ html: true })],
    content,
  });
}

describe("notes de fin de document", () => {
  it("l'identifiant reste une chaîne même si le HTML porte id=\"1\" (et le document se rend)", () => {
    const ed = makeEditor('<p>Texte<sup id="1" data-type="footnote-ref" data-id="1" class="xmd-footnote-ref">1</sup></p>');
    let id: unknown = null;
    ed.state.doc.descendants((n) => {
      if (n.type.name === "footnoteReference") id = n.attrs.id;
    });
    expect(id).toBe("1");
    expect(() => ed.view.dom.outerHTML).not.toThrow();
    expect(ed.getHTML()).toContain('data-id="1"');
    expect(ed.getHTML()).not.toMatch(/<sup id=/);
  });

  it("aller-retour Markdown : [^1] et sa définition", () => {
    const ed = makeEditor("Texte[^1]\n\n[^1]: La note\n");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const md = (ed.storage as any).markdown.getMarkdown() as string;
    expect(md).toContain("[^1]");
    expect(md).toContain("[^1]: La note");
  });
});
