/**
 * État des onglets ouverts (couche "état du document").
 * Ne dépend d'aucune bibliothèque d'édition (pas de Tiptap ici) : le contenu
 * texte (Markdown) est la seule source de vérité persistée par onglet.
 */
import { create } from "zustand";
import { isEditableDocument } from "../types";
import { readTextFile, writeTextFile } from "../../persistence/fileService";
import { extractDocumentConfig, withDocumentConfig, type PageLayoutSettings } from "../pageLayout";

export interface EditorTab {
  path: string;
  title: string;
  content: string; // dernier contenu markdown sauvegardé (ou chargé) — SANS le commentaire de config (voir pageLayout.ts)
  dirty: boolean;
  layout: PageLayoutSettings;
}

const LAST_TABS_KEY = "xmd.openTabs";
const LAST_ACTIVE_KEY = "xmd.activeTab";

// Évite qu'un même fichier soit ouvert deux fois lors d'appels concurrents à
// openFile (ex. double-clic, ou double montage des effets en StrictMode) :
// deux appels sur le même chemin partagent la même promesse de lecture.
const inFlightOpens = new Map<string, Promise<void>>();

function titleFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

interface TabsState {
  tabs: EditorTab[];
  activePath: string | null;
  pendingContent: Record<string, string>; // contenu en cours d'édition (non sauvegardé) par onglet

  openFile: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  updateLayout: (path: string, layout: PageLayoutSettings) => void;
  saveTab: (path: string) => Promise<void>;
  restoreSession: () => Promise<void>;
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activePath: null,
  pendingContent: {},

  openFile: async (path: string) => {
    if (!isEditableDocument(path)) return;
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activePath: path });
      persist(get());
      return;
    }

    const alreadyLoading = inFlightOpens.get(path);
    if (alreadyLoading) {
      await alreadyLoading;
      set({ activePath: path });
      persist(get());
      return;
    }

    const loadPromise = (async () => {
      const raw = await readTextFile(path);
      // Revérifier après l'attente : un appel concurrent a pu créer l'onglet entre-temps.
      if (get().tabs.some((t) => t.path === path)) return;
      // Le commentaire de config (voir pageLayout.ts) est extrait ICI, avant
      // que le contenu n'atteigne jamais l'éditeur Tiptap — un HTML comment
      // n'a pas de nœud de schéma dédié et disparaîtrait silencieusement au
      // premier aller-retour markdown si on le laissait dans `content`.
      const { layout, content } = extractDocumentConfig(raw);
      const tab: EditorTab = { path, title: titleFromPath(path), content, dirty: false, layout };
      set((s) => ({
        tabs: [...s.tabs, tab],
        activePath: path,
        pendingContent: { ...s.pendingContent, [path]: content },
      }));
      persist(get());
    })();

    inFlightOpens.set(path, loadPromise);
    try {
      await loadPromise;
    } finally {
      inFlightOpens.delete(path);
    }
    set({ activePath: path });
    persist(get());
  },

  closeTab: (path: string) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      const { [path]: _removed, ...pendingContent } = s.pendingContent;
      let activePath = s.activePath;
      if (activePath === path) {
        activePath = tabs.length > 0 ? tabs[tabs.length - 1].path : null;
      }
      return { tabs, activePath, pendingContent };
    });
    persist(get());
  },

  setActive: (path: string) => {
    set({ activePath: path });
    persist(get());
  },

  updateContent: (path: string, content: string) => {
    set((s) => ({
      pendingContent: { ...s.pendingContent, [path]: content },
      tabs: s.tabs.map((t) =>
        t.path === path ? { ...t, dirty: content !== t.content } : t
      ),
    }));
  },

  updateLayout: (path: string, layout: PageLayoutSettings) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, layout, dirty: true } : t)),
    }));
  },

  saveTab: async (path: string) => {
    const { pendingContent, tabs } = get();
    const content = pendingContent[path];
    const tab = tabs.find((t) => t.path === path);
    if (content === undefined || !tab) return;
    // Le commentaire de config est réinjecté ICI, juste avant l'écriture
    // disque — jamais porté par l'éditeur (voir pageLayout.ts).
    await writeTextFile(path, withDocumentConfig(tab.layout, content));
    set({
      tabs: tabs.map((t) => (t.path === path ? { ...t, content, dirty: false } : t)),
    });
  },

  restoreSession: async () => {
    const raw = localStorage.getItem(LAST_TABS_KEY);
    const activeSaved = localStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) return;
    try {
      const paths: string[] = JSON.parse(raw);
      for (const p of paths) {
        try {
          await get().openFile(p);
        } catch {
          // fichier peut-être supprimé/déplacé depuis : on l'ignore silencieusement
        }
      }
      if (activeSaved && get().tabs.some((t) => t.path === activeSaved)) {
        set({ activePath: activeSaved });
      }
    } catch {
      // session corrompue : on ignore
    }
  },
}));

function persist(state: TabsState) {
  localStorage.setItem(LAST_TABS_KEY, JSON.stringify(state.tabs.map((t) => t.path)));
  if (state.activePath) {
    localStorage.setItem(LAST_ACTIVE_KEY, state.activePath);
  }
}
