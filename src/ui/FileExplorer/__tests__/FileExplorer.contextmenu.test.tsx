import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { FileNode } from "../../../core/types";
import { useWorkspaceStore } from "../../../core/store/workspaceStore";
import { useTabsStore } from "../../../core/store/tabsStore";
import { FileExplorer } from "../FileExplorer";

// On mocke le module Tauri bas niveau (pas le fileService) : les composants
// appellent les commandes via src/persistence/fileService.ts qui lui-même
// passe par invoke — mocker ici permet de vérifier les arguments réels.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

const ROOT = "C:\\ws";

// Arbre côté "disque" au format Rust (snake_case), tel que renvoyé par
// read_workspace_tree AVANT le mapping camelCase de fileService.
interface RustNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: RustNode[];
}

let diskTree: RustNode[] = [];

function cloneTree(nodes: RustNode[]): RustNode[] {
  return nodes.map((n) => ({ ...n, children: n.children ? cloneTree(n.children) : undefined }));
}

/** Applique un renommage (fichier ou dossier) dans l'arbre mocké. */
function applyRename(from: string, to: string) {
  const walk = (nodes: RustNode[]): RustNode[] =>
    nodes.map((n) => {
      const renamed = n.path === from
        ? { ...n, path: to, name: to.slice(Math.max(to.lastIndexOf("\\"), to.lastIndexOf("/")) + 1) }
        : n.path.startsWith(from + "\\") || n.path.startsWith(from + "/")
          ? { ...n, path: to + n.path.slice(from.length), name: n.name }
          : n;
      if (renamed.children) renamed.children = walk(renamed.children);
      return renamed;
    });
  diskTree = walk(diskTree);
}

/** Retire un nœud (fichier ou dossier) de l'arbre mocké. */
function applyDelete(path: string) {
  const walk = (nodes: RustNode[]): RustNode[] =>
    nodes
      .filter((n) => n.path !== path)
      .map((n) => (n.children ? { ...n, children: walk(n.children) } : n));
  diskTree = walk(diskTree);
}

/** Ajoute la copie renvoyée par duplicate_path dans l'arbre mocké. */
function applyDuplicate(path: string, newPath: string) {
  const walk = (nodes: RustNode[]): void => {
    for (const n of nodes) {
      if (n.path === path) {
        const copy: RustNode = { ...n, path: newPath, name: newPath.slice(Math.max(newPath.lastIndexOf("\\"), newPath.lastIndexOf("/")) + 1) };
        nodes.push(copy);
        return;
      }
      if (n.children) walk(n.children);
    }
  };
  walk(diskTree);
}

const C_CCTP = `${ROOT}\\cctp.md`;
const C_ALPHA = `${ROOT}\\Alpha`;
const C_NOTES = `${ROOT}\\Alpha\\notes.md`;

const INITIAL_TREE: RustNode[] = [
  { name: "cctp.md", path: C_CCTP, is_dir: false },
  { name: "Alpha", path: C_ALPHA, is_dir: true, children: [{ name: "notes.md", path: C_NOTES, is_dir: false }] },
];

beforeEach(() => {
  vi.clearAllMocks();
  diskTree = cloneTree(INITIAL_TREE);
  localStorage.clear();
  useTabsStore.setState({ tabs: [], activePath: null, pendingContent: {} });
  useWorkspaceStore.setState({ root: ROOT, tree: toFront(diskTree), loading: false, error: null });

  invokeMock.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    switch (cmd) {
      case "read_workspace_tree":
        return cloneTree(diskTree);
      case "read_text_file":
        return "# Contenu initial\n";
      case "write_text_file":
      case "create_file":
      case "create_folder":
        return null;
      case "rename_path":
        applyRename(args.from as string, args.to as string);
        return null;
      case "delete_path":
        applyDelete(args.path as string);
        return null;
      case "duplicate_path": {
        const path = args.path as string;
        const dot = path.lastIndexOf(".");
        const newPath = dot > 0 ? `${path.slice(0, dot)} (copie)${path.slice(dot)}` : `${path} (copie)`;
        applyDuplicate(path, newPath);
        return newPath;
      }
      default:
        throw new Error(`commande inattendue : ${cmd}`);
    }
  });
});

function toFront(nodes: RustNode[]): FileNode[] {
  return nodes.map((n) => ({
    name: n.name,
    path: n.path,
    isDir: n.is_dir,
    children: n.children ? toFront(n.children) : undefined,
  }));
}

function setup() {
  return render(<FileExplorer onOpenFile={() => {}} />);
}

/** Ouvre le menu contextuel sur la ligne portant ce nom. */
function openMenuOn(name: string) {
  fireEvent.contextMenu(screen.getByText(name));
}

const MENU_ITEMS = ["Nouveau fichier", "Nouveau dossier", "Renommer", "Dupliquer", "Supprimer"];

