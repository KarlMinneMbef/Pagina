/**
 * Fenêtre « Paragraphe » — onglet « Retrait et espacement », comme Word
 * (demande utilisateur 2026-10-21 : « reprends le fonctionnement de Word
 * […] plus la fenêtre retrait et espacement »). Ouverte par le lanceur du
 * groupe Paragraphe du ruban et par « Options d'interligne… » du menu.
 *
 * Contenu :
 * - Général : Alignement (du paragraphe sous le curseur).
 * - Retrait : Gauche / Droite en cm (paragraphe courant) — même modèle
 *   que les boutons Tabulation ± (ParagraphMarkdown, repli HTML
 *   <p style="margin-left/right">).
 * - Espacement : Avant / Après (pt) + Interligne — réglages du
 *   DOCUMENT (layout, comme le ruban et le menu Interligne).
 * - Aperçu en direct (3 mini-paragraphes avec alignement, retraits,
 *   espacement et interligne appliqués).
 * - « Définir par défaut » : les réglages ESPACEMENT/INTERLIGNE
 *   deviennent ceux des nouveaux documents (même mécanisme que Mise en
 *   page — l'alignement/retrait sont ceux du paragraphe, pas sauvegardés).
 */
import { useState } from "react";
import { NumberField } from "../NumberField";
import type { PageLayoutSettings } from "../../core/pageLayout";
import { saveDefaultPageLayout } from "../../core/pageLayout";
import "./ParagraphDialog.css";

const ALIGNEMENTS: { value: "left" | "center" | "right" | "justify"; label: string }[] = [
  { value: "left", label: "À gauche" },
  { value: "center", label: "Centré" },
  { value: "right", label: "À droite" },
  { value: "justify", label: "Justifié" },
];

/** Fenêtre « Paragraphe » — onglet « Retrait et espacement », comme Word
 *  (détail complet en tête de fichier). */
