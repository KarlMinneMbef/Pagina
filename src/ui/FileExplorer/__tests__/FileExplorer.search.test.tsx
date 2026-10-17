import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { FileNode } from "../../../core/types";
import { useWorkspaceStore } from "../../../core/store/workspaceStore";
import { FileExplorer } from "../FileExplorer";

const ROOT = "C:\\ws";

function file(name: string, path: string): FileNode {
  return { name, path, isDir: false };
}
function dir(name: string, path: string, children: FileNode[]): FileNode {
  return { name, path, isDir: true, children };
}

const TREE: FileNode[] = [
  file("cctp.md", `${ROOT}\\cctp.md`),
  file("readme.md", `${ROOT}\\readme.md`),
  dir("Alpha", `${ROOT}\\Alpha`, [
    file("notes.md", `${ROOT}\\Alpha\\notes.md`),
    file("CCTP v2.md", `${ROOT}\\Alpha\\CCTP v2.md`),
  ]),
  dir("Beta", `${ROOT}\\Beta`, [file("rapport.md", `${ROOT}\\Beta\\rapport.md`)]),
];

function setTree(nodes: FileNode[], root = ROOT) {
  useWorkspaceStore.setState({ root, tree: nodes, loading: false, error: null });
}

function setup(nodes: FileNode[] = TREE) {
  setTree(nodes);
  return render(<FileExplorer onOpenFile={() => {}} />);
}

function typeSearch(value: string) {
  fireEvent.change(screen.getByPlaceholderText("Rechercher un fichier…"), {
    target: { value },
  });
  act(() => {
    vi.advanceTimersByTime(150);
  });
}

describe("FileExplorer — recherche dans l'arborescence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ne montre que les nœuds dont le nom contient la requête, casse indifférente, en profondeur", () => {
    setup();
    // Avant recherche : tout est visible (dossiers de premier niveau dépliés).
    expect(screen.getByText("readme.md")).toBeInTheDocument();

    typeSearch("cctp");

    expect(screen.getByText("cctp.md")).toBeInTheDocument();
    // Fichier dans un sous-dossier, trouvé par la vue aplatie, avec son
    // chemin relatif en second.
    expect(screen.getByText("CCTP v2.md")).toBeInTheDocument();
    expect(screen.getByText(`Alpha\\CCTP v2.md`)).toBeInTheDocument();
    expect(screen.queryByText("readme.md")).not.toBeInTheDocument();
    expect(screen.queryByText("notes.md")).not.toBeInTheDocument();
    expect(screen.queryByText("rapport.md")).not.toBeInTheDocument();
  });

  it("affiche le chemin relatif en second sur une correspondance", () => {
    setup();
    typeSearch("rapport");
    expect(screen.getByText("rapport.md")).toBeInTheDocument();
    expect(screen.getByText(`Beta\\rapport.md`)).toBeInTheDocument();
  });

  it("revient à l'arbre complet au vidage du champ en préservant l'état déplié", () => {
    setup();

    // Replie Alpha (déplié par défaut au premier niveau), laisse Beta déplié.
    fireEvent.click(screen.getByText("Alpha"));
    expect(screen.queryByText("notes.md")).not.toBeInTheDocument();

    typeSearch("notes");
    expect(screen.getByText("notes.md")).toBeInTheDocument();

    // Champ vidé : retour à l'arbre normal.
    typeSearch("");
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    // Alpha est resté replié, Beta est resté déplié.
    expect(screen.queryByText("notes.md")).not.toBeInTheDocument();
    expect(screen.getByText("rapport.md")).toBeInTheDocument();
  });

  it("affiche un message d'absence de résultat quand rien ne correspond", () => {
    setup();
    typeSearch("zzzinconnu");
    expect(
      screen.getByText(/Aucun résultat pour « zzzinconnu »/)
    ).toBeInTheDocument();
    expect(screen.queryByText("cctp.md")).not.toBeInTheDocument();
  });

  it("Échap vide la recherche et rend l'arbre normal immédiatement", () => {
    setup();
    const input = screen.getByPlaceholderText(
      "Rechercher un fichier…"
    ) as HTMLInputElement;
    typeSearch("cctp");
    expect(screen.queryByText("readme.md")).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    // Pas besoin d'attendre le debounce : Échap vide immédiatement.
    expect(screen.getByText("readme.md")).toBeInTheDocument();
  });
});
