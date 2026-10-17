import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { FileNode } from "../../../core/types";
import { useWorkspaceStore, sortTree } from "../../../core/store/workspaceStore";
import { FileExplorer } from "../FileExplorer";

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
const f = (name: string): FileNode => ({ name, path: `${ROOT}\\${name}`, isDir: false });
const d = (name: string, children: FileNode[]): FileNode => ({
  name,
  path: `${ROOT}\\${name}`,
  isDir: true,
  children,
});

describe("sortTree (tri d'affichage de l'arborescence)", () => {
  it("dossiers avant fichiers, puis alphabétique insensible à la casse et aux accents", () => {
    const out = sortTree([f("zébu.md"), d("Alpha", []), f("algo.md"), d("Beta", [])]);
    expect(out.map((n) => n.name)).toEqual(["Alpha", "Beta", "algo.md", "zébu.md"]);
  });

  it("« CCTP.md » est trié à côté de « cctp v2.md » (casse indifférente)", () => {
    const out = sortTree([f("cctp v2.md"), f("Alpha2.md"), f("CCTP.md")]);
    const names = out.map((n) => n.name);
    // L'ordre exact entre les deux dépend du traitement ICU des espaces/
    // ponctuation ; l'exigence est l'ADJACENCE (casse ignorée).
    expect(Math.abs(names.indexOf("CCTP.md") - names.indexOf("cctp v2.md"))).toBe(1);
  });

  it("é ≈ e : accents ignorés dans l'ordre (collator francophone)", () => {
    const out = sortTree([f("ève.md"), f("ezo.md"), f("ecrevisse.md")]);
    expect(out.map((n) => n.name)).toEqual(["ecrevisse.md", "ève.md", "ezo.md"]);
  });

  it("tri récursif à toutes les profondeurs", () => {
    const out = sortTree([
      d("Zoulou", [f("b.md"), d("SousB", []), f("a.md"), d("SousA", [])]),
    ]);
    const zoulou = out[0];
    expect(zoulou.children?.map((n) => n.name)).toEqual(["SousA", "SousB", "a.md", "b.md"]);
  });
});

describe("FileExplorer — ordre de rendu trié", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("l'arbre rafraîchi est rendu trié : [zébu.md, Alpha/, algo.md, Beta/] → Alpha/, Beta/, algo.md, zébu.md", async () => {
    // Le "disque" renvoie volontairement un arbre NON trié.
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "read_workspace_tree") {
        return [
          { name: "zébu.md", path: `${ROOT}\\zébu.md`, is_dir: false },
          { name: "Alpha", path: `${ROOT}\\Alpha`, is_dir: true, children: [] },
          { name: "algo.md", path: `${ROOT}\\algo.md`, is_dir: false },
          { name: "Beta", path: `${ROOT}\\Beta`, is_dir: true, children: [] },
        ];
      }
      return null;
    });
    useWorkspaceStore.setState({ root: ROOT, tree: [], loading: false, error: null });
    await useWorkspaceStore.getState().refreshTree();

    render(<FileExplorer onOpenFile={() => {}} />);
    const names = Array.from(document.querySelectorAll(".fx-row .fx-name")).map(
      (e) => e.textContent
    );
    expect(names).toEqual(["Alpha", "Beta", "algo.md", "zébu.md"]);
  });

  it("la vue aplatie de recherche est triée elle aussi", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "read_workspace_tree") {
        return [
          { name: "Zeta.md", path: `${ROOT}\\Zeta.md`, is_dir: false },
          { name: "alpha", path: `${ROOT}\\alpha`, is_dir: true, children: [
            { name: "b cctp.md", path: `${ROOT}\\alpha\\b cctp.md`, is_dir: false },
          ] },
          { name: "a cctp.md", path: `${ROOT}\\a cctp.md`, is_dir: false },
        ];
      }
      return null;
    });
    useWorkspaceStore.setState({ root: ROOT, tree: [], loading: false, error: null });
    await useWorkspaceStore.getState().refreshTree();

    render(<FileExplorer onOpenFile={() => {}} />);
    // La recherche "cctp" : vue aplatie triée par nom, insensible casse.
    const input = screen.getByPlaceholderText("Rechercher un fichier…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "cctp" } });

    await vi.waitFor(
      () => {
        const names = Array.from(document.querySelectorAll(".fx-row .fx-name")).map(
          (e) => e.textContent
        );
        expect(names).toEqual(["a cctp.md", "b cctp.md"]);
      },
      { timeout: 1000 }
    );
  });
});
