/**
 * Couche de rendu/édition : encapsule Tiptap + sa sérialisation Markdown.
 * Ce composant ne connaît rien du filesystem ni du store d'onglets : il reçoit
 * un contenu Markdown initial et notifie les changements via onChange.
 * (Ce découplage permet d'ajouter plus tard un panneau IA qui lit/modifie une
 * sélection sans toucher à ce fichier.)
 *
 * Architecture de pagination (2026-09-12, réécriture) : voir CLAUDE.md pour
 * le contexte complet. En résumé — l'ancien système (un seul flux continu +
 * des "trous" calculés pour simuler des sauts de page) faisait des pages de
 * hauteur variable, recalculée à chaque frappe : pas acceptable, les feuilles
 * doivent être des boîtes de taille FIXE, comme dans Word. Solution retenue
 * (technique inspirée de CasualOffice/docs, réécrite pour nos besoins — voir
 * `pagination/paintPages.ts`) :
 * - Tiptap édite un document dans une zone invisible (`.xmd-live-editor-host`
 *   ci-dessous) — c'est la SEULE source de vérité éditable : curseur,
 *   sélection, undo/redo, IME... tout reste 100% natif à ProseMirror.
 * - À chaque modification, on répartit les blocs de premier niveau en pages
 *   de hauteur fixe et on peint des CLONES en lecture seule dans des boîtes
 *   `.xmd-page` (voir `paintPages.ts`) — jamais redimensionnées.
 * - Les clics sur ces clones sont traduits en position réelle dans l'éditeur
 *   invisible (`resolveClickPosition.ts`), qui reprend alors le focus.
 * - Un curseur dessiné à la main (`caretPosition.ts`) est repositionné à
 *   chaque changement de sélection, puisque la vraie sélection ProseMirror
 *   est invisible.
 */
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Editor as TiptapEditor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableMarkdown as Table } from "./extensions/TableMarkdown";
import { TableRowStyled as TableRow } from "./extensions/TableRowStyle";
import { TableCellStyled as TableCell, TableHeaderStyled as TableHeader } from "./extensions/TableCellStyle";
import { CellSelection } from "@tiptap/pm/tables";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CharacterCount from "@tiptap/extension-character-count";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import { FontSize } from "./extensions/FontSize";
import { Markdown } from "tiptap-markdown";
import { useEffect, useLayoutEffect, useImperativeHandle, forwardRef, useRef, useMemo, useState, type CSSProperties } from "react";
import { PageBreak } from "./extensions/PageBreak";
import { Bookmark } from "./extensions/Bookmark";
import { ParagraphMarkdown } from "./extensions/ParagraphMarkdown";
import { TocMarker } from "./extensions/TocMarker";
import { FootnoteReference, FootnoteDefinition } from "./extensions/Footnote";
import { MermaidDiagram, setMermaidRenderedCallback } from "./extensions/MermaidDiagram";
import { SectionBreak } from "./extensions/SectionBreak";
import { CoverPage, setCoverRenderProviders, refreshAllCoverPages } from "./extensions/CoverPage";
import {
  CoverZoneStart,
  CoverZoneEnd,
  migrateCoverMarkdown,
  findCoverZoneAround,
  coverZoneIndexAt,
  extractCoverZoneMarkdown,
  type CoverZoneInfo,
} from "./extensions/CoverZone";
import { DocField, setDocFieldContext, refreshAllDocFields } from "./extensions/DocField";
import { CoverTheme } from "./extensions/CoverTheme";
import { DOMParser as ProseMirrorDOMParser, Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { InlineMath, BlockMath } from "./extensions/Math";
import { applyHeadingNumbering } from "./extensions/HeadingAutoNumber";
import {
  paintPages,
  HEADER_TEMPLATE_ATTR,
  FOOTER_TEMPLATE_ATTR,
  COL_RESIZE_HANDLE_CLASS,
  COL_RESIZE_TABLE_POS_ATTR,
  COL_RESIZE_COL_INDEX_ATTR,
  ROW_RESIZE_HANDLE_CLASS,
  ROW_RESIZE_TABLE_POS_ATTR,
  ROW_RESIZE_ROW_INDEX_ATTR,
} from "./pagination/paintPages";
import { HorizontalRuler, VerticalRuler, PAGE_GAP_PX } from "./pagination/Ruler";
import type { MathfieldElement } from "mathlive";
import { resolveClickPosition, findClonedBlock } from "./pagination/resolveClickPosition";
import type { CloneIndex } from "./pagination/cloneIndex";
import { computeCaretScreenPosition } from "./pagination/caretPosition";
import { computeSelectionRects } from "./pagination/selectionHighlight";
import { SelectionBar } from "./SelectionBar";
import { resolvePageSizeMm, formatTodayForHeaderFooter, type PageLayoutSettings } from "../../core/pageLayout";
import "katex/dist/katex.min.css";
import "./MarkdownEditor.css";
// Après MarkdownEditor.css : à spécificité égale, les thèmes de page de garde
// doivent l'emporter sur le style générique des titres.
import "../Cover/coverThemes.css";
import { keepEditorFocus } from "../focusGuard";
import {
  getActiveBlockStyle,
  getActiveMarks,
  getActiveAlign,
  getActiveListType,
  getInsideToc,
  findMatchesInDoc,
  getMermaidAtSelection,
  getCoverZoneAtSelection,
  getMathAtSelection,
  currentTextColor,
  currentFontFamily,
} from "./editorQueries";
import {
  findCellPos,
  applyToSelectedCells,
  clearSelectedCellContents,
  applyBorderPreset,
  getSelectionShape,
  setGridLineBorder,
  applyColumnWidth,
  applyRowHeight,
  type GridLine,
} from "./editorTableOps";
import {
  FONT_SIZE_STEPS,
  currentFontSizePt,
  nextCase,
  copyEditorSelection,
  cutEditorSelection,
  pasteIntoEditor,
  slugifyBookmark,
  escapeHtmlText,
  headerFooterTargetNearViewport,
  revealInViewport,
  mmToPx,
} from "./editorUtils";
import { openDocFieldEditor } from "./docFieldEdit";
import { useCodeLangChip } from "./hooks/useCodeLangChip";
import { useSelectionBarSync } from "./hooks/useSelectionBarSync";

/** Options de recherche du panneau « Rechercher / Remplacer » (roadmap
 * 2.4) — mêmes sémantiques que Word. */
export interface FindReplaceOptions {
  /** `false` (défaut) : insensible à la casse, comme la recherche de Word
   * par défaut. */
  matchCase: boolean;
  /** `true` : l'occurrence doit être délimitée par des caractères non
   * "mot" (lettres/chiffres) de chaque côté. */
  wholeWord: boolean;
}

/** Une occurrence avec son CONTEXTE pour la liste « Résultats » du
 * panneau Rechercher (façon Word) : ~40 caractères avant/après,
 * l'occurrence elle-même en gras dans l'interface. */
export interface FindMatchResult {
  from: number;
  to: number;
  before: string;
  match: string;
  after: string;
}

/** Contrat exposé par <MarkdownEditor /> via ref : toutes les actions du
 *  ruban (ToolbarActions), stats, zoom, pagination, mise en page. */
export interface MarkdownEditorHandle {
  getMarkdown: () => string;
  getHTML: () => string;
  focus: () => void;
  undo: () => void;
  redo: () => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  toggleHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
  setParagraph: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleBlockquote: () => void;
  toggleCodeBlock: () => void;
  /** Code EN LIGNE (`` `code` ``) — distinct de `toggleCodeBlock` (un bloc
   * entier). */
  toggleCode: () => void;
  setLink: () => void;
  // --- Presse-papiers (boutons Coller/Couper/Copier du ruban) ---
  /** Copie la sélection en Markdown (texte brut) via l'API Clipboard. */
  copySelection: () => void;
  /** Copie la sélection puis la supprime. */
  cutSelection: () => void;
  /** Insère le texte du presse-papiers à la position du curseur — le texte
   * passe par le parseur Markdown de tiptap-markdown (override de
   * `insertContentAt`), donc coller du Markdown le convertit en nœuds
   * riches, pas en texte brut. */
  pasteClipboard: () => void;
  /** Agrandit/Réduit la police de la sélection d'un pas dans
   * `FONT_SIZE_STEPS` (voir juste dessous), façon Word. */
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  /** Fait cycler la casse de la sélection : minuscules/mixte →
   * MAJUSCULES → Casse de titre → minuscules. */
  changeCase: () => void;
  /** `rows`/`cols` : taille choisie via le sélecteur-grille du ruban (façon
   * Word) — voir `TableSizePicker` dans `Toolbar.tsx`. */
  insertTable: (rows: number, cols: number) => void;
  /** Commandes de tableau ci-dessous : toutes fournies nativement par
   * `@tiptap/extension-table`, juste exposées ici. Sans effet si le curseur
   * n'est pas dans un tableau (Tiptap ignore silencieusement). Rien
   * au-delà du Markdown standard (pas de fusion/scission de cellules,
   * pas de largeurs personnalisées) — voir la discussion avec
   * l'utilisateur dans CLAUDE.md. */
  addRowBefore: () => void;
  addRowAfter: () => void;
  deleteRow: () => void;
  addColumnBefore: () => void;
  addColumnAfter: () => void;
  deleteColumn: () => void;
  deleteTable: () => void;
  /** Fusion/scission de cellules + couleur de fond/bordures par côté —
   * onglet "Format avancé", groupe "Tableau" (voir `TableCellStyle.ts`).
   * Sans équivalent Markdown standard : un tableau qui utilise l'une de ces
   * fonctions bascule automatiquement en `<table>` HTML à la sauvegarde
   * (voir `TableMarkdown.ts`, `isMarkdownSerializable`) — les tableaux
   * simples restent en syntaxe GFM comme avant, rien ne change pour eux. */
  mergeCells: () => void;
  splitCell: () => void;
  /** Transforme la ligne courante en ligne d'en-tête (et inversement) —
   * commande native de `@tiptap/extension-table`. Sans effet hors tableau. */
  toggleHeaderRow: () => void;
  /** Vide le contenu de la cellule sous le curseur (ou de toutes les
   * cellules de la sélection) sans supprimer les cellules. */
  clearCellContents: () => void;
  setCellBackgroundColor: (color: string | null) => void;
  /** `sides` vide = tous les côtés. `css` = chaîne de bordure CSS complète
   * (ex. "2px solid #343334") ou `null` pour retirer la bordure sur ces
   * côtés. Appliqué à la cellule courante, ou à toutes les cellules
   * couvertes par une sélection multi-cellules (glisser-sélectionner). */
  setCellBorder: (sides: ("top" | "right" | "bottom" | "left")[], css: string | null) => void;
  /** Présets façon Word (voir groupe "Tableau", Format avancé) : "all"/"none"
   * touchent les 4 côtés de chaque cellule sélectionnée ; "outside"/"inside"
   * distinguent le pourtour de la sélection de ses arêtes internes (voir
   * `applyBorderPreset` dans ce fichier). */
  setCellBorderPreset: (preset: "all" | "outside" | "inside" | "none", css: string | null) => void;
  /** Applique/retire une bordure sur des lignes de grille PRÉCISES du
   * schéma interactif (voir `GridLine`/`setGridLineBorder` dans ce fichier)
   * — contrairement à `setCellBorderPreset`, permet de ne toucher QUE les
   * lignes explicitement cliquées (ex. une seule ligne interne parmi
   * plusieurs), pas "tout l'intérieur" d'un coup. */
  setGridLineBorder: (lines: GridLine[], css: string | null) => void;
  setCellVerticalAlign: (align: "top" | "middle" | "bottom") => void;
  insertHorizontalRule: () => void;
  insertPageBreak: () => void;
  setFontFamily: (family: string) => void;
  unsetFontFamily: () => void;
  setFontSize: (size: string) => void;
  unsetFontSize: () => void;
  setColor: (color: string) => void;
  unsetColor: () => void;
  toggleHighlight: () => void;
  /** Surligne la sélection avec la couleur donnée (roadmap 2.3 — bouton
   * mémorisé du ruban ; re-sélectionner la même couleur l'enlève). */
  setHighlightColor: (color: string) => void;
  setTextAlign: (align: "left" | "center" | "right" | "justify") => void;
  /** Augmente le retrait du paragraphe courant d'un pas de 1,25 cm
   * (bouton « Tabulation + » du ruban, raccourci Ctrl+M comme Word). */
  increaseIndent: () => void;
  /** Diminue le retrait du paragraphe courant d'un pas (bouton
   * « Tabulation − », raccourci Ctrl+Shift+M comme Word). */
  decreaseIndent: () => void;
  /** Format du paragraphe SOUS LE CURSEUR (fenêtre « Paragraphe ») :
   * alignement + retraits gauche/droite en cm. */
  getActiveParagraphFormat: () => {
    align: "left" | "center" | "right" | "justify" | null;
    indentLeftCm: number;
    indentRightCm: number;
  };
  /** Pose les retraits gauche/droite EXACTS du paragraphe courant, en cm
   * (fenêtre « Paragraphe », comme Word). */
  setParagraphIndent: (leftCm: number, rightCm: number) => void;
  toggleSubscript: () => void;
  toggleSuperscript: () => void;
  toggleTaskList: () => void;
  clearFormatting: () => void;
  getStats: () => EditorStats;
  /** Ouvre l'éditeur en place de l'en-tête/du pied de page (sur la première
   * page peinte), comme un clic direct dessus — pour les rendre accessibles
   * depuis un bouton du ruban, pas seulement en cliquant sur la page (pas
   * évident à trouver au premier abord). */
  editHeader: () => void;
  editFooter: () => void;
  /** Insère une variable (`{{page}}`, `{{pages}}`, `{{date}}`...) dans le
   * champ d'en-tête/pied de page en cours d'édition (ou ouvre celui de
   * l'en-tête par défaut s'il n'y en a aucun d'ouvert). */
  insertHeaderFooterVariable: (token: string) => void;
  /** Termine l'édition du champ d'en-tête/pied de page en cours (valide
   * le texte saisi, comme un clic ailleurs) — bouton ✕ du panneau
   * « Variables » dans App.tsx. */
  closeHeaderFooterEdit: () => void;
  insertTocMarker: () => void;
  generateToc: () => void;
  /** Régénère en place le sommaire qui contient le curseur (panneau latéral
   * « Sommaire ») — sans effet si le curseur n'est pas dans un sommaire. */
  updateTocAtCursor: () => void;
  /** Supprime entièrement le sommaire qui contient le curseur (panneau
   * latéral « Sommaire ») — sans effet si le curseur n'est pas dans un
   * sommaire. */
  deleteTocAtCursor: () => void;
  /** Insère une référence `[^n]` au curseur ET la définition correspondante
   * en fin de document (n = 1 + le plus grand id de note déjà utilisé). */
  insertFootnote: () => void;
  insertMermaidDiagram: () => void;
  /** Insère un saut de section (titre affiché + reprise de numérotation). */
  insertSectionBreak: (title: string, restart: boolean) => void;
  /** Insère une zone « Page de garde » au curseur : deux marqueurs
   *  transparents encadrant le CONTENU NORMAL dérivé de la source du
   *  modèle (Markdown/HTML + variables {{…}} — parseur de l'éditeur),
   *  avec un saut de page optionnel juste après (voir CoverZone.ts). */
  insertCoverZone: (source: string, withPageBreak: boolean, theme?: string) => void;
  /** Supprime la zone page de garde qui contient le curseur (marqueurs
   *  ET contenu). */
  deleteCoverZone: () => void;
  /** Affiche/masque l'en-tête et le pied sur les pages couvertes par la
   *  zone qui contient le curseur (propriété du marqueur de début). */
  setCoverZoneHeaderFooter: (show: boolean) => void;
  /** Change le thème visuel de la zone au curseur (« » = style libre). */
  setCoverZoneTheme: (theme: string) => void;
  /** Contenu Markdown COURANT de la zone qui contient le curseur — pour
   *  « Enregistrer comme type » dans le panneau latéral ; `null` si le
   *  curseur n'est dans aucune zone. */
  getCoverZoneSource: () => string | null;
  /** Insère un champ de document `{{name}}` au curseur (valeur résolue
   *  affichée, variable gardée dans le .md — voir DocField.ts). */
  insertDocField: (name: string) => void;
  /** Supprime le nœud atomique sélectionné (page de garde, diagramme…). */
  deleteSelectedNode: () => void;
  /** Met à jour la source du diagramme sélectionné (panneau
   * « Diagramme ») — sans effet si aucun diagramme n'est sélectionné. */
  updateMermaidSource: (source: string) => void;
  /** Supprime le diagramme sélectionné. */
  deleteMermaid: () => void;
  insertInlineMath: () => void;
  insertBlockMath: () => void;
  /** Met à jour la source LaTeX de la formule sélectionnée (panneau
   * « Équation », éditeur MathLive) — sans effet si aucune formule
   * n'est sélectionnée. */
  updateMathSource: (source: string) => void;
  /** Insère du LaTeX dans le champ d'édition de formule ouvert DANS LA
   * page (palette de symboles du panneau « Équation ») ; rouvre le champ
   * sur la formule sélectionnée s'il est refermé. */
  insertMathLatex: (latex: string) => void;
  /** Supprime la formule sélectionnée (panneau « Équation »). */
  deleteMath: () => void;
  insertEmoji: (emoji: string) => void;
  // --- Rechercher / Remplacer (roadmap 2.4, panneau latéral) ---
  /** Recherche toutes les occurrences puis SÉLECTIONNE la suivante (ou
   * la précédente, `direction: -1`) à partir du curseur, en bouclant.
   * Retourne le nombre TOTAL d'occurrences et le rang (1-based) de
   * l'occurrence sélectionnée, ou `null` si aucune. */
  findText: (
    query: string,
    options: FindReplaceOptions,
    direction?: 1 | -1,
  ) => { total: number; index: number } | null;
  /** Liste TOUTES les occurrences avec extrait de contexte (onglet
   * « Résultats » du panneau Rechercher, façon Word) — pour chaque
   * occurrence : positions + ~40 caractères autour. */
  listFindMatches: (query: string, options: FindReplaceOptions) => FindMatchResult[];
  /** Sélectionne une occurrence précise dans la page (clic sur un
   * résultat) et y fait défiler — SANS voler le focus au panneau. */
  selectMatch: (from: number, to: number) => void;
  /** Remplace l'occurrence ACTIVEMENT sélectionnée (si elle correspond à
   * la recherche) puis passe à la suivante — même retour que findText. */
  replaceCurrent: (
    query: string,
    options: FindReplaceOptions,
    replacement: string,
  ) => { total: number; index: number } | null;
  /** Remplace TOUTES les occurrences en UNE seule étape d'annulation
   * (une transaction) — retourne le nombre de remplacements. */
  replaceAll: (query: string, options: FindReplaceOptions, replacement: string) => number;
  /** Pose un signet (ancre invisible `<a id="…">`) à la position du
   * curseur — cible des renvois. Voir `Bookmark.ts`. */
  insertBookmark: () => void;
  /** Insère un renvoi vers un signet : lien Markdown `[texte](#id)`. */
  insertCrossReference: () => void;
}

// Coloration syntaxique des blocs de code : "common" couvre les langages les
// plus courants (JS/TS, Python, C/C++/C#, Java, HTML/CSS, JSON, Bash, SQL,
// YAML...) sans alourdir le bundle avec les ~190 langages disponibles.
const lowlight = createLowlight(common);

/** État contextuel remonté en continu à App : sélection active, tableaux,
 *  formules, diagrammes, en-tête/pied, sommaire — pilotent ruban et panneaux. */
export interface EditorStats {
  words: number;
  characters: number;
  pageCount: number;
  currentPage: number;
  /** Style de bloc sous le curseur — pour surligner le bon bouton dans la
   * galerie de styles du ruban (voir RibbonGroup "Styles" dans Toolbar.tsx). */
  activeBlockStyle: "paragraph" | 1 | 2 | 3 | 4 | 5 | 6;
  /** Marques actives sous le curseur/la sélection (Gras, Italique...) —
   * pilote la mise en évidence des boutons du groupe Police, comme Word. */
  activeMarks: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    code: boolean;
    subscript: boolean;
    superscript: boolean;
    highlight: boolean;
  };
  /** Alignement de paragraphe actif, `null` si aucun n'est posé. */
  activeAlign: "left" | "center" | "right" | "justify" | null;
  /** Type de liste/bloc actif (Puces/Numérotée/Tâches/Citation), `null` sinon. */
  activeList: "bullet" | "ordered" | "task" | "blockquote" | null;
  /** Police de la sélection, `null` si aucune n'est posée explicitement. */
  activeFontFamily: string | null;
  /** Couleur de texte de la sélection (hex/rgb CSS), `null` si automatique. */
  activeColor: string | null;
  /** Taille de police de la sélection, en pt (toujours une valeur — voir
   * `currentFontSizePt`, replie sur 12pt par défaut). */
  activeFontSizePt: number;
  /** Le curseur est-il actuellement dans un tableau — pilote l'apparition/
   * bascule automatique de l'onglet contextuel "Tableau" du ruban (voir
   * `Toolbar.tsx`), façon "Outils de tableau" de Word. */
  insideTable: boolean;
  /** Dimensions de la sélection de cellules courante — voir
   * `getSelectionShape` ; `null` hors tableau. */
  tableSelectionShape: { rows: number; cols: number } | null;
  /** Champ flottant d'en-tête/pied de page actuellement en cours d'édition
   * — pilote le panneau latéral « Variables » (voir `HeaderFooterPanel`
   * dans App.tsx) ; `null` quand aucun champ n'est ouvert. */
  headerFooterEditMode: "header" | "footer" | null;
  /** Le curseur est-il actuellement dans un sommaire généré (voir
   * `isTocList` dans TocMarker.ts) — pilote l'ouverture automatique du
   * panneau latéral « Sommaire » (Mettre à jour/Supprimer), même principe
   * que `insideTable`. */
  insideToc: boolean;
  /** Diagramme Mermaid sélectionné (NodeSelection posée au clic sur le
   * diagramme peint ou à l'insertion) — pilote le panneau latéral
   * « Diagramme » ; `null` quand aucun diagramme n'est sélectionné.
   * `pos` sert de CLÉ d'identité (le panneau se remonte au changement de
   * diagramme, jamais à la frappe). */
  mermaid: { pos: number; source: string } | null;
  /** Zone page de garde contenant le curseur (marqueurs transparents,
   *  contenu NORMAL — voir CoverZone.ts) — pilote le panneau latéral
   *  « Page de garde » ; `start` sert de clé de remontage du panneau. */
  coverZone: CoverZoneInfo | null;
  /** Formule mathématique sélectionnée (`inlineMath`/`blockMath` — nœud
   * atomique désigné par NodeSelection, posée à l'insertion ou au clic sur
   * la formule peinte) — pilote le panneau latéral « Équation » (éditeur
   * WYSIWYG MathLive) ; `null` quand aucune formule n'est sélectionnée.
   * `pos` sert de CLÉ d'identité : le panneau se réinitialise quand on
   * change de formule, jamais à la frappe. */
  math: { kind: "inline" | "block"; source: string; pos: number } | null;
}

