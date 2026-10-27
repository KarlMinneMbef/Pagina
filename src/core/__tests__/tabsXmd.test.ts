/**
 * Onglets au format .xmd : ouverture, ajout d'image (dédoublonné), conversion .md → .xmd sur place, enregistrement.
 * La couche disque (`documentIO`) est simulée : on vérifie ce que le store lui demande d'écrire.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LoadedDocument, DocumentToSave } from "../../persistence/documentIO";
import { EMPTY_COMMENTS, EMPTY_HISTORY } from "../xmd/container";

const written: { path: string; doc: DocumentToSave }[] = [];
const disk = new Map<string, LoadedDocument>();

vi.mock("../../persistence/documentIO", () => ({
  loadDocument: async (path: string) => {
    const d = disk.get(path);
    if (!d) throw new Error("introuvable " + path);
    return d;
  },
  saveDocument: async (path: string, doc: DocumentToSave) => {
    written.push({ path, doc });
  },
  formatOf: (p: string) => (p.toLowerCase().endsWith(".xmd") ? "xmd" : "md"),
}));

import { useTabsStore } from "../store/tabsStore";

const PNG = new Uint8Array([1, 2, 3, 4]);

function doc(format: "md" | "xmd", raw: string, assets: LoadedDocument["assets"] = {}): LoadedDocument {
  return { format, raw, assets, comments: EMPTY_COMMENTS, history: EMPTY_HISTORY, extras: {} };
}

describe("onglets .xmd", () => {
  beforeEach(() => {
    written.length = 0;
    disk.clear();
    useTabsStore.setState({ tabs: [], activePath: null, pendingContent: {} });
  });

  it("ouvre un .xmd : texte, images et annexes dans l'onglet", async () => {
    disk.set("C:\\d\\a.xmd", doc("xmd", "# T\n\n![x](images/x-1.png)\n", { "images/x-1.png": { bytes: PNG, mime: "image/png" } }));
    await useTabsStore.getState().openFile("C:\\d\\a.xmd");
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.format).toBe("xmd");
    expect(Object.keys(tab.assets)).toEqual(["images/x-1.png"]);
    expect(tab.content).toContain("![x](images/x-1.png)");
  });

  it("addAsset : chemin relatif sûr, un contenu identique réutilise le même chemin", async () => {
    disk.set("C:\\d\\a.xmd", doc("xmd", "x\n"));
    await useTabsStore.getState().openFile("C:\\d\\a.xmd");
    const a = await useTabsStore.getState().addAsset("C:\\d\\a.xmd", "Plan étage.PNG", PNG, "image/png");
    const b = await useTabsStore.getState().addAsset("C:\\d\\a.xmd", "autre.png", PNG, "image/png");
    expect(a).toMatch(/^images\/plan-etage-[0-9a-f]{8}\.png$/);
    expect(Object.keys(useTabsStore.getState().tabs[0].assets)).toHaveLength(2 - (a === b ? 1 : 0));
    const c = await useTabsStore.getState().addAsset("C:\\d\\a.xmd", "Plan étage.PNG", PNG, "image/png");
    expect(c).toBe(a);
  });

  it("convertToXmd : l'onglet pointe sur le .xmd (même clé), le texte en cours est écrit, le .md n'est pas touché", async () => {
    disk.set("C:\\d\\a.md", doc("md", "avant\n"));
    await useTabsStore.getState().openFile("C:\\d\\a.md");
    useTabsStore.getState().updateContent("C:\\d\\a.md", "avant\n\nnouveau texte\n");
    await useTabsStore.getState().convertToXmd("C:\\d\\a.md", "C:\\d\\a.xmd");
    const s = useTabsStore.getState();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]).toMatchObject({ path: "C:\\d\\a.xmd", title: "a.xmd", format: "xmd", dirty: false, key: "C:\\d\\a.md" });
    expect(s.activePath).toBe("C:\\d\\a.xmd");
    expect(s.pendingContent["C:\\d\\a.xmd"]).toBe("avant\n\nnouveau texte\n");
    expect(s.pendingContent["C:\\d\\a.md"]).toBeUndefined();
    // une seule écriture : le .xmd, avec le texte en cours (le .md d'origine n'est jamais réécrit)
    expect(written.map((w) => w.path)).toEqual(["C:\\d\\a.xmd"]);
    expect(written[0].doc.raw).toContain("nouveau texte");
  });

  it("l'enregistrement d'un onglet .xmd écrit le texte, les images et les annexes", async () => {
    disk.set("C:\\d\\a.xmd", doc("xmd", "x\n", { "images/i.png": { bytes: PNG, mime: "image/png" } }));
    await useTabsStore.getState().openFile("C:\\d\\a.xmd");
    useTabsStore.getState().updateContent("C:\\d\\a.xmd", "x modifié\n");
    await useTabsStore.getState().saveTab("C:\\d\\a.xmd");
    expect(written).toHaveLength(1);
    expect(written[0].doc.raw).toContain("x modifié");
    expect(Object.keys(written[0].doc.assets)).toEqual(["images/i.png"]);
    expect(written[0].doc.comments).toBe(EMPTY_COMMENTS);
    expect(useTabsStore.getState().tabs[0].dirty).toBe(false);
  });

  it("enregistrer sous un .md depuis un .xmd : le nouvel onglet est un .md, les images voyagent avec lui", async () => {
    disk.set("C:\\d\\a.xmd", doc("xmd", "![i](images/i.png)\n", { "images/i.png": { bytes: PNG, mime: "image/png" } }));
    await useTabsStore.getState().openFile("C:\\d\\a.xmd");
    await useTabsStore.getState().saveTabAs("C:\\d\\a.xmd", "C:\\d\\b.md");
    const tab = useTabsStore.getState().tabs.find((t) => t.path === "C:\\d\\b.md");
    expect(tab?.format).toBe("md");
    expect(Object.keys(tab!.assets)).toEqual(["images/i.png"]);
    expect(written[0].path).toBe("C:\\d\\b.md");
  });
});
