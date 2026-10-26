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
import { Fragment, useState } from "react";
import type { HeadingLevel, HeadingLevelStyle, NumberingScheme, PageLayoutSettings } from "../../core/pageLayout";
import { ColorPicker } from "../ColorPicker/ColorPicker";
import { NumberField } from "../NumberField";
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
                  <Fragment key={level}>
                  <tr>
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
                      <NumberField
                        className="hs-size-input"
                        value={style.spacingAfterPt ?? null}
                        allowEmpty
                        max={600}
                        title="Espace après chaque titre de ce niveau, en points (vide = suivre le document)"
                        onCommit={(v) => setLevel(level, { spacingAfterPt: v ?? undefined })}
                      />
                    </td>
                  </tr>
                  {/* Mise en forme « Word » du niveau (soulignement, majuscules,
                   * retrait, centrage, bandeau de fond). */}
                  <tr className="hs-extra-row">
                    <td />
                    <td colSpan={8}>
                      <label className="hs-extra">
                        <input type="checkbox" checked={!!style.underline} onChange={(e) => setLevel(level, { underline: e.target.checked })} /> Souligné
                      </label>
                      <label className="hs-extra">
                        <input type="checkbox" checked={!!style.uppercase} onChange={(e) => setLevel(level, { uppercase: e.target.checked })} /> Majuscules
                      </label>
                      <label className="hs-extra">
                        <input type="checkbox" checked={!!style.centered} onChange={(e) => setLevel(level, { centered: e.target.checked })} /> Centré
                      </label>
                      <label className="hs-extra">
                        Retrait (mm)
                        <NumberField className="hs-size-input" value={style.indentMm ?? 0} max={60} onCommit={(v) => setLevel(level, { indentMm: v ?? 0 })} />
                      </label>
                      <label className="hs-extra">
                        Espacement lettres (pt)
                        <NumberField className="hs-size-input" value={style.letterSpacingPt ?? 0} max={20} onCommit={(v) => setLevel(level, { letterSpacingPt: v ?? 0 })} />
                      </label>
                      <label className="hs-extra">
                        Espace avant (pt)
                        <NumberField className="hs-size-input" value={style.spacingBeforePt ?? null} allowEmpty max={600} placeholder="doc." onCommit={(v) => setLevel(level, { spacingBeforePt: v ?? undefined })} />
                      </label>
                      <label className="hs-extra" title="Le bandeau de couleur déborde des marges, d'un bord à l'autre de la page">
                        <input type="checkbox" checked={!!style.fullWidth} onChange={(e) => setLevel(level, { fullWidth: e.target.checked })} /> Bandeau pleine largeur
                      </label>
                      <span className="hs-extra">
                        Bandeau
                        <ColorPicker
                          value={style.background || "#d9d9d9"}
                          title="Couleur du bandeau de fond du titre"
                          triggerClassName="hs-color-trigger"
                          trigger={<span className="hs-color-swatch" style={{ background: style.background || "transparent" }} />}
                          onAutomatic={() => setLevel(level, { background: "" })}
                          onChange={(color) => setLevel(level, { background: color })}
                        />
                      </span>
                    </td>
                  </tr>
                  </Fragment>
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
