/**
 * Panneau « Image » (format .xmd, 2026-10-26) : s'ouvre quand une image est SÉLECTIONNÉE (clic sur l'image peinte, ou juste
 * après une insertion), comme le panneau Diagramme.
 *
 * - Largeur : « Automatique » (taille d'origine, plafonnée à la zone de texte) ou un pourcentage de la largeur de la zone de
 *   texte. Une largeur est écrite dans le fichier en HTML `<img width>` (lisible dans tout lecteur Markdown) ; sans largeur
 *   l'image reste du Markdown standard. On peut aussi l'étirer directement SUR LA PAGE : poignées d'angle (useImageResize).
 * - Transformer (2026-10-26, mêmes commandes que CasualOffice) : pivoter à gauche / à droite (par pas de 90°), miroir
 *   horizontal / vertical — stockés comme une transformation CSS, le fichier d'origine n'est jamais modifié.
 * - Bordure (2026-10-26) : épaisseur (aucune / fine / moyenne / épaisse) + couleur.
 * - Texte alternatif : lu par les lecteurs d'écran et affiché si l'image est introuvable.
 * - Suppression.
 *
 * Remonté à chaque changement d'image (`key` = position du nœud), jamais à la frappe (le champ garde son curseur).
 */
import { useState, type ReactNode } from "react";
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
  /** Transformation CSS (`rotate(90deg) scaleX(-1)`) ; `null` = aucune. */
  transform?: string | null;
  /** Épaisseur de bordure en px ; `null` = aucune. */
  borderWidth?: number | null;
  borderColor?: string | null;
}

/** Action de transformation (même vocabulaire que CasualOffice). */
export type ImageTransformAction = "rotateCW" | "rotateCCW" | "flipH" | "flipV";

/** Largeurs proposées d'un clic (en % de la largeur de la zone de texte). */
const PRESETS = [25, 50, 75, 100];

/** Préréglages de bordure (px) — mêmes paliers que CasualOffice. */
const BORDER_PRESETS: { label: string; width: number | null }[] = [
  { label: "Aucune", width: null },
  { label: "Fine", width: 1 },
  { label: "Moyenne", width: 2 },
  { label: "Épaisse", width: 4 },
];

const TRANSFORM_BUTTONS: { action: ImageTransformAction; label: string; icon: ReactNode }[] = [
  {
    action: "rotateCCW",
    label: "Pivoter à gauche (90°)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z" />
      </svg>
    ),
  },
  {
    action: "rotateCW",
    label: "Pivoter à droite (90°)",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ transform: "scaleX(-1)" }}>
        <path d="M7.11 8.53 5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z" />
      </svg>
    ),
  },
  {
    action: "flipH",
    label: "Miroir horizontal",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3v18" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2" />
        <path d="M10 6 4 12l6 6V6zM14 6v12l6-6-6-6z" fill="currentColor" opacity="0.85" />
      </svg>
    ),
  },
  {
    action: "flipV",
    label: "Miroir vertical",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 12h18" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2 2" />
        <path d="M6 10 12 4l6 6H6zM6 14h12l-6 6-6-6z" fill="currentColor" opacity="0.85" />
      </svg>
    ),
  },
];

/** « 50% » → 50 ; « 320 » (pixels, ancien fichier) ou vide → `null`. */
export function percentOf(width: string | null): number | null {
  const m = width?.match(/^(\d+(?:\.\d+)?)%$/);
  return m ? Number(m[1]) : null;
}

export function ImagePanel({
  src,
  alt,
  width,
  transform,
  borderWidth,
  borderColor,
  onChange,
  onTransform,
  onDelete,
  onClose,
}: {
  src: string;
  alt: string;
  width: string | null;
  /** Transformation CSS courante (`rotate(90deg)…`) ou `null`. */
  transform: string | null;
  /** Épaisseur de bordure px ou `null`. */
  borderWidth: number | null;
  borderColor: string | null;
  onChange: (patch: ImagePatch) => void;
  onTransform: (action: ImageTransformAction) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [altText, setAltText] = useState(alt);
  const percent = percentOf(width);
  const fileName = src.split("/").pop() ?? src;
  const activePreset = BORDER_PRESETS.find((p) => p.width === (borderWidth ?? null))?.width;

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
          <img src={resolveAssetUrl(src)} alt={alt} style={transform ? { transform } : undefined} />
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
          <p className="im-hint-small">Vous pouvez aussi étirer l'image par ses poignées d'angle, sur la page.</p>
        </div>

        <div className="im-field">
          <span className="im-label">Transformer</span>
          <div className="im-transform">
            {TRANSFORM_BUTTONS.map(({ action, label, icon }) => (
              <button key={action} type="button" className="im-transform-btn" title={label} onMouseDown={keepEditorFocus} onClick={() => onTransform(action)}>
                {icon}
              </button>
            ))}
          </div>
          {transform && (
            <p className="im-hint-small">
              Transformation : <code>{transform}</code> — <button type="button" className="im-link" onMouseDown={keepEditorFocus} onClick={() => onChange({ transform: null })}>retirer</button>
            </p>
          )}
        </div>

        <div className="im-field">
          <span className="im-label">Bordure</span>
          <div className="im-presets">
            {BORDER_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onMouseDown={keepEditorFocus}
                className={`im-preset${activePreset === p.width ? " im-preset-on" : ""}`}
                onClick={() => onChange({ borderWidth: p.width, borderColor: p.width ? borderColor ?? "#003f2b" : borderColor })}
              >
                {p.label}
              </button>
            ))}
          </div>
          {borderWidth != null && borderWidth > 0 && (
            <label className="im-inline">
              <span>Couleur</span>
              <input
                type="color"
                className="im-color"
                value={borderColor ?? "#003f2b"}
                title="Couleur de la bordure"
                onChange={(e) => onChange({ borderColor: e.target.value })}
              />
            </label>
          )}
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
