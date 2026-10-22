/**
 * Panneau « Page de garde » (2026-10-22) — s'ouvre au clic sur une page
 * de garde (NodeSelection sur le nœud coverPage, même cycle que les
 * panneaux Équation/Diagramme) : source Markdown éditable en direct
 * (le bloc sur la page suit à chaque frappe), variables de document
 * insérables en un clic, « Enregistrer comme modèle » (réutilisable
 * depuis la galerie, exportable), suppression.
 */
import { useState } from "react";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { IconTrash } from "../Toolbar/icons";
import { COVER_VARIABLES, addUserCoverTemplate } from "../../core/coverTemplates";
import "./CoverPagePanel.css";

/** Panneau Page de garde : édition de la source + variables + modèle. */
export function CoverPagePanel({
  source,
  onSourceChange,
  onDelete,
  onClose,
}: {
  /** Source Markdown ACTUELLE du nœud (à l'ouverture seulement — le
   * panneau garde ensuite la main sur son textarea pour le curseur). */
  source: string;
  /** Appelé à CHAQUE frappe (mise à jour en direct du document). */
  onSourceChange: (source: string) => void;
  /** Supprime la page de garde du document. */
  onDelete: () => void;
  /** Ferme le panneau (la sélection reste). */
  onClose: () => void;
}) {
  const [value, setValue] = useState(source);
  const [modelName, setModelName] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const onInput = (v: string) => {
    setValue(v);
    onSourceChange(v);
  };

  /** Insère une variable à la position du curseur du textarea. */
  const insertVariable = (token: string) => {
    const ta = document.querySelector<HTMLTextAreaElement>(".cvp-source");
    if (!ta) {
      onInput(value + token);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? start;
    const next = value.slice(0, start) + token + value.slice(end);
    onInput(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const saveAsModel = () => {
    const name = modelName.trim();
    if (!name) {
      setSavedNote("Donnez d'abord un nom au modèle.");
      return;
    }
    addUserCoverTemplate({ name, source: value });
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
        closeTitle="Fermer le panneau (la sélection reste)"
      />
      <div className="cvp-body">
        <div className="cvp-variables">
          {COVER_VARIABLES.map((v) => (
            <button key={v.token} type="button" className="cvp-var-btn" title={v.label} onClick={() => insertVariable(v.token)}>
              {v.token}
            </button>
          ))}
        </div>
        <textarea
          className="cvp-source"
          spellCheck={false}
          value={value}
          onChange={(e) => onInput(e.target.value)}
          placeholder="Contenu de la page de garde (Markdown + variables)…"
        />
        <p className="cvp-hint">
          Le contenu suit les variables du document (propriétés) et se met à jour sur la page à chaque frappe.
        </p>
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
