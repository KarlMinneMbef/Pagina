import { useEffect, useMemo, useState } from "react";
import type { FileNode } from "../../core/types";
import { useWorkspaceStore, joinPath } from "../../core/store/workspaceStore";
import { useTabsStore } from "../../core/store/tabsStore";
import { useHorizontalResize } from "../ResizeHandle/useHorizontalResize";
import { ResizeHandle } from "../ResizeHandle/ResizeHandle";
import { TreeMenu, type TreeMenuAction } from "./TreeMenu";
import { NameDialog } from "./NameDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import "./FileExplorer.css";

function FileIcon({ isDir, name, expanded }: { isDir: boolean; name: string; expanded?: boolean }) {
  if (isDir) return <span className="fx-icon">{expanded ? "📂" : "📁"}</span>;
  if (name.toLowerCase().endsWith(".xmd")) return <span className="fx-icon">🧩</span>;
  return <span className="fx-icon">📄</span>;
}

function TreeNode({
  node,
  depth,
  onOpenFile,
  activePath,
  expandedOverrides,
  onToggleDir,
  onNodeContextMenu,
}: {
  node: FileNode;
  depth: number;
  onOpenFile: (path: string) => void;
  activePath: string | null;
  /** Chemins explicitement dépliés/repliés par l'utilisateur — les dossiers
   * de premier niveau sont dépliés par défaut (voir FileExplorer). */
  expandedOverrides: Map<string, boolean>;
  onToggleDir: (path: string, defaultExpanded: boolean) => void;
  onNodeContextMenu: (e: React.MouseEvent, node: FileNode) => void;
}) {
  const defaultExpanded = depth < 1;
  const expanded = expandedOverrides.has(node.path)
    ? expandedOverrides.get(node.path)!
    : defaultExpanded;

  if (node.isDir) {
    return (
      <div>
        <div
          className="fx-row"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => onToggleDir(node.path, defaultExpanded)}
          onContextMenu={(e) => onNodeContextMenu(e, node)}
        >
          <span className="fx-caret">{expanded ? "▾" : "▸"}</span>
          <FileIcon isDir name={node.name} expanded={expanded} />
          <span className="fx-name">{node.name}</span>
        </div>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                onOpenFile={onOpenFile}
                activePath={activePath}
                expandedOverrides={expandedOverrides}
                onToggleDir={onToggleDir}
                onNodeContextMenu={onNodeContextMenu}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`fx-row fx-file${node.path === activePath ? " fx-row-active" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 + 14 }}
      onClick={() => onOpenFile(node.path)}
      onContextMenu={(e) => onNodeContextMenu(e, node)}
    >
      <FileIcon isDir={false} name={node.name} />
      <span className="fx-name">{node.name}</span>
    </div>
  );
}

/** Parcourt récursivement l'arbre et retourne tous les nœuds à plat,
 * dans l'ordre d'affichage (utilisé par la recherche aplatie). */
function flattenTree(nodes: FileNode[], out: FileNode[] = []): FileNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children) flattenTree(n.children, out);
  }
  return out;
}

/** Chemin du nœud relatif à la racine du workspace (pour l'affichage
 * en second dans la vue aplatie de recherche). */
function relativePath(root: string, path: string): string {
  if (path.length > root.length && (path[root.length] === "\\" || path[root.length] === "/") && path.startsWith(root)) {
    return path.slice(root.length + 1);
  }
  return path;
}

export function FileExplorer({
  onOpenFile,
  onClose,
  activePath,
}: {
  onOpenFile: (path: string) => void;
  onClose?: () => void;
  /** Chemin de l'onglet actif — pour la mise en évidence de la ligne
   * correspondante dans l'arborescence (barre d'accent + fond clair). */
  activePath?: string | null;
}) {
  const { root, tree, loading, error, openFolderPicker, createNewFile, createNewFolder, renameEntry, deleteEntry, duplicateEntry } = useWorkspaceStore();

  const workspaceName = root ? root.split(/[\\/]/).filter(Boolean).pop() ?? root : null;

  // Recherche : saisie brute (immédiate) + valeur débouncée (150 ms) servant
  // au filtrage réel de l'arborescence.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 150);
    return () => clearTimeout(t);
  }, [searchInput]);

  // État déplié/replié des dossiers, porté ici (et non dans TreeNode) pour
  // survivre aux allers-retours recherche <-> arbre normal.
  const [expandedOverrides, setExpandedOverrides] = useState<Map<string, boolean>>(() => new Map());
  const toggleDir = (path: string, defaultExpanded: boolean) => {
    setExpandedOverrides((prev) => {
      const next = new Map(prev);
      const current = next.has(path) ? next.get(path)! : defaultExpanded;
      next.set(path, !current);
      return next;
    });
  };

  // Correspondances de recherche : vue aplatie de tous les nœuds (fichiers et
  // dossiers) dont le nom contient la requête, insensible à la casse.
  const matches = useMemo(() => {
    if (!search) return [] as FileNode[];
    const q = search.toLowerCase();
    return flattenTree(tree).filter((n) => n.name.toLowerCase().includes(q));
  }, [tree, search]);

  // --- Menu contextuel + dialogues (aucun window.prompt/confirm : ils
  // échouent silencieusement dans WebView2, voir CLAUDE.md) ---
  const [menu, setMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null);
  const [dialog, setDialog] = useState<
    { kind: "newFile" | "newFolder" | "rename"; node: FileNode | null } | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState<FileNode | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openNodeContextMenu = (e: React.MouseEvent, node: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, node });
  };

  const menuActions: TreeMenuAction[] = useMemo(() => {
    if (!menu) return [];
    const node = menu.node;
    if (!node) {
      // Fond de l'arbre (racine) : création seulement.
      return [
        { id: "newFile", label: "Nouveau fichier", onAction: () => setDialog({ kind: "newFile", node: null }) },
        { id: "newFolder", label: "Nouveau dossier", onAction: () => setDialog({ kind: "newFolder", node: null }) },
      ];
    }
    const rename = { id: "rename", label: "Renommer", onAction: () => setDialog({ kind: "rename", node }) };
    const duplicate = {
      id: "duplicate",
      label: "Dupliquer",
      onAction: () => { void duplicateEntry(node.path).catch((e) => setActionError(String(e))); },
    };
    const del = { id: "delete", label: "Supprimer", onAction: () => setConfirmDelete(node) };
    if (node.isDir) {
      return [
        { id: "newFile", label: "Nouveau fichier", onAction: () => setDialog({ kind: "newFile", node }) },
        { id: "newFolder", label: "Nouveau dossier", onAction: () => setDialog({ kind: "newFolder", node }) },
        rename,
        duplicate,
        del,
      ];
    }
    return [rename, duplicate, del];
  }, [menu, duplicateEntry]);

  const dialogTitles: Record<"newFile" | "newFolder" | "rename", { title: string; submitLabel: string }> = {
    newFile: { title: "Nouveau fichier", submitLabel: "Créer" },
    newFolder: { title: "Nouveau dossier", submitLabel: "Créer" },
    rename: { title: "Renommer", submitLabel: "Renommer" },
  };

  const runAction = (p: Promise<unknown>) => {
    void p.catch((e) => setActionError(String(e)));
  };

  const submitDialog = (name: string) => {
    if (!dialog) return;
    const node = dialog.node;
    setDialog(null);
    setActionError(null);
    if (dialog.kind === "newFile") {
      runAction(createNewFile(name, node?.path).then(onOpenFile));
    } else if (dialog.kind === "newFolder") {
      runAction(createNewFolder(name, node?.path));
    } else if (node) {
      const from = node.path;
      const sepIdx = Math.max(from.lastIndexOf("\\"), from.lastIndexOf("/"));
      const parent = sepIdx > 0 ? from.slice(0, sepIdx) : from;
      const to = joinPath(parent, name);
      if (to !== from) runAction(renameEntry(from, to));
    }
  };

  // Message de confirmation de suppression : renforcé si un onglet modifié
  // (dirty) serait perdu avec le fichier/dossier supprimé.
  const tabs = useTabsStore((s) => s.tabs);
  const deleteTargetHasDirtyTab = (() => {
    if (!confirmDelete) return false;
    const p = confirmDelete.path;
    return tabs.some(
      (t) => t.dirty && (t.path === p || t.path.startsWith(p + "\\") || t.path.startsWith(p + "/"))
    );
  })();
  const confirmDeleteMessage = !confirmDelete
    ? ""
    : deleteTargetHasDirtyTab
      ? `« ${confirmDelete.name} » a des modifications non enregistrées qui seront perdues. Supprimer quand même ?`
      : `Supprimer « ${confirmDelete.name} » ?`;

  const { width, onHandleMouseDown } = useHorizontalResize(260, { min: 180, max: 520, anchor: "left" });

  return (
    <div className="fx-panel" style={{ width }}>
      <ResizeHandle side="right" onMouseDown={onHandleMouseDown} />
      <div className="fx-header">
        <span>Explorateur</span>
        <div className="fx-header-actions">
          <button className="fx-open-btn" onClick={openFolderPicker} title="Ouvrir un dossier">
            Ouvrir…
          </button>
          {onClose && (
            <button className="fx-close-btn" onClick={onClose} title="Masquer l'explorateur">
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="fx-search">
        <span className="fx-search-icon">🔍</span>
        <input
          className="fx-search-input"
          placeholder="Rechercher un fichier…"
          aria-label="Rechercher dans l'arborescence"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setSearchInput("");
              setSearch("");
            }
          }}
        />
      </div>

      {root && (
        <div className="fx-section-label">
          <span className="fx-section-name" title={root}>
            {workspaceName}
          </span>
        </div>
      )}

      <div
        className="fx-body"
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, node: null });
        }}
      >
        {actionError && (
          <div className="fx-error" role="alert" onClick={() => setActionError(null)}>
            {actionError}
          </div>
        )}
        {!root && !loading && (
          <div className="fx-empty">Aucun dossier ouvert. Cliquez sur « Ouvrir… ».</div>
        )}
        {loading && <div className="fx-empty">Chargement…</div>}
        {error && <div className="fx-error">{error}</div>}
        {root && !loading && !search && tree.length === 0 && !error && (
          <div className="fx-empty">Aucun fichier .md / .xmd dans ce dossier.</div>
        )}
        {search && matches.length === 0 && !loading && (
          <div className="fx-empty">Aucun résultat pour « {search} »</div>
        )}
        {search ? (
          matches.map((node) => {
            const rel = relativePath(root ?? "", node.path);
            return (
              <div
                key={node.path}
                className={`fx-row fx-file${node.path === activePath ? " fx-row-active" : ""}`}
                onClick={node.isDir ? undefined : () => onOpenFile(node.path)}
              >
                <FileIcon isDir={node.isDir} name={node.name} />
                <span className="fx-name">{node.name}</span>
                {/* Chemin relatif en second — masqué à la racine où il
                 * redoublerait inutilement le nom du fichier. */}
                {rel !== node.name && (
                  <span className="fx-match-path" title={node.path}>
                    {rel}
                  </span>
                )}
              </div>
            );
          })
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              onOpenFile={onOpenFile}
              activePath={activePath ?? null}
              expandedOverrides={expandedOverrides}
              onToggleDir={toggleDir}
              onNodeContextMenu={openNodeContextMenu}
            />
          ))
        )}
      </div>

      {menu && (
        <TreeMenu x={menu.x} y={menu.y} actions={menuActions} onClose={() => setMenu(null)} />
      )}
      {dialog && (
        <NameDialog
          title={dialogTitles[dialog.kind].title}
          submitLabel={dialogTitles[dialog.kind].submitLabel}
          initialName={
            dialog.kind === "newFile"
              ? "Nouveau document.md"
              : dialog.kind === "rename"
                ? dialog.node?.name ?? ""
                : ""
          }
          onSubmit={submitDialog}
          onCancel={() => setDialog(null)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Confirmer la suppression"
          message={confirmDeleteMessage}
          onConfirm={() => {
            const node = confirmDelete;
            setConfirmDelete(null);
            setActionError(null);
            runAction(deleteEntry(node.path));
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
