import { useEffect, useMemo, useState } from "react";
import type { FileNode } from "../../core/types";
import { useWorkspaceStore } from "../../core/store/workspaceStore";
import { useHorizontalResize } from "../ResizeHandle/useHorizontalResize";
import { ResizeHandle } from "../ResizeHandle/ResizeHandle";
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
}: {
  node: FileNode;
  depth: number;
  onOpenFile: (path: string) => void;
  activePath: string | null;
  /** Chemins explicitement dépliés/repliés par l'utilisateur — les dossiers
   * de premier niveau sont dépliés par défaut (voir FileExplorer). */
  expandedOverrides: Map<string, boolean>;
  onToggleDir: (path: string, defaultExpanded: boolean) => void;
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
  const { root, tree, loading, error, openFolderPicker, createNewFile, createNewFolder } = useWorkspaceStore();

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

  const handleNewFile = () => {
    const name = window.prompt("Nom du nouveau fichier :", "Nouveau document.md");
    if (!name) return;
    void createNewFile(name.trim()).then(onOpenFile).catch((e) => window.alert(`Impossible de créer le fichier : ${e}`));
  };

  const handleNewFolder = () => {
    const name = window.prompt("Nom du nouveau dossier :");
    if (!name) return;
    void createNewFolder(name.trim()).catch((e) => window.alert(`Impossible de créer le dossier : ${e}`));
  };

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
          <span className="fx-section-name">{workspaceName}</span>
          <span className="fx-section-actions">
            <button className="fx-section-btn" onClick={handleNewFolder} title="Nouveau dossier">
              🗀+
            </button>
            <button className="fx-section-btn" onClick={handleNewFile} title="Nouveau fichier">
              🗋+
            </button>
          </span>
        </div>
      )}

      <div className="fx-body">
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
            />
          ))
        )}
      </div>
    </div>
  );
}
