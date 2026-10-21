/**
 * Chargement PARESSEUX de MathLive avec ses styles, pour le champ
 * d'édition de formule flottant SUR LA PAGE (startMathEdit dans
 * MarkdownEditor.tsx, point ① de la maquette panneau-equation.html).
 *
 * MathLive est volumineux : il n'est chargé que la première fois qu'une
 * formule est éditée, jamais au démarrage (découpage de bundle). Avant
 * le 2026-10-21, ce chargement vivait dans EquationPanel.tsx (le champ
 * était dans le panneau) ; le champ étant passé sur la page, c'est ce
 * module qui le porte — le panneau reste léger (palette de symboles).
 */
import "mathlive/static.css";
import "mathlive/fonts.css";

export { MathfieldElement } from "mathlive";
