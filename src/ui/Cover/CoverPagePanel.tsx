/**
 * Panneau « Page de garde » (refonte 2026-10-22 : zone TRANSPARENTE — voir
 * CoverZone.ts) — la page de garde est une PAGE NORMALE du document
 * encadrée par deux marqueurs invisibles ; le contenu s'édite avec tout
 * l'éditeur (ruban, tableaux, curseur — plus de mini-éditeur dédié). Ce
 * panneau ne porte que les PROPRIÉTÉS SPÉCIFIQUES de la zone :
 * - en-tête/pied de page masqués (ou non) sur les pages couvertes ;
 * - insertion de champs de document {{variable}} (DocField.ts — la page
 *   affiche la valeur résolue, le fichier garde la variable) ;
 * - enregistrer la zone comme « type » réutilisable (galerie + export) ;
 * - suppression de la zone.
 */
import { useState } from "react";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { IconTrash } from "../Toolbar/icons";
import { COVER_VARIABLES, COVER_THEMES } from "../../core/coverTemplates";
import "./CoverPagePanel.css";

/** Nom de variable sans accolades : "{{title}}" → "title" (DocField). */
function tokenToName(token: string): string {
  return token.replace(/^\{\{|\}\}$/g, "").trim();
}

/** Panneau Page de garde : propriétés de la zone, champs, type, suppression. */
export function CoverPagePanel({
  zoneStart,
  headerFooter,
  theme,
  onChangeTheme,
  customVariables,
  onToggleHeaderFooter,
  onInsertField,
  onSaveAsType,
  onDelete,
  onClose,
}: {
  /** Position du marqueur de début — clé de remontage du panneau
   *  (change de zone = panneau réinitialisé, jamais à la frappe). */
  zoneStart: number;
  /** En-tête/pied actuellement AFFICHÉS sur les pages de la zone ? */
  headerFooter: boolean;
  /** Thème visuel de la zone (« » = style libre). */
  theme: string;
  /** Change le thème visuel de la zone. */
  onChangeTheme: (theme: string) => void;
  /** Champs personnalisés du document (Propriétés) — même liste que le
   *  panneau En-tête/Pied. */
  customVariables: { token: string; label: string }[];
  /** Affiche/masque l'en-tête et le pied sur les pages de la zone. */
  onToggleHeaderFooter: (show: boolean) => void;
  /** Insère un champ {{variable}} au curseur (dans la zone). */
  onInsertField: (name: string) => void;
  /** Enregistre le contenu COURANT de la zone comme type réutilisable
   *  (galerie de pages de garde) sous ce nom. */
  onSaveAsType: (name: string) => void;
  /** Supprime la zone (marqueurs + contenu) du document. */
  onDelete: () => void;
  /** Ferme le panneau. */
  onClose: () => void;
}) {
  const [modelName, setModelName] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const saveAsType = () => {
    const name = modelName.trim();
    if (!name) {
      setSavedNote("Donnez d'abord un nom au type.");
      return;
    }
    onSaveAsType(name);
    setSavedNote(`Type « ${name} » enregistré — visible dans la galerie.`);
    setModelName("");
  };

  const variables = [...COVER_VARIABLES, ...customVariables];

  return (
    <div className="cvp-panel">
      <PanelHeader
        title="Page de garde"
        chip="Zone"
        actions={[
          {
            icon: <IconTrash size={15} />,
            title: "Supprimer la page de garde (marqueurs et contenu)",
            onClick: onDelete,
            danger: true,
          },
        ]}
        onClose={onClose}
        closeTitle="Fermer le panneau"
      />
      <div className="cvp-body" key={zoneStart}>
        <p className="cvp-hint">
          La page de garde est une <strong>page normale</strong> : son contenu s'édite
          directement sur la page avec tout l'éditeur. Les deux repères pointillés en
          marquent le début et la fin ; invisibles à l'impression.
        </p>
        <label className="cvp-theme">
          <span>Apparence :</span>
          <select value={theme} onChange={(e) => onChangeTheme(e.target.value)} title="Thème visuel de la page de garde — le fichier reste du Markdown simple">
            {COVER_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="cvp-check">
          <input
            type="checkbox"
            checked={headerFooter}
            onChange={(e) => onToggleHeaderFooter(e.target.checked)}
          />
          Afficher l'en-tête et le pied de page sur cette page
        </label>
        <p className="cvp-vars-title">Insérer un champ au curseur :</p>
        <div className="cvp-variables">
          {variables.map((v) => (
            <button key={v.token} type="button" className="cvp-var-btn" title={v.label} onClick={() => onInsertField(tokenToName(v.token))}>
              {v.token}
            </button>
          ))}
        </div>
        <div className="cvp-model">
          <input
            type="text"
            className="cvp-model-name"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="Nom du type (ex. Affaire chantier)"
          />
          <button type="button" className="cvp-model-btn" onClick={saveAsType} title="Enregistrer cette page de garde comme type réutilisable (galerie)">
            Enregistrer comme type
          </button>
        </div>
        {savedNote && <p className="cvp-model-note">{savedNote}</p>}
      </div>
    </div>
  );
}
