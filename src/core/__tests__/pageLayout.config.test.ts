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

  it("bordure de page : défauts pour un ancien fichier, aller-retour pour un cadre activé", () => {
    expect(DEFAULT_PAGE_LAYOUT.pageBorder.enabled).toBe(false);
    const ancien = extractDocumentConfig('<!-- pagina:config {"configVersion":1,"layout":{"paperSize":"A4"}} -->\n# T').layout;
    expect(ancien.pageBorder).toEqual(DEFAULT_PAGE_LAYOUT.pageBorder);

    const layout = { ...DEFAULT_PAGE_LAYOUT, pageBorder: { enabled: true, style: "double" as const, widthPt: 2, color: "#343334", offsetMm: 8, appliesTo: "cover" as const } };
    const relu = extractDocumentConfig(withDocumentConfig(layout, "# T")).layout;
    expect(relu.pageBorder).toEqual(layout.pageBorder);
  });

  it("une bordure partielle est complétée par les défauts champ par champ", () => {
    const partiel = extractDocumentConfig('<!-- pagina:config {"configVersion":1,"layout":{"pageBorder":{"enabled":true,"offsetMm":5}}} -->\n# T').layout;
    expect(partiel.pageBorder).toEqual({ ...DEFAULT_PAGE_LAYOUT.pageBorder, enabled: true, offsetMm: 5 });
  });

  it("un JSON invalide retombe sur les défauts sans perdre le corps", () => {
    const { layout, content } = extractDocumentConfig("<!-- pagina:config {pas du json} -->\n# Titre");
    expect(layout.paperSize).toBe(DEFAULT_PAGE_LAYOUT.paperSize);
    expect(content).toBe("# Titre");
  });
});

describe("date de création des propriétés", () => {
  it("posée au premier enregistrement d'un fichier sans config, jamais recalculée ensuite", () => {
    const { layout } = extractDocumentConfig("# Titre\n");
    expect(layout.documentProperties.createdDate).toBe("");
    const written = withDocumentConfig(layout, "# Titre\n");
    const created = extractDocumentConfig(written).layout.documentProperties.createdDate;
    expect(created).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Une date déjà présente n'est pas touchée.
    const old = { ...layout, documentProperties: { ...layout.documentProperties, createdDate: "2020-01-02" } };
    expect(extractDocumentConfig(withDocumentConfig(old, "x")).layout.documentProperties.createdDate).toBe("2020-01-02");
  });
});