interface MarkdownEditorProps {
  initialContent: string;
  onChange: (markdown: string) => void;
  onSaveRequest: () => void;
  onStats?: (stats: EditorStats) => void;
  /** Format papier, marges, en-tête/pied de page — voir pageLayout.ts. */
  layout: PageLayoutSettings;
  /** Nom de fichier affiché, disponible comme variable `{{filename}}` dans
   * l'en-tête/pied de page. */
  documentTitle: string;
  /** Édition en place de l'en-tête/pied de page (clic direct sur la page,
   * voir l'effet plus bas) — répercutée par l'appelant (App.tsx) sur le
   * store, comme pour PageSetupDialog. */
  onLayoutChange: (layout: PageLayoutSettings) => void;
  /** Niveau de zoom (1 = 100%), purement visuel. */
  zoom?: number;
  /** Afficher les règles graduées (paramétrage global, roadmap 1.4) —
   * vrai par défaut ; faux les retire complètement du layout. */
  showRulers?: boolean;
  /** Ctrl+molette : proposition d'un nouveau niveau de zoom (paliers gérés par l'appelant). */
  onZoomChange?: (zoom: number) => void;
  /** Lecture seule (document figé) : aucune saisie possible, mais mise en page et défilement inchangés. */
  readOnly?: boolean;
}

