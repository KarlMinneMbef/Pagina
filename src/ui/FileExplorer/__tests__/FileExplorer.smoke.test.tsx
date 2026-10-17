import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileExplorer } from "../FileExplorer";

describe("FileExplorer (smoke)", () => {
  it("affiche l'en-tête et l'état vide sans dossier ouvert", () => {
    render(<FileExplorer onOpenFile={() => {}} />);
    expect(screen.getByText("Explorateur")).toBeInTheDocument();
    expect(
      screen.getByText("Aucun dossier ouvert. Cliquez sur « Ouvrir… ».")
    ).toBeInTheDocument();
  });
});
