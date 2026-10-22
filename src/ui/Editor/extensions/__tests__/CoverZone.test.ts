/**
 * Zone « Page de garde » + champs de document — tests de sérialisation
 * (aller-retour Markdown) sur un vrai éditeur Tiptap minimal (jsdom) :
 * marqueurs transparents, champs {{variable}}, migration de l'ancien bloc.
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { ParagraphMarkdown } from "../ParagraphMarkdown";
import { CoverZoneStart, CoverZoneEnd, migrateCoverMarkdown, findCoverZoneAround, extractCoverZoneMarkdown, coverZoneIndexAt } from "../CoverZone";
import { DocField } from "../DocField";

/** Sérialise en Markdown (storage ajouté par tiptap-markdown — non typé). */
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
      DocField,
      Markdown.configure({ html: true }),
    ],
    content: markdown,
  });
}

describe("CoverZone — marqueurs transparents", () => {
  it("sérialise les marqueurs en commentaires HTML et les relit", () => {
    const ed = makeEditor("Avant\n\n<!-- coverzone-start -->\n\nTitre de garde\n\n<!-- coverzone-end -->\n\nAprès");
    const md = getMarkdown(ed);
    expect(md).toContain("coverzone-start");
    expect(md).toContain("coverzone-end");
    // Relecture : les marqueurs redeviennent des nœuds.
    const ed2 = makeEditor(md);
    const names: string[] = [];
    ed2.state.doc.forEach((n) => names.push(n.type.name));
    expect(names).toContain("coverZoneStart");
    expect(names).toContain("coverZoneEnd");
    // Zone retrouvée au curseur (stats du panneau) — position DANS la zone
    // (le marqueur de début + 1), pas à l'intérieur du premier paragraphe.
    const startPos = (() => {
      let pos = -1;
      ed2.state.doc.forEach((n, offset) => {
        if (n.type.name === "coverZoneStart" && pos < 0) pos = offset;
      });
      return pos;
    })();
    expect(startPos).toBeGreaterThanOrEqual(0);
    const zone = findCoverZoneAround(ed2.state.doc, startPos! + 1);
    expect(zone).not.toBeNull();
    expect(zone!.headerFooter).toBe(false);
  });

  it("porte l'option en-tête/pied dans le commentaire et la relit", () => {
    const ed = makeEditor("<!-- coverzone-start header -->\n\nX\n\n<!-- coverzone-end -->");
    const startPos = (() => {
      let pos = -1;
      ed.state.doc.forEach((n, offset) => {
        if (n.type.name === "coverZoneStart" && pos < 0) pos = offset;
      });
      return pos;
    })();
    const zone = findCoverZoneAround(ed.state.doc, startPos! + 1);
    expect(zone?.headerFooter).toBe(true);
    const md = getMarkdown(ed);
    expect(md).toContain("coverzone-start header");
  });

  it("extrait le contenu d'une zone du Markdown sérialisé (enregistrer comme type)", () => {
    const md = "A\n\n<!-- coverzone-start -->\n\n**Garde**\n\n<!-- coverzone-end -->\n\nB\n\n<!-- coverzone-start -->\n\nDeuxième\n\n<!-- coverzone-end -->\n";
    expect(extractCoverZoneMarkdown(md, 0)).toBe("**Garde**");
    expect(extractCoverZoneMarkdown(md, 1)).toBe("Deuxième");
  });

  it("calcule le rang de la zone contenant une position", () => {
    const ed = makeEditor("<!-- coverzone-start -->\n\nUn\n\n<!-- coverzone-end -->\n\nMilieu\n\n<!-- coverzone-start -->\n\nDeux\n\n<!-- coverzone-end -->\n");
    const secondStart = (() => {
      let pos = -1;
      let seen = 0;
      ed.state.doc.forEach((n, offset) => {
        if (n.type.name === "coverZoneStart") {
          if (seen === 1) pos = offset;
          seen++;
        }
      });
      return pos;
    })();
    expect(coverZoneIndexAt(ed.state.doc, secondStart + 1)).toBe(1);
    expect(coverZoneIndexAt(ed.state.doc, 3)).toBe(0);
  });
});