/** Éditeur complet : ProseMirror INVISIBLE + couche peinte paginée (voir
 *  pagination/README.md) — le composant central de Pagina. */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  ({ initialContent, onChange, onSaveRequest, onStats, layout, documentTitle, onLayoutChange, zoom = 1, showRulers = true, onZoomChange, readOnly = false }, ref) => {
    // Contenu initial MIGRÉ (CoverZone.ts) : un document écrit avec
    // l'ancien bloc atomique `coverPage` s'ouvre directement en zone
    // transparente + contenu normal. Idempotent sur les documents
    // récents. `loadedContentRef` doit pointer sur la MÊME chaîne que
    // celle posée dans l'éditeur, sinon l'effet de synchronisation
    // ci-dessous rappellerait `setContent` avec le contenu BRUT et
    // détruirait la migration.
    const initialContentMigrated = useMemo(() => migrateCoverMarkdown(initialContent), [initialContent]);
    const loadedContentRef = useRef(initialContentMigrated);
    // Menu contextuel clic-droit sur une cellule de tableau (voir
    // `onContextMenu` plus bas) — seule pièce d'UI de ce composant gérée en
    // état React classique plutôt qu'en impératif/DOM direct : c'est un
    // simple overlay ponctuel, sans lien avec la mécanique de repaint, donc
    // sans risque pour l'architecture "tout en refs" du reste du fichier.
    const [tableContextMenu, setTableContextMenu] = useState<{ x: number; y: number; inTable: boolean } | null>(null);
    // Mini-barre flottante de mise en forme à la sélection (voir
    // SelectionBar.tsx / effet `selBarSync` plus bas). `rev` change à chaque
    // synchro pour rafraîchir l'état actif des boutons (gras déjà appliqué…).
    const [selBar, setSelBar] = useState<{ left: number; top: number; rev: number } | null>(null);
    // Règle verticale (roadmap 1.1) : nombre de motifs de page rendus —
    // seul l'ASPECT qui change rarement passe en état React (hauteur du
    // viewport, zoom) ; le calage au fil du défilement est appliqué en
    // DIRECT sur le DOM via variables CSS (voir recomputeVRuler).
    const [vRulerPeriods, setVRulerPeriods] = useState(2);
    const selBarSyncRef = useRef<() => void>(() => {});
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const caretRef = useRef<HTMLDivElement>(null);
    const selectionLayerRef = useRef<HTMLDivElement>(null);
    const liveHostRef = useRef<HTMLDivElement>(null);
    const pageCountRef = useRef(1);
    const currentPageRef = useRef(1);
    const onStatsRef = useRef(onStats);
    onStatsRef.current = onStats;
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const layoutRef = useRef(layout);
    layoutRef.current = layout;
    const documentTitleRef = useRef(documentTitle);
    documentTitleRef.current = documentTitle;
    const onLayoutChangeRef = useRef(onLayoutChange);
    onLayoutChangeRef.current = onLayoutChange;
    // Peuplée plus bas (`startHeaderFooterEdit`) — permet à
    // `useImperativeHandle` (défini avant, plus haut dans le fichier) et au
    // gestionnaire de clic de partager la même fonction sans réordonner tout
    // le fichier, comme `repaintRef`/`repaintCaretRef` juste au-dessus.
    const startHeaderFooterEditRef = useRef<(target: HTMLElement) => void>(() => {});
    const insertHeaderFooterVariableRef = useRef<(token: string) => void>(() => {});
    // Champ flottant actuellement ouvert (voir startHeaderFooterEdit) — permet
    // aux boutons "insérer une variable" du ruban de taper dans le bon champ
    // sans que l'utilisateur ait à re-cliquer dedans.
    // Mini-éditeur RICHE en-tête/pied de page (Tiptap, voir
    // `startHeaderFooterEdit`) : tant que le champ est ouvert, le routage
    // `cmd()` ci-dessous y redirige TOUTES les commandes du ruban.
    const headerMiniEditorRef = useRef<Editor | null>(null);
    // Fonction « refermer le champ » de l'édition en cours (commit) — pour
    // le bouton ✕ du panneau latéral (`closeHeaderFooterEdit`).
    const headerFooterCommitRef = useRef<(() => void) | null>(null);
    // Pastille « langage du bloc de code » (2026-10-17, déménagée du ruban
    // Insertion) : petit sélecteur natif posé en haut à droite du BLOC
    // PEINT contenant le curseur (les pages affichées sont des clones —
    // même mécanisme que le champ d'en-tête/pied). Visible uniquement
    // quand la sélection est dans un bloc de code ; resynchronisée à
    // chaque repaint/curseur/scroll/resize via `codeLangSyncRef`.
    const codeLangSyncRef = useRef<() => void>(() => {});
    // Éditeur ciblé par les commandes du RUBAN : tant qu'un champ
    // d'en-tête/pied de page est ouvert, c'est LUI (l'en-tête/le pied est
    // du contenu Markdown ordinaire, simplement dupliqué sur chaque page —
    // le ruban s'y applique donc tel quel, AUCUNE commande dédiée) ; sinon
    // l'éditeur principal. Évalué à chaque appel, pas à la définition.
    const cmd = () => headerMiniEditorRef.current ?? editor;
    // Sélectionne (NodeSelection) le nœud formule qui vient d'être inséré —
    // l'insertion laisse le curseur APRÈS l'atome ; en le sélectionnant, le
    // panneau latéral « Équation » s'ouvre (stats.math, front montant dans
    // App.tsx, même principe que Tableau/Sommaire).
    const selectMathNodeBeforeCursor = () => {
      if (!editor) return;
      const $from = editor.state.selection.$from;
      const nb = $from.nodeBefore;
      if (nb && (nb.type.name === "inlineMath" || nb.type.name === "blockMath")) {
        editor.commands.setNodeSelection($from.pos - nb.nodeSize);
      }
    };
    // Mode en-tête/pied de page en cours d'édition (voir startHeaderFooterEdit)
    // — remonte dans `EditorStats.headerFooterEditMode` pour piloter le
    // panneau latéral « Variables » de App.tsx.
    const headerFooterModeRef = useRef<"header" | "footer" | null>(null);
    // Champ d'édition de formule DANS LA PAGE (point ① maquette
    // docs/maquettes/panneau-equation.html, 2026-10-21) : un MathLive
    // flottant posé sur la zone peinte, même mécanisme que l'en-tête/pied
    // (hôte `position: fixed` sur body, recalé au repaint/scroll, refermé
    // au clic extérieur). Le panneau latéral ne garde QUE la palette de
    // symboles, le type et la suppression.
    const mathEditRef = useRef<{
      host: HTMLDivElement;
      mf: MathfieldElement;
      mathPos: number;
      detach: () => void;
    } | null>(null);
    const startMathEditRef = useRef<(mathPos: number, target?: HTMLElement | null | undefined) => void>(() => {});
    // LaTeX à insérer dès que le champ flottant est créé (palette cliquée
    // alors qu'aucun champ n'est ouvert — il est rouvert à la demande).
    const pendingMathLatexRef = useRef<string | null>(null);
    // Défilement manuel vers la sélection courante (recherche, roadmap
    // 2.4) : le défilement natif de ProseMirror est intercepté
    // (handleScrollToSelection, l'éditeur invisible serait "scrollé"
    // hors écran) — on amène la zone PEINTE de la sélection dans le
    // viewport nous-mêmes, via les mêmes rectangles que la
    // surbrillance de sélection (computeSelectionRects), dans un rAF
    // pour laisser le repaint se faire.
    const scrollSelectionIntoViewRef = useRef<() => void>(() => {});
    scrollSelectionIntoViewRef.current = () => {
      const wrap = wrapRef.current;
      if (!wrap || !canvasRef.current || !editor) return;
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas || !wrapRef.current || !editor) return;
        const rects = computeSelectionRects(editor.view, canvas, editor.state.selection, zoomRef.current);
        if (!rects.length) return;
        const r = rects[0];
        const canvasTop = canvas.getBoundingClientRect().top;
        const wrapRect = wrapRef.current.getBoundingClientRect();
        const targetTop = canvasTop + r.top;
        const MARGIN = 90;
        if (targetTop < wrapRect.top + MARGIN) {
          wrapRef.current.scrollBy({ top: targetTop - wrapRect.top - MARGIN, behavior: "smooth" });
        } else if (targetTop + r.height > wrapRect.bottom - MARGIN) {
          wrapRef.current.scrollBy({ top: targetTop + r.height - wrapRect.bottom + MARGIN, behavior: "smooth" });
        }
      });
    };
    // Peuplée après le montage de l'éditeur (voir plus bas) — permet aux
    // callbacks `onUpdate`/`onSelectionUpdate`, créés une seule fois par
    // Tiptap, d'appeler la version toujours à jour de `repaint`.
    const repaintRef = useRef<() => void>(() => {});
    const repaintCaretRef = useRef<() => void>(() => {});
    // Index des clones peints (refonte 2026-10-17 de la résolution clic →
    // position, voir cloneIndex.ts) : nœuds texte du clone → position PM,
    // cellules → plage. Représenté à CHAQUE repaint (result.cloneIndex).
    const cloneIndexRef = useRef<CloneIndex | null>(null);

    // Constantes physiques (mm → px) : indépendantes du zoom, recalculées
    // seulement quand la mise en page change (format papier, orientation,
    // marges), pas à chaque frappe.
    const geometry = useMemo(() => {
      const { widthMm, heightMm } = resolvePageSizeMm(layout);
      const pageHeightPx = mmToPx(heightMm);
      const marginTopPx = mmToPx(layout.marginTopMm);
      const marginBottomPx = mmToPx(layout.marginBottomMm);
      const contentWidthPx = mmToPx(widthMm - layout.marginLeftMm - layout.marginRightMm);
      return { pageHeightPx, marginTopPx, marginBottomPx, contentWidthPx };
    }, [layout]);

    // Format papier de l'IMPRESSION : le `@page { size }` suit le format du
    // document (A4, Letter, paysage, dimensions libres). Une règle fixe A4
    // faisait imprimer tous les documents en A4.
    useEffect(() => {
      const { widthMm, heightMm } = resolvePageSizeMm(layout);
      let style = document.getElementById("xmd-print-page-size");
      if (!style) {
        style = document.createElement("style");
        style.id = "xmd-print-page-size";
        document.head.appendChild(style);
      }
      style.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }`;
    }, [layout]);

    const editor = useEditor({
      editable: !readOnly,
      extensions: [
        StarterKit.configure({
          link: { openOnClick: false },
          // Remplacé par CodeBlockLowlight (coloration syntaxique) juste
          // en dessous — désactiver ici, sinon Tiptap se plaint de deux
          // extensions enregistrant le même nom de nœud ("codeBlock").
          codeBlock: false,
          // Remplacé par ParagraphMarkdown juste en dessous (préserve les
          // paragraphes vides — plusieurs Entrée pour espacer visuellement
          // deux paragraphes — à la sauvegarde, voir ce fichier).
          paragraph: false,
        }),
        CodeBlockLowlight.configure({ lowlight }),
        ParagraphMarkdown,
        Image,
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        Placeholder.configure({ placeholder: "Commencez à rédiger…" }),
        TextStyle,
        FontFamily,
        FontSize,
        Color,
        // multicolor (roadmap 2.3) : le bouton Surlignage du ruban
        // mémorise/applique une couleur choisie, comme Word. Sérialisation
        // en repli HTML <mark style="background-color: …"> pour les
        // couleurs — lisible partout, comme tous les réglages avancés.
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({ types: ["heading", "paragraph", "tableCell", "tableHeader"] }),
        Subscript,
        Superscript,
        TaskList,
        TaskItem.configure({ nested: true }),
        CharacterCount,
        PageBreak,
        Bookmark,
        TocMarker,
        FootnoteReference,
        FootnoteDefinition,
        MermaidDiagram,
        SectionBreak,
        CoverPage,
        // Zone « Page de garde » transparente (refonte 2026-10-22) : deux
        // marqueurs encadrent du contenu NORMAL — tout l'éditeur y
        // fonctionne (ruban, tableaux, champs de document inline).
        CoverZoneStart,
        CoverZoneEnd,
        CoverTheme,
        // Champ de document {{variable}} inline — valeur résolue affichée
        // (comme les en-têtes/pieds), variable gardée dans le .md.
        DocField,
        InlineMath,
        BlockMath,
        Markdown.configure({
          // Nécessaire pour que police/taille/couleur/surlignage/alignement
          // (qui n'ont pas d'équivalent en Markdown standard) survivent à la
          // sauvegarde : ils sont sérialisés en <span style="…"> — toujours
          // lisible et correctement rendu par tout moteur Markdown→HTML
          // (GitHub, VS Code, Obsidian…), juste pas en syntaxe Markdown pure.
          html: true,
          transformPastedText: true,
        }),
      ],
      content: initialContent,
      editorProps: {
        attributes: {
          class: "xmd-prosemirror",
          // Désactive vérification orthographique/correction automatique/
          // majuscule automatique du NAVIGATEUR sur cette zone — elle est
          // INVISIBLE (`opacity:0`, voir MarkdownEditor.css), donc
          // l'utilisateur ne peut jamais voir un soulignement rouge ni un
          // menu de suggestion de correction avant qu'il n'agisse. Piste
          // sérieuse pour un bug remonté par l'utilisateur (texte réel
          // corrompu par des insertions d'espaces en plein milieu de mots,
          // ex. "d'ouvrage" devenu "d'o uvra ge" dans un vrai document,
          // trouvé en tentant de reproduire un décalage de curseur) : le
          // correcteur du système/WebView2 a pu proposer/appliquer une
          // correction sur ce champ sans que l'utilisateur la voie venir.
          // Non confirmé formellement (non reproduit par un test ciblé de
          // positionnement de clic, qui s'est révélé correct dans tous les
          // scénarios essayés), mais une désactivation standard et sans
          // risque pour un éditeur qui dessine lui-même tout son rendu.
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "off",
        },
        // Empêche TOUT défilement automatique natif de ProseMirror vers la
        // sélection (`tr.scrollIntoView()`, appelé en interne par de
        // nombreuses commandes — Entrée/`splitBlock`, flèches, jusqu'aux
        // actions du ruban comme `toggleBold`) : `view.dom` est
        // `.xmd-live-editor-host`, l'éditeur INVISIBLE décalé hors écran
        // (voir MarkdownEditor.css) — un défilement natif essaierait de
        // ramener cette position hors-écran dans le viewport, ce qui fait
        // sauter/défiler la couche peinte visible (signalé par
        // l'utilisateur : "saut de feuille quand je fais un Entrée"). Ce
        // hook (`handleScrollToSelection`, point d'extension officiel de
        // prosemirror-view) intercepte le défilement à sa toute source,
        // pour TOUTES les commandes d'un coup — plus robuste que rajouter
        // `{ scrollIntoView: false }` commande par commande (déjà fait sur
        // les actions du ruban, mais Entrée/les flèches passent par des
        // commandes internes de @tiptap/core impossibles à patcher une par
        // une). Le curseur/la sélection affichés restent corrects : gérés
        // entièrement par notre propre dessin sur la couche peinte
        // (`caretPosition.ts`/`selectionHighlight.ts`), jamais par le
        // scroll natif de l'éditeur invisible.
        handleScrollToSelection: () => true,
        handleKeyDown: (_view, event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            onSaveRequest();
            return true;
          }
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            editor?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "pageBreak" }).run();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        const markdown: string = editor.storage.markdown.getMarkdown();
        // Le markdown remonté ici revient ensuite en prop `initialContent`
        // (via le store puis App.tsx). Sans synchroniser la référence tout de
        // suite, l'effet plus bas voit `initialContent` différer de l'ancien
        // `loadedContentRef` et rappelle `setContent()` sur CHAQUE frappe —
        // ce qui réinitialise tout le document et renvoie le curseur en fin
        // de texte à chaque caractère tapé.
        loadedContentRef.current = markdown;
        onChange(markdown);
        repaintRef.current();
      },
      onSelectionUpdate: ({ editor }) => {
        // Le curseur/la sélection réels vivent dans l'éditeur invisible :
        // sans ça, une navigation au clavier (flèches, clic) ne bougerait
        // jamais le curseur DESSINÉ dans la couche peinte.
        repaintCaretRef.current();
        // Remonte le style de bloc courant (juste ce champ, pas de repaint
        // complet) pour surligner le bon bouton dans la galerie "Styles" du
        // ruban même quand on déplace le curseur sans taper.
        const words: number = editor.storage.characterCount.words();
        const characters: number = editor.storage.characterCount.characters();
        onStatsRef.current?.({
          words,
          characters,
          pageCount: pageCountRef.current,
          currentPage: currentPageRef.current,
          activeBlockStyle: getActiveBlockStyle(cmd()),
          activeMarks: getActiveMarks(cmd()),
          activeAlign: getActiveAlign(cmd()),
          activeList: getActiveListType(cmd()),
          activeFontFamily: currentFontFamily(cmd()),
          activeColor: currentTextColor(cmd()),
          activeFontSizePt: currentFontSizePt(cmd()),
          insideTable: cmd().isActive("table"),
          insideToc: getInsideToc(editor),
          math: getMathAtSelection(editor),
          mermaid: getMermaidAtSelection(editor),
          coverZone: getCoverZoneAtSelection(editor),
          tableSelectionShape: getSelectionShape(cmd()),
          headerFooterEditMode: headerFooterModeRef.current,
        });
      },
    });

    // Bascule lecture seule / édition après le montage (ex. un document qui vient d'être figé).
    useEffect(() => {
      editor?.setEditable(!readOnly, false); // false = sans événement `update` (ce n'est pas une modification du contenu)
    }, [editor, readOnly]);

    useImperativeHandle(ref, () => ({
      getMarkdown: () => {
        if (!editor) return loadedContentRef.current;
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        return editor.storage.markdown.getMarkdown();
      },
      getHTML: () => editor?.getHTML() ?? "",
      focus: () => editor?.commands.focus(),
      undo: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).undo().run(),
      redo: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).redo().run(),
      toggleBold: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleBold().run(),
      toggleItalic: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleItalic().run(),
      toggleUnderline: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleUnderline().run(),
      toggleStrike: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleStrike().run(),
      toggleHeading: (level) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level }).run(),
      setParagraph: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setParagraph().run(),
      toggleBulletList: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleBulletList().run(),
      toggleOrderedList: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleOrderedList().run(),
      toggleBlockquote: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleBlockquote().run(),
      toggleCodeBlock: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleCodeBlock().run(),
      toggleCode: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleCode().run(),
      setLink: () => {
        if (!editor) return;
        const previous = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("URL du lien :", previous ?? "https://");
        if (url === null) return;
        if (url === "") {
          editor.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange("link").unsetLink().run();
          return;
        }
        editor.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange("link").setLink({ href: url }).run();
      },
      // --- Presse-papiers : sérialisation Markdown de la sélection via
      // tiptap-markdown (storage.markdown.serializer), puis API Clipboard
      // du navigateur. `navigator.clipboard` peut être absent (contexte
      // non sécurisé, ex. intégration PaginaLight en file://) : dans ce
      // cas les boutons restent sans effet silencieux.
      copySelection: () => {
        if (editor) copyEditorSelection(editor);
      },
      cutSelection: () => {
        if (editor) cutEditorSelection(editor);
      },
      pasteClipboard: () => {
        if (editor) pasteIntoEditor(editor, false);
      },
      increaseFontSize: () => {
        if (!editor) return;
        const pt = currentFontSizePt(editor);
        const next = FONT_SIZE_STEPS.find((s) => s > pt + 0.01);
        if (next !== undefined) {
          editor.chain().focus(undefined, { scrollIntoView: false }).setFontSize(`${next}pt`).run();
        }
      },
      decreaseFontSize: () => {
        if (!editor) return;
        const pt = currentFontSizePt(editor);
        const prev = [...FONT_SIZE_STEPS].reverse().find((s) => s < pt - 0.01);
        if (prev !== undefined) {
          editor.chain().focus(undefined, { scrollIntoView: false }).setFontSize(`${prev}pt`).run();
        } else {
          // Plus petit que 8pt : retour à la taille par défaut du document.
          editor.chain().focus(undefined, { scrollIntoView: false }).unsetFontSize().run();
        }
      },
      changeCase: () => {
        if (!editor) return;
        const { from, to, empty } = editor.state.selection;
        if (empty) return;
        const text = editor.state.doc.textBetween(from, to, "\n");
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .command(({ tr }) => {
            tr.insertText(nextCase(text), from, to);
            return true;
          })
          .run();
      },
      insertTable: (rows, cols) =>
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertTable({ rows, cols, withHeaderRow: true }).run(),
      addRowBefore: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).addRowBefore().run(),
      addRowAfter: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).addRowAfter().run(),
      deleteRow: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).deleteRow().run(),
      addColumnBefore: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).addColumnBefore().run(),
      addColumnAfter: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).addColumnAfter().run(),
      deleteColumn: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).deleteColumn().run(),
      deleteTable: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).deleteTable().run(),
      mergeCells: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).mergeCells().run(),
      splitCell: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).splitCell().run(),
      toggleHeaderRow: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleHeaderRow().run(),
      clearCellContents: () => {
        const ed = cmd();
        if (!ed) return;
        clearSelectedCellContents(ed);
      },
      setCellBackgroundColor: (color) => {
        const ed = cmd();
        if (!ed) return;
        applyToSelectedCells(ed, { backgroundColor: color });
      },
      setCellBorder: (sides, css) => {
        const ed = cmd();
        if (!ed) return;
        const targetSides = sides.length ? sides : (["top", "right", "bottom", "left"] as const);
        const patch: Record<string, unknown> = {};
        for (const side of targetSides) {
          patch[`border${side[0].toUpperCase()}${side.slice(1)}`] = css;
        }
        applyToSelectedCells(ed, patch);
      },
      setCellVerticalAlign: (align) => {
        const ed = cmd();
        if (!ed) return;
        applyToSelectedCells(ed, { verticalAlign: align === "middle" ? "middle" : align });
      },
      setCellBorderPreset: (preset, css) => {
        const ed = cmd();
        if (!ed) return;
        applyBorderPreset(ed, preset, css);
      },
      setGridLineBorder: (lines, css) => {
        const ed = cmd();
        if (!ed) return;
        setGridLineBorder(editor, lines, css);
      },
      insertHorizontalRule: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setHorizontalRule().run(),
      insertPageBreak: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "pageBreak" }).run(),
      setFontFamily: (family) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setFontFamily(family).run(),
      unsetFontFamily: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).unsetFontFamily().run(),
      setFontSize: (size) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setFontSize(size).run(),
      unsetFontSize: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).unsetFontSize().run(),
      setColor: (color) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setColor(color).run(),
      unsetColor: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).unsetColor().run(),
      toggleHighlight: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleHighlight().run(),
      setHighlightColor: (color) =>
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleHighlight({ color }).run(),
      setTextAlign: (align) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setTextAlign(align).run(),
      // Tabulation ± (roadmap 2.1) : commandes du paragraphe étendu
      // (ParagraphMarkdown.ts) — sérialisées en repli HTML <p style>, pas
      // d'espaces en tête de ligne (= bloc de code en Markdown !).
      increaseIndent: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).increaseParagraphIndent().run(),
      decreaseIndent: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).decreaseParagraphIndent().run(),
      getActiveParagraphFormat: () => {
        if (!editor) return { align: null, indentLeftCm: 0, indentRightCm: 0 };
        const attrs = editor.getAttributes("paragraph");
        const align =
          typeof attrs.textAlign === "string" &&
          ["left", "center", "right", "justify"].includes(attrs.textAlign)
            ? (attrs.textAlign as "left" | "center" | "right" | "justify")
            : null;
        return {
          align,
          indentLeftCm: typeof attrs.indentCm === "number" ? attrs.indentCm : 0,
          indentRightCm: typeof attrs.indentRightCm === "number" ? attrs.indentRightCm : 0,
        };
      },
      setParagraphIndent: (leftCm, rightCm) =>
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).setParagraphIndent(leftCm, rightCm).run(),
      toggleSubscript: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleSubscript().run(),
      toggleSuperscript: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleSuperscript().run(),
      toggleTaskList: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleTaskList().run(),
      clearFormatting: () =>
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).unsetAllMarks().unsetFontFamily().unsetFontSize().unsetColor().run(),
      getStats: () => ({
        words: editor?.storage.characterCount.words() ?? 0,
        characters: editor?.storage.characterCount.characters() ?? 0,
        activeBlockStyle: editor ? getActiveBlockStyle(cmd()) : "paragraph",
        activeMarks: editor
          ? getActiveMarks(cmd())
          : { bold: false, italic: false, underline: false, strike: false, code: false, subscript: false, superscript: false, highlight: false },
        activeAlign: editor ? getActiveAlign(cmd()) : null,
        activeList: editor ? getActiveListType(cmd()) : null,
        activeFontFamily: editor ? currentFontFamily(cmd()) : null,
        activeColor: editor ? currentTextColor(cmd()) : null,
        activeFontSizePt: editor ? currentFontSizePt(cmd()) : 12,
        insideTable: !!cmd()?.isActive("table"),
        insideToc: editor ? getInsideToc(editor) : false,
        math: editor ? getMathAtSelection(editor) : null,
        tableSelectionShape: editor ? getSelectionShape(cmd()) : null,
        pageCount: pageCountRef.current,
        currentPage: currentPageRef.current,
        headerFooterEditMode: headerFooterModeRef.current,
        mermaid: editor ? getMermaidAtSelection(editor) : null,
        coverZone: editor ? getCoverZoneAtSelection(editor) : null,
      }),
      editHeader: () => {
        const el = headerFooterTargetNearViewport(canvasRef.current, ".xmd-page-header");
        if (!el) return;
        revealInViewport(el);
        startHeaderFooterEditRef.current(el);
      },
      editFooter: () => {
        const el = headerFooterTargetNearViewport(canvasRef.current, ".xmd-page-footer");
        if (!el) return;
        revealInViewport(el);
        startHeaderFooterEditRef.current(el);
      },
      insertHeaderFooterVariable: (token) => insertHeaderFooterVariableRef.current(token),
      closeHeaderFooterEdit: () => {
        // Referme le champ riche en validant (les modifications sont déjà
        // appliquées en direct — il ne reste qu'à refermer).
        headerFooterCommitRef.current?.();
      },
      /** Insère un champ de document {{name}} au curseur (DocField.ts). */
      insertDocField: (name) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertDocField(name).run(),
      insertTocMarker: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertTocMarker().run(),
      generateToc: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).generateToc().run(),
      updateTocAtCursor: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).updateTocAtCursor().run(),
      deleteTocAtCursor: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).deleteTocAtCursor().run(),
      insertFootnote: () => {
        if (!editor) return;
        let maxId = 0;
        editor.state.doc.descendants((node) => {
          if (node.type.name === "footnoteReference" || node.type.name === "footnoteDefinition") {
            const n = parseInt(node.attrs.id, 10);
            if (!Number.isNaN(n)) maxId = Math.max(maxId, n);
          }
        });
        const newId = String(maxId + 1);
        editor.chain().focus(undefined, { scrollIntoView: false }).insertFootnoteReference(newId).run();
        // La définition va TOUJOURS en fin de document, jamais à la
        // position du curseur (qui vient de bouger juste après la
        // référence qu'on a insérée) — déplacer explicitement la sélection
        // à la toute fin avant d'insérer.
        const endPos = editor.state.doc.content.size;
        editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(endPos).insertFootnoteDefinition(newId).run();
        // La position exacte après insertion dépend de ce qu'il y avait
        // juste avant la fin du document (un saut de ligne implicite ?) —
        // on la retrouve en reparcourant le document plutôt que de la
        // calculer à la main.
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "footnoteDefinition" && node.attrs.id === newId) {
            editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(pos + 1).run();
          }
        });
      },
      insertMermaidDiagram: () => {
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "mermaidDiagram" }).run();
        // Sélectionne le diagramme inséré (NodeSelection) : le panneau
        // « Diagramme » s'ouvre, comme le panneau Équation à l'insertion
        // d'une formule.
        const $from = editor?.state.selection.$from;
        const nb = $from?.nodeBefore;
        if (nb && nb.type.name === "mermaidDiagram" && editor) {
          editor.commands.setNodeSelection($from.pos - nb.nodeSize);
        }
      },
      // Saut de section (SectionBreak.ts) — titre + reprise de
      // numérotation ; le séparateur peint montre « Section — Titre ».
      insertSectionBreak: (title, restart) => {
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertSectionBreak({ title, restart }).run();
      },
      // Zone « Page de garde » (CoverZone.ts) : insère marqueur début +
      // CONTENU NORMAL (source du modèle parseée par le parseur Markdown de
      // l'éditeur — HTML inline et variables {{…}} compris, celles-ci
      // deviennent des nœuds docField) + marqueur fin, en UNE transaction,
      // avec un saut de page optionnel juste après. Le curseur finit DANS
      // la zone (premier bloc de contenu) : le panneau latéral s'ouvre.
      insertCoverZone: (source, withPageBreak, theme = "") => {
        if (!editor) return;
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        const html: string = editor.storage.markdown.parser.parse(source ?? "");
        const dom = new DOMParser().parseFromString(html, "text/html");
        const contentFrag = ProseMirrorDOMParser.fromSchema(editor.state.schema).parse(dom.body).content;
        const schema = editor.state.schema;
        // Contenu de la zone : blocs du modèle, ou un paragraphe prêt à
        // taper si le modèle est vide (sinon le curseur ne peut pas se
        // poser entre les deux marqueurs atomes).
        const inner: ProseMirrorNode[] = [];
        if (contentFrag.size > 0) contentFrag.forEach((n) => inner.push(n));
        else inner.push(schema.nodes.paragraph.create());
        const nodes = [
          schema.nodes.coverZoneStart.create({ theme }),
          ...inner,
          schema.nodes.coverZoneEnd.create(),
          ...(withPageBreak ? [schema.nodes.pageBreak.create()] : []),
        ];
        // UNE SEULE insertion (Fragment complet) : une insertion au
        // milieu d'un paragraphe le SCINDE, et la taille réellement
        // insérée n'est PAS la somme des tailles de nœuds — les positions
        // suivantes doivent passer par tr.mapping, pas par arithmétique
        // manuelle (bug remonté au test : le marqueur de début atterrissait
        // après tout le contenu).
        const tr = editor.state.tr;
        if (!tr.selection.empty) tr.deleteSelection();
        const at = tr.selection.from;
        tr.insert(at, Fragment.fromArray(nodes));
        // Curseur DANS la zone, juste après le marqueur de début : assoc
        // -1 → position AVANT le contenu inséré (celle du marqueur de
        // début), +1 → juste après lui.
        const zoneStart = tr.mapping.map(at, -1) + 1;
        tr.setSelection(TextSelection.near(tr.doc.resolve(zoneStart), 1));
        tr.setMeta("addToHistory", true);
        editor.view.dispatch(tr);
        editor.commands.focus(undefined, { scrollIntoView: false });
      },
      // Supprime la zone page de garde qui contient le curseur (marqueurs
      // + contenu), en une seule transaction (une seule entrée d'historique).
      deleteCoverZone: () => {
        if (!editor) return;
        const zone = findCoverZoneAround(editor.state.doc, editor.state.selection.from);
        if (!zone) return;
        const endNode = editor.state.doc.nodeAt(zone.end);
        const end = zone.end + (endNode?.nodeSize ?? 1);
        const tr = editor.state.tr.delete(zone.start, end);
        tr.setMeta("addToHistory", true);
        editor.view.dispatch(tr);
        editor.commands.focus(undefined, { scrollIntoView: false });
      },
      // En-tête/pied affichés ou masqués sur les pages couvertes par la
      // zone au curseur (propriété portée par le marqueur de DÉBUT).
      setCoverZoneHeaderFooter: (show) => {
        if (!editor) return;
        const zone = findCoverZoneAround(editor.state.doc, editor.state.selection.from);
        if (!zone) return;
        const startNode = editor.state.doc.nodeAt(zone.start);
        const tr = editor.state.tr.setNodeMarkup(zone.start, undefined, { ...startNode?.attrs, headerFooter: show });
        tr.setMeta("addToHistory", true);
        editor.view.dispatch(tr);
      },
      // Thème visuel de la zone au curseur (propriété du marqueur de début).
      setCoverZoneTheme: (theme) => {
        if (!editor) return;
        const zone = findCoverZoneAround(editor.state.doc, editor.state.selection.from);
        if (!zone) return;
        const startNode = editor.state.doc.nodeAt(zone.start);
        const tr = editor.state.tr.setNodeMarkup(zone.start, undefined, { ...startNode?.attrs, theme });
        tr.setMeta("addToHistory", true);
        editor.view.dispatch(tr);
      },
      // Contenu Markdown COURANT de la zone au curseur — sert
      // « Enregistrer comme type » dans le panneau latéral.
      getCoverZoneSource: () => {
        if (!editor) return null;
        const zone = findCoverZoneAround(editor.state.doc, editor.state.selection.from);
        if (!zone) return null;
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        const md: string = editor.storage.markdown.getMarkdown();
        return extractCoverZoneMarkdown(md, coverZoneIndexAt(editor.state.doc, editor.state.selection.from));
      },
      // Supprime le nœud sélectionné (page de garde sous NodeSelection).
      deleteSelectedNode: () => {
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).deleteSelection().run();
      },
      updateMermaidSource: (source) => {
        const m = editor ? getMermaidAtSelection(editor) : null;
        if (!editor || !m) return;
        editor.view.dispatch(editor.view.state.tr.setNodeAttribute(m.pos, "source", source));
      },
      deleteMermaid: () => {
        const m = editor ? getMermaidAtSelection(editor) : null;
        if (!editor || !m) return;
        const node = editor.state.doc.nodeAt(m.pos);
        if (!node) return;
        editor.view.dispatch(editor.view.state.tr.delete(m.pos, m.pos + node.nodeSize));
      },
      insertInlineMath: () => {
        // Insère la formule VIDE et la SÉLECTIONNE (NodeSelection) : le
        // panneau latéral « Équation » s'ouvre automatiquement (stats.math)
        // et le champ WYSIWYG flotte DANS LA PAGE sur la formule neuve —
        // plus aucun window.prompt de LaTeX brut.
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "inlineMath", attrs: { source: "" } }).run();
        selectMathNodeBeforeCursor();
        const m = editor ? getMathAtSelection(editor) : null;
        if (m) startMathEditRef.current(m.pos, null);
      },
      insertBlockMath: () => {
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "blockMath", attrs: { source: "" } }).run();
        selectMathNodeBeforeCursor();
        const m = editor ? getMathAtSelection(editor) : null;
        if (m) startMathEditRef.current(m.pos, null);
      },
      insertMathLatex: (latex) => {
        // Champ déjà ouvert : insertion directe, focus rendu au champ.
        const cur = mathEditRef.current;
        if (cur) {
          cur.mf.insert(latex, { focus: true, feedback: false, selectionMode: "placeholder" });
          return;
        }
        // Champ refermé (Échap) mais formule toujours sélectionnée : on le
        // rouvre SUR la page et l'insertion partira dès sa création
        // (pendingMathLatex, appliqué au focus du champ).
        const m = editor ? getMathAtSelection(editor) : null;
        if (!m) return;
        pendingMathLatexRef.current = latex;
        startMathEditRef.current(m.pos, null);
      },
      updateMathSource: (source) => {
        const math = editor ? getMathAtSelection(editor) : null;
        if (!editor || !math) return;
        editor.view.dispatch(editor.view.state.tr.setNodeAttribute(math.pos, "source", source));
      },
      deleteMath: () => {
        const math = editor ? getMathAtSelection(editor) : null;
        if (!editor || !math) return;
        const node = editor.state.doc.nodeAt(math.pos);
        if (!node) return;
        editor.view.dispatch(editor.view.state.tr.delete(math.pos, math.pos + node.nodeSize));
      },
      insertEmoji: (emoji) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertContent(emoji).run(),
      // --- Rechercher / Remplacer (roadmap 2.4) ---
      findText: (query, options, direction = 1) => {
        if (!editor || !query) return null;
        const matches = findMatchesInDoc(editor.state.doc, query, options);
        if (!matches.length) return null;
        const sel = editor.state.selection;
        let index: number;
        if (direction === 1) {
          index = matches.findIndex((m) => m.from >= sel.from);
          if (index === -1) index = 0; // boucle : repart du début
          // Le match sous le curseur EST le match courant : passer au
          // suivant pour que « Suivant » avance vraiment.
          if (matches[index].from === sel.from && matches[index].to === sel.to && matches.length > 1) {
            index = (index + 1) % matches.length;
          }
        } else {
          index = -1;
          for (let i = matches.length - 1; i >= 0; i--) {
            if (matches[i].to <= sel.from) { index = i; break; }
          }
          if (index === -1) index = matches.length - 1; // boucle : repart de la fin
          if (matches[index].from === sel.from && matches[index].to === sel.to && matches.length > 1) {
            index = (index - 1 + matches.length) % matches.length;
          }
        }
        const m = matches[index];
        // SANS focus() : le champ du panneau garde la main sur le clavier
        // (focuser l'éditeur invisible VOLAIT le focus à la première frappe
        // — les caractères suivants s'inséraient DANS LE DOCUMENT, bug
        // trouvé en test). La sélection se peint pareil (couche peinte),
        // seul le curseur clignotant natif ne suit pas — sans importance.
        editor.commands.setTextSelection({ from: m.from, to: m.to });
        scrollSelectionIntoViewRef.current();
        return { total: matches.length, index: index + 1 };
      },
      listFindMatches: (query, options) => {
        if (!editor || !query) return [];
        return findMatchesInDoc(editor.state.doc, query, options).map((m) => {
          const doc = editor.state.doc;
          const ctx = (from: number, to: number) =>
            doc
              .textBetween(from, to, "\n", " ")
              .replace(/\s+/g, " ")
              .trim();
          return {
            from: m.from,
            to: m.to,
            before: ctx(Math.max(0, m.from - 40), m.from),
            match: ctx(m.from, m.to),
            after: ctx(m.to, Math.min(doc.content.size, m.to + 40)),
          };
        });
      },
      selectMatch: (from, to) => {
        if (!editor) return;
        // SANS focus() : le panneau garde la main sur le clavier (même
        // piège que la recherche — voir findText). Le défilement vers
        // l'occurrence est fait à la main (couche peinte).
        editor.commands.setTextSelection({ from, to });
        scrollSelectionIntoViewRef.current();
      },
      replaceCurrent: (query, options, replacement) => {
        if (!editor) return null;
        const sel = editor.state.selection;
        const selText = editor.state.doc.textBetween(sel.from, sel.to);
        const matchesQuery =
          options.matchCase ? selText === query : selText.toLowerCase() === query.toLowerCase();
        if (!matchesQuery) {
          // Rien de remplaçable sous le curseur : se positionner d'abord.
          return null; // le panneau appelle alors findText pour avancer
        }
        // SANS focus() : le panneau garde le clavier (même piège que
        // findText — le remplacement s'applique très bien sans focus).
        editor.chain().insertContentAt({ from: sel.from, to: sel.to }, replacement).run();
        // Occurrence suivante (les positions d'après le remplacement).
        const matches = findMatchesInDoc(editor.state.doc, query, options);
        if (!matches.length) return null;
        const next = matches.find((m) => m.from >= sel.from);
        const index = next ? matches.indexOf(next) : 0;
        const m = matches[index];
        editor.commands.setTextSelection({ from: m.from, to: m.to });
        scrollSelectionIntoViewRef.current();
        return { total: matches.length, index: index + 1 };
      },
      replaceAll: (query, options, replacement) => {
        if (!editor || !query) return 0;
        const matches = findMatchesInDoc(editor.state.doc, query, options);
        if (!matches.length) return 0;
        // UNE seule transaction : un seul Ctrl+Z annule tout le
        // « Remplacer tout », comme dans Word.
        let tr = editor.state.tr;
        for (let i = matches.length - 1; i >= 0; i--) {
          tr = tr.insertText(replacement, matches[i].from, matches[i].to);
        }
        editor.view.dispatch(tr);
        return matches.length;
      },
      // --- Signet / Renvoi (groupe « Liens » du ruban, façon Word) ---
      insertBookmark: () => {
        if (!editor) return;
        const name = window.prompt("Nom du signet (ancre invisible à cette position du document) :", "signet");
        if (!name) return;
        const id = slugifyBookmark(name);
        if (!id) return;
        editor.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "bookmark", attrs: { id } }).run();
      },
      insertCrossReference: () => {
        if (!editor) return;
        const name = window.prompt("Nom du signet visé (celui donné à la création du signet) :", "signet");
        if (!name) return;
        const id = slugifyBookmark(name);
        if (!id) return;
        const label = window.prompt("Texte affiché pour le renvoi :", name) ?? name;
        // Lien Markdown standard vers l'ancre : [texte](#id) — cliquable
        // dans tout moteur de rendu, et le saut vers l'ancre <a id> posée
        // par « Signet » fonctionne à l'écran comme à l'impression.
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .insertContent(`<a href="#${id}">${escapeHtmlText(label || id)}</a>`)
          .run();
      },
    }));

    // Si le contenu initial change (changement d'onglet actif), recharger l'éditeur.
    useEffect(() => {
      if (editor && initialContentMigrated !== loadedContentRef.current) {
        editor.commands.setContent(initialContentMigrated);
        loadedContentRef.current = initialContentMigrated;
      }
    }, [initialContentMigrated, editor]);

    // repaint() reconstruit entièrement la couche peinte (répartition en
    // pages + clones, voir paintPages.ts) et replace le curseur dessiné à la
    // main. Appelée à chaque modification du document (onUpdate ci-dessus),
    // au montage, et si le zoom change (les mesures dépendent du zoom).
    useEffect(() => {
      if (!editor) return;

      const repaintCaretOnly = () => {
        // La pastille de langage suit la sélection à CHAQUE changement de
        // curseur (visible ou non selon qu'on est dans un bloc de code,
        // recollée au bon clone) — avant les early-returns ci-dessous.
        codeLangSyncRef.current();
        selBarSyncRef.current();
        const canvas = canvasRef.current;
        const caret = caretRef.current;
        const selectionLayer = selectionLayerRef.current;
        if (!canvas || !caret) return;

        const { from, to } = editor.state.selection;
        const isCollapsed = from === to;

        // Sélection étendue : on dessine des rectangles de surbrillance et on
        // masque le curseur clignotant (comme dans n'importe quel éditeur —
        // pas de curseur ET de surbrillance affichés en même temps).
        if (selectionLayer) {
          if (isCollapsed) {
            selectionLayer.replaceChildren();
          } else {
            const rects = computeSelectionRects(editor.view, canvas, editor.state.selection, zoomRef.current);
            selectionLayer.replaceChildren(
              ...rects.map((r) => {
                const div = document.createElement("div");
                div.className = "xmd-selection-rect";
                div.style.left = `${r.left}px`;
                div.style.top = `${r.top}px`;
                div.style.width = `${r.width}px`;
                div.style.height = `${r.height}px`;
                return div;
              }),
            );
          }
        }

        if (!isCollapsed) {
          caret.style.display = "none";
          return;
        }

        const pos = computeCaretScreenPosition(editor.view, canvas, editor.state.selection.head, zoomRef.current);
        if (pos) {
          caret.style.display = "block";
          caret.style.left = `${pos.left}px`;
          caret.style.top = `${pos.top}px`;
          caret.style.height = `${pos.height}px`;
        } else {
          caret.style.display = "none";
        }
      };
      repaintCaretRef.current = repaintCaretOnly;

      // En-tête/pied de page : le template est stocké en MARKDOWN dans
      // `layout.header/footer.text` (sérialisé par le mini-éditeur) mais
      // le peintre (paintPages.ts) rend du HTML — conversion via le
      // parseur Markdown de tiptap-markdown, qui traverse aussi le HTML
      // historique grâce à `html: true`. Retourne une chaîne HTML
      // (innerHTML) ; vide si template vide.
      const mdToHtml = (md: string): string => {
        if (!md) return "";
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        return editor.storage.markdown.parser.parse(md) as string;
      };

      // Pages de garde (CoverPage.ts) : leurs NodeViews rendent le contenu
      // RÉSOLU (variables substituées) — le parseur et le contexte vivent
      // ici. Rechargés à CHAQUE changement de layout (propriétés du
      // document modifiées → variables à re-résoudre) : l'effet se
      // rejouant, le nouveau contexte est repoussé aux NodeViews.
      setCoverRenderProviders({
        mdToHtml,
        getContext: () => ({
          page: 1,
          pages: 1,
          date: formatTodayForHeaderFooter(),
          filename: documentTitleRef.current,
          version: layout.documentVersion,
          author: layout.author,
          title: layout.documentProperties?.title ?? "",
          subject: layout.documentProperties?.subject ?? "",
          keywords: layout.documentProperties?.keywords ?? "",
          created: layout.documentProperties?.createdDate ?? "",
          modified: layout.documentProperties?.modifiedDate ?? "",
          custom: layout.documentProperties?.custom ?? [],
        }),
      });
      refreshAllCoverPages();

      // Champs de document {{…}} (DocField.ts) : MÊME contexte que les
      // en-têtes/pieds et l'ancien bloc page de garde — les NodeViews
      // résolvent la valeur avec, et le re-push à chaque changement de
      // layout (propriétés du document modifiées) met à jour tous les
      // champs affichés.
      setDocFieldContext(() => ({
        page: 1,
        pages: 1,
        date: formatTodayForHeaderFooter(),
        filename: documentTitleRef.current,
        version: layout.documentVersion,
        author: layout.author,
        title: layout.documentProperties?.title ?? "",
        subject: layout.documentProperties?.subject ?? "",
        keywords: layout.documentProperties?.keywords ?? "",
        created: layout.documentProperties?.createdDate ?? "",
        modified: layout.documentProperties?.modifiedDate ?? "",
        custom: layout.documentProperties?.custom ?? [],
      }));
      refreshAllDocFields();

      const repaint = () => {
        const canvas = canvasRef.current;
        const liveHost = liveHostRef.current;
        if (!canvas) return;

        // Réécrit la numérotation des titres si besoin (voir
        // HeadingAutoNumber.ts) — placé ici plutôt que seulement dans
        // `onUpdate` pour couvrir AUSSI le cas d'un changement de schéma de
        // numérotation depuis le dialogue "Styles de titres", qui ne
        // modifie pas le document lui-même (juste `layout`) : `repaint()`
        // est déjà appelée à chaque changement de `layout` (effet
        // dépendant, plus bas), donc c'est le seul endroit qui couvre tous
        // les déclencheurs (frappe, zoom, changement de mise en page) en un
        // seul appel.
        applyHeadingNumbering(editor.view, layoutRef.current.headingStyles);

        // La zone invisible doit avoir EXACTEMENT la même largeur que la
        // vraie zone de contenu d'une page — pas juste "à peu près", au
        // dixième de pixel près. `geometry.contentWidthPx` (calculé une
        // fois en JS via mmToPx) et la largeur réellement rendue en CSS
        // pour `.xmd-page-content` peuvent différer de quelques millièmes
        // de pixel (deux chemins de calcul distincts, arrondis différents) —
        // un écart invisible à l'œil, mais qui peut suffire à faire
        // retomber un mot de fin de ligne différemment, décalant TOUT le
        // reste du retour à la ligne. Ça désynchronise alors la traduction
        // clic → position (`resolveClickPosition.ts`) : un clic en fin de
        // ligne peut atterrir des dizaines de caractères plus loin dans le
        // document réel. On corrige donc la largeur pour qu'elle
        // corresponde exactement à ce qui est déjà rendu, dès qu'une page
        // existe pour le mesurer.
        if (liveHost) {
          const renderedContent = canvas.querySelector<HTMLElement>(".xmd-page-content");
          if (renderedContent) {
            // `.getBoundingClientRect().width` donne la largeur de BORDURE
            // (padding inclus, ~793px = la page entière) puisque
            // `.xmd-page-content` est en `box-sizing: border-box` — ce
            // n'est PAS ce qui contraint la mise en ligne du texte à
            // l'intérieur (ça, c'est la largeur de CONTENU, une fois le
            // padding retranché). S'y être trompé une fois déjà coûté un
            // bug sur la hauteur du curseur (voir CLAUDE.md) ; même piège
            // ici, sur la largeur cette fois — recommencé deux fois avant
            // de s'en souvenir.
            const style = getComputedStyle(renderedContent);
            // `renderedContent` vit dans `.xmd-page-canvas`, qui porte
            // `transform: scale(zoom)` : son rect est donc MULTIPLIÉ par le
            // zoom alors que le padding (computed style) reste en px CSS
            // logiques. Sans cette division, à 150% la zone invisible devenait
            // 1,5× trop large → autre retour à la ligne → pagination fausse
            // (moins de pages, blocs qui débordent de leur page).
            const realWidth =
              renderedContent.getBoundingClientRect().width / zoomRef.current -
              (parseFloat(style.paddingLeft) || 0) -
              (parseFloat(style.paddingRight) || 0);
            if (Math.abs(realWidth - liveHost.getBoundingClientRect().width) > 0.01) {
              liveHost.style.width = `${realWidth}px`;
              // Le changement de largeur va faire reflow le texte dans la
              // zone invisible ; le ResizeObserver plus bas rappellera
              // repaint() automatiquement avec les bonnes mesures — pas la
              // peine de continuer cette passe-ci avec des mesures déjà
              // périmées.
              return;
            }
          }
        }

        const result = paintPages(editor.view, canvas, {
          pageHeightPx: geometry.pageHeightPx,
          marginTopPx: geometry.marginTopPx,
          marginBottomPx: geometry.marginBottomPx,
          header: { ...layout.header, html: mdToHtml(layout.header.text) },
          footer: { ...layout.footer, html: mdToHtml(layout.footer.text) },
          context: {
            date: formatTodayForHeaderFooter(),
            filename: documentTitleRef.current,
            version: layout.documentVersion,
            author: layout.author,
            // Propriétés du document + champs personnalisés (roadmap 1.6) —
            // disponibles comme variables d'en-tête/pied ({{title}},
            // {{subject}}, {{keywords}}, {{created}}, {{modified}} et
            // {{NomDuChamp}} pour chaque champ personnalisé).
            title: layout.documentProperties?.title ?? "",
            subject: layout.documentProperties?.subject ?? "",
            keywords: layout.documentProperties?.keywords ?? "",
            created: layout.documentProperties?.createdDate ?? "",
            modified: layout.documentProperties?.modifiedDate ?? "",
            custom: layout.documentProperties?.custom ?? [],
          },
        });
        pageCountRef.current = result.pageCount;
        // L'index texte/cellules des clones vient d'être reconstruit —
        // c'est LUI que resolveClickPosition consultera pour la
        // résolution exacte au caractère (ancien index périmé).
        cloneIndexRef.current = result.cloneIndex;
        repaintCaretOnly();
        // Les clones viennent d'être recréés : recolle la pastille de
        // langage sur le bloc peint correspondant.
        codeLangSyncRef.current();
        selBarSyncRef.current();
        const words: number = editor.storage.characterCount.words();
        const characters: number = editor.storage.characterCount.characters();
        onStatsRef.current?.({
          words,
          characters,
          pageCount: pageCountRef.current,
          currentPage: currentPageRef.current,
          activeBlockStyle: getActiveBlockStyle(cmd()),
          activeMarks: getActiveMarks(cmd()),
          activeAlign: getActiveAlign(cmd()),
          activeList: getActiveListType(cmd()),
          activeFontFamily: currentFontFamily(cmd()),
          activeColor: currentTextColor(cmd()),
          activeFontSizePt: currentFontSizePt(cmd()),
          insideTable: cmd().isActive("table"),
          insideToc: getInsideToc(editor),
          math: getMathAtSelection(editor),
          mermaid: getMermaidAtSelection(editor),
          coverZone: getCoverZoneAtSelection(editor),
          tableSelectionShape: getSelectionShape(cmd()),
          headerFooterEditMode: headerFooterModeRef.current,
        });
      };
      repaintRef.current = repaint;
      // Diagrammes Mermaid : leur re-rendu (thème/couleurs via le panneau
      // Diagramme, ou montage) est ASYNCHRONE — le rappel débouncé relance
      // le repaint pour que les CLONES de la couche peinte suivent (sans
      // lui, un changement de thème ne se verrait sur la page qu'à la
      // prochaine frappe).
      setMermaidRenderedCallback(() => repaintRef.current());

      repaint();
      // Un changement de fenêtre (redimensionnement) peut changer la mise en
      // ligne du texte dans l'éditeur invisible (largeur inchangée en
      // pratique — fixe en mm — mais on reste robuste si ça change un jour).
      const ro = new ResizeObserver(repaint);
      const dom = editor.view.dom as HTMLElement;
      ro.observe(dom);
      // Le cadre (`.xmd-canvas-frame`) change de largeur quand la fenêtre ou
      // un panneau latéral est redimensionné, et la page (centrée dedans) se
      // déplace — alors que l'éditeur invisible garde sa largeur. Le curseur
      // dessiné et les rectangles de sélection sont en coordonnées du cadre :
      // sans ce recalage ils restaient à l'ancienne position.
      const frame = canvasRef.current?.parentElement;
      const roFrame = new ResizeObserver(() => repaintCaretRef.current());
      if (frame) roFrame.observe(frame);
      return () => {
        setMermaidRenderedCallback(null);
        ro.disconnect();
        roFrame.disconnect();
      };
    }, [editor, geometry, layout]);

    // Le zoom change les mesures géométriques (transform: scale()) : on
    // repeint pour que la pagination et la position du curseur restent
    // cohérentes avec le nouveau niveau de zoom.
    useEffect(() => {
      repaintRef.current();
    }, [zoom]);

    useCodeLangChip(editor, readOnly, canvasRef, codeLangSyncRef);

    useSelectionBarSync(editor, readOnly, canvasRef, zoomRef, headerMiniEditorRef, selBarSyncRef, setSelBar);

    // Édition en place de l'en-tête/pied de page : un clic sur l'un ou
    // l'autre (sur N'IMPORTE QUELLE page — le texte est le même partout,
    // sauf substitution des variables) ouvre un petit champ texte flottant
    // par-dessus, pré-rempli avec le MODÈLE brut (variables `{{page}}` non
    // résolues, lues depuis `HEADER_TEMPLATE_ATTR`/`FOOTER_TEMPLATE_ATTR`
    // posés par paintPages.ts) plutôt que le texte déjà substitué affiché.
    const startHeaderFooterEdit = (target: HTMLElement) => {
      const isHeader = target.classList.contains("xmd-page-header");
      const template = target.getAttribute(isHeader ? HEADER_TEMPLATE_ATTR : FOOTER_TEMPLATE_ATTR) ?? "";
      const rect = target.getBoundingClientRect();

      // Remonte le mode d'édition (panneau latéral « En-tête/Pied de page »
      // de App.tsx) à chaque ouverture/fermeture du champ.
      const emitMode = (mode: "header" | "footer" | null) => {
        headerFooterModeRef.current = mode;
        if (!editor) return;
        onStatsRef.current?.({
          words: editor.storage.characterCount.words(),
          characters: editor.storage.characterCount.characters(),
          pageCount: pageCountRef.current,
          currentPage: currentPageRef.current,
          activeBlockStyle: getActiveBlockStyle(cmd()),
          activeMarks: getActiveMarks(cmd()),
          activeAlign: getActiveAlign(cmd()),
          activeList: getActiveListType(cmd()),
          activeFontFamily: currentFontFamily(cmd()),
          activeColor: currentTextColor(cmd()),
          activeFontSizePt: currentFontSizePt(cmd()),
          insideTable: cmd().isActive("table"),
          insideToc: getInsideToc(editor),
          math: getMathAtSelection(editor),
          mermaid: getMermaidAtSelection(editor),
          coverZone: getCoverZoneAtSelection(editor),
          tableSelectionShape: getSelectionShape(cmd()),
          headerFooterEditMode: mode,
        });
      };

      // Champ RICHE : l'en-tête/pied de page est du contenu MARKDOWN
      // ordinaire, simplement dupliqué sur chaque page — le mini-éditeur
      // embarque l'extension `Markdown` de tiptap-markdown : le template
      // (stocké en Markdown dans `layout.header/footer.text`) est parsé
      // tel quel à l'ouverture (le HTML historique passe aussi grâce à
      // `html: true`), et la frappe est re-sérialisée en Markdown à chaque
      // mise à jour. Le RUBAN principal s'applique au champ via le routage
      // `cmd()` — aucune commande dédiée.
      const initialContent = template;

      const host = document.createElement("div");
      host.className = "xmd-header-footer-edit xmd-header-footer-rich";
      host.style.left = `${rect.left}px`;
      host.style.top = `${rect.top}px`;
      host.style.width = `${rect.width}px`;
      host.style.minHeight = `${rect.height}px`;
      document.body.appendChild(host);

      let mini: Editor;
      try {
        mini = new TiptapEditor({
          element: host,
          extensions: [
            StarterKit.configure({ link: { openOnClick: false } }),
            TextStyle,
            FontFamily,
            FontSize,
            Color,
            TextAlign.configure({ types: ["paragraph", "tableCell", "tableHeader"] }),
            // ParagraphMarkdown REMPLACE le paragraphe du StarterKit : son
            // sérialiseur garde l'ALIGNEMENT (et les retraits) en repli HTML
            // <p style="…"> — sans lui, centrer/droiter dans le champ était
            // silencieusement PERDU à la fermeture (remonté par l'utilisateur
            // sur la page de garde ; même bug pour l'en-tête/pied, corrigé
            // au passage).
            ParagraphMarkdown,
            Table,
            TableRow,
            TableCell,
            TableHeader,
            Markdown.configure({ html: true }),
          ],
          content: initialContent,
          editorProps: { attributes: { class: "xmd-hf-prosemirror" } },
        });
      } catch (e) {
        host.remove();
        return;
      }
      headerMiniEditorRef.current = mini;
      emitMode(isHeader ? "header" : "footer");
      mini.commands.focus("end");

      // Mise à jour EN DIRECT : le contenu est partagé par toutes les
      // pages et le document peint suit la frappe au fur et à mesure
      // (comme le corps du document). Le « commit » ne fait plus rien
      // d'autre que refermer : tout est déjà appliqué.
      const field = isHeader ? "header" : "footer";
      mini.on("update", () => {
        const current = layoutRef.current;
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        const rawMd: string = mini.storage.markdown.getMarkdown();
        // Champ vidé : le sérialiseur écrit le marqueur de paragraphe vide —
        // inutile ici (et il contient `-->`), on stocke une chaîne vide.
        const md = rawMd.trim() === "<!-- empty-line -->" ? "" : rawMd;
        onLayoutChangeRef.current({ ...current, [field]: { ...current[field], text: md } });
      });

      // Recalage du champ sur la zone peinte : l'ouverture du panneau
      // latéral (ou une fermeture d'explorateur, un redimensionnement)
      // déplace les pages APRÈS l'ouverture — sans recalage le champ
      // restait décalé (bug du 2026-10-17). Sur l'élément d'origine s'il
      // survit à un repaint, sinon la zone visible la plus proche.
      const selector = isHeader ? ".xmd-page-header" : ".xmd-page-footer";
      const reposition = () => {
        const el = target.isConnected ? target : headerFooterTargetNearViewport(canvasRef.current, selector);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        host.style.left = `${r.left}px`;
        host.style.top = `${r.top}px`;
        host.style.width = `${r.width}px`;
        host.style.minHeight = `${r.height}px`;
      };
      const canvasEl = canvasRef.current;
      const resizeObserver = canvasEl ? new ResizeObserver(() => reposition()) : null;
      if (canvasEl && resizeObserver) resizeObserver.observe(canvasEl);
      window.addEventListener("resize", reposition);

      // Referme quand on clique ailleurs que dans le champ ou dans le
      // panneau latéral (les boutons du panneau neutralisent déjà leur
      // `mousedown` pour ne pas voler le focus au mini-éditeur).
      // Le RUBAN (.tb-ribbon-stack) et la barre de titre (.tbar) sont
      // AUSSI exclus : tant que le champ est ouvert, les commandes du
      // ruban s'y appliquent via le routage `cmd()` — laisser le clic
      // fermer le champ TUAIT la mise en forme de la sélection (bug
      // remonté par l'utilisateur : « quand je veux mettre du texte en
      // gras dans l'en-tête, il est automatiquement désélectionné »).
      // Les commandes re-donnent le focus au mini-éditeur via leur
      // `.focus()`, la sélection ProseMirror étant conservée même sans
      // focus.
      const onDocMouseDown = (e: MouseEvent) => {
        const t = e.target as Node;
        if (host.contains(t)) return;
        if (t instanceof Element && t.closest(".ctx-host")) return;
        if (t instanceof Element && t.closest(".tb-ribbon-stack, .tbar")) return;
        commit();
      };
      document.addEventListener("mousedown", onDocMouseDown, true);

      let closed = false;
      const detach = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener("mousedown", onDocMouseDown, true);
        resizeObserver?.disconnect();
        window.removeEventListener("resize", reposition);
        headerFooterCommitRef.current = null;
        headerMiniEditorRef.current = null;
        emitMode(null);
        mini.destroy();
        host.remove();
      };
      const commit = () => detach();
      const cancel = () => detach();
      headerFooterCommitRef.current = commit;

      host.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      });
    };
    startHeaderFooterEditRef.current = startHeaderFooterEdit;

    /** Insère une variable (`{{page}}`, etc.) dans le champ riche
     * d'en-tête/pied de page actuellement ouvert ; s'il n'y en a aucun,
     * ouvre celui de l'en-tête (choix par défaut) et insère à la fin. */
    insertHeaderFooterVariableRef.current = (token: string) => {
      const mini = headerMiniEditorRef.current;
      if (mini) {
        mini.chain().focus().insertContent(token).run();
        return;
      }
      const el = headerFooterTargetNearViewport(canvasRef.current, ".xmd-page-header");
      if (!el) return;
      startHeaderFooterEditRef.current(el);
      headerMiniEditorRef.current?.chain().focus("end").insertContent(token).run();
    };

    // --- Édition de formule DANS LA PAGE (point ① maquette, 2026-10-21) ---
    //
    // Retrouve le clone peint d'une formule à partir de sa position dans le
    // document : les clones de bloc portent `data-src-pos` (paintPages.ts)
    // et un bloc n'est JAMAIS coupé entre deux pages, donc la formule est
    // toujours entière dans un seul clone. `blockMath` EST un bloc (cherche
    // direct) ; `inlineMath` se localise par son bloc ancêtre + son RANG
    // parmi les formules inline du bloc (l'ordre des clones suit l'ordre du
    // document).
    const findPaintedMath = (mathPos: number): HTMLElement | null => {
      const canvas = canvasRef.current;
      if (!canvas || !editor) return null;
      const node = editor.state.doc.nodeAt(mathPos);
      if (!node) return null;
      if (node.type.name === "blockMath") {
        return canvas.querySelector<HTMLElement>(`[data-src-pos="${mathPos}"]`);
      }
      if (node.type.name !== "inlineMath") return null;
      const resolved = editor.state.doc.resolve(mathPos);
      let blockPos = -1;
      for (let d = resolved.depth; d >= 1; d--) {
        if (resolved.node(d).isBlock) {
          blockPos = resolved.before(d);
          break;
        }
      }
      if (blockPos < 0) return null;
      // Rang de CETTE formule parmi celles du bloc : compte les formules
      // entièrement avant elle dans le bloc (nodesBetween est exclusif de
      // la borne `to`, la nôtre commence exactement à mathPos).
      let index = 0;
      editor.state.doc.nodesBetween(blockPos + 1, mathPos, (n) => {
        if (n.type.name === "inlineMath") index++;
        return true;
      });
      const blockEl = canvas.querySelector<HTMLElement>(`[data-src-pos="${blockPos}"]`);
      if (!blockEl) return null;
      const maths = blockEl.querySelectorAll<HTMLElement>('[data-type="inline-math"]');
      return maths[index] ?? null;
    };

    // Ouvre le champ MathLive flottant SUR la formule peinte (même
    // mécanisme que startHeaderFooterEdit : hôte fixed sur le body,
    // coordonnées de la zone peinte, recalé à chaque repaint/scroll —
    // le repaint DÉTRUIT la zone, on la retrouve par position). La
    // formule est modifiée là où elle s'affiche ; le panneau latéral
    // garde la palette de symboles, qui route ici par insertMathLatex.
    const startMathEdit = (mathPos: number, target?: HTMLElement | null) => {
      // Une seule formule éditée à la fois : cliquer une autre formule
      // referme la précédente (le clic extérieur fait déjà le ménage,
      // ceci couvre les ouvertures programmatiques).
      mathEditRef.current?.detach();
      const ed = editor;
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!ed || !canvas) return;
      const node = ed.state.doc.nodeAt(mathPos);
      if (!node || (node.type.name !== "inlineMath" && node.type.name !== "blockMath")) return;
      const isBlock = node.type.name === "blockMath";
      const source = String(node.attrs.source ?? "");

      const host = document.createElement("div");
      host.className = `xmd-math-edit${isBlock ? " xmd-math-edit-block" : ""}`;
      // Étiquette de la maquette : la zone se lit comme éditable.
      const tag = document.createElement("span");
      tag.className = "xmd-math-edit-tag";
      tag.textContent = "Édition sur la page";
      host.appendChild(tag);
      document.body.appendChild(host);

      // Position : sur le clone peint ; repli = première page visible
      // (jamais rencontré en pratique — un bloc sélectionné est toujours
      // peint — mais garantit qu'un champ s'ouvre dans tous les cas).
      const positionOn = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        host.style.left = `${r.left}px`;
        host.style.top = `${r.top}px`;
        host.style.width = `${r.width}px`;
        host.style.minHeight = `${r.height}px`;
        return true;
      };
      const positionFallback = () => {
        const pages = Array.from(canvas.querySelectorAll<HTMLElement>(".xmd-page"));
        const visible = pages.find((p) => {
          const r = p.getBoundingClientRect();
          return r.bottom > 60 && r.top < window.innerHeight;
        });
        if (!visible) return;
        const r = visible.getBoundingClientRect();
        host.style.left = `${r.left + r.width * 0.15}px`;
        host.style.top = `${r.top + 100}px`;
        host.style.width = `${r.width * 0.7}px`;
        host.style.minHeight = "40px";
      };
      const painted = target ?? findPaintedMath(mathPos);
      if (painted && positionOn(painted)) {
        // posé sur la zone peinte
      } else {
        positionFallback();
      }

      let closed = false;

      // Recalage : la zone peinte est DÉTRUITE à chaque frappe (repaint) —
      // on la retrouve par position et le champ la suit. Si la formule a
      // disparu du document (suppression depuis le panneau), fermeture.
      const reposition = () => {
        if (closed) return;
        const el = findPaintedMath(mathPos);
        if (el) {
          positionOn(el);
          return;
        }
        const n = ed.state.doc.nodeAt(mathPos);
        if (!n || (n.type.name !== "inlineMath" && n.type.name !== "blockMath")) detach();
      };

      const resizeObserver = new ResizeObserver(() => reposition());
      resizeObserver.observe(canvas);
      window.addEventListener("resize", reposition);
      wrap?.addEventListener("scroll", reposition, { passive: true });

      // Referme au clic ailleurs que dans le champ, le panneau latéral ou
      // les barres de commandes (mêmes exclusions que l'en-tête/pied).
      const onDocMouseDown = (e: MouseEvent) => {
        const t = e.target as Node;
        if (host.contains(t)) return;
        if (t instanceof Element && t.closest(".ctx-host")) return;
        if (t instanceof Element && t.closest(".tb-ribbon-stack, .tbar")) return;
        detach();
      };
      document.addEventListener("mousedown", onDocMouseDown, true);

      const detach = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener("mousedown", onDocMouseDown, true);
        resizeObserver.disconnect();
        window.removeEventListener("resize", reposition);
        wrap?.removeEventListener("scroll", reposition);
        if (mathEditRef.current?.host === host) mathEditRef.current = null;
        host.remove();
      };
      const onHostKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          detach(); // la NodeSelection reste : le panneau et la palette demeurent
        }
      };
      host.addEventListener("keydown", onHostKeyDown);

      // MathLive en import DYNAMIQUE (lourd) : le champ apparaît un
      // instant après le clic, comme dans le panneau avant. Le module
      // embarque les styles du champ (mathLiveField.ts).
      const load = import("./mathLiveField");
      load.then(({ MathfieldElement: MathfieldElementClass }) => {
        if (closed || !host.isConnected) return;
        const mf = new MathfieldElementClass();
        // « manual » : le clavier virtuel flottant de MathLive ne se
        // déclenche JAMAIS automatiquement. L'ancien attribut
        // « virtual-keyboard-mode » n'existait pas (ignoré en silence) et
        // le clavier géant s'affichait au focus — supprimé définitivement
        // (retour utilisateur : « trop grossier ») : la palette de
        // symboles du panneau latéral Équation la remplace, et le clavier
        // est en plus tué par CSS (voir MarkdownEditor.css).
        mf.setAttribute("math-virtual-keyboard-policy", "manual");
        mf.setAttribute("locale", "fr");
        mf.setValue(source, { silenceNotifications: true });
        mf.addEventListener("input", () => {
          // Mise à jour EN DIRECT du document (même chemin que le panneau
          // avant : setNodeAttribute → repaint → KaTeX sous le champ).
          ed.view.dispatch(ed.view.state.tr.setNodeAttribute(mathPos, "source", mf.value));
        });
        host.appendChild(mf);
        mathEditRef.current = { host, mf, mathPos, detach };
        mf.focus();
        // Insertion en attente (palette cliquée avant l'ouverture) ?
        if (pendingMathLatexRef.current !== null) {
          const latex = pendingMathLatexRef.current;
          pendingMathLatexRef.current = null;
          mf.insert(latex, { focus: true, feedback: false, selectionMode: "placeholder" });
        }
      });
      // Filet : si l'import échoue, ne pas laisser un hôte vide.
      load.catch(() => detach());
    };
    startMathEditRef.current = startMathEdit;

    // Clics sur la couche peinte : traduits en position réelle dans
    // l'éditeur invisible (voir resolveClickPosition.ts), qui reprend le
    // focus. Glisser (mousedown puis mousemove) étend la sélection.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !editor) return;

      let dragging = false;
      let anchorPos: number | null = null;
      // Position de la CELLULE (pas du texte) où le glisser a commencé — voir
      // `findCellPos` plus haut. `null` si le glisser n'a pas démarré dans un
      // tableau, auquel cas on reste sur une sélection de texte normale.
      let cellAnchorPos: number | null = null;
      // Glisser une poignée de redimensionnement de colonne (voir
      // paintPages.ts) — état séparé du glisser-sélection ci-dessus,
      // mutuellement exclusif avec lui (un mousedown sur une poignée
      // retourne avant d'atteindre la logique de sélection).
      let resizingCol: {
        tablePos: number;
        colIndex: number;
        startClientX: number;
        startHandleLeft: number;
        /** Largeur mesurée au mousedown — JAMAIS modifiée pendant le
         * glisser, sert de référence pour calculer `currentWidthPx` à
         * chaque déplacement. */
        startWidthPx: number;
        /** Largeur courante recalculée à chaque `mousemove` — c'est elle
         * qui est appliquée au document au `mouseup`. */
        currentWidthPx: number;
        handle: HTMLElement;
      } | null = null;
      // Même principe que `resizingCol`, sur l'axe vertical (hauteur de ligne).
      let resizingRow: {
        tablePos: number;
        rowIndex: number;
        startClientY: number;
        startHandleTop: number;
        startHeightPx: number;
        currentHeightPx: number;
        handle: HTMLElement;
      } | null = null;

      const posFromEvent = (e: MouseEvent): number | null => {
        const block = findClonedBlock(e.target);
        if (!block) return null;
        return resolveClickPosition(editor.view, e.clientX, e.clientY, block, zoomRef.current, cloneIndexRef.current ?? undefined, e.target as Element);
      };

      /** Résolution par COORDONNÉES seules (sans événement) — utilisée par
       * l'auto-scroll de glissement : après un scroll programmatique il n'y
       * a pas de nouvel événement souris, il faut retrouver ce qui se
       * trouve maintenant sous le point mémorisé. */
      const posFromCoords = (x: number, y: number): number | null => {
        const el = document.elementFromPoint(x, y);
        if (!(el instanceof Element)) return null;
        const block = findClonedBlock(el);
        if (!block) return null;
        return resolveClickPosition(editor.view, x, y, block, zoomRef.current, cloneIndexRef.current ?? undefined, el);
      };

      /** Plage du MOT sous un point (double-clic) — via l'index du clone :
       * le nœud texte VISIBLE sous le point, précision caractère, donc
       * insensible au zoom et à la cellule. */
      const wordRangeAtPoint = (x: number, y: number): { from: number; to: number } | null => {
        const index = cloneIndexRef.current;
        if (!index) return null;
        const caret = document.caretRangeFromPoint(x, y);
        const container = caret?.startContainer;
        if (!caret || !container || container.nodeType !== Node.TEXT_NODE) return null;
        const textNode = container as Text;
        const start = index.text.get(textNode);
        if (start === undefined) return null;
        const text = textNode.data;
        const off = caret.startOffset;
        const isWordChar = (ch: string) => /[\p{L}\p{N}_'’-]/u.test(ch);
        let s = off;
        let e = off;
        while (s > 0 && isWordChar(text[s - 1])) s--;
        while (e < text.length && isWordChar(text[e])) e++;
        if (s === e) return null;
        return { from: start + s, to: start + e };
      };

      // --- Auto-scroll pendant le glisser-sélection (refonte 2026-10-17,
      // réimplémentation du concept de useDragAutoScroll de CasualOffice,
      // voir ROADMAP-CASUALOFFICE.md) : quand la souris s'approche du bord
      // haut/bas du wrapper de pages, une boucle requestAnimationFrame
      // fait défeler le conteneur à vitesse proportionnelle à la proximité
      // et étend la sélection à chaque tick — sélectionner sur plusieurs
      // pages devient possible (avant : le glissement s'arrêtait net au
      // bord du viewport).
      const DRAG_EDGE_ZONE = 40;
      const DRAG_MAX_SPEED = 12;
      let dragAutoScrollRaf: number | null = null;
      const lastDragPoint = { x: 0, y: 0 };
      const wrap = canvas.closest(".xmd-page-wrap") as HTMLElement | null;
      const stopDragAutoScroll = () => {
        if (dragAutoScrollRaf !== null) {
          cancelAnimationFrame(dragAutoScrollRaf);
          dragAutoScrollRaf = null;
        }
      };
      const extendDragAt = (x: number, y: number) => {
        const pos = posFromCoords(x, y);
        if (pos === null || anchorPos === null) return;
        const cellPos = findCellPos(editor.state.doc, pos);
        if (cellAnchorPos !== null && cellPos !== null && cellPos !== cellAnchorPos) {
          try {
            const sel = CellSelection.create(editor.state.doc, cellAnchorPos, cellPos);
            editor.view.dispatch(editor.state.tr.setSelection(sel));
            return;
          } catch {
            // Repli texte ci-dessous.
          }
        }
        editor.commands.setTextSelection({ from: Math.min(anchorPos, pos), to: Math.max(anchorPos, pos) });
      };
      const dragAutoScrollTick = () => {
        dragAutoScrollRaf = null;
        if (!dragging || !wrap) return;
        const r = wrap.getBoundingClientRect();
        let delta = 0;
        if (lastDragPoint.y < r.top + DRAG_EDGE_ZONE) {
          delta = -Math.min(DRAG_MAX_SPEED, ((r.top + DRAG_EDGE_ZONE - lastDragPoint.y) / DRAG_EDGE_ZONE) * DRAG_MAX_SPEED);
        } else if (lastDragPoint.y > r.bottom - DRAG_EDGE_ZONE) {
          delta = Math.min(DRAG_MAX_SPEED, ((lastDragPoint.y - (r.bottom - DRAG_EDGE_ZONE)) / DRAG_EDGE_ZONE) * DRAG_MAX_SPEED);
        }
        if (delta !== 0) {
          wrap.scrollTop += delta;
          extendDragAt(lastDragPoint.x, lastDragPoint.y);
        }
        dragAutoScrollRaf = requestAnimationFrame(dragAutoScrollTick);
      };

      const onMouseDown = (e: MouseEvent) => {
        // Clic droit : ne touche ni la sélection ni le glisser — le menu
        // contextuel (`onContextMenu`) décide lui-même quoi sélectionner.
        if (e.button !== 0) return;
        // Poignée de redimensionnement de colonne (voir paintPages.ts) —
        // vérifiée en tout premier : une poignée peut visuellement se
        // trouver à l'intérieur d'un tableau d'en-tête/pied de page, donc
        // AVANT le test `headerFooterTarget` ci-dessous pour ne jamais lui
        // laisser la priorité par erreur.
        const resizeHandleTarget = (e.target as HTMLElement)?.closest<HTMLElement>(`.${COL_RESIZE_HANDLE_CLASS}`);
        if (resizeHandleTarget) {
          e.preventDefault();
          const tablePos = Number(resizeHandleTarget.getAttribute(COL_RESIZE_TABLE_POS_ATTR));
          const colIndex = Number(resizeHandleTarget.getAttribute(COL_RESIZE_COL_INDEX_ATTR));
          // Largeur de départ mesurée sur le tableau ORIGINAL (invisible,
          // mais attaché au document donc mesurable) via son `<col>` — pas
          // sur la cellule, qui n'a pas forcément d'attribut `colwidth`
          // explicite tant qu'elle n'a jamais été redimensionnée.
          const originalWrapper = editor.view.nodeDOM(tablePos) as HTMLElement | null;
          const originalTable = originalWrapper?.matches("table") ? originalWrapper : originalWrapper?.querySelector("table");
          const col = originalTable?.querySelectorAll(":scope > colgroup > col")[colIndex] as HTMLElement | undefined;
          const startWidthPx = col?.getBoundingClientRect().width;
          if (!startWidthPx) return;
          resizingCol = {
            tablePos,
            colIndex,
            startClientX: e.clientX,
            startHandleLeft: parseFloat(resizeHandleTarget.style.left),
            startWidthPx,
            currentWidthPx: startWidthPx,
            handle: resizeHandleTarget,
          };
          resizeHandleTarget.classList.add("xmd-col-resize-active");
          return;
        }
        // Poignée de redimensionnement de LIGNE — même principe, miroir
        // vertical du cas colonne ci-dessus.
        const rowResizeHandleTarget = (e.target as HTMLElement)?.closest<HTMLElement>(`.${ROW_RESIZE_HANDLE_CLASS}`);
        if (rowResizeHandleTarget) {
          e.preventDefault();
          const tablePos = Number(rowResizeHandleTarget.getAttribute(ROW_RESIZE_TABLE_POS_ATTR));
          const rowIndex = Number(rowResizeHandleTarget.getAttribute(ROW_RESIZE_ROW_INDEX_ATTR));
          const originalWrapper = editor.view.nodeDOM(tablePos) as HTMLElement | null;
          const originalTable = originalWrapper?.matches("table") ? originalWrapper : originalWrapper?.querySelector("table");
          const rows = originalTable?.querySelectorAll(":scope > tbody > tr, :scope > tr");
          const row = rows?.[rowIndex] as HTMLElement | undefined;
          const startHeightPx = row?.getBoundingClientRect().height;
          if (!startHeightPx) return;
          resizingRow = {
            tablePos,
            rowIndex,
            startClientY: e.clientY,
            startHandleTop: parseFloat(rowResizeHandleTarget.style.top),
            startHeightPx,
            currentHeightPx: startHeightPx,
            handle: rowResizeHandleTarget,
          };
          rowResizeHandleTarget.classList.add("xmd-row-resize-active");
          return;
        }
        const headerFooterTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-page-header, .xmd-page-footer");
        if (headerFooterTarget) {
          e.preventDefault();
          startHeaderFooterEdit(headerFooterTarget);
          return;
        }
        // Marqueur de sommaire (voir TocMarker.ts) : cliquer dessus le
        // remplit directement — remonté par l'utilisateur ("le marqueur de
        // sommaire n'ouvre pas le panneau"), le bouton ruban dédié
        // ("Mettre à jour") ayant été retiré au profit du panneau latéral
        // « Sommaire », qui s'ouvre automatiquement une fois le sommaire
        // généré (voir `insideToc`/le curseur repositionné dedans par
        // `generateToc`).
        const tocMarkerTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-toc-marker");
        if (tocMarkerTarget) {
          e.preventDefault();
          editor.chain().focus(undefined, { scrollIntoView: false }).generateToc().run();
          return;
        }
        // Ancre de sommaire (voir TocMarker.ts, generateToc) : un lien
        // `#slug` ne peut pas être laissé au navigateur (la couche peinte
        // n'est pas un document normal, et le clic serait de toute façon
        // intercepté juste en dessous pour la résolution de position) — on
        // le gère nous-mêmes en faisant défiler jusqu'à l'élément portant
        // cet `id` (posé sur chaque titre peint par paintPages.ts).
        const anchorLink = (e.target as HTMLElement)?.closest<HTMLAnchorElement>('a[href^="#"]');
        if (anchorLink) {
          e.preventDefault();
          const targetId = decodeURIComponent(anchorLink.getAttribute("href")!.slice(1));
          const targetEl = canvas.querySelector(`#${CSS.escape(targetId)}`);
          targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        // Référence de note de bas de page (voir Footnote.ts) : saute à sa
        // définition (en fin de document) plutôt que de positionner le
        // curseur dedans — c'est un atome en lecture seule dans la couche
        // peinte, pas du texte à éditer directement.
        const footnoteRef = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-footnote-ref");
        if (footnoteRef) {
          e.preventDefault();
          const id = footnoteRef.getAttribute("data-id");
          const targetEl = canvas.querySelector(`.xmd-footnote-def[data-id="${CSS.escape(id ?? "")}"]`);
          targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        // Formule mathématique (voir Math.ts) : clic → invite avec la
        // source LaTeX actuelle, plutôt que d'éditer le rendu KaTeX
        // directement (un atome, comme les notes de bas de page). Réutilise
        // `posFromEvent` (déjà fiable sur du contenu en ligne, voir
        // resolveClickPosition.ts) pour retrouver la position réelle du
        // clic, puis cherche l'atome pile à cette position (ou juste avant,
        // selon de quel côté `posFromEvent` est tombé).
        // Diagramme Mermaid (2026-10-21, éditeur dédié) : clic sur le
        // diagramme peint → NodeSelection → le panneau latéral
        // « Diagramme » s'ouvre avec la source et l'aperçu en direct
        // (la PAGE ne montre QUE le diagramme rendu, plus jamais la
        // source brute).
        // NB : le clone peint porte la CLASSE .xmd-mermaid (le DOM du
        // NodeView, cloné tel quel), pas l'attribut data-type (qui n'existe
        // que sur le HTML sérialisé) — viser la classe, pas l'attribut.
        const mermaidTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-mermaid");
        if (mermaidTarget) {
          e.preventDefault();
          const isMermaidNode = (n: any) => n && n.type.name === "mermaidDiagram";
          let mermaidPos: number | null = null;
          // Chemin PRINCIPAL : le clone peint du bloc porte data-src-pos =
          // la position EXACTE du nœud dans le document (paintPages) — un
          // atome sans texte ne passe pas toujours bien posFromEvent.
          const blockPosAttr = mermaidTarget.closest<HTMLElement>("[data-src-pos]")?.getAttribute("data-src-pos");
          if (blockPosAttr != null) {
            const p = parseInt(blockPosAttr, 10);
            if (isMermaidNode(editor.state.doc.nodeAt(p))) mermaidPos = p;
          }
          // Repli : résolution au point cliqué (position avant/après l'atome).
          if (mermaidPos === null) {
            const clickPos = posFromEvent(e);
            if (clickPos !== null) {
              if (isMermaidNode(editor.state.doc.nodeAt(clickPos))) mermaidPos = clickPos;
              else if (isMermaidNode(editor.state.doc.nodeAt(clickPos - 1))) mermaidPos = clickPos - 1;
            }
          }
          if (mermaidPos === null) return;
          editor.commands.focus(undefined, { scrollIntoView: false });
          editor.commands.setNodeSelection(mermaidPos);
          return;
        }
        const mathTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-math");
        // Saut de section : clic → NodeSelection (sélectionnable, Suppr le
        // retire — même confort que le saut de page).
        const sectionTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-sectionbreak");
        if (sectionTarget) {
          e.preventDefault();
          const isSectionNode = (n: any) => n && n.type.name === "sectionBreak";
          const blockPosAttr = sectionTarget.closest<HTMLElement>("[data-src-pos]")?.getAttribute("data-src-pos");
          let sectionPos: number | null = null;
          if (blockPosAttr != null) {
            const p = parseInt(blockPosAttr, 10);
            if (isSectionNode(editor.state.doc.nodeAt(p))) sectionPos = p;
          }
          if (sectionPos === null) {
            const clickPos = posFromEvent(e);
            if (clickPos !== null) {
              if (isSectionNode(editor.state.doc.nodeAt(clickPos))) sectionPos = clickPos;
              else if (isSectionNode(editor.state.doc.nodeAt(clickPos - 1))) sectionPos = clickPos - 1;
            }
          }
          if (sectionPos === null) return;
          editor.commands.focus(undefined, { scrollIntoView: false });
          editor.commands.setNodeSelection(sectionPos);
          return;
        }
        // Champ de document ({{title}}…) : un clic ouvre sa saisie directe
        // (propriétés du document) au lieu de le sélectionner comme un
        // atome muet. Les champs calculés (date…) gardent le clic normal.
        const docFieldTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-docfield");
        if (docFieldTarget && !readOnly) {
          const fieldName = docFieldTarget.getAttribute("data-name") ?? "";
          if (openDocFieldEditor(docFieldTarget, fieldName, layoutRef.current, (l) => onLayoutChangeRef.current(l))) {
            e.preventDefault();
            return;
          }
        }
        if (mathTarget) {
          e.preventDefault();
          const clickPos = posFromEvent(e);
          if (clickPos === null) return;
          const isMathNode = (n: any) => n && (n.type.name === "inlineMath" || n.type.name === "blockMath");
          let mathPos = clickPos;
          let node = editor.state.doc.nodeAt(mathPos);
          if (!isMathNode(node)) {
            mathPos = clickPos - 1;
            node = editor.state.doc.nodeAt(mathPos);
          }
          if (!isMathNode(node)) return;
          // Sélectionne la formule (NodeSelection) : le panneau latéral
          // « Équation » s'ouvre automatiquement avec l'éditeur WYSIWYG
          // MathLive pré-rempli (plus de window.prompt de LaTeX brut —
          // les utilisateurs ne codent pas d'équation).
          editor.commands.focus(undefined, { scrollIntoView: false });
          editor.commands.setNodeSelection(mathPos);
          // Édition DIRECTE SUR LA PAGE (point ① maquette) : le champ
          // MathLive flotte sur la zone cliquée, le panneau ne garde
          // que la palette.
          startMathEditRef.current(mathPos, mathTarget);
          return;
        }        const pos = posFromEvent(e);
        if (pos === null) return;
        e.preventDefault();
        editor.commands.focus(undefined, { scrollIntoView: false });

        // Maj+clic (simple) : étend la sélection existante depuis son
        // ancre (comme un glisser-sélection, sans glisser).
        if (e.shiftKey && e.detail === 1) {
          const { anchor } = editor.state.selection;
          editor.commands.setTextSelection({ from: anchor, to: pos });
          return;
        }
        // Double-clic : sélectionne le MOT sous le point (le repli = un
        // simple clic si le point n'est pas sur du texte indexé).
        if (e.detail === 2) {
          const word = wordRangeAtPoint(e.clientX, e.clientY);
          if (word) {
            editor.commands.setTextSelection(word);
            return;
          }
        }
        // Triple-clic : sélectionne le BLOC entier (sauf tableau — une
        // grille ne se sélectionne pas d'un triple-clic, ça n'aurait pas
        // de sens d'englober tout le tableau).
        if (e.detail === 3) {
          const block = findClonedBlock(e.target);
          const srcPosAttr = block?.getAttribute("data-src-pos");
          if (block && srcPosAttr != null) {
            const srcPos = parseInt(srcPosAttr, 10);
            const node = editor.state.doc.nodeAt(srcPos);
            if (node && node.type.name !== "table") {
              const from = srcPos + 1;
              const to = srcPos + node.nodeSize - 1;
              if (from < to) {
                editor.commands.setTextSelection({ from, to });
                return;
              }
            }
          }
        }

        dragging = true;
        anchorPos = pos;
        cellAnchorPos = findCellPos(editor.state.doc, pos);
        editor.commands.setTextSelection(pos);
        // Démarre la boucle d'auto-scroll (sans effet tant que la souris
        // n'approche pas un bord — le tick ne fait alors rien).
        lastDragPoint.x = e.clientX;
        lastDragPoint.y = e.clientY;
        if (dragAutoScrollRaf === null) dragAutoScrollRaf = requestAnimationFrame(dragAutoScrollTick);
      };
      const onMouseMove = (e: MouseEvent) => {
        if (resizingCol) {
          // Delta en pixels ÉCRAN (`clientX`) converti en pixels LOGIQUES
          // (avant le `transform: scale(zoom)` de `.xmd-page-canvas`) —
          // sans cette division, glisser à 150% de zoom déplacerait la
          // poignée 1,5× plus vite que la souris. Mêmes unités que
          // `caretPosition.ts`/`selectionHighlight.ts` pour la même raison.
          const logicalDelta = (e.clientX - resizingCol.startClientX) / zoomRef.current;
          const MIN_COL_WIDTH_PX = 40;
          resizingCol.currentWidthPx = Math.max(MIN_COL_WIDTH_PX, resizingCol.startWidthPx + logicalDelta);
          // La poignée ne bouge que de l'écart réellement appliqué (clampé
          // à la largeur minimale), pas du delta brut — sinon elle
          // continuerait de suivre la souris au-delà de la limite tout en
          // laissant la largeur réelle bloquée, décalage visible et
          // trompeur.
          const appliedDelta = resizingCol.currentWidthPx - resizingCol.startWidthPx;
          resizingCol.handle.style.left = `${resizingCol.startHandleLeft + appliedDelta}px`;
          return;
        }
        if (resizingRow) {
          const logicalDelta = (e.clientY - resizingRow.startClientY) / zoomRef.current;
          const MIN_ROW_HEIGHT_PX = 24;
          resizingRow.currentHeightPx = Math.max(MIN_ROW_HEIGHT_PX, resizingRow.startHeightPx + logicalDelta);
          const appliedDeltaY = resizingRow.currentHeightPx - resizingRow.startHeightPx;
          resizingRow.handle.style.top = `${resizingRow.startHandleTop + appliedDeltaY}px`;
          return;
        }
        if (!dragging || anchorPos === null) return;
        // Point mémorisé pour l'auto-scroll de glissement (le tick rAF
        // étend la sélection à CE point après chaque scroll programmatique).
        lastDragPoint.x = e.clientX;
        lastDragPoint.y = e.clientY;
        const pos = posFromEvent(e);
        if (pos === null) return;
        // Glisser à travers plusieurs cellules d'un tableau DOIT produire une
        // vraie `CellSelection` (nécessaire pour `mergeCells`/`setCellBorder`
        // etc., voir `applyToSelectedCells` plus haut) — un simple
        // `setTextSelection({from, to})` ne la construit JAMAIS, même si la
        // plage traverse des cellules : ProseMirror la normalise en
        // sélection de texte ordinaire, ce qui rendait la fusion de cellules
        // glissées-sélectionnées peu fiable (jamais une vraie sélection
        // multi-cellules, quel que soit le zoom/la résolution d'écran —
        // cette étape-ci n'a d'ailleurs rien de géométrique, donc n'est en
        // fait pas sensible à ça, contrairement à `posFromEvent` ci-dessus).
        const cellPos = findCellPos(editor.state.doc, pos);
        if (cellAnchorPos !== null && cellPos !== null && cellPos !== cellAnchorPos) {
          try {
            const sel = CellSelection.create(editor.state.doc, cellAnchorPos, cellPos);
            editor.view.dispatch(editor.state.tr.setSelection(sel));
            return;
          } catch {
            // Les deux cellules ne sont pas dans le même tableau (ou autre
            // position invalide) — repli sur la sélection de texte normale.
          }
        }
        editor.commands.setTextSelection({ from: anchorPos, to: pos });
      };
      const onMouseUp = () => {
        if (resizingCol) {
          resizingCol.handle.classList.remove("xmd-col-resize-active");
          applyColumnWidth(editor, resizingCol.tablePos, resizingCol.colIndex, Math.round(resizingCol.currentWidthPx));
          resizingCol = null;
          return;
        }
        if (resizingRow) {
          resizingRow.handle.classList.remove("xmd-row-resize-active");
          applyRowHeight(editor, resizingRow.tablePos, resizingRow.rowIndex, Math.round(resizingRow.currentHeightPx));
          resizingRow = null;
          return;
        }
        dragging = false;
        anchorPos = null;
        cellAnchorPos = null;
        stopDragAutoScroll();
      };

      // Filet de sécurité : un lien réel (`<a href="https://…">`) cliqué
      // dans la couche peinte a fait naviguer le NAVIGATEUR SYSTÈME (Chrome
      // ouvert par-dessus l'appli — `tauri-plugin-opener` redirige toute
      // navigation externe hors de la WebView vers le navigateur par
      // défaut, comportement de sécurité voulu par Tauri) au lieu de se
      // contenter de positionner le curseur, comme n'importe quel autre
      // clic sur cette couche en lecture seule. `preventDefault()` sur
      // `mousedown` (dans `onMouseDown` ci-dessus) ne suffit PAS à annuler
      // la navigation déclenchée par l'événement `click` natif du lien qui
      // suit — il faut l'empêcher explicitement, lui aussi.
      const onClick = (e: MouseEvent) => {
        if ((e.target as HTMLElement)?.closest("a")) {
          e.preventDefault();
        }
      };

      // Menu contextuel clic-droit (voir `tableContextMenu`/`TableContextMenu`
      // plus bas) — uniquement si le clic tombe dans un tableau, façon Word :
      // le menu natif du navigateur reste disponible partout ailleurs (texte
      // normal), on n'intercepte QUE ce cas précis.
      const onContextMenu = (e: MouseEvent) => {
        const pos = posFromEvent(e);
        if (pos === null) return;
        const cellPos = findCellPos(editor.state.doc, pos);
        e.preventDefault();
        // Préserve une sélection déjà en place si le clic tombe dedans (pour
        // que Couper/Copier/"Fusionner" agissent dessus) ; sinon positionne
        // le curseur au point cliqué, comme un clic normal.
        const sel = editor.state.selection;
        const insideSelection = sel.from !== sel.to && pos >= sel.from && pos <= sel.to;
        if (!(sel instanceof CellSelection) && !insideSelection) {
          editor.commands.focus(undefined, { scrollIntoView: false });
          editor.commands.setTextSelection(pos);
        }
        setTableContextMenu({ x: e.clientX, y: e.clientY, inTable: cellPos !== null });
      };

      canvas.addEventListener("mousedown", onMouseDown);
      canvas.addEventListener("click", onClick);
      canvas.addEventListener("contextmenu", onContextMenu);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return () => {
        canvas.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("click", onClick);
        canvas.removeEventListener("contextmenu", onContextMenu);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        stopDragAutoScroll();
      };
    }, [editor]);

    // Page courante (comme "Page 8 sur 27" dans Word) : la page dont la
    // boîte a défilé sous le haut de la zone visible.
    useEffect(() => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas || !editor) return;

      let scheduled = false;
      const recomputeCurrentPage = () => {
        scheduled = false;
        const pages = Array.from(canvas.querySelectorAll<HTMLElement>(".xmd-page"));
        const wrapTop = wrap.getBoundingClientRect().top;
        const thresholdY = wrapTop + 40;
        let page = 1;
        for (let i = 0; i < pages.length; i++) {
          if (pages[i].getBoundingClientRect().top < thresholdY) page = i + 1;
        }
        if (page !== currentPageRef.current) {
          currentPageRef.current = page;
          const words: number = editor.storage.characterCount.words();
          const characters: number = editor.storage.characterCount.characters();
          onStatsRef.current?.({
            words,
            characters,
            pageCount: pageCountRef.current,
            currentPage: page,
            activeBlockStyle: getActiveBlockStyle(cmd()),
            activeMarks: getActiveMarks(cmd()),
            activeAlign: getActiveAlign(cmd()),
            activeList: getActiveListType(cmd()),
            activeFontFamily: currentFontFamily(cmd()),
          activeColor: currentTextColor(cmd()),
            activeFontSizePt: currentFontSizePt(cmd()),
            insideTable: cmd().isActive("table"),
            insideToc: getInsideToc(editor),
          math: getMathAtSelection(editor),
          mermaid: getMermaidAtSelection(editor),
          coverZone: getCoverZoneAtSelection(editor),
            tableSelectionShape: getSelectionShape(cmd()),
            headerFooterEditMode: headerFooterModeRef.current,
          });
        }
      };

      const onScroll = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(recomputeCurrentPage);
      };

      wrap.addEventListener("scroll", onScroll, { passive: true });
      recomputeCurrentPage();
      return () => wrap.removeEventListener("scroll", onScroll);
    }, [editor]);

    // Règle verticale (roadmap 1.1) — recalcul calé sur le DOM réel, jamais
    // sur des valeurs dérivées : la règle est sticky (gauche + sous la règle
    // horizontale), ses graduations doivent suivre la page sous le viewport.
    // Principe : un motif de page par période « hauteur de page + espace
    // entre pages » (voir Ruler.tsx) ; on translate l'ensemble pour que le
    // motif reste à l'aplomb des pages réelles, mesuré depuis les boîtes
    // peintes (getBoundingClientRect intègre déjà le zoom via transform).
    // Le calage est posé en variables CSS SUR LE DOM (pas d'état React) :
    // le défilement le déclenche à chaque frame, un re-render serait du
    // gaspillage ; seul le NOMBRE de motifs (dépend de la hauteur du
    // viewport et du zoom, change rarement) passe par setVRulerPeriods.
    const recomputeVRulerRef = useRef<() => void>(() => {});
    recomputeVRulerRef.current = () => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const rulerV = wrap.querySelector<HTMLElement>(".xmd-ruler-v");
      const page = canvas.querySelector<HTMLElement>(".xmd-page");
      if (!rulerV || !page) return;
      const wrapTop = wrap.getBoundingClientRect().top;
      const scrollTop = wrap.scrollTop;
      // Position réelle (coords contenu) de la règle sticky — mesurée, pas
      // déduite : près de la fin du document, le sticky est contraint par le
      // bas du bloc conteneur et la règle remonte avec le contenu.
      const rulerTop = rulerV.getBoundingClientRect().top - wrapTop + scrollTop;
      const pageTop = page.getBoundingClientRect().top - wrapTop + scrollTop;
      const pageHeight = page.getBoundingClientRect().height;
      // Période = hauteur de page + espace entre pages (le `gap` de
      // .xmd-page-canvas, lu depuis le style calculé pour rester juste si
      // la valeur CSS change un jour).
      const gap = parseFloat(getComputedStyle(canvas).rowGap) || PAGE_GAP_PX;
      const stride = pageHeight + gap;
      // Hauteur visible : tout le viewport du wrap moins la règle
      // horizontale (18px + bordure) moins une marge de sécurité.
      const height = Math.max(0, wrap.clientHeight - 20);
      // Calage : le motif est translaté pour que ses marques de page
      // tombent sur les vrais bords de page (offset dans [-stride, 0)).
      const raw = (((pageTop - rulerTop) % stride) + stride) % stride;
      rulerV.style.setProperty("--xmd-ruler-v-offset", `${raw - stride}px`);
      rulerV.style.setProperty("--xmd-ruler-v-stride", `${stride}px`);
      rulerV.style.height = `${height}px`;
      const periods = Math.max(2, Math.ceil((height + stride) / stride));
      setVRulerPeriods((prev) => (prev === periods ? prev : periods));
    };
    useEffect(() => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      let scheduled = false;
      const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          recomputeVRulerRef.current();
        });
      };
      wrap.addEventListener("scroll", schedule, { passive: true });
      // Le viewport (wrap) ET la pile de pages (canvas) changent de taille
      // (fenêtre redimensionnée, panneaux latéraux, repaint des pages,
      // zoom) : ResizeObserver couvre tout, y compris le premier paint
      // (le canvas passe de 0 à la hauteur de la première page).
      const ro = new ResizeObserver(schedule);
      ro.observe(wrap);
      ro.observe(canvas);
      schedule();
      return () => {
        wrap.removeEventListener("scroll", schedule);
        ro.disconnect();
      };
    }, [zoom, layout, editor]);

    // Ctrl+molette : zoom façon Word/Google Docs. Purement visuel
    // (`transform: scale()` sur `.xmd-page-canvas`, voir le rendu plus bas).
    useEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap || !onZoomChange) return;
      const onWheel = (event: WheelEvent) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        onZoomChange(zoom + delta);
      };
      wrap.addEventListener("wheel", onWheel, { passive: false });
      return () => wrap.removeEventListener("wheel", onWheel);
    }, [zoom, onZoomChange]);

    const { widthMm: pageWidthMm, heightMm: pageHeightMm } = resolvePageSizeMm(layout);
    const pageVars = {
      "--xmd-font-family": layout.fontFamily,
      "--xmd-font-size": layout.fontSize,
      "--xmd-line-height": layout.lineHeight,
      "--xmd-paragraph-spacing": `${layout.paragraphSpacingPt}pt`,
      "--xmd-paragraph-spacing-before": `${layout.spacingBeforePt}pt`,
      "--xmd-zoom": zoom,
      "--xmd-page-height": `${pageHeightMm}mm`,
      "--xmd-page-width": `${pageWidthMm}mm`,
      "--xmd-margin-top": `${layout.marginTopMm}mm`,
      "--xmd-margin-right": `${layout.marginRightMm}mm`,
      "--xmd-margin-bottom": `${layout.marginBottomMm}mm`,
      "--xmd-margin-left": `${layout.marginLeftMm}mm`,
      "--xmd-header-height": `${layout.header.heightMm}mm`,
      "--xmd-footer-height": `${layout.footer.heightMm}mm`,
      // « À partir du bord » (onglet Mise en page, comme Word) : distance du
      // bord de la page au début de la zone, consommée par .xmd-page-header
      // / .xmd-page-footer dans MarkdownEditor.css.
      "--xmd-header-top": `${layout.header.fromEdgeMm}mm`,
      "--xmd-footer-bottom": `${layout.footer.fromEdgeMm}mm`,
      // Style par niveau de titre (voir pageLayout.ts) — une variable par
      // propriété et par niveau, consommées par les règles `.xmd-prosemirror
      // h1`...`h6` dans MarkdownEditor.css. La numérotation elle-même n'a
      // pas de variable ici : elle est écrite en dur dans le texte du titre
      // par HeadingAutoNumber.ts, pas affichée en CSS.
      ...Object.fromEntries(
        ([1, 2, 3, 4, 5, 6] as const).flatMap((level) => {
          const style = layout.headingStyles[level];
          return [
            [`--xmd-h${level}-font`, style.fontFamily],
            [`--xmd-h${level}-size`, style.fontSize],
            [`--xmd-h${level}-color`, style.color],
            [`--xmd-h${level}-weight`, style.bold ? "bold" : "normal"],
            [`--xmd-h${level}-style`, style.italic ? "italic" : "normal"],
            // Interligne + espacement propres au niveau (roadmap 2.2) —
            // non définis = suivre le document (les variables prennent les
            // valeurs du document, le CSS n'a pas besoin de repli spécial).
            [`--xmd-h${level}-line-height`, String(style.lineHeight ?? layout.lineHeight)],
            [`--xmd-h${level}-spacing`, `${style.spacingAfterPt ?? layout.paragraphSpacingPt}pt`],
          ];
        }),
      ),
    } as CSSProperties;

    return (
      <div className="xmd-page-wrap" ref={wrapRef} style={pageVars}>
        {/* Règles graduées en mm, zones de marge, triangles (roadmap 1.1) —
         * lecture seule pour l'instant, jamais imprimées. L'horizontale est
         * sticky en haut du wrap ; la verticale est sticky à gauche dans la
         * ligne flex .xmd-editor-row ci-dessous (calage au défilement par
         * recomputeVRuler). */}
        {showRulers && (
          <HorizontalRuler
            layout={layout}
            zoom={zoom}
            onMarginChange={(patch) => onLayoutChangeRef.current({ ...layoutRef.current, ...patch })}
          />
        )}

        {/* Zone RÉELLEMENT éditable — jamais visible. Curseur, sélection,
         * undo/redo, IME : tout ProseMirror natif. Largeur initialisée à une
         * estimation (mm → px) puis corrigée au pixel près dès qu'une page
         * existe pour la mesurer (voir repaint() plus bas) — la mise en
         * ligne du texte doit être IDENTIQUE à celle des boîtes peintes,
         * au risque de décaler la traduction clic → position. */}
        <div
          className="xmd-live-editor-host"
          ref={liveHostRef}
          style={{ width: geometry.contentWidthPx }}
          aria-hidden="true"
        >
          <EditorContent editor={editor} />
        </div>

        {/* Couche peinte : boîtes de page à taille FIXE contenant des clones
         * en lecture seule (voir paintPages.ts). C'est la seule chose que
         * l'utilisateur voit et avec laquelle il clique/glisse.
         * Le curseur dessiné à la main (.xmd-fake-caret) doit être un frère
         * de .xmd-page-canvas SANS aucun autre ancêtre positionné entre les
         * deux : caretPosition.ts calcule ses coordonnées relativement au
         * coin haut-gauche de .xmd-page-canvas — s'il était positionné par
         * rapport à .xmd-page-wrap (qui a du padding), le curseur affiché
         * dériverait de cette différence à chaque frappe. */}
        {/* Ligne flex : règle verticale (gauche) + couche peinte. Ce
         * conteneur NE DOIT PAS être positionné — caretPosition.ts calcule
         * les coordonnées du curseur relativement au coin haut-gauche de
         * .xmd-page-canvas via son ancêtre positionné .xmd-canvas-frame ;
         * un ancêtre positionné de plus désynchroniserait le curseur. */}
        <div className="xmd-editor-row">
          {showRulers && (
            <VerticalRuler
              layout={layout}
              zoom={zoom}
              periods={vRulerPeriods}
              onMarginChange={(patch) => onLayoutChangeRef.current({ ...layoutRef.current, ...patch })}
            />
          )}
          <div className="xmd-canvas-frame">
            <div className="xmd-page-canvas" ref={canvasRef} />
            <div className="xmd-selection-layer" ref={selectionLayerRef} />
            <div className="xmd-fake-caret" ref={caretRef} />
          </div>
        </div>

        {selBar && editor && <SelectionBar editor={editor} left={selBar.left} top={selBar.top} />}

        {tableContextMenu && editor && (
          <TableContextMenu
            x={tableContextMenu.x}
            y={tableContextMenu.y}
            inTable={tableContextMenu.inTable}
            editable={!readOnly}
            hasSelection={editor.state.selection.from !== editor.state.selection.to}
            onClose={() => setTableContextMenu(null)}
            onAction={(run) => {
              run(editor);
              setTableContextMenu(null);
            }}
          />
        )}
      </div>
    );
  }
);
MarkdownEditor.displayName = "MarkdownEditor";

