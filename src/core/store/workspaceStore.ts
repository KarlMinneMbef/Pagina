import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { FileNode } from "../types";
import { DEFAULT_PAGE_LAYOUT, withDocumentConfig } from "../pageLayout";
import {
  pickWorkspaceFolder,
  readWorkspaceTree,
  watchWorkspace,
  createFile,
  createFolder,
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
  /** Crée un nouveau fichier .md à la racine du workspace et retourne son chemin. */
  createNewFile: (fileName: string) => Promise<string>;
  /** Crée un nouveau sous-dossier à la racine du workspace. */
  createNewFolder: (folderName: string) => Promise<void>;
}

function joinPath(root: string, name: string): string {
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

  createNewFile: async (fileName: string) => {
    const { root } = get();
    if (!root) throw new Error("Aucun dossier de travail ouvert.");
    const name = fileName.toLowerCase().endsWith(".md") || fileName.toLowerCase().endsWith(".xmd")
      ? fileName
      : `${fileName}.md`;
    const path = joinPath(root, name);
    // Documente la config de mise en page utilisée à la création du fichier
    // (police, marges, format papier, en-tête/pied de page) — invisible
    // dans tout autre outil Markdown (voir pageLayout.ts).
    await createFile(path, withDocumentConfig(DEFAULT_PAGE_LAYOUT, "\n"));
    await get().refreshTree();
    return path;
  },

  createNewFolder: async (folderName: string) => {
    const { root } = get();
    if (!root) throw new Error("Aucun dossier de travail ouvert.");
    const path = joinPath(root, folderName);
    await createFolder(path);
    await get().refreshTree();
  },
}));
