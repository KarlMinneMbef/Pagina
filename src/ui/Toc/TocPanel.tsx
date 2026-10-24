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
import type { TocStyleSettings } from "../../core/pageLayout";
import { ColorPicker } from "../ColorPicker/ColorPicker";
import { IconTocRefresh, IconTrash } from "../Toolbar/icons";
import "./TocPanel.css";
import { PanelHeader } from "../ContextualPanels/PanelHeader";

/** Panneau Sommaire : mettre à jour / supprimer le sommaire du marqueur. */
export function TocPanel({
  toc,
  onChangeToc,
  onUpdate,
  onDelete,
  onClose,
}: {
  /** Style du sommaire du document (layout.toc) — appliqué tout de suite. */
  toc: TocStyleSettings;
  onChangeToc: (patch: Partial<TocStyleSettings>) => void;
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
          Ces réglages s'appliquent tout de suite à tous les sommaires du document. ⟳ en haut régénère le
          sommaire avec les titres actuels, 🗑 le supprime.
        </p>

        <label className="toc-field">
          <span>Niveaux listés</span>
          <select value={toc.maxLevel} onChange={(e) => onChangeToc({ maxLevel: parseInt(e.target.value, 10) })}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Titre 1 seulement" : `Titres 1 à ${n}`}
              </option>
            ))}
          </select>
        </label>
        <label className="toc-check">
          <input type="checkbox" checked={toc.bullets} onChange={(e) => onChangeToc({ bullets: e.target.checked })} />
          Puces devant les entrées
        </label>
        <label className="toc-check">
          <input type="checkbox" checked={toc.underline} onChange={(e) => onChangeToc({ underline: e.target.checked })} />
          Entrées soulignées
        </label>
        <label className="toc-check">
          <input type="checkbox" checked={toc.boldFirstLevel} onChange={(e) => onChangeToc({ boldFirstLevel: e.target.checked })} />
          Premier niveau en gras
        </label>
        <label className="toc-check">
          <input type="checkbox" checked={toc.pageNumbers} onChange={(e) => onChangeToc({ pageNumbers: e.target.checked })} />
          Numéros de page avec points de conduite
        </label>
        <label className="toc-field">
          <span>Retrait par niveau (mm)</span>
          <input
            type="number"
            min={0}
            max={30}
            step={1}
            value={toc.indentMm}
            onChange={(e) => onChangeToc({ indentMm: Math.max(0, Math.min(30, parseFloat(e.target.value) || 0)) })}
          />
        </label>
        <label className="toc-field">
          <span>Couleur des entrées</span>
          <ColorPicker
            value={toc.color || "#2f52a0"}
            title="Couleur des entrées du sommaire (Automatique = couleur des liens)"
            triggerClassName="toc-color-trigger"
            trigger={<span className="toc-color-swatch" style={{ background: toc.color || "#2f52a0" }} />}
            onAutomatic={() => onChangeToc({ color: "" })}
            onChange={(color) => onChangeToc({ color })}
          />
        </label>
      </div>
    </div>
  );
}