/** Menu contextuel clic-droit sur une cellule de tableau (voir `onContextMenu`
 * dans le composant principal) — reprend les mêmes commandes natives de
 * `@tiptap/extension-table` déjà exposées dans le ruban (voir `CLAUDE.md`,
 * inspiré du menu équivalent de CasualOffice/docs, `TextContextMenu.tsx` :
 * right-click dans un tableau y ajoute les mêmes actions que la barre
 * d'outils dédiée, en plus de couper/copier/coller). Les commandes agissent
 * ici directement sur l'instance `editor` (pas besoin de repasser par
 * `MarkdownEditorHandle`/`ToolbarActions` : ce composant a déjà un accès
 * direct, plus simple que de dupliquer l'indirection). */
function TableContextMenu({
  x,
  y,
  inTable,
  editable,
  hasSelection,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  /** Le clic est dans un tableau : ajoute les actions de tableau. */
  inTable: boolean;
  editable: boolean;
  hasSelection: boolean;
  onAction: (run: (editor: Editor) => void) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Recale dans la fenêtre (le menu s'ouvre au point du clic : près du bord
  // droit/bas il déborderait sinon).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
  }, [x, y, inTable]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // `setTimeout` : le `contextmenu` natif qui a ouvert ce menu déclenche
    // aussi, juste après, un `mousedown`/`click` fantôme sur certains
    // navigateurs — sans ce délai, le menu se refermerait instantanément
    // lui-même dès son ouverture (même piège que les menus du ruban, voir
    // `Toolbar.tsx`, mais ici sur l'évènement d'OUVERTURE plutôt que sur un
    // clic d'option).
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onMouseDown);
      document.addEventListener("keydown", onKeyDown);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const item = (label: string, run: (editor: Editor) => void, danger?: boolean, shortcut?: string, disabled?: boolean) => (
    <button
      key={label}
      type="button"
      disabled={disabled}
      className={`xmd-table-ctx-item${danger ? " xmd-table-ctx-item-danger" : ""}`}
      // Garde le focus (donc la sélection) dans l'éditeur invisible.
      onMouseDown={keepEditorFocus}
      onClick={() => onAction(run)}
    >
      <span>{label}</span>
      {shortcut && <span className="xmd-table-ctx-shortcut">{shortcut}</span>}
    </button>
  );

  const chain = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => (editor: Editor) =>
    fn(editor.chain().focus(undefined, { scrollIntoView: false })).run();

  return (
    <div
      ref={rootRef}
      className="xmd-table-ctx-menu"
      style={pos}
      role="menu"
    >
      {/* Édition de texte (inspiré du menu de CasualOffice/docs — sans
       * « Traduire » ni « Commenter », volontairement : commentaires prévus
       * plus tard avec le format .xmd). */}
      {item("Couper", (ed) => cutEditorSelection(ed), false, "Ctrl+X", !editable || !hasSelection)}
      {item("Copier", (ed) => copyEditorSelection(ed), false, "Ctrl+C", !hasSelection)}
      {item("Coller", (ed) => pasteIntoEditor(ed, false), false, "Ctrl+V", !editable)}
      {item("Coller en texte brut", (ed) => pasteIntoEditor(ed, true), false, "Ctrl+Maj+V", !editable)}
      <div className="xmd-table-ctx-sep" />
      {item("Supprimer", chain((c) => c.deleteSelection()), false, "Suppr", !editable || !hasSelection)}
      <div className="xmd-table-ctx-sep" />
      {item("Tout sélectionner", chain((c) => c.selectAll()), false, "Ctrl+A")}
      {inTable && editable && (
        <>
          <div className="xmd-table-ctx-sep" />
          {item("Insérer une ligne au-dessus", chain((c) => c.addRowBefore()))}
          {item("Insérer une ligne en dessous", chain((c) => c.addRowAfter()))}
          {item("Supprimer la ligne", chain((c) => c.deleteRow()), true)}
          <div className="xmd-table-ctx-sep" />
          {item("Insérer une colonne à gauche", chain((c) => c.addColumnBefore()))}
          {item("Insérer une colonne à droite", chain((c) => c.addColumnAfter()))}
          {item("Supprimer la colonne", chain((c) => c.deleteColumn()), true)}
          <div className="xmd-table-ctx-sep" />
          {item("Fusionner les cellules", chain((c) => c.mergeCells()))}
          {item("Scinder la cellule", chain((c) => c.splitCell()))}
          <div className="xmd-table-ctx-sep" />
          {item("Supprimer le tableau", chain((c) => c.deleteTable()), true)}
        </>
      )}
    </div>
  );
}
