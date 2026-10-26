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
 * placeholders visuels, sans logique) : le chevron
 * "Personnaliser". La barre "Rechercher" est FONCTIONNELLE depuis le
 * 2026-10-21 (retour utilisateur : « le champ rechercher en haut doit
 * permettre une recherche rapide ») : c'est une RECHERCHE RAPIDE — chaque
 * frappe ouvre le panneau latéral « Rechercher » (roadmap 2.4) et y porte
 * la requête en direct ; la navigation (Entrée = suivant) et le
 * remplacement continuent dans le panneau. L'AVATAR est fonctionnel
 * depuis le 2026-10-21 aussi (roadmap 1.5) : initiales du prénom + nom
 * de l'utilisateur (fenêtre Utilisateur au clic) ; le bouton ⚙ ouvre
 * la fenêtre Paramétrage (roadmap 1.4).
 */
import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { IconCog } from "../Toolbar/icons";
import "./TitleBar.css";

const appWindow = getCurrentWindow();

/** Barre de titre : actions fichier, nom du document, recherche rapide,
 *  boutons du coin droit (voir TitleBar.css). */
export function TitleBar({
  documentTitle,
  disabled,
  onSave,
  onUndo,
  onRedo,
  onNewFile,
  onOpenFolder,
  onOpenFiles,
  onSaveAs,
  onPrint,
  onExportPdf,
  onSearch,
  onOpenSettings,
  onOpenUser,
  userInitials,
}: {
  documentTitle: string | null;
  disabled: boolean;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onNewFile: () => void;
  onOpenFolder: () => void;
  /** "Ouvrir un fichier" — un ou plusieurs `.md`/`.xmd` directement, sans
   * passer par un dossier de travail (contrairement à `onOpenFolder`). */
  onOpenFiles: () => void;
  /** "Enregistrer sous" — écrit le document actif à un nouvel emplacement. */
  onSaveAs: () => void;
  onPrint: () => void;
  /** Export PDF DIRECT (pas de boîte de dialogue d'impression système) —
   * voir `handleExportPdf` dans App.tsx. */
  onExportPdf: () => void;
  /** Recherche rapide : chaque frappe ouvre le panneau latéral
   * « Rechercher » et y porte la requête (voir App.tsx). Absent = champ
   * désactivé (aucun document ouvert). */
  onSearch?: (query: string) => void;
  /** Ouvre la fenêtre « Paramétrage » (préférences globales, roadmap 1.4). */
  onOpenSettings: () => void;
  /** Ouvre la fenêtre « Utilisateur » (clic sur l'avatar, roadmap 1.5). */
  onOpenUser: () => void;
  /** Initiales affichées dans l'avatar (store userStore) — « ? » si vide. */
  userInitials: string;
}) {
  const [searchValue, setSearchValue] = useState("");
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
        <button className="tbar-icon-btn" disabled={disabled} onClick={onSaveAs} title="Enregistrer sous…">
          📤
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
        <button className="tbar-icon-btn" onClick={onOpenFiles} title="Ouvrir un fichier…">
          📄
        </button>
        <button className="tbar-icon-btn" onClick={onOpenFolder} title="Ouvrir un dossier">
          📂
        </button>
        <button className="tbar-icon-btn" disabled={disabled} onClick={onPrint} title="Imprimer">
          🖨️
        </button>
        <button className="tbar-icon-btn" disabled={disabled} onClick={onExportPdf} title="Exporter en PDF…">
          📑
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
        {/* Recherche rapide (2026-10-21) : ouvre le panneau latéral
         * « Rechercher » et y porte la requête à chaque frappe. */}
        <div className="tbar-search" title="Recherche rapide dans le document — ouvre le panneau Rechercher">
          <span className="tbar-search-icon">🔍</span>
          <input
            className="tbar-search-input"
            type="text"
            placeholder="Rechercher"
            value={searchValue}
            disabled={disabled || !onSearch}
            onChange={(e) => {
              setSearchValue(e.target.value);
              onSearch?.(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearch?.(searchValue);
              }
            }}
          />
          <span className="tbar-search-mic" title="Recherche vocale (à venir)">🎤</span>
        </div>
        {/* Paramétrage (roadmap 1.4) : préférences globales de
         * l'application — règles, auto-sauvegarde… */}
        <button
          className="tbar-icon-btn tbar-settings"
          onClick={onOpenSettings}
          title="Paramétrage (règles, correction orthographique, auto-sauvegarde…)"
          aria-label="Paramétrage"
        >
          <IconCog size={18} />
        </button>
        {/* Avatar = profil utilisateur (roadmap 1.5) : initiales du
         * prénom + nom (fenêtre Utilisateur au clic). */}
        <button
          className="tbar-avatar"
          onClick={onOpenUser}
          title={userInitials === "?" ? "Utilisateur — renseigner votre nom" : "Utilisateur (modifier)"}
        >
          {userInitials}
        </button>
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
