/**
 * Couche de persistance fichier : seul module autorisé à appeler les commandes
 * Tauri (invoke) pour lire/écrire le filesystem. Le reste de l'app passe par ici.
 */
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { FileNode } from "../core/types";

export async function pickWorkspaceFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Choisir le dossier de travail",
  });
  if (!selected || Array.isArray(selected)) return null;
  return selected;
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
