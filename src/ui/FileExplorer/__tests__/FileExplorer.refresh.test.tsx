import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { FileNode } from "../../../core/types";
import { useWorkspaceStore } from "../../../core/store/workspaceStore";
import { blankTabData, useTabsStore } from "../../../core/store/tabsStore";
import { FileExplorer } from "../FileExplorer";
import { TabBar } from "../../TabBar/TabBar";

// Callback du listener workspace://changed, capturé depuis le mock.
let changedListener: (() => void) | null = null;

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_ev: string, cb: () => void) => {
    changedListener = cb;
    return () => {
      changedListener = null;
    };
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
}));

const ROOT = "C:\\ws";
const OTHER_ROOT = "D:\\autre";
const C_CCTP = `${ROOT}\\cctp.md`;

interface RustNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: RustNode[];
}

let diskTree: RustNode[] = [];

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  diskTree = [{ name: "cctp.md", path: C_CCTP, is_dir: false }];
  localStorage.clear();
  useTabsStore.setState({ tabs: [], activePath: null, pendingContent: {} });
  useWorkspaceStore.setState({
    root: null,
    tree: [],
    loading: false,
    error: null,
  });
  // Le store garde watcherStarted en variable de module : on repasse par
  // openWorkspace pour un état de départ propre.
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "read_workspace_tree") return diskTree;
    if (cmd === "read_text_file") return "# Contenu\n";
    return null;
  });
  await useWorkspaceStore.getState().openWorkspace(ROOT);
});

afterEach(() => {
  vi.useRealTimers();
});

const readCount = () => invokeMock.mock.calls.filter(([cmd]) => cmd === "read_workspace_tree").length;
const callIndex = (cmd: string, filter?: (args: Record<string, unknown>) => boolean) =>
  invokeMock.mock.calls.findIndex(
    ([c, args]) => c === cmd && (!filter || filter(args as Record<string, unknown>))
  );

describe("workspaceStore — rafraîchissement disque robuste", () => {
  it("deux events rapprochés : read_workspace_tree appelé une seule fois (debounce 300 ms)", () => {
    expect(changedListener).not.toBeNull();
    const before = readCount();
    changedListener!();
    changedListener!();
    changedListener!();
    // Pas encore de relecture avant le debounce.
    expect(readCount()).toBe(before);
    act(() => {
      vi.advanceTimersByTime(310);
    });
    expect(readCount()).toBe(before + 1);
  });

  it("changement de workspace : unwatch_workspace appelé pour l'ancien dossier avant watch_workspace du nouveau", async () => {
    // watcherStarted (variable de module) vaut déjà ROOT (beforeEach/test 1) :
    // le changement vers OTHER_ROOT doit déclencher unwatch PUIS watch.
    invokeMock.mockClear();
    await useWorkspaceStore.getState().openWorkspace(OTHER_ROOT);

    const unwatchIdx = callIndex("unwatch_workspace");
    const newWatchIdx = callIndex("watch_workspace", (args) => args.root === OTHER_ROOT);
    expect(unwatchIdx).toBeGreaterThan(-1);
    expect(newWatchIdx).toBeGreaterThan(unwatchIdx);
  });

  it("fichier ouvert supprimé du disque : l'onglet reste ouvert et marqué « (introuvable) »", async () => {
    await useTabsStore.getState().openFile(C_CCTP);
    useTabsStore.getState().updateContent(C_CCTP, "# Modifié\n");
    expect(useTabsStore.getState().tabs).toHaveLength(1);

    // Le fichier disparaît du disque ; l'event arrive.
    diskTree = [];
    act(() => {
      changedListener!();
      vi.advanceTimersByTime(310);
    });
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().tree).toHaveLength(0);
    });

    const tab = useTabsStore.getState().tabs[0];
    expect(tab).toBeDefined();
    expect(tab.path).toBe(C_CCTP);
    expect(tab.missing).toBe(true);
    expect(tab.dirty).toBe(true); // contenu conservé

    // Le fichier revient : la marque disparaît.
    diskTree = [{ name: "cctp.md", path: C_CCTP, is_dir: false }];
    act(() => {
      changedListener!();
      vi.advanceTimersByTime(310);
    });
    await vi.waitFor(() => {
      expect(useTabsStore.getState().tabs[0].missing).toBeFalsy();
    });
  });

  it("un onglet hors workspace n'est jamais marqué introuvable", async () => {
    await useTabsStore.getState().openFile("E:\\ailleurs\\autre.md");
    act(() => {
      changedListener!();
      vi.advanceTimersByTime(310);
    });
    await vi.waitFor(() => {
      expect(useWorkspaceStore.getState().tree).toHaveLength(1);
    });
    expect(useTabsStore.getState().tabs[0].missing).toBeFalsy();
  });

  it("TabBar affiche le titre suivi de « (introuvable) »", () => {
    useTabsStore.setState({
      tabs: [
        {
          path: C_CCTP,
          title: "cctp.md",
          content: "# x\n",
          dirty: false,
          layout: {} as never,
          issues: [],
          revision: 0,
          ...blankTabData(),
          missing: true,
        },
      ],
      activePath: C_CCTP,
      pendingContent: {},
    });
    render(
      <TabBar tabs={useTabsStore.getState().tabs} activePath={C_CCTP} onSelect={() => {}} onClose={() => {}} />
    );
    expect(screen.getByText(/cctp\.md \(introuvable\)/)).toBeInTheDocument();
  });

  it("message d'arbre vide seulement s'il n'y a NI fichiers NI dossiers", () => {
    // Dossier sans fichiers (le Rust actuel élague ce cas, mais le frontend
    // doit être robuste) : pas de message.
    const tree: FileNode[] = [
      { name: "Dossier", path: `${ROOT}\\Dossier`, isDir: true, children: [] },
    ];
    useWorkspaceStore.setState({ root: ROOT, tree, loading: false, error: null });
    const { rerender } = render(<FileExplorer onOpenFile={() => {}} />);
    expect(screen.queryByText(/Aucun fichier \.md/)).not.toBeInTheDocument();

    // Vraiment vide : message.
    useWorkspaceStore.setState({ root: ROOT, tree: [], loading: false, error: null });
    rerender(<FileExplorer onOpenFile={() => {}} />);
    expect(screen.getByText(/Aucun fichier \.md/)).toBeInTheDocument();
  });
});
