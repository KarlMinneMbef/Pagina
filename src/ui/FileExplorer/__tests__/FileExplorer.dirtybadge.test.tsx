import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import type { FileNode } from "../../../core/types";
import { useWorkspaceStore } from "../../../core/store/workspaceStore";
import { useTabsStore } from "../../../core/store/tabsStore";
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
const C_CCTP = `${ROOT}\\cctp.md`;
const C_NOTES = `${ROOT}\\Alpha\\notes.md`;

const TREE: FileNode[] = [
  { name: "cctp.md", path: C_CCTP, isDir: false },
  { name: "Alpha", path: `${ROOT}\\Alpha`, isDir: true, children: [{ name: "notes.md", path: C_NOTES, isDir: false }] },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useTabsStore.setState({ tabs: [], activePath: null, pendingContent: {} });
  useWorkspaceStore.setState({ root: ROOT, tree: TREE, loading: false, error: null });
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "read_workspace_tree":
        return TREE;
      case "read_text_file":
        return "# Contenu initial\n";
      case "write_text_file":
        return null;
      default:
        return null;
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
});function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest(".fx-row") as HTMLElement;
}

function setup() {
  return render(<FileExplorer onOpenFile={() => {}} />);
}

describe("FileExplorer — badge « modifié »", () => {
  it("un onglet dirty porte le badge ; saveTab le retire", async () => {
    await useTabsStore.getState().openFile(C_CCTP);
    useTabsStore.getState().updateContent(C_CCTP, "# Modifié\n");

    setup();

    // Alpha est déplié par défaut, donc notes.md est rendu sans onglet : pas
    // de badge. cctp.md, dirty : badge présent.
    expect(within(rowOf("cctp.md")).queryByTitle("Modifié (non enregistré)")).toBeInTheDocument();
    expect(within(rowOf("notes.md")).queryByTitle("Modifié (non enregistré)")).not.toBeInTheDocument();

    await act(async () => {
      await useTabsStore.getState().saveTab(C_CCTP);
    });
    await waitFor(() => {
      expect(within(rowOf("cctp.md")).queryByTitle("Modifié (non enregistré)")).not.toBeInTheDocument();
    });
  });

  it("un fichier sans onglet ouvert ne porte jamais le badge", async () => {
    // Onglet dirty sur cctp.md seulement.
    await useTabsStore.getState().openFile(C_CCTP);
    useTabsStore.getState().updateContent(C_CCTP, "# Modifié\n");

    setup();
    expect(within(rowOf("notes.md")).queryByTitle("Modifié (non enregistré)")).not.toBeInTheDocument();
    expect(within(rowOf("cctp.md")).queryByTitle("Modifié (non enregistré)")).toBeInTheDocument();
  });

  it("le badge est visible aussi en mode recherche aplatie", async () => {
    vi.useFakeTimers();
    await useTabsStore.getState().openFile(C_CCTP);
    useTabsStore.getState().updateContent(C_CCTP, "# Modifié\n");

    setup();
    fireEvent.change(screen.getByPlaceholderText("Rechercher un fichier…"), {
      target: { value: "cctp" },
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(within(rowOf("cctp.md")).queryByTitle("Modifié (non enregistré)")).toBeInTheDocument();
  });

  it("se met à jour à la frappe en temps réel (dirty devient propre)", async () => {
    await useTabsStore.getState().openFile(C_CCTP);
    setup();
    expect(within(rowOf("cctp.md")).queryByTitle("Modifié (non enregistré)")).not.toBeInTheDocument();

    act(() => {
      useTabsStore.getState().updateContent(C_CCTP, "# Frappe\n");
    });
    expect(within(rowOf("cctp.md")).queryByTitle("Modifié (non enregistré)")).toBeInTheDocument();
  });
});
