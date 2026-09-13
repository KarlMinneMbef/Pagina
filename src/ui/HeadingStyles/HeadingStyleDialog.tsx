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
                      <input type="color" value={style.color} onChange={(e) => setLevel(level, { color: e.target.value })} />
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
