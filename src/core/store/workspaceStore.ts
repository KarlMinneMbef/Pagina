import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { FileNode } from "../types";
import { DEFAULT_PAGE_LAYOUT, withDocumentConfig } from "../pageLayout";
import { useTabsStore } from "./tabsStore";
import {
  pickWorkspaceFolder,
  readWorkspaceTree,
  watchWorkspace,
  createFile,
  createFolder,
  renamePath,
  deletePath,
  duplicatePath,
} from "../../persistence/fileService";

const LAST_WORKSPACE_KEY = "xmd.lastWorkspaceRoot";

interface WorkspaceState {
  root: string | null;
  tree: FileNode[];
  loading: boolean;
  error: string | null;

  openFolderPicker: () => Promise<void>;
  openWorkspace: (root: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  restoreLastWorkspace: () => Promise<void>;
  /** Crée un nouveau fichier .md (racine du workspace, ou `dirPath` pour un
   * sous-dossier) et retourne son chemin complet. */
  createNewFile: (fileName: string, dirPath?: string) => Promise<string>;
  /** Crée un nouveau sous-dossier (racine du workspace, ou `dirPath`). */
  createNewFolder: (folderName: string, dirPath?: string) => Promise<void>;
  /** Renomme un fichier ou un dossier sur disque, met à jour l'arbre et
   * propage aux onglets ouverts (chemin/titre conservés : contenu et dirty). */
  renameEntry: (from: string, to: string) => Promise<void>;
  /** Supprime un fichier ou un dossier sur disque, met à jour l'arbre et
   * ferme proprement les onglets concernés. */
  deleteEntry: (path: string) => Promise<void>;
  /** Duplique un fichier ou un dossier sur disque, met à jour l'arbre et
   * retourne le chemin de la copie. */
  duplicateEntry: (path: string) => Promise<string>;
}

export function joinPath(root: string, name: string): string {
  const sep = root.includes("\\") ? "\\" : "/";
  return root.endsWith(sep) ? `${root}${name}` : `${root}${sep}${name}`;
}

let watcherStarted: string | null = null;
let unlistenChanged: (() => void) | null = null;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  root: null,
  tree: [],
  loading: false,
  error: null,

  openFolderPicker: async () => {
    const folder = await pickWorkspaceFolder();
    if (folder) {
      await get().openWorkspace(folder);
    }
  },

  openWorkspace: async (root: string) => {
    set({ loading: true, error: null });
    try {
      const tree = await readWorkspaceTree(root);
      set({ root, tree, loading: false });
      localStorage.setItem(LAST_WORKSPACE_KEY, root);

      if (watcherStarted !== root) {
        await watchWorkspace(root);
        watcherStarted = root;
        if (unlistenChanged) unlistenChanged();
        unlistenChanged = await listen("workspace://changed", () => {
          get().refreshTree();
        });
      }
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  refreshTree: async () => {
    const { root } = get();
    if (!root) return;
    try {
      const tree = await readWorkspaceTree(root);
      set({ tree });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  restoreLastWorkspace: async () => {
    const last = localStorage.getItem(LAST_WORKSPACE_KEY);
    if (last) {
      await get().openWorkspace(last);
    }
  },

  createNewFile: async (fileName: string, dirPath?: string) => {
    const { root } = get();
    if (!root) throw new Error("Aucun dossier de travail ouvert.");
    const name = fileName.toLowerCase().endsWith(".md") || fileName.toLowerCase().endsWith(".xmd")
      ? fileName
      : `${fileName}.md`;
    const path = joinPath(dirPath ?? root, name);
    // Documente la config de mise en page utilisée à la création du fichier
    // (police, marges, format papier, en-tête/pied de page) — invisible
    // dans tout autre outil Markdown (voir pageLayout.ts).
    await createFile(path, withDocumentConfig(DEFAULT_PAGE_LAYOUT, "\n"));
    await get().refreshTree();
    return path;
  },

  createNewFolder: async (folderName: string, dirPath?: string) => {
    const { root } = get();
    if (!root) throw new Error("Aucun dossier de travail ouvert.");
    const path = joinPath(dirPath ?? root, folderName);
    await createFolder(path);
    await get().refreshTree();
  },

  renameEntry: async (from: string, to: string) => {
    await renamePath(from, to);
    // Propage aux onglets AVANT le refresh pour que le rafraîchissement de
    // l'UI ne remonte jamais un état d'onglet périmé.
    useTabsStore.getState().renameTabPaths(from, to);
    await get().refreshTree();
  },

  deleteEntry: async (path: string) => {
    await deletePath(path);
    const tabs = useTabsStore.getState();
    for (const t of [...tabs.tabs]) {
      const under =
        t.path === path || t.path.startsWith(path + "\\") || t.path.startsWith(path + "/");
      if (under) tabs.closeTab(t.path);
    }
    await get().refreshTree();
  },

  duplicateEntry: async (path: string) => {
    const newPath = await duplicatePath(path);
    await get().refreshTree();
    return newPath;
  },
}));
