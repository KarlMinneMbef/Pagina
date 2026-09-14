/**
 * Barre supérieure unique (façon Word), fusionnant l'ancienne barre de
 * titre système ET l'ancienne "quickbar" (nom de fichier + Nouveau/
 * Enregistrer/Imprimer) en une seule rangée. Nécessite une fenêtre SANS
 * décorations natives (`"decorations": false` dans `src-tauri/
 * tauri.conf.json`) — avant cette page, l'application n'avait PAS de
 * barre de titre personnalisée : la barre système du système
 * d'exploitation fournissait déjà minimiser/agrandir/fermer, il n'y avait
 * donc aucun handler existant à "déplacer" pour ces boutons — ils sont
 * implémentés ici directement via l'API fenêtre de Tauri
 * (`@tauri-apps/api/window`), pas repris d'un code antérieur.
 *
 * Glisser la fenêtre : l'attribut HTML `data-tauri-drag-region` (posé sur
 * le fond de la barre, pas sur les boutons) fait tout le travail, sans
 * JS — c'est le mécanisme standard de Tauri pour une fenêtre sans
 * décorations.
 *
 * Élements NON FONCTIONNELS (demandé explicitement comme purs
 * placeholders visuels, sans logique) : la barre "Rechercher", l'avatar
 * "KM", le chevron "Personnaliser".
 */
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./TitleBar.css";

const appWindow = getCurrentWindow();

export function TitleBar({
  documentTitle,
  disabled,
  onSave,
  onUndo,
  onRedo,
  onNewFile,
  onOpenFolder,
  onPrint,
}: {
  documentTitle: string | null;
  disabled: boolean;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onNewFile: () => void;
  onOpenFolder: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="tbar" data-tauri-drag-region>
      {/* `data-tauri-drag-region` ne s'hérite PAS aux enfants (comportement
       * documenté de Tauri) — le poser seulement sur `.tbar` (juste
       * au-dessus) ne suffit donc pas : les trois conteneurs flex
       * (gauche/centre/droite) recouvrent toute la largeur de la barre, le
       * fond de `.tbar` lui-même n'étant jamais réellement sous la souris.
       * Reposé ici sur chacun des trois — l'espace VIDE qu'ils contiennent
       * (au-delà de leurs boutons) devient une vraie zone de déplacement,
       * sans rien changer au clic sur les boutons eux-mêmes (éléments
       * distincts, sans l'attribut). */}
      <div className="tbar-left" data-tauri-drag-region>
        <img className="tbar-logo" src="/pagina-icon.svg" alt="Pagina" title="Pagina" />
        <button className="tbar-icon-btn" disabled={disabled} onClick={onSave} title="Enregistrer (Ctrl+S)">
          💾
        </button>
        <span className="tbar-sep" />
        <button className="tbar-icon-btn" disabled={disabled} onClick={onUndo} title="Annuler">
          ↶
        </button>
        <button className="tbar-icon-btn" disabled={disabled} onClick={onRedo} title="Rétablir">
          ↷
        </button>
        <span className="tbar-sep" />
        <button className="tbar-icon-btn" onClick={onNewFile} title="Nouveau document">
          🗋
        </button>
        <button className="tbar-icon-btn" onClick={onOpenFolder} title="Ouvrir un dossier">
          📂
        </button>
        <button className="tbar-icon-btn" disabled={disabled} onClick={onPrint} title="Imprimer / Exporter PDF">
          🖨️
        </button>
        {/* Décoratif, non fonctionnel — voir le commentaire d'en-tête. */}
        <button className="tbar-icon-btn tbar-customize" title="Personnaliser la barre d'outils (à venir)">
          ⌄
        </button>
      </div>

      <div className="tbar-center" data-tauri-drag-region>
        <span className="tbar-title">{documentTitle ? `${documentTitle} — Pagina` : "Pagina"}</span>
      </div>

      <div className="tbar-right" data-tauri-drag-region>
        {/* Non fonctionnelle — voir le commentaire d'en-tête. */}
        <div className="tbar-search" title="Recherche (à venir)">
          <span className="tbar-search-icon">🔍</span>
          <span className="tbar-search-placeholder">Rechercher</span>
          <span className="tbar-search-mic">🎤</span>
        </div>
        {/* Non fonctionnel — pas de système d'utilisateurs, initiales figées. */}
        <span className="tbar-avatar" title="Utilisateur">
          KM
        </span>
        <span className="tbar-sep" />
        <button className="tbar-window-btn" onClick={() => appWindow.minimize()} title="Réduire">
          ─
        </button>
        <button className="tbar-window-btn" onClick={() => appWindow.toggleMaximize()} title="Agrandir/Restaurer">
          ▢
        </button>
        <button className="tbar-window-btn tbar-window-close" onClick={() => appWindow.close()} title="Fermer">
          ✕
        </button>
      </div>
    </div>
  );
}