export function ParagraphDialog({
  layout,
  paragraphFormat,
  onApply,
  onClose,
}: {
  /** Mise en page du document (interligne + espacements). */
  layout: PageLayoutSettings;
  /** Format du paragraphe sous le curseur (alignement + retraits cm). */
  paragraphFormat: {
    align: "left" | "center" | "right" | "justify" | null;
    indentLeftCm: number;
    indentRightCm: number;
  };
  /** Applique : alignement + retraits du paragraphe, et layout (espacement
   * + interligne du document) mis à jour. */
  onApply: (patch: {
    align: "left" | "center" | "right" | "justify";
    indentLeftCm: number;
    indentRightCm: number;
    layout: PageLayoutSettings;
  }) => void;
  onClose: () => void;
}) {
  const [align, setAlign] = useState<"left" | "center" | "right" | "justify">(paragraphFormat.align ?? "left");
  const [indentLeft, setIndentLeft] = useState(paragraphFormat.indentLeftCm);
  const [indentRight, setIndentRight] = useState(paragraphFormat.indentRightCm);
  const [spaceBefore, setSpaceBefore] = useState(layout.spacingBeforePt);
  const [spaceAfter, setSpaceAfter] = useState(layout.paragraphSpacingPt);
  const [lineSpacing, setLineSpacing] = useState(layout.lineHeight);
  const [defaultSaved, setDefaultSaved] = useState(false);

  const draftLayout: PageLayoutSettings = {
    ...layout,
    spacingBeforePt: spaceBefore,
    paragraphSpacingPt: spaceAfter,
    lineHeight: lineSpacing,
  };

  const handleApply = () => {
    onApply({ align, indentLeftCm: indentLeft, indentRightCm: indentRight, layout: draftLayout });
    onClose();
  };

  const handleSetDefault = () => {
    // Seuls les réglages du DOCUMENT ont un sens par défaut (l'alignement
    // et le retrait appartiennent au paragraphe cliqué, pas aux nouveaux).
    saveDefaultPageLayout(draftLayout);
    setDefaultSaved(true);
  };

  return (
    <div className="pg-overlay" onMouseDown={onClose}>
      <div className="pg-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pg-header">
          <span>Paragraphe</span>
          <button className="pg-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>

        <div className="pg-tabbar">
          <span className="pg-tab-active">Retrait et espacement</span>
        </div>

        <div className="pg-body">
          <section className="pg-section">
            <h4 className="pg-section-title">Général</h4>
            <div className="pg-row">
              <label className="pg-field">
                <span>Alignement :</span>
                <select value={align} onChange={(e) => setAlign(e.target.value as typeof align)}>
                  {ALIGNEMENTS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="pg-section">
            <h4 className="pg-section-title">Retrait</h4>
            <div className="pg-row">
              <label className="pg-field">
                <span>Gauche :</span>
                <NumberField value={indentLeft} onCommit={(v) => setIndentLeft(v ?? 0)} max={50} title="Retrait à gauche du paragraphe, en cm" />
                <span className="pg-unit">cm</span>
              </label>
              <label className="pg-field">
                <span>Droite :</span>
                <NumberField value={indentRight} onCommit={(v) => setIndentRight(v ?? 0)} max={50} title="Retrait à droite du paragraphe, en cm" />
                <span className="pg-unit">cm</span>
              </label>
            </div>
          </section>

          <section className="pg-section">
            <h4 className="pg-section-title">Espacement</h4>
            <div className="pg-row">
              <label className="pg-field">
                <span>Avant :</span>
                <NumberField value={spaceBefore} onCommit={(v) => setSpaceBefore(v ?? 0)} max={600} title="Espace avant chaque paragraphe, en points" />
                <span className="pg-unit">pt</span>
              </label>
              <label className="pg-field">
                <span>Après :</span>
                <NumberField value={spaceAfter} onCommit={(v) => setSpaceAfter(v ?? 0)} max={600} title="Espace après chaque paragraphe, en points" />
                <span className="pg-unit">pt</span>
              </label>
              <label className="pg-field">
                <span>Interligne :</span>
                <select value="multiple" disabled title="Interligne multiple (comme Word par défaut)">
                  <option value="multiple">Multiple</option>
                </select>
              </label>
              <label className="pg-field">
                <span>de :</span>
                <NumberField className="pg-input-narrow" value={lineSpacing} onCommit={(v) => setLineSpacing(v ?? 1.15)} min={0.5} max={5} title="Interligne (0,5 à 5)" />
              </label>
            </div>
          </section>

          <section className="pg-section">
            <h4 className="pg-section-title">Aperçu</h4>
            <div className="pg-preview">
              <p className="pg-preview-para pg-preview-sibling">Paragraphe précédent Paragraphe précédent Paragraphe précédent</p>
              <p
                className="pg-preview-para pg-preview-sample"
                style={{
                  textAlign: align,
                  marginLeft: `${indentLeft}cm`,
                  marginRight: `${indentRight}cm`,
                  lineHeight: lineSpacing,
                  marginTop: `${spaceBefore}pt`,
                  marginBottom: `${spaceAfter}pt`,
                }}
              >
                Suite à nos deux rendez-vous de chantier d'hier matin et d'hier après-midi, vous trouverez ci-dessous les différents points à respecter pour la levée des réserves de la première phase.
              </p>
              <p className="pg-preview-para pg-preview-sibling">Paragraphe suivant Paragraphe suivant Paragraphe suivant</p>
            </div>
          </section>
        </div>

        <div className="pg-actions">
          <button className="pg-btn" onClick={handleSetDefault} title="Les réglages d'espacement/interligne deviennent ceux des nouveaux documents">
            {defaultSaved ? "Défini par défaut ✓" : "Définir par défaut"}
          </button>
          <span className="pg-actions-spacer" />
          <button className="pg-btn pg-btn-primary" onClick={handleApply}>
            OK
          </button>
          <button className="pg-btn" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