describe("FileExplorer — menu contextuel", () => {
  it("clic droit sur un dossier : 5 actions ; sur un fichier : 3 actions", () => {
    setup();

    openMenuOn("Alpha");
    MENU_ITEMS.forEach((label) => expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();

    openMenuOn("cctp.md");
    ["Renommer", "Dupliquer", "Supprimer"].forEach((label) =>
      expect(screen.getByRole("menuitem", { name: label })).toBeInTheDocument()
    );
    expect(screen.queryByRole("menuitem", { name: "Nouveau fichier" })).not.toBeInTheDocument();
  });

  it("clic droit sur le fond de l'arbre : création à la racine uniquement", () => {
    setup();
    fireEvent.contextMenu(screen.getByRole("button", { name: "Ouvrir…" }).parentElement as never); // n'importe où hors des lignes
    // Le fond de l'arbre : l'évènement part de fx-body lui-même.
    const body = document.querySelector(".fx-body") as HTMLElement;
    fireEvent.contextMenu(body);
    expect(screen.getByRole("menuitem", { name: "Nouveau fichier" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Nouveau dossier" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Renommer" })).not.toBeInTheDocument();
  });

  it("renommage avec caractère invalide : erreur affichée, aucun appel à rename_path", async () => {
    setup();
    openMenuOn("cctp.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "Renommer" }));

    const input = screen.getByLabelText("Nom") as HTMLInputElement;
    expect(input.value).toBe("cctp.md");
    fireEvent.change(input, { target: { value: "in:valide?.md" } });
    fireEvent.click(screen.getByRole("button", { name: "Renommer" }));

    expect(screen.getByRole("alert").textContent).toContain("Caractères interdits");
    expect(invokeMock).not.toHaveBeenCalledWith("rename_path", expect.anything());
    // Le dialogue reste ouvert pour corriger.
    expect(screen.getByLabelText("Nom")).toBeInTheDocument();
  });

  it("renommage valide : rename_path appelé avec les bons arguments, arbre rafraîchi, onglet mis à jour (contenu et dirty conservés)", async () => {
    // Onglet ouvert et modifié sur cctp.md.
    await useTabsStore.getState().openFile(C_CCTP);
    useTabsStore.getState().updateContent(C_CCTP, "# Modifié\n");
    expect(useTabsStore.getState().tabs[0].dirty).toBe(true);

    setup();
    openMenuOn("cctp.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "Renommer" }));

    const input = screen.getByLabelText("Nom");
    fireEvent.change(input, { target: { value: "cctp-renommé.md" } });
    fireEvent.click(screen.getByRole("button", { name: "Renommer" }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("rename_path", { from: C_CCTP, to: `${ROOT}\\cctp-renommé.md` });
    });
    // Arbre rafraîchi : la nouvelle ligne est visible.
    await waitFor(() => expect(screen.getByText("cctp-renommé.md")).toBeInTheDocument());
    // Onglet mis à jour : nouveau chemin/titre, contenu et dirty conservés.
    const tab = useTabsStore.getState().tabs[0];
    expect(tab.path).toBe(`${ROOT}\\cctp-renommé.md`);
    expect(tab.title).toBe("cctp-renommé.md");
    expect(tab.content).toBe("# Contenu initial\n");
    expect(tab.dirty).toBe(true);
  });

  it("suppression d'un fichier avec onglet dirty : confirmation demandée avant fermeture de l'onglet", async () => {
    await useTabsStore.getState().openFile(C_CCTP);
    useTabsStore.getState().updateContent(C_CCTP, "# Modifié\n");

    setup();
    openMenuOn("cctp.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "Supprimer" }));

    // Confirmation affichée, avertissement dirty, onglet ENCORE ouvert,
    // rien supprimé tant qu'on ne confirme pas.
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/modifications non enregistrées/)).toBeInTheDocument();
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(invokeMock).not.toHaveBeenCalledWith("delete_path", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("delete_path", { path: C_CCTP });
    });
    // L'onglet du fichier supprimé a été fermé proprement.
    await waitFor(() => expect(useTabsStore.getState().tabs).toHaveLength(0));
  });

  it("le menu se ferme au clic extérieur et à Échap", () => {
    setup();
    openMenuOn("cctp.md");
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);

    fireEvent.keyDown(screen.getAllByRole("menuitem")[0], { key: "Escape" });
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();

    openMenuOn("Alpha");
    expect(screen.getAllByRole("menuitem")).toHaveLength(5);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
  });

  it("navigation clavier dans le menu : flèches déplacent le focus", () => {
    setup();
    openMenuOn("Alpha");
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(items[1], { key: "ArrowDown" });
    expect(items[2]).toHaveFocus();
    fireEvent.keyDown(items[2], { key: "ArrowUp" });
    expect(items[1]).toHaveFocus();
  });

  it("duplication d'un fichier : duplicate_path appelé puis arbre rafraîchi", async () => {
    setup();
    openMenuOn("cctp.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "Dupliquer" }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("duplicate_path", { path: C_CCTP });
    });
    // read_workspace_tree a été appelé pour rafraîchir l'arbre.
    await waitFor(() => {
      const calls = invokeMock.mock.calls.filter(([cmd]) => cmd === "read_workspace_tree");
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
