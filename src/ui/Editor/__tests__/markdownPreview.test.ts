import { describe, it, expect } from "vitest";
import { prepareMarkdownPreviewHtml } from "../MarkdownPreview";

describe("prepareMarkdownPreviewHtml", () => {
  it("retire les repères d'édition (page de garde, sauts de page/section, marqueur de sommaire)", () => {
    const out = prepareMarkdownPreviewHtml(
      '<h1>T</h1><div data-type="cover-zone-start" class="xmd-coverzone"></div><p>a</p>' +
        '<div data-type="cover-zone-end"></div><div data-type="page-break"></div><div data-type="toc-marker"></div>' +
        '<div data-type="section-break" data-title="x"></div><p>b</p>',
    );
    expect(out).toBe("<h1>T</h1><p>a</p><p>b</p>");
  });

  it("remplit les champs de document (le HTML de l'éditeur les contient vides)", () => {
    const out = prepareMarkdownPreviewHtml('<p>Le <span data-type="doc-field" data-name="date" class="xmd-docfield"></span></p>');
    // Sans contexte d'édition, la variable reste visible telle quelle (comme dans les en-têtes).
    expect(out).toContain("{{date}}");
    expect(out).not.toContain("></span>");
  });

  it("met les cases à cocher en lecture seule", () => {
    const out = prepareMarkdownPreviewHtml('<ul data-type="taskList"><li><label><input type="checkbox" checked></label></li></ul>');
    expect(out).toMatch(/<input[^>]*disabled/);
  });
});
