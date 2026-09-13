import { useState } from "react";
import type { FileNode } from "../../core/types";
import { useWorkspaceStore } from "../../core/store/workspaceStore";
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
}: {
  node: FileNode;
  depth: number;
  onOpenFile: (path: string) => void;
  activePath: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 1);

  if (node.isDir) {
    return (
      <div>
        <div
          className="fx-row"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => setExpanded((e) => !e)}
        >
          <span className="fx-caret">{expanded ? "▾" : "▸"}</span>
          <FileIcon isDir name={node.name} expanded={expanded} />
          <span className="fx-name">{node.name}</span>
        </div>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode key={child.path} node={child} depth={depth + 1} onOpenFile={onOpenFile} activePath={activePath} />
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

  return (
    <div className="fx-panel">
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

      {/* Non fonctionnelle pour l'instant : pas de filtrage de l'arborescence
       * à implémenter (demande explicite, pur placeholder visuel). */}
      <div className="fx-search">
        <span className="fx-search-icon">🔍</span>
        <input className="fx-search-input" placeholder="Rechercher un fichier…" disabled title="Recherche (à venir)" />
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
        {root && !loading && tree.length === 0 && !error && (
          <div className="fx-empty">Aucun fichier .md / .xmd dans ce dossier.</div>
        )}
        {tree.map((node) => (
          <TreeNode key={node.path} node={node} depth={0} onOpenFile={onOpenFile} activePath={activePath ?? null} />
        ))}
      </div>
    </div>
  );
}
