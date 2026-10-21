/**
 * Barre d'onglets document : un onglet par fichier ouvert (titre tronqué,
 * marqueur « • » si non enregistré, bouton ✕ pour fermer — confirmation si
 * des modifications ne sont pas sauvegardées). Gérée par tabsStore.
 */
import type { EditorTab } from "../../core/store/tabsStore";
import "./TabBar.css";

/** Rend la barre d'onglets document (voir l'en-tête du fichier). */
export function TabBar({
  tabs,
  activePath,
  onSelect,
  onClose,
}: {
  tabs: EditorTab[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  return (
    <div className="tabbar">
      {tabs.map((tab) => (
        <div
          key={tab.path}
          className={`tabbar-tab${tab.path === activePath ? " tabbar-tab-active" : ""}`}
          onClick={() => onSelect(tab.path)}
          title={tab.path}
        >
          <span className="tabbar-title">
            {tab.title}
            {tab.missing ? " (introuvable)" : ""}
            {tab.dirty ? " •" : ""}
          </span>
          <button
            className="tabbar-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.path);
            }}
            title="Fermer"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
