/**
 * Panneau « Sommaire » — s'ouvre automatiquement quand le curseur entre
 * dans un sommaire déjà généré (voir `isTocList` dans TocMarker.ts,
 * `EditorStats.insideToc` dans MarkdownEditor.tsx). Répond à un retour
 * explicite de l'utilisateur : un sommaire généré est déjà compliqué à
 * cliquer dedans (plusieurs niveaux imbriqués, désormais réparti sur
 * plusieurs pages — voir le correctif de débordement) et impossible à
 * supprimer proprement sans ce panneau (il fallait auparavant sélectionner
 * "à la main" toute la liste, potentiellement sur plusieurs pages).
 *
 * Deux actions seulement pour l'instant — « Mettre à jour » régénère le
 * sommaire EN PLACE (retrouvé par sa forme, pas par un marqueur : un
 * sommaire déjà généré n'a plus de `<!-- toc -->` à proximité), et
 * « Supprimer » l'efface entièrement. Pas encore de réglage des niveaux de
 * titre inclus (toujours tous niveaux, comme `generateToc`) — à ajouter si
 * demandé, nécessiterait de choisir où persister ce réglage puisqu'un
 * sommaire généré ne porte aucun marqueur.
 */
import { IconTocRefresh, IconTrash } from "../Toolbar/icons";
import "./TocPanel.css";
import { PanelHeader } from "../ContextualPanels/PanelHeader";

export function TocPanel({
  onUpdate,
  onDelete,
  onClose,
}: {
  /** Régénère le sommaire en place avec les titres actuels du document. */
  onUpdate: () => void;
  /** Supprime entièrement le sommaire. */
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="toc-panel">
      <PanelHeader
        title="Sommaire"
        actions={[
          {
            icon: <IconTocRefresh size={15} />,
            title: "Régénère le sommaire avec les titres actuels du document",
            onClick: onUpdate,
          },
          {
            icon: <IconTrash size={15} />,
            title: "Supprime entièrement ce sommaire",
            onClick: onDelete,
            danger: true,
          },
        ]}
        onClose={onClose}
      />

      <div className="toc-body">
        <p className="toc-hint">
          Le curseur est dans un sommaire généré. Icônes en haut :
          ⟳ met à jour le sommaire avec les titres actuels, 🗑 le supprime entièrement.
        </p>
      </div>
    </div>
  );
}
