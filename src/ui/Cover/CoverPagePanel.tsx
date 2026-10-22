/**
 * Panneau « Page de garde » (2026-10-22, refonte édition en place) — le
 * contenu s'édite DIRECTEMENT SUR LA PAGE (mini-éditeur posé sur la zone
 * peinte, voir startCoverEdit dans MarkdownEditor.tsx) : ce panneau ne
 * porte PLUS de textarea. Il garde les actions autour de l'édition :
 * variables de document insérées au curseur de l'éditeur en place,
 * « Enregistrer comme modèle » (réutilisable depuis la galerie,
 * exportable), suppression.
 */
import { useState } from "react";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { IconTrash } from "../Toolbar/icons";
import { COVER_VARIABLES, addUserCoverTemplate } from "../../core/coverTemplates";
import "./CoverPagePanel.css";

/** Panneau Page de garde : variables, modèle, suppression — l'édition
 *  du contenu se fait sur la page même. */
export function CoverPagePanel({
  source,
  onInsertVariable,
  onDelete,
  onClose,
}: {
  /** Source Markdown COURANTE du nœud (rafraîchie à chaque frappe via
   *  les stats — utilisée pour « Enregistrer comme modèle »). */
  source: string;
  /** Insère une variable au curseur de l'éditeur en place. */
  onInsertVariable: (token: string) => void;
  /** Supprime la page de garde du document. */
  onDelete: () => void;
  /** Ferme le panneau (l'édition en place reste ouverte). */
  onClose: () => void;
}) {
  const [modelName, setModelName] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const saveAsModel = () => {
    const name = modelName.trim();
    if (!name) {
      setSavedNote("Donnez d'abord un nom au modèle.");
      return;
    }
    addUserCoverTemplate({ name, source });
    setSavedNote(`Modèle « ${name} » enregistré — visible dans la galerie.`);
    setModelName("");
  };

  return (
    <div className="cvp-panel">
      <PanelHeader
        title="Page de garde"
        chip="Modèle"
        actions={[
          {
            icon: <IconTrash size={15} />,
            title: "Supprimer la page de garde du document",
            onClick: onDelete,
            danger: true,
          },
        ]}
        onClose={onClose}
        closeTitle="Fermer le panneau (l'édition reste ouverte)"
      />
      <div className="cvp-body">
        <p className="cvp-hint">
          Le contenu s'édite <strong>directement sur la page</strong> — cliquez dans la zone,
          tapez, le ruban s'y applique. Les variables ci-dessous s'insèrent au curseur ; la page
          affiche leur valeur, le fichier garde la variable.
        </p>
        <div className="cvp-variables">
          {COVER_VARIABLES.map((v) => (
            <button key={v.token} type="button" className="cvp-var-btn" title={v.label} onClick={() => onInsertVariable(v.token)}>
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
            placeholder="Nom du modèle (ex. Affaire chantier)"
          />
          <button type="button" className="cvp-model-btn" onClick={saveAsModel} title="Enregistrer cette page de garde comme modèle réutilisable (galerie)">
            Enregistrer comme modèle
          </button>
        </div>
        {savedNote && <p className="cvp-model-note">{savedNote}</p>}
      </div>
    </div>
  );
}
