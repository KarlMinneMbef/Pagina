/**
 * Panneau « Image » (format .xmd, 2026-10-26) : s'ouvre quand une image est SÉLECTIONNÉE (clic sur l'image peinte, ou juste
 * après une insertion), comme le panneau Diagramme.
 *
 * - Largeur : « Automatique » (taille d'origine, plafonnée à la zone de texte) ou un pourcentage de la largeur de la zone de
 *   texte. Une largeur est écrite dans le fichier en HTML `<img width>` (lisible dans tout lecteur Markdown) ; sans largeur
 *   l'image reste du Markdown standard.
 * - Texte alternatif : lu par les lecteurs d'écran et affiché si l'image est introuvable.
 * - Suppression.
 *
 * Remonté à chaque changement d'image (`key` = position du nœud), jamais à la frappe (le champ garde son curseur).
 */
import { useState } from "react";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { IconTrash } from "../Toolbar/icons";
import { NumberField } from "../NumberField";
import { keepEditorFocus } from "../focusGuard";
import { resolveAssetUrl } from "../Editor/assetUrls";
import "./ImagePanel.css";

export interface ImagePatch {
  alt?: string;
  /** `null` = automatique. */
  width?: string | null;
}

/** Largeurs proposées d'un clic (en % de la largeur de la zone de texte). */
const PRESETS = [25, 50, 75, 100];

/** « 50% » → 50 ; « 320 » (pixels, ancien fichier) ou vide → `null`. */
export function percentOf(width: string | null): number | null {
  const m = width?.match(/^(\d+(?:\.\d+)?)%$/);
  return m ? Number(m[1]) : null;
}

export function ImagePanel({
  src,
  alt,
  width,
  onChange,
  onDelete,
  onClose,
}: {
  src: string;
  alt: string;
  width: string | null;
  onChange: (patch: ImagePatch) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [altText, setAltText] = useState(alt);
  const percent = percentOf(width);
  const fileName = src.split("/").pop() ?? src;

  return (
    <div className="im-panel">
      <PanelHeader
        title="Image"
        chip={fileName.length > 24 ? `${fileName.slice(0, 22)}…` : fileName}
        actions={[{ icon: <IconTrash size={15} />, title: "Supprimer l'image du document", onClick: onDelete, danger: true }]}
        onClose={onClose}
        closeTitle="Fermer le panneau (la sélection reste)"
      />
      <div className="im-body">
        <div className="im-preview">
          <img src={resolveAssetUrl(src)} alt={alt} />
        </div>

        <div className="im-field">
          <span className="im-label">Largeur</span>
          <div className="im-presets">
            <button type="button" onMouseDown={keepEditorFocus} className={`im-preset${width === null ? " im-preset-on" : ""}`} onClick={() => onChange({ width: null })} title="Taille d'origine, plafonnée à la zone de texte">
              Auto
            </button>
            {PRESETS.map((p) => (
              <button key={p} type="button" onMouseDown={keepEditorFocus} className={`im-preset${percent === p ? " im-preset-on" : ""}`} onClick={() => onChange({ width: `${p}%` })}>
                {p} %
              </button>
            ))}
          </div>
          <label className="im-inline">
            <span>Personnalisée (%)</span>
            <NumberField
              className="im-number"
              value={percent}
              allowEmpty
              min={5}
              max={100}
              placeholder="auto"
              title="Largeur en pourcentage de la zone de texte (vide = automatique)"
              onCommit={(v) => onChange({ width: v === null ? null : `${Math.max(5, Math.min(100, v))}%` })}
            />
          </label>
        </div>

        <label className="im-field">
          <span className="im-label">Texte alternatif</span>
          <input
            type="text"
            className="im-text"
            value={altText}
            placeholder="Décrivez l'image…"
            onChange={(e) => {
              setAltText(e.target.value);
              onChange({ alt: e.target.value });
            }}
          />
        </label>

        <p className="im-hint">
          L'image est embarquée dans le fichier .xmd (dossier <code>images/</code>). Pour la centrer, utilisez les boutons d'alignement du paragraphe qui la contient.
        </p>
      </div>
    </div>
  );
}
