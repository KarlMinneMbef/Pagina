/**
 * Couche de persistance fichier : seul module autorisé à appeler les commandes
 * Tauri (invoke) pour lire/écrire le filesystem. Le reste de l'app passe par ici.
 */
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { FileNode } from "../core/types";

const MARKDOWN_FILTERS = [{ name: "Markdown", extensions: ["md", "xmd"] }];

/** Ouvre le sélecteur natif de dossier de travail ; null si annulé. */
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

/** Sélecteur natif « Enregistrer » pour EXPORTER un modèle de page de
 *  garde (voir core/coverTemplates.ts) ; null si annulé. */
export async function pickCoverTemplateSaveLocation(defaultName: string): Promise<string | null> {
  const COVER_FILTERS = [{ name: "Modèle de page de garde Pagina", extensions: ["json"] }];
  return save({
    defaultPath: defaultName,
    filters: COVER_FILTERS,
    title: "Exporter le modèle de page de garde",
  });
}

/** Sélecteur natif « Ouvrir » pour IMPORTER un modèle de page de garde
 *  exporté depuis un autre poste ; null si annulé. */
export async function pickCoverTemplateFile(): Promise<string | null> {
  const COVER_FILTERS = [{ name: "Modèle de page de garde Pagina", extensions: ["json"] }];
  const selected = await open({
    directory: false,
    multiple: false,
    filters: COVER_FILTERS,
    title: "Importer un modèle de page de garde",
  });
  if (!selected || Array.isArray(selected)) return null;
  return selected;
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

/** Lit l'arborescence complète du dossier de travail (commande Rust). */
export async function readWorkspaceTree(root: string): Promise<FileNode[]> {
  const nodes = await invoke<RustFileNode[]>("read_workspace_tree", { root });
  return nodes.map(fromRustNode);
}

/** Lit un fichier texte (UTF-8). */
export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

/** Écrit un fichier texte (UTF-8), écrase sans confirmation. */
export async function writeTextFile(path: string, content: string): Promise<void> {
  return invoke("write_text_file", { path, content });
}

/** Crée un fichier (vide par défaut). */
export async function createFile(path: string, content = ""): Promise<void> {
  return invoke("create_file", { path, content });
}

/** Crée un dossier. */
export async function createFolder(path: string): Promise<void> {
  return invoke("create_folder", { path });
}

/** Renomme/déplace un fichier ou un dossier. */
export async function renamePath(from: string, to: string): Promise<void> {
  return invoke("rename_path", { from, to });
}

/** Supprime un fichier ou un dossier. */
export async function deletePath(path: string): Promise<void> {
  return invoke("delete_path", { path });
}

/** Duplique un fichier et renvoie le chemin de la copie. */
export async function duplicatePath(path: string): Promise<string> {
  return invoke<string>("duplicate_path", { path });
}

/** Démarre le watcher Rust du dossier de travail (changements externes). */
export async function watchWorkspace(root: string): Promise<void> {
  return invoke("watch_workspace", { root });
}

/** Arrête le watcher courant (appelé avant watch_workspace du NOUVEAU
 * dossier lors d'un changement de workspace — l'ancien watcher Rust
 * resterait sinon actif sur un dossier qui n'est plus affiché). */
export async function unwatchWorkspace(): Promise<void> {
  return invoke("unwatch_workspace");
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

/** Boîte de dialogue "Enregistrer sous" pour l'export PDF — retourne le
 * chemin choisi, ou `null` si l'utilisateur annule. */
export async function pickPdfSaveLocation(defaultName: string): Promise<string | null> {
  return save({
    defaultPath: defaultName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    title: "Exporter en PDF",
  });
}

/**
 * Export PDF DIRECT (pas de boîte de dialogue d'impression système) —
 * écrit un PDF sur disque à `path` en se basant sur le même rendu
 * `@media print`/`@page` que l'impression (voir `printWindow` ci-dessus),
 * via l'API COM native WebView2 `ICoreWebView2_7::PrintToPdf`
 * (`src-tauri/src/print_commands.rs`) — aucun passage par la boîte de
 * dialogue système, contrairement à "Imprimer > Enregistrer au format PDF".
 */
export async function exportPdf(path: string): Promise<void> {
  return invoke("export_pdf", { path });
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