describe("DocField — champ {{variable}} inline", () => {
  it("sérialise {{name}} et relit le champ comme nœud", () => {
    const ed = makeEditor("Affaire : {{title}} et indice {{version}}.");
    // À la lecture : le texte {{…}} devient un nœud docField (updateDOM).
    let fields = 0;
    ed.state.doc.descendants((n) => {
      if (n.type.name === "docField") fields++;
    });
    expect(fields).toBe(2);
    // À la sérialisation : le nœud redevient {{name}}.
    const md = getMarkdown(ed);
    expect(md).toContain("{{title}}");
    expect(md).toContain("{{version}}");
    expect(md).not.toContain("data-type=");
  });

  it("sérialise les champs DANS un bloc HTML (cas des modèles de page de garde)", () => {
    const ed = makeEditor('<p style="text-align: center;">Indice : {{version}}</p>');
    const md = getMarkdown(ed);
    expect(md).toContain("{{version}}");
    expect(md).not.toContain("data-type=");
  });

  it("round-trip complet : zone + paragraphe stylé + champs + relecture", () => {
    // Cas exact d'une page de garde réelle : paragraphe CENTRÉ (repli HTML
    // de ParagraphMarkdown) contenant des champs.
    const ed = makeEditor(
      '<!-- coverzone-start -->\n\n<p style="text-align: center; font-size: 22pt;">{{title}}</p>\n\n<p style="text-align: center;">Affaire : {{title}} — {{version}}</p>\n\n<!-- coverzone-end -->\n\nSuite',
    );
    const md = getMarkdown(ed);
    expect(md).toContain("coverzone-start");
    expect(md).toContain("coverzone-end");
    expect(md).not.toContain("data-type=");
    expect(md).toContain("{{title}}");
    // Relecture : tout revient (marqueurs, styles, champs).
    const ed2 = makeEditor(md);
    const names: string[] = [];
    ed2.state.doc.forEach((n) => names.push(n.type.name));
    expect(names).toContain("coverZoneStart");
    expect(names).toContain("coverZoneEnd");
    let fields = 0;
    ed2.state.doc.descendants((n) => {
      if (n.type.name === "docField") fields++;
    });
    expect(fields).toBe(3);
    const md2 = getMarkdown(ed2);
    expect((md2.match(/\{\{title\}\}/g) ?? []).length).toBe(2);
  });
});

describe("migrateCoverMarkdown — anciens documents", () => {
  it("convertit le commentaire multi-lignes en zone", () => {
    const before = "<!-- coverpage\n<p style=\"text-align: center\">Garde</p>\n-->\n\nSuite";
    const after = migrateCoverMarkdown(before);
    expect(after).toContain("<!-- coverzone-start -->");
    expect(after).toContain("Garde");
    expect(after).toContain("<!-- coverzone-end -->");
    // Relit comme zone avec contenu.
    const ed = makeEditor(after);
    expect(findCoverZoneAround(ed.state.doc, 1)).not.toBeNull();
    const inner = extractCoverZoneMarkdown(getMarkdown(ed), 0);
    expect(inner).toContain("Garde");
  });

  it("convertit l'ancien format URI-encodé", () => {
    const encoded = encodeURIComponent("<p>Titre {{title}}</p>");
    const after = migrateCoverMarkdown(`<!-- coverpage: ${encoded} -->\n\nSuite`);
    expect(after).toContain("Titre {{title}}");
    const ed = makeEditor(after);
    let fields = 0;
    ed.state.doc.descendants((n) => {
      if (n.type.name === "docField") fields++;
    });
    expect(fields).toBe(1);
  });

  it("est idempotent sur un document sans page de garde", () => {
    expect(migrateCoverMarkdown("# Titre\n\ntexte")).toBe("# Titre\n\ntexte");
  });
});
