/**
 * Panneau latéral contextuel « Tableau » — PRÉSENTATION refaite
 * (2026-10-17, maquette sobre gris clair) : en-tête sobre (titre seul +
 * bouton fermer), corps en trois sections (Lignes / Colonnes / Cellules)
 * de 3 boutons façon ruban (icône ~20px + libellé court dessous), plus
 * « Supprimer le tableau » en bas. Aucune logique ici : chaque bouton
 * appelle exactement la même action `ToolbarActions` qu'avant.
 *
 * S'ouvre automatiquement à l'entrée dans un tableau (voir `App.tsx`,
 * front montant de `stats.insideTable`), se rouvre dès que le curseur y
 * revient même après une fermeture manuelle.
 *
 * NOTE : les réglages avancés de l'ancienne présentation (bordures,
 * couleur de fond, alignement vertical, bascule de ligne d'en-tête) ne
 * sont plus exposés ici — leurs actions restent intactes dans
 * `ToolbarActions`/`MarkdownEditorHandle`, prêtes à réapparaître dans une
 * future surface d'UI si demandé.
 */
import { useHorizontalResize } from "../ResizeHandle/useHorizontalResize";
import { ResizeHandle } from "../ResizeHandle/ResizeHandle";
import type { ToolbarActions } from "../Toolbar/Toolbar";
import {
  IconClearCell,
  IconColDelete,
  IconColLeft,
  IconColRight,
  IconMergeCells,
  IconRowAbove,
  IconRowBelow,
  IconRowDelete,
  IconSplitCells,
} from "../Toolbar/icons";
import "./TablePropertiesPanel.css";

export function TablePropertiesPanel({
  actions,
  disabled,
  onClose,
}: {
  actions: ToolbarActions | null;
  disabled: boolean;
  onClose: () => void;
}) {
  const inactive = disabled || actions === null;
  const { width: panelWidth, onHandleMouseDown } = useHorizontalResize(220, { min: 200, max: 420, anchor: "right" });

  return (
    <aside className="tp-panel" style={{ width: panelWidth }}>
      <ResizeHandle side="left" onMouseDown={onHandleMouseDown} />
      <header className="tp-header">
        <span className="tp-title">Tableau</span>
        <button
          type="button"
          className="tp-close"
          onClick={onClose}
          title="Masquer le panneau (réapparaît dès que le curseur revient dans un tableau)"
        >
          ✕
        </button>
      </header>

      <div className="tp-body">
        <section className="tp-section">
          <h4 className="tp-section-title">Lignes</h4>
          <div className="tp-grid">
            <ActionButton
              title="Insérer une ligne au-dessus du curseur"
              icon={<IconRowAbove size={20} />}
              label="Au-dessus"
              onClick={() => actions?.addRowBefore()}
              disabled={inactive}
            />
            <ActionButton
              title="Insérer une ligne en dessous du curseur"
              icon={<IconRowBelow size={20} />}
              label="En dessous"
              onClick={() => actions?.addRowAfter()}
              disabled={inactive}
            />
            <ActionButton
              title="Supprimer la ligne du curseur"
              icon={<IconRowDelete size={20} />}
              label="Supprimer"
              onClick={() => actions?.deleteRow()}
              disabled={inactive}
            />
          </div>
        </section>

        <section className="tp-section">
          <h4 className="tp-section-title">Colonnes</h4>
          <div className="tp-grid">
            <ActionButton
              title="Insérer une colonne à gauche du curseur"
              icon={<IconColLeft size={20} />}
              label="À gauche"
              onClick={() => actions?.addColumnBefore()}
              disabled={inactive}
            />
            <ActionButton
              title="Insérer une colonne à droite du curseur"
              icon={<IconColRight size={20} />}
              label="À droite"
              onClick={() => actions?.addColumnAfter()}
              disabled={inactive}
            />
            <ActionButton
              title="Supprimer la colonne du curseur"
              icon={<IconColDelete size={20} />}
              label="Supprimer"
              onClick={() => actions?.deleteColumn()}
              disabled={inactive}
            />
          </div>
        </section>

        <section className="tp-section">
          <h4 className="tp-section-title">Cellules</h4>
          <div className="tp-grid">
            <ActionButton
              title="Fusionner les cellules sélectionnées"
              icon={<IconMergeCells size={20} />}
              label="Fusionner"
              onClick={() => actions?.mergeCells()}
              disabled={inactive}
            />
            <ActionButton
              title="Diviser la cellule fusionnée du curseur"
              icon={<IconSplitCells size={20} />}
              label="Diviser"
              onClick={() => actions?.splitCell()}
              disabled={inactive}
            />
            <ActionButton
              title="Vider le contenu de la cellule (ou des cellules sélectionnées)"
              icon={<IconClearCell size={20} />}
              label="Vider"
              onClick={() => actions?.clearCellContents()}
              disabled={inactive}
            />
          </div>
        </section>

        <button
          type="button"
          className="tp-delete-table"
          onClick={() => actions?.deleteTable()}
          disabled={inactive}
          title="Supprimer tout le tableau"
        >
          Supprimer le tableau
        </button>
      </div>
    </aside>
  );
}

/** Bouton d'action du panneau : icône SVG centrée (~20px) + libellé court
 * dessous (~10px), façon boutons type A du ruban. Tooltip obligatoire. */
function ActionButton({
  icon,
  label,
  title,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button type="button" className="tp-action" onClick={onClick} disabled={disabled} title={title}>
      <span className="tp-action-icon">{icon}</span>
      <span className="tp-action-label">{label}</span>
    </button>
  );
}
