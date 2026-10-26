import { describe, it, expect, beforeEach } from "vitest";
import { blankTabData, useTabsStore } from "../store/tabsStore";
import { extractDocumentConfig } from "../pageLayout";

const PATH = "C:\docs\a.md";

function seed(content: string, dirty = false) {
  useTabsStore.setState({
    tabs: [{ path: PATH, title: "a.md", content, dirty, layout: extractDocumentConfig("").layout, issues: [], revision: 0, ...blankTabData() }],
    activePath: PATH,
    pendingContent: { [PATH]: content },
  });
}

describe("référence de l'indicateur « modifié » (0.8)", () => {
  beforeEach(() => seed("texte  disque\n"));

  it("le Markdown normalisé par l'éditeur devient la référence : pas de « modifié » à l'ouverture", () => {
    useTabsStore.getState().setBaseline(PATH, "texte disque\n");
    expect(useTabsStore.getState().tabs[0].content).toBe("texte disque\n");
    expect(useTabsStore.getState().tabs[0].dirty).toBe(false);
  });

  it("une annulation complète (retour au texte normalisé) redevient non modifiée", () => {
    useTabsStore.getState().setBaseline(PATH, "texte disque\n");
    useTabsStore.getState().updateContent(PATH, "texte disque modifié\n");
    expect(useTabsStore.getState().tabs[0].dirty).toBe(true);
    useTabsStore.getState().updateContent(PATH, "texte disque\n");
    expect(useTabsStore.getState().tabs[0].dirty).toBe(false);
  });

  it("sans effet sur un onglet déjà modifié (ses modifications en attente restent à enregistrer)", () => {
    seed("texte disque\n", true);
    useTabsStore.getState().setBaseline(PATH, "autre\n");
    expect(useTabsStore.getState().tabs[0].content).toBe("texte disque\n");
  });
});
