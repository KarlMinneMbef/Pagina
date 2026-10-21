/**
 * Boîte de dialogue "Styles de titres" — SÉPARÉE du dialogue "Mise en page"
 * (choix explicite de l'utilisateur, comme le panneau de styles de Word).
 * Police/taille/couleur/gras/italique ET schéma de numérotation automatique
 * par niveau de titre (1 à 6). Voir `core/pageLayout.ts` pour le stockage
 * (toujours par document, dans le même commentaire invisible que le reste
 * de la mise en page — seule l'interface est séparée).
 *
 * Import/export de cette config entre documents (mentionné par l'utilisateur
 * comme un besoin futur) : PAS implémenté ici, volontairement — à construire
 * plus tard une fois ce dialogue validé en pratique.
 */
import { useState } from "react";
import type { HeadingLevel, HeadingLevelStyle, NumberingScheme, PageLayoutSettings } from "../../core/pageLayout";
import { ColorPicker } from "../ColorPicker/ColorPicker";
import "./HeadingStyleDialog.css";

const LEVELS: HeadingLevel[] = [1, 2, 3, 4, 5, 6];

const NUMBERING_LABELS: Record<NumberingScheme, string> = {
  none: "Aucune",
  decimal: "1, 2, 3…",
  upperRoman: "I, II, III…",
  lowerRoman: "i, ii, iii…",
  upperAlpha: "A, B, C…",
  lowerAlpha: "a, b, c…",
};

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Calibri", value: "Calibri, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

/** Interlignes proposés par niveau (roadmap 2.2) — 0 = « suivre le
 * document » (layout.lineHeight), les autres sont des valeurs propres. */
const LEVEL_LINE_SPACINGS = [0, 1, 1.15, 1.5, 2, 3];

/** Dialogue « Régler les styles de titres » : police, taille, couleur,
 *  numérotation, interligne et espacement par niveau. */
export function HeadingStyleDialog({
  layout,
  onApply,
  onClose,
}: {
  layout: PageLayoutSettings;
  onApply: (layout: PageLayoutSettings) => void;
  onClose: () => void;
}) {
  const [headingStyles, setHeadingStyles] = useState(layout.headingStyles);

  const setLevel = (level: HeadingLevel, patch: Partial<HeadingLevelStyle>) =>
    setHeadingStyles((prev) => ({ ...prev, [level]: { ...prev[level], ...patch } }));

  const handleApply = () => {
    onApply({ ...layout, headingStyles });
    onClose();
  };

  return (
    <div className="hs-overlay" onMouseDown={onClose}>
      <div className="hs-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="hs-header">
          <span>Styles de titres</span>
          <button className="hs-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>

        <div className="hs-body">
          <p className="hs-hint">
            La numérotation est écrite directement dans le texte du titre ("1.2. Mon titre") — elle reste donc
            correcte dans n'importe quel autre outil Markdown. Un niveau réglé sur "Aucune" n'affiche pas de
            numéro lui-même, mais son compteur continue d'exister pour les niveaux enfants (ex. Titre 1 sans
            numéro, Titre 2 numéroté "1.", "2."...).
          </p>

          <table className="hs-table">
            <thead>
              <tr>
                <th>Niveau</th>
                <th>Police</th>
                <th>Taille</th>
                <th>Couleur</th>
                <th>Gras</th>
                <th>Italique</th>
                <th>Numérotation</th>
                <th>Interligne</th>
                <th>Espace après (pt)</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((level) => {
                const style = headingStyles[level];
                return (
                  <tr key={level}>
                    <td className="hs-level-label">Titre {level}</td>
                    <td>
                      <select value={style.fontFamily} onChange={(e) => setLevel(level, { fontFamily: e.target.value })}>
                        {FONT_FAMILIES.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="hs-size-input"
                        value={style.fontSize}
                        onChange={(e) => setLevel(level, { fontSize: e.target.value })}
                      />
                    </td>
                    <td>
                      <ColorPicker
                        value={style.color}
                        title="Couleur du titre"
                        triggerClassName="hs-color-trigger"
                        trigger={<span className="hs-color-swatch" style={{ background: style.color }} />}
                        onChange={(color) => setLevel(level, { color })}
                      />
                    </td>
                    <td className="hs-checkbox-cell">
                      <input type="checkbox" checked={style.bold} onChange={(e) => setLevel(level, { bold: e.target.checked })} />
                    </td>
                    <td className="hs-checkbox-cell">
                      <input
                        type="checkbox"
                        checked={style.italic}
                        onChange={(e) => setLevel(level, { italic: e.target.checked })}
                      />
                    </td>
                    <td>
                      <select
                        value={style.numbering}
                        onChange={(e) => setLevel(level, { numbering: e.target.value as NumberingScheme })}
                      >
                        {(Object.keys(NUMBERING_LABELS) as NumberingScheme[]).map((scheme) => (
                          <option key={scheme} value={scheme}>
                            {NUMBERING_LABELS[scheme]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {/* Interligne du niveau (roadmap 2.2) : 0 = suivre le
                       * document, sinon valeur propre. */}
                      <select
                        value={style.lineHeight ?? 0}
                        title="Interligne de ce niveau de titre (0 = suivre l'interligne du document)"
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setLevel(level, { lineHeight: v === 0 ? undefined : v });
                        }}
                      >
                        {LEVEL_LINE_SPACINGS.map((v) => (
                          <option key={v} value={v}>
                            {v === 0 ? "Défaut" : String(v).replace(".", ",")}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {/* Espacement APRÈS les titres de ce niveau : vide =
                       * suivre l'espacement des paragraphes du document. */}
                      <input
                        type="text"
                        className="hs-size-input"
                        value={style.spacingAfterPt ?? ""}
                        title="Espace après chaque titre de ce niveau, en points (vide = suivre le document)"
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          if (raw === "") {
                            setLevel(level, { spacingAfterPt: undefined });
                            return;
                          }
                          const pt = Number(raw);
                          if (Number.isFinite(pt) && pt >= 0) setLevel(level, { spacingAfterPt: pt });
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="hs-actions">
          <button className="hs-btn" onClick={onClose}>
            Annuler
          </button>
          <button className="hs-btn hs-btn-primary" onClick={handleApply}>
            Appliquer
          </button>
        </div>
      </div>
    </div>
  );
}
