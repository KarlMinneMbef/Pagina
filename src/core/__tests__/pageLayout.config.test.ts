import { describe, it, expect } from "vitest";
import { extractDocumentConfig, withDocumentConfig } from "../pageLayout";

// Mise en page par défaut, obtenue comme le fait l'app : fichier sans config.
const DEFAULT_PAGE_LAYOUT = extractDocumentConfig("").layout;

describe("commentaire pagina:config", () => {
  it("survit à un en-tête contenant `-->` (aller-retour sans fuite dans le corps)", () => {
    const layout = {
      ...DEFAULT_PAGE_LAYOUT,
      header: { ...DEFAULT_PAGE_LAYOUT.header, text: "<!-- empty-line -->" },
    };
    const fichier = withDocumentConfig(layout, "# Titre\n\nCorps.");
    const { layout: relu, content } = extractDocumentConfig(fichier);
    expect(relu.header.text).toBe("<!-- empty-line -->");
    expect(content).toBe("# Titre\n\nCorps.");
  });

  it("répare un fichier écrit par l'ancienne version (JSON coupé au premier `-->`)", () => {
    const json = JSON.stringify({
      configVersion: 1,
      layout: { ...DEFAULT_PAGE_LAYOUT, footer: { ...DEFAULT_PAGE_LAYOUT.footer, text: "<!-- empty-line -->" } },
    });
    const ancien = `<!-- pagina:config ${json} -->\n# Titre\n\nCorps.`;
    const { layout, content } = extractDocumentConfig(ancien);
    expect(layout.footer.text).toBe("<!-- empty-line -->");
    expect(content).toBe("# Titre\n\nCorps.");
  });

  it("un JSON invalide retombe sur les défauts sans perdre le corps", () => {
    const { layout, content } = extractDocumentConfig("<!-- pagina:config {pas du json} -->\n# Titre");
    expect(layout.paperSize).toBe(DEFAULT_PAGE_LAYOUT.paperSize);
    expect(content).toBe("# Titre");
  });
});
