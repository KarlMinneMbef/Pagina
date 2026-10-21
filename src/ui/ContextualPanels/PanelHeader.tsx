/**
 * En-tête PARTAGÉ des panneaux latéraux (harmonisation 2026-10-17,
 * demande : « les commandes des panneaux en icônes en haut, harmoniser
 * tous les panneaux » — modèle validé via la maquette
 * docs/maquettes/panneau-equation.html) :
 * - Titre avec filet vertical SAPIN, puce de type éventuelle.
 * - À droite : les COMMANDES DU PANNEAU EN ICÔNES (supprimer, mettre à
 *   jour, réglages… selon le panneau), puis le ✕ de fermeture.
 * Chaque panneau adapte ses icônes via `actions` ; le style est unique
 * (classes ctx-ph dans ContextualPanelHost.css).
 */
import type { ReactNode } from "react";

export interface PanelHeaderAction {
  /** Icône SVG (module Toolbar/icons) ou glyphe ✕. */
  icon: ReactNode;
  /** Tooltip obligatoire (l'icône seule ne dit pas tout). */
  title: string;
  onClick: () => void;
  /** Action destructive (corbeille) : survol rouge. */
  danger?: boolean;
  /** État actif (fond prairie) — ex. palette de symboles ouverte. */
  active?: boolean;
  /** Grisé (fonction à venir). */
  disabled?: boolean;
}

export function PanelHeader({
  title,
  chip,
  actions = [],
  onClose,
  closeTitle = "Fermer le panneau",
}: {
  title: string;
  /** Puce de type éventuelle (« EN BLOC », « EN LIGNE »…). */
  chip?: string;
  /** Commandes du panneau, adaptées à chaque contexte. */
  actions?: PanelHeaderAction[];
  onClose: () => void;
  closeTitle?: string;
}) {
  return (
    <header className="ctx-ph">
      <span className="ctx-ph-title">
        {title}
        {chip ? <span className="ctx-ph-chip">{chip}</span> : null}
      </span>
      <span className="ctx-ph-actions">
        {actions.map((a) => (
          <button
            key={a.title}
            type="button"
            className={`ctx-ph-btn${a.danger ? " ctx-ph-btn-danger" : ""}${a.active ? " ctx-ph-btn-active" : ""}`}
            title={a.title}
            onClick={a.onClick}
            disabled={a.disabled}
          >
            {a.icon}
          </button>
        ))}
        <button type="button" className="ctx-ph-btn" title={closeTitle} onClick={onClose}>
          ✕
        </button>
      </span>
    </header>
  );
}
