/**
 * Boîte de dialogue "Styles de titres" — SÉPARÉE du dialogue "Mise en page"
 * (choix explicite de l'utilisateur, comme le panneau de styles de Word).
 * Police/taille/couleur/gras/italique, mise en forme « Word » (souligné,
 * majuscules, bandeau…) ET schéma de numérotation automatique par niveau de
 * titre (1 à 6). Voir `core/pageLayout.ts` pour le stockage (toujours par
 * document, dans le même commentaire invisible que le reste de la mise en
 * page — seule l'interface est séparée).
 *
 * Présentation « liste + détail » (2026-10-26) : les 6 niveaux à gauche, chacun
 * avec un échantillon de son style ; à droite, les réglages du niveau choisi
 * rangés en blocs (Caractères, Paragraphe, Numérotation, Bandeau) et un aperçu
 * réel. Avant : un tableau de 16 réglages × 6 niveaux, illisible. Aucun réglage
 * n'a été retiré ; « Copier ce style vers… » évite de tout ressaisir.
 *
 * Import/export de cette config entre documents : voir « Styles » de la fenêtre
 * Mise en page (documentStyles.ts).
 */
import { useState } from "react";
import { formatCounter } from "../../core/pageLayout";
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

/** Style CSS d'un titre d'après ses réglages (échantillon de la liste et aperçu). */
function sampleStyle(style: HeadingLevelStyle, opts: { actualSize: boolean }): React.CSSProperties {
  return {
    fontFamily: style.fontFamily,
    fontSize: opts.actualSize ? style.fontSize : undefined,
    color: style.color,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? "italic" : "normal",
    textDecoration: style.underline ? "underline" : "none",
    textTransform: style.uppercase ? "uppercase" : "none",
    letterSpacing: style.letterSpacingPt ? `${style.letterSpacingPt}pt` : undefined,
    textAlign: style.centered ? "center" : "left",
    background: style.background || undefined,
  };
}

