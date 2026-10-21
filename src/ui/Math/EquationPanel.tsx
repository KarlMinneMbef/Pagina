/**
 * Panneau « Équation » (2026-10-17, demande : « pour chaque fonction un
 * panneau latéral droit, très simple — les utilisateurs ne peuvent pas
 * coder une équation ») — REVU le 2026-10-21 (points ① et ② de la
 * maquette docs/maquettes/panneau-equation.html) :
 *
 * - ① La formule s'édite DIRECTEMENT DANS LA PAGE : un champ MathLive
 *   flotte sur la zone peinte (voir startMathEdit dans
 *   MarkdownEditor.tsx, même mécanisme que l'édition en-tête/pied).
 *   Ce panneau ne porte PLUS le champ — il garde le type, la palette et
 *   la suppression.
 * - ② PALETTE DE SYMBOLES intégrée au panneau : trois onglets
 *   (Basique / Grec / Opérateurs), 18 touches chacun, insertion dans le
 *   champ de la page via `onInsertLatex` (routé par le handle
 *   `insertMathLatex`) — remplace le clavier virtuel flottant de
 *   MathLive qui recouvrait le document. Repliable par le bouton ⌨
 *   de l'en-tête (vert = ouverte).
 * - 100 % local (tout tourne dans l'app Tauri, aucun service en ligne).
 */
import { useState } from "react";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { IconKeyboard, IconTrash } from "../Toolbar/icons";
import "./EquationPanel.css";

/** Une touche de la palette : glyphe affiché + LaTeX inséré. `#?` est le
 * placeholder MathLive (le curseur y saute après insertion). */
interface EqKey {
  label: string;
  latex: string;
}

interface EqTab {
  id: string;
  label: string;
  keys: EqKey[];
}

/** Palette maison (charte MBEF) — 3 onglets × 18 touches, comme la
 * maquette. Les touches insèrent du LaTeX, jamais l'utilisateur n'en
 * écrit. */
const SYMBOL_TABS: EqTab[] = [
  {
    id: "basique",
    label: "Basique",
    keys: [
      { label: "x²", latex: "x^{#?}" },
      { label: "x₂", latex: "x_{#?}" },
      { label: "a⁄b", latex: "\\frac{#?}{#?}" },
      { label: "√", latex: "\\sqrt{#?}" },
      { label: "ⁿ√", latex: "\\sqrt[#?]{#?}" },
      { label: "( )", latex: "\\left(#?\\right)" },
      { label: "|x|", latex: "\\left|#?\\right|" },
      { label: "÷", latex: "\\div" },
      { label: "·", latex: "\\cdot" },
      { label: "×", latex: "\\times" },
      { label: "±", latex: "\\pm" },
      { label: "=", latex: "=" },
      { label: "≠", latex: "\\ne" },
      { label: "≤", latex: "\\le" },
      { label: "≥", latex: "\\ge" },
      { label: "≈", latex: "\\approx" },
      { label: "%", latex: "\\%" },
      { label: "∞", latex: "\\infty" },
    ],
  },
  {
    id: "grec",
    label: "Grec",
    keys: [
      { label: "α", latex: "\\alpha" },
      { label: "β", latex: "\\beta" },
      { label: "γ", latex: "\\gamma" },
      { label: "δ", latex: "\\delta" },
      { label: "ε", latex: "\\varepsilon" },
      { label: "θ", latex: "\\theta" },
      { label: "λ", latex: "\\lambda" },
      { label: "μ", latex: "\\mu" },
      { label: "ν", latex: "\\nu" },
      { label: "π", latex: "\\pi" },
      { label: "ρ", latex: "\\rho" },
      { label: "σ", latex: "\\sigma" },
      { label: "τ", latex: "\\tau" },
      { label: "φ", latex: "\\varphi" },
      { label: "ω", latex: "\\omega" },
      { label: "Δ", latex: "\\Delta" },
      { label: "Σ", latex: "\\Sigma" },
      { label: "Ω", latex: "\\Omega" },
    ],
  },
  {
    id: "operateurs",
    label: "Opérateurs",
    keys: [
      { label: "∑", latex: "\\sum_{#?}^{#?}" },
      { label: "∫", latex: "\\int_{#?}^{#?}" },
      { label: "∏", latex: "\\prod_{#?}^{#?}" },
      { label: "∂", latex: "\\partial" },
      { label: "∇", latex: "\\nabla" },
      { label: "→", latex: "\\to" },
      { label: "←", latex: "\\leftarrow" },
      { label: "↔", latex: "\\leftrightarrow" },
      { label: "⇒", latex: "\\Rightarrow" },
      { label: "⇔", latex: "\\Leftrightarrow" },
      { label: "∈", latex: "\\in" },
      { label: "∉", latex: "\\notin" },
      { label: "⊂", latex: "\\subset" },
      { label: "∪", latex: "\\cup" },
      { label: "∩", latex: "\\cap" },
      { label: "∀", latex: "\\forall" },
      { label: "∃", latex: "\\exists" },
      { label: "∝", latex: "\\propto" },
    ],
  },
];

/** Panneau Équation : champ MathLive WYSIWYG + palette de symboles,
 *  rendu live sur la page (voir l'en-tête du fichier). */
export function EquationPanel({
  kind,
  onInsertLatex,
  onDelete,
  onClose,
}: {
  /** En ligne (`$…$`) ou en bloc (`$$…$$`) — affiché dans le titre. */
  kind: "inline" | "block";
  /** Insère du LaTeX dans le champ d'édition flottant de la page
   * (handle `insertMathLatex` de MarkdownEditor). */
  onInsertLatex: (latex: string) => void;
  /** Supprime la formule du document. */
  onDelete: () => void;
  /** Ferme le panneau (la formule reste sélectionnée). */
  onClose: () => void;
}) {
  // Palette de symboles : OUVERTE par défaut (point ② maquette — c'est le
  // moyen principal de saisie pour des utilisateurs qui ne codent pas en
  // LaTeX), repliable par le bouton ⌨ de l'en-tête.
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [tabId, setTabId] = useState("basique");

  const tab = SYMBOL_TABS.find((t) => t.id === tabId) ?? SYMBOL_TABS[0];

  return (
    <div className="eq-panel">
      <PanelHeader
        title="Équation"
        chip={kind === "block" ? "En bloc" : "En ligne"}
        actions={[
          {
            icon: <IconKeyboard size={15} />,
            title: paletteOpen ? "Masquer la palette de symboles" : "Afficher la palette de symboles",
            onClick: () => setPaletteOpen((v) => !v),
            active: paletteOpen,
          },
          {
            icon: <IconTrash size={15} />,
            title: "Supprimer la formule du document",
            onClick: onDelete,
            danger: true,
          },
        ]}
        onClose={onClose}
        closeTitle="Fermer le panneau (la sélection reste)"
      />
      <div className="eq-body">
        {paletteOpen && (
          <div className="eq-palette">
            <div className="eq-palette-tabs" role="tablist">
              {SYMBOL_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={t.id === tab.id}
                  className={`eq-palette-tab${t.id === tab.id ? " eq-palette-tab-active" : ""}`}
                  onClick={() => setTabId(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="eq-palette-grid">
              {tab.keys.map((k) => (
                <button
                  key={k.label + k.latex}
                  type="button"
                  className="eq-key"
                  title={`Insérer ${k.label}`}
                  onClick={() => onInsertLatex(k.latex)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className="eq-hint">
          La formule s'édite directement dans la page (cadre vert). Cliquez une touche pour l'insérer à l'endroit du curseur.
        </p>
      </div>
    </div>
  );
}
