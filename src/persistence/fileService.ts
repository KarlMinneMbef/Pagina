/**
 * Couche de persistance fichier : seul module autorisé à appeler les commandes
 * Tauri (invoke) pour lire/écrire le filesystem. Le reste de l'app passe par ici.
 */
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { FileNode } from "../core/types";

const MARKDOWN_FILTERS = [{ name: "Markdown", extensions: ["md", "xmd"] }];

export async function pickWorkspaceFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choisir le dossier de travail",
  });
  if (!selected || Array.isArray(selected)) return null;
  return selected;
}

/** Ouvre un ou plusieurs fichiers `.md`/`.xmd` directement, sans dépendre
 * d'un dossier de travail déjà ouvert — `tabsStore.openFile` accepte
 * n'importe quel chemin absolu. */
export async function pickFiles(): Promise<string[]> {
  const selected = await open({
    directory: false,
    multiple: true,
    filters: MARKDOWN_FILTERS,
    title: "Ouvrir un ou plusieurs fichiers",
  });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

/** Boîte de dialogue "Enregistrer sous" — retourne le chemin choisi, ou
 * `null` si l'utilisateur annule. N'écrit rien elle-même (voir
 * `tabsStore.saveTabAs`, qui appelle ensuite `writeTextFile`). */
export async function pickSaveLocation(defaultName: string): Promise<string | null> {
  return save({
    defaultPath: defaultName,
    filters: MARKDOWN_FILTERS,
    title: "Enregistrer sous",
  });
}

/** Fichiers `.md`/`.xmd` passés en argument au tout premier lancement de
 * l'app (double-clic depuis l'Explorateur Windows) — à appeler une seule
 * fois au montage de l'app, voir `startup_files.rs` côté Rust pour le
 * pourquoi (un second lancement pendant que l'app tourne déjà arrive plutôt
 * via l'évènement `"open-files"`, écouté séparément). */
export async function getStartupFiles(): Promise<string[]> {
  return invoke<string[]>("pending_open_files");
}

export async function readWorkspaceTree(root: string): Promise<FileNode[]> {
  const nodes = await invoke<RustFileNode[]>("read_workspace_tree", { root });
  return nodes.map(fromRustNode);
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  return invoke("write_text_file", { path, content });
}

export async function createFile(path: string, content = ""): Promise<void> {
  return invoke("create_file", { path, content });
}

export async function createFolder(path: string): Promise<void> {
  return invoke("create_folder", { path });
}

export async function renamePath(from: string, to: string): Promise<void> {
  return invoke("rename_path", { from, to });
}

export async function deletePath(path: string): Promise<void> {
  return invoke("delete_path", { path });
}

export async function duplicatePath(path: string): Promise<string> {
  return invoke<string>("duplicate_path", { path });
}

export async function watchWorkspace(root: string): Promise<void> {
  return invoke("watch_workspace", { root });
}

/**
 * Ouvre la boîte de dialogue d'impression système. N'utilise PAS
 * `window.print()` : sur cette version de Tauri/wry (Windows/WebView2),
 * `window.print()` ne fait jamais rien de visible (Tauri réinjecte son
 * propre `window.print` qui boucle indéfiniment sur lui-même sans jamais
 * atteindre un appel natif réel — voir `src-tauri/src/print_commands.rs`
 * pour l'explication complète). La commande Rust `print_window` appelle
 * directement l'API COM native WebView2 (`ICoreWebView2_16::ShowPrintUI`),
 * en contournant complètement ce bug.
 */
export async function printWindow(): Promise<void> {
  return invoke("print_window");
}

// --- mapping snake_case (Rust/serde) -> camelCase (TS) ---
interface RustFileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: RustFileNode[];
}

function fromRustNode(n: RustFileNode): FileNode {
  return {
    name: n.name,
    path: n.path,
    isDir: n.is_dir,
    children: n.children ? n.children.map(fromRustNode) : undefined,
  };
}