/** Texte d'exemple d'un niveau, précédé de son numéro (« 1. », « I. »…) quand il est numéroté. */
function sampleText(level: HeadingLevel, style: HeadingLevelStyle): string {
  const num = style.numbering === "none" ? "" : `${formatCounter(1, style.numbering)}. `;
  return `${num}Titre de niveau ${level}`;
}

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
  const [selected, setSelected] = useState<HeadingLevel>(1);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<HeadingLevel[]>([]);

  const style = headingStyles[selected];
  const setLevel = (level: HeadingLevel, patch: Partial<HeadingLevelStyle>) =>
    setHeadingStyles((prev) => ({ ...prev, [level]: { ...prev[level], ...patch } }));
  const set = (patch: Partial<HeadingLevelStyle>) => setLevel(selected, patch);

  const select = (level: HeadingLevel) => {
    setSelected(level);
    setCopyOpen(false);
    setCopyTargets([]);
  };

  /** Recopie le style du niveau choisi sur les niveaux cochés — sauf la numérotation, propre à chaque niveau. */
  const handleCopy = () => {
    setHeadingStyles((prev) => {
      const next = { ...prev };
      for (const target of copyTargets) next[target] = { ...prev[selected], numbering: prev[target].numbering };
      return next;
    });
    setCopyOpen(false);
    setCopyTargets([]);
  };

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
          <nav className="hs-levels" aria-label="Niveaux de titre">
            {LEVELS.map((level) => {
              const st = headingStyles[level];
              return (
                <button
                  key={level}
                  className={`hs-level${level === selected ? " hs-level-active" : ""}`}
                  onClick={() => select(level)}
                  title={`Régler le style des titres de niveau ${level}`}
                >
                  <span className="hs-level-name">Titre {level}</span>
                  <span className="hs-level-sample" style={sampleStyle(st, { actualSize: false })}>
                    {sampleText(level, st)}
                  </span>
                  <span className="hs-level-meta">
                    {st.fontSize} · {NUMBERING_LABELS[st.numbering]}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="hs-detail">
            <div className="hs-detail-head">
              <h3>Titre {selected}</h3>
              <button className="hs-btn hs-btn-small" onClick={() => setCopyOpen((o) => !o)} aria-expanded={copyOpen}>
                Copier ce style vers…
              </button>
            </div>

            {copyOpen && (
              <div className="hs-copy">
                <span>Recopier sur :</span>
                {LEVELS.filter((l) => l !== selected).map((l) => (
                  <label key={l} className="hs-extra">
                    <input
                      type="checkbox"
                      checked={copyTargets.includes(l)}
                      onChange={(e) =>
                        setCopyTargets((prev) => (e.target.checked ? [...prev, l] : prev.filter((x) => x !== l)))
                      }
                    />
                    Titre {l}
                  </label>
                ))}
                <button className="hs-btn hs-btn-small hs-btn-primary" disabled={copyTargets.length === 0} onClick={handleCopy}>
                  Copier
                </button>
                <span className="hs-copy-note">La numérotation de chaque niveau est conservée.</span>
              </div>
            )}

            <div className="hs-preview-wrap">
              <span className="hs-preview-label">Aperçu</span>
              <div className="hs-preview">
                <div
                  className="hs-preview-title"
                  style={{
                    ...sampleStyle(style, { actualSize: true }),
                    paddingLeft: `${style.indentMm ?? 0}mm`,
                    // Pleine largeur : le bandeau déborde des marges de l'aperçu, comme sur la page.
                    margin: style.background && style.fullWidth ? "0 -14px" : undefined,
                    padding: style.background && style.fullWidth ? `2px 14px 2px calc(14px + ${style.indentMm ?? 0}mm)` : undefined,
                    lineHeight: style.lineHeight ?? 1.2,
                  }}
                >
                  {sampleText(selected, style)}
                </div>
                <div className="hs-preview-text">Texte du paragraphe qui suit le titre, pour juger de l'espacement et du contraste.</div>
              </div>
            </div>

            <fieldset className="hs-group">
              <legend>Caractères</legend>
              <div className="hs-row">
                <label className="hs-field">
                  Police
                  <select value={style.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
                    {FONT_FAMILIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="hs-field">
                  Taille
                  <input
                    type="text"
                    className="hs-size-input"
                    value={style.fontSize}
                    onChange={(e) => set({ fontSize: e.target.value })}
                  />
                </label>
                <div className="hs-field">
                  Couleur
                  <ColorPicker
                    value={style.color}
                    title="Couleur du titre"
                    triggerClassName="hs-color-trigger"
                    trigger={<span className="hs-color-swatch" style={{ background: style.color }} />}
                    onChange={(color) => set({ color })}
                  />
                </div>
              </div>
              <div className="hs-row">
                <label className="hs-extra">
                  <input type="checkbox" checked={style.bold} onChange={(e) => set({ bold: e.target.checked })} /> Gras
                </label>
                <label className="hs-extra">
                  <input type="checkbox" checked={style.italic} onChange={(e) => set({ italic: e.target.checked })} /> Italique
                </label>
                <label className="hs-extra">
                  <input type="checkbox" checked={!!style.underline} onChange={(e) => set({ underline: e.target.checked })} /> Souligné
                </label>
                <label className="hs-extra">
                  <input type="checkbox" checked={!!style.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} /> Majuscules
                </label>
                <label className="hs-extra">
                  Espacement des lettres (pt)
                  <NumberField
                    className="hs-size-input"
                    value={style.letterSpacingPt ?? 0}
                    max={20}
                    onCommit={(v) => set({ letterSpacingPt: v ?? 0 })}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="hs-group">
              <legend>Paragraphe</legend>
              <div className="hs-row">
                <div className="hs-field">
                  Alignement
                  <span className="hs-segmented">
                    <button className={!style.centered ? "hs-seg-on" : ""} onClick={() => set({ centered: false })}>
                      Gauche
                    </button>
                    <button className={style.centered ? "hs-seg-on" : ""} onClick={() => set({ centered: true })}>
                      Centré
                    </button>
                  </span>
                </div>
                <label className="hs-field">
                  Retrait (mm)
                  <NumberField
                    className="hs-size-input"
                    value={style.indentMm ?? 0}
                    max={60}
                    onCommit={(v) => set({ indentMm: v ?? 0 })}
                  />
                </label>
                <label className="hs-field">
                  Interligne
                  {/* 0 = suivre le document, sinon valeur propre au niveau (roadmap 2.2). */}
                  <select
                    value={style.lineHeight ?? 0}
                    title="Interligne de ce niveau de titre (Défaut = suivre l'interligne du document)"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      set({ lineHeight: v === 0 ? undefined : v });
                    }}
                  >
                    {LEVEL_LINE_SPACINGS.map((v) => (
                      <option key={v} value={v}>
                        {v === 0 ? "Défaut" : String(v).replace(".", ",")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="hs-row">
                <label className="hs-field">
                  Espace avant (pt)
                  <NumberField
                    className="hs-size-input"
                    value={style.spacingBeforePt ?? null}
                    allowEmpty
                    max={600}
                    placeholder="doc."
                    title="Espace avant chaque titre de ce niveau, en points (vide = suivre le document)"
                    onCommit={(v) => set({ spacingBeforePt: v ?? undefined })}
                  />
                </label>
                <label className="hs-field">
                  Espace après (pt)
                  <NumberField
                    className="hs-size-input"
                    value={style.spacingAfterPt ?? null}
                    allowEmpty
                    max={600}
                    placeholder="doc."
                    title="Espace après chaque titre de ce niveau, en points (vide = suivre le document)"
                    onCommit={(v) => set({ spacingAfterPt: v ?? undefined })}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="hs-group">
              <legend>Numérotation</legend>
              <div className="hs-row">
                <label className="hs-field">
                  Style de numéro
                  <select value={style.numbering} onChange={(e) => set({ numbering: e.target.value as NumberingScheme })}>
                    {(Object.keys(NUMBERING_LABELS) as NumberingScheme[]).map((scheme) => (
                      <option key={scheme} value={scheme}>
                        {NUMBERING_LABELS[scheme]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="hs-hint">
                Le numéro est écrit directement dans le texte du titre (« 1.2. Mon titre ») : il reste correct dans
                n'importe quel autre outil Markdown. Un niveau sur « Aucune » n'affiche pas de numéro, mais son compteur
                continue pour les niveaux enfants (Titre 1 sans numéro, Titre 2 numéroté « 1. », « 2. »…).
              </p>
            </fieldset>

            <fieldset className="hs-group">
              <legend>Bandeau de fond</legend>
              <div className="hs-row">
                <div className="hs-field">
                  Couleur du bandeau
                  <ColorPicker
                    value={style.background || "#d9d9d9"}
                    title="Couleur du bandeau de fond du titre"
                    triggerClassName="hs-color-trigger"
                    trigger={<span className="hs-color-swatch" style={{ background: style.background || "transparent" }} />}
                    onAutomatic={() => set({ background: "" })}
                    automaticLabel="Aucun bandeau"
                    onChange={(color) => set({ background: color })}
                  />
                </div>
                <label
                  className="hs-extra"
                  title="Le bandeau de couleur déborde des marges, d'un bord à l'autre de la page"
                >
                  <input type="checkbox" checked={!!style.fullWidth} onChange={(e) => set({ fullWidth: e.target.checked })} />{" "}
                  Bandeau pleine largeur
                </label>
              </div>
            </fieldset>

          </div>
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
