import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import type { FileNode } from "../../../core/types";
import { useWorkspaceStore } from "../../../core/store/workspaceStore";
import { FileExplorer } from "../FileExplorer";

const ROOT = "C:\\Dossiers très longs\\Un chemin de workspace assez long pour tronquer visuellement";

const TREE: FileNode[] = [
  { name: "guide.md", path: `${ROOT}\\guide.md`, isDir: false },
  {
    name: "Rapports",
    path: `${ROOT}\\Rapports`,
    isDir: true,
    children: [
      { name: "cctp.md", path: `${ROOT}\\Rapports\\cctp.md`, isDir: false },
      { name: "annexes", path: `${ROOT}\\Rapports\\annexes`, isDir: true, children: [] },
    ],
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  useWorkspaceStore.setState({ root: ROOT, tree: TREE, loading: false, error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FileExplorer — tooltip chemin complet", () => {
  it("chaque ligne rendue porte un title égal au chemin absolu du nœud", () => {
    const { container } = render(<FileExplorer onOpenFile={() => {}} />);
    // Alpha/Rapports est déplié par défaut : les 4 nœuds sont rendus.
    const rows = Array.from(container.querySelectorAll(".fx-row")) as HTMLElement[];
    expect(rows).toHaveLength(4);
    const paths = rows.map((r) => r.getAttribute("title"));
    expect(paths).toContain(`${ROOT}\\guide.md`);
    expect(paths).toContain(`${ROOT}\\Rapports`);
    expect(paths).toContain(`${ROOT}\\Rapports\\cctp.md`);
    expect(paths).toContain(`${ROOT}\\Rapports\\annexes`);
  });

  it("les lignes de la vue aplatie de recherche portent aussi le chemin complet", () => {
    const { container } = render(<FileExplorer onOpenFile={() => {}} />);
    fireEvent.change(container.querySelector(".fx-search-input") as HTMLInputElement, {
      target: { value: "cctp" },
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    const rows = Array.from(container.querySelectorAll(".fx-row")) as HTMLElement[];
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("title")).toBe(`${ROOT}\\Rapports\\cctp.md`);
  });
});
