import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { FileNode } from "../../../core/types";
import { useWorkspaceStore } from "../../../core/store/workspaceStore";
import { FileExplorer } from "../FileExplorer";

const ROOT = "C:\\ws";
const C_CCTP = `${ROOT}\\cctp.md`;
const C_ALPHA = `${ROOT}\\Alpha`;
const C_NOTES = `${ROOT}\\Alpha\\notes.md`;

const TREE: FileNode[] = [
  {
    name: "Alpha",
    path: C_ALPHA,
    isDir: true,
    children: [{ name: "notes.md", path: C_NOTES, isDir: false }],
  },
  { name: "cctp.md", path: C_CCTP, isDir: false },
];

beforeEach(() => {
  useWorkspaceStore.setState({ root: ROOT, tree: TREE, loading: false, error: null });
});

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest(".fx-row") as HTMLElement;
}

function setup() {
  const onOpenFile = { calls: [] as string[] };
  const openFile = (path: string) => {
    onOpenFile.calls.push(path);
  };
  render(<FileExplorer onOpenFile={openFile} />);
  return {
    onOpenFile,
    body: document.querySelector(".fx-body") as HTMLElement,
  };
}

describe("FileExplorer — ergonomie clavier et double-clic", () => {
  it("double-clic sur un fichier : openFile appelé une seule fois avec le bon chemin", () => {
    const { onOpenFile } = setup();
    fireEvent.doubleClick(rowOf("cctp.md"));
    expect(onOpenFile.calls).toEqual([C_CCTP]);

    fireEvent.doubleClick(rowOf("notes.md"));
    expect(onOpenFile.calls).toEqual([C_CCTP, C_NOTES]);
  });

  it("le simple clic sur un fichier ne fait que sélectionner (pas d'ouverture)", () => {
    const { onOpenFile } = setup();
    fireEvent.click(rowOf("cctp.md"));
    expect(onOpenFile.calls).toEqual([]);
    expect(rowOf("cctp.md").className).toContain("fx-row-selected");
  });

  it("Suppr sur un fichier sélectionné : modale de confirmation affichée", () => {
    const { body } = setup();
    fireEvent.click(rowOf("cctp.md"));
    fireEvent.keyDown(body, { key: "Delete" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/Supprimer « cctp\.md »/)).toBeInTheDocument();
    // Annulation : rien ne se passe.
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("F2 : boîte de renommage ouverte sur l'élément sélectionné", () => {
    const { body } = setup();
    fireEvent.click(rowOf("cctp.md"));
    fireEvent.keyDown(body, { key: "F2" });
    const input = screen.getByLabelText("Nom") as HTMLInputElement;
    expect(input.value).toBe("cctp.md");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // F2 sur un DOSSIER sélectionné fonctionne aussi.
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.click(rowOf("Alpha"));
    fireEvent.keyDown(body, { key: "F2" });
    expect((screen.getByLabelText("Nom") as HTMLInputElement).value).toBe("Alpha");
  });

  it("flèches haut/bas déplacent la sélection ; Entrée ouvre un fichier et déplie/replie un dossier", () => {
    const { body, onOpenFile } = setup();
    // Ordre visible : Alpha (déplié par défaut), notes.md, cctp.md.
    expect(within(rowOf("notes.md")).queryByText("notes.md")).toBeInTheDocument();

    fireEvent.keyDown(body, { key: "ArrowDown" });
    expect(rowOf("Alpha").className).toContain("fx-row-selected");

    fireEvent.keyDown(body, { key: "Enter" });
    // Entrée sur Alpha le replie.
    expect(screen.queryByText("notes.md")).not.toBeInTheDocument();

    fireEvent.keyDown(body, { key: "Enter" });
    // Entrée sur Alpha le replie/déplie à nouveau.
    expect(screen.queryByText("notes.md")).toBeInTheDocument();

    fireEvent.keyDown(body, { key: "ArrowDown" }); // notes.md
    expect(rowOf("notes.md").className).toContain("fx-row-selected");
    fireEvent.keyDown(body, { key: "ArrowDown" }); // cctp.md
    expect(rowOf("cctp.md").className).toContain("fx-row-selected");
    fireEvent.keyDown(body, { key: "ArrowUp" }); // retour notes.md
    expect(rowOf("notes.md").className).toContain("fx-row-selected");
    expect(rowOf("cctp.md").className).not.toContain("fx-row-selected");

    fireEvent.keyDown(body, { key: "Enter" });
    expect(onOpenFile.calls).toEqual([C_NOTES]);
  });

  it("la sélection clavier fonctionne aussi en mode recherche aplatie", () => {
    const { body, onOpenFile } = setup();
    fireEvent.change(screen.getByPlaceholderText("Rechercher un fichier…"), {
      target: { value: "notes" },
    });
    // pas de fake timers ici : on attend le debounce réel (150 ms).
    return new Promise((resolve) => setTimeout(resolve, 220)).then(() => {
      fireEvent.keyDown(body, { key: "ArrowDown" });
      expect(rowOf("notes.md").className).toContain("fx-row-selected");
      fireEvent.keyDown(body, { key: "Enter" });
      expect(onOpenFile.calls).toEqual([C_NOTES]);
    });
  });
});
