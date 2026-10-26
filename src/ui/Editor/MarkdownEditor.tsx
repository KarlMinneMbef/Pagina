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


import { useEffect, useLayoutEffect, useImperativeHandle, forwardRef, useRef, useMemo, useState, type CSSProperties } from "react";


import { migrateCoverMarkdown, findCoverZoneAround, coverZoneIndexAt, extractCoverZoneMarkdown, type CoverZoneInfo } from "./extensions/CoverZone";


import { refreshSpellcheck } from "./extensions/Spellcheck";
import { buildEditorExtensions } from "./editorExtensions";
import type { EditorRefs } from "./hooks/editorRefs";
import { useCanvasRepaint } from "./hooks/useCanvasRepaint";
import { useHeaderFooterEdit } from "./hooks/useHeaderFooterEdit";
import { useMathEdit } from "./hooks/useMathEdit";
import { useCanvasMouse, type TableContextMenuState } from "./hooks/useCanvasMouse";
import { askLinkUrl, askBookmarkName, askCrossReference } from "../dialogs/prompts";
import { addUserWord, ignoreWord } from "../../core/spellcheck/userDictionary";

import { DOMParser as ProseMirrorDOMParser, Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

import { HorizontalRuler, VerticalRuler, PAGE_GAP_PX } from "./pagination/Ruler";
import type { MathfieldElement } from "mathlive";
import type { CloneIndex } from "./pagination/cloneIndex";

import { computeSelectionRects } from "./pagination/selectionHighlight";
import { SelectionBar } from "./SelectionBar";
import { resolvePageSizeMm, type PageLayoutSettings } from "../../core/pageLayout";
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
import { applyToSelectedCells, clearSelectedCellContents, applyBorderPreset, getSelectionShape, setGridLineBorder, readGridBorderState, type GridLineInfo, type GridLine } from "./editorTableOps";
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
  /** État réel des lignes de grille de la sélection (voir `readGridBorderState`). */
  getGridBorderState: () => Map<string, GridLineInfo> | null;
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
  /** Marges ABSOLUES (mm, distance au bord de la page) de la zone au curseur ;
   *  `null` = marge du document. */
  setCoverZoneMargins: (margins: { top: number | null; left: number | null; right: number | null; bottom: number | null }) => void;
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
  /** Appelé UNE fois à la création de l'éditeur avec le Markdown tel que l'éditeur le sérialise (normalisé) : la
   * référence de l'indicateur « modifié » — sans ça, un fichier que l'éditeur écrit autrement qu'il ne l'a lu
   * (espaces, tableaux, commentaires) restait « modifié » même après annulation complète (0.8). */
  onBaseline?: (markdown: string) => void;
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
  ({ initialContent, onChange, onBaseline, onSaveRequest, onStats, layout, documentTitle, onLayoutChange, zoom = 1, showRulers = true, onZoomChange, readOnly = false }, ref) => {
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
    const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState | null>(null);
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
    const onBaselineRef = useRef(onBaseline);
    onBaselineRef.current = onBaseline;
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
    // Regroupement des refs pour les hooks extraits (voir hooks/editorRefs.ts).
    const refs: EditorRefs = {
      wrapRef, canvasRef, caretRef, selectionLayerRef, liveHostRef, pageCountRef, currentPageRef, zoomRef, layoutRef,
      documentTitleRef, onStatsRef, onLayoutChangeRef, repaintRef, repaintCaretRef, selBarSyncRef, codeLangSyncRef,
      scrollSelectionIntoViewRef, startHeaderFooterEditRef, insertHeaderFooterVariableRef, startMathEditRef,
      headerMiniEditorRef, headerFooterCommitRef, headerFooterModeRef, mathEditRef, pendingMathLatexRef, cloneIndexRef,
    };

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
      extensions: buildEditorExtensions({ onSpellChanged: () => repaintRef.current() }),
      content: initialContent,
      onCreate: ({ editor }) => {
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        const normalized = editor.storage.markdown.getMarkdown() as string;
        // Le store répercute cette référence en prop `initialContent` : la poser aussi dans `loadedContentRef`, sinon l'effet de
        // synchronisation rappellerait `setContent()` (et remettrait le curseur en fin de document).
        loadedContentRef.current = normalized;
        onBaselineRef.current?.(normalized);
      },
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
      setLink: async () => {
        if (!editor) return;
        const previous = editor.getAttributes("link").href as string | undefined;
        const url = await askLinkUrl(previous);
        if (url === null) return;
        if (url.trim() === "") {
          editor.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange("link").unsetLink().run();
          return;
        }
        editor.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange("link").setLink({ href: url.trim() }).run();
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
        setGridLineBorder(ed, lines, css);
      },
      getGridBorderState: () => {
        const ed = cmd();
        return ed ? readGridBorderState(ed) : null;
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
      setCoverZoneMargins: ({ top, left, right, bottom }) => {
        if (!editor) return;
        const zone = findCoverZoneAround(editor.state.doc, editor.state.selection.from);
        if (!zone) return;
        const startNode = editor.state.doc.nodeAt(zone.start);
        const tr = editor.state.tr.setNodeMarkup(zone.start, undefined, {
          ...startNode?.attrs,
          marginTopMm: top,
          marginLeftMm: left,
          marginRightMm: right,
          marginBottomMm: bottom,
        });
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
      insertBookmark: async () => {
        if (!editor) return;
        const name = await askBookmarkName();
        if (!name) return;
        const id = slugifyBookmark(name);
        if (!id) return;
        editor.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "bookmark", attrs: { id } }).run();
      },
      insertCrossReference: async () => {
        if (!editor) return;
        // Signets existants du document, proposés dans la fenêtre (saisie libre possible).
        const existing: string[] = [];
        editor.state.doc.descendants((node) => {
          if (node.type.name === "bookmark" && typeof node.attrs.id === "string") existing.push(node.attrs.id);
        });
        const answer = await askCrossReference(existing);
        if (!answer) return;
        const name = answer.target;
        const id = slugifyBookmark(name);
        if (!id) return;
        const label = answer.label || name;
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

    useCanvasRepaint({ editor, geometry, layout, zoom, cmd, refs });

    useCodeLangChip(editor, readOnly, canvasRef, codeLangSyncRef);

    useSelectionBarSync(editor, readOnly, canvasRef, zoomRef, headerMiniEditorRef, selBarSyncRef, setSelBar);

    useHeaderFooterEdit({ editor, cmd, refs });

    useMathEdit({ editor, refs });

    useCanvasMouse({ editor, readOnly, setTableContextMenu, refs });

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
      ...(layout.justify ? { "--xmd-text-align": "justify" } : {}),
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
      // Style du sommaire (TocStyle.ts + règles `ul[data-toc]`).
      "--xmd-toc-list-style": layout.toc.bullets ? "disc" : "none",
      "--xmd-toc-indent": `${layout.toc.indentMm}mm`,
      "--xmd-toc-top-padding": layout.toc.bullets ? "40px" : "0px",
      "--xmd-toc-decoration": layout.toc.underline ? "underline" : "none",
      "--xmd-toc-first-weight": layout.toc.boldFirstLevel ? "bold" : "normal",
      // Place réservée à droite des entrées pour les numéros de page : posée
      // aussi sur l'éditeur invisible (même retour à la ligne que la page peinte).
      "--xmd-toc-pageno-pad": layout.toc.pageNumbers ? "12mm" : "0mm",
      ...(layout.toc.color ? { "--xmd-toc-color": layout.toc.color } : {}),
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
            // Mise en forme « Word » (soulignement, majuscules, retrait, bandeau…).
            [`--xmd-h${level}-decoration`, style.underline ? "underline" : "none"],
            [`--xmd-h${level}-transform`, style.uppercase ? "uppercase" : "none"],
            [
              `--xmd-h${level}-indent`,
              style.background && style.fullWidth ? "calc(0mm - var(--xmd-margin-left, 20mm))" : `${style.indentMm ?? 0}mm`,
            ],
            [`--xmd-h${level}-mr`, style.background && style.fullWidth ? "calc(0mm - var(--xmd-margin-right, 20mm))" : "0mm"],
            [`--xmd-h${level}-letter-spacing`, `${style.letterSpacingPt ?? 0}pt`],
            [`--xmd-h${level}-align`, style.centered ? "center" : "left"],
            [`--xmd-h${level}-bg`, style.background || "transparent"],
            [
              `--xmd-h${level}-padding`,
              !style.background
                ? "0"
                : style.fullWidth
                  ? "6mm calc(var(--xmd-margin-right, 20mm) + 4mm) 6mm calc(var(--xmd-margin-left, 20mm) + 4mm)"
                  : "6mm 4mm",
            ],
            [`--xmd-h${level}-before`, `${style.spacingBeforePt ?? layout.spacingBeforePt ?? 0}pt`],
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
            spell={tableContextMenu.spell}
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
  spell,
  editable,
  hasSelection,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  /** Mot mal orthographié sous le clic : suggestions, « Ignorer », « Ajouter au dictionnaire ». */
  spell?: { from: number; to: number; word: string; suggestions: string[] | null };
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

  // Fermeture lue par RÉFÉRENCE : `onClose` est une fonction inline, nouvelle à chaque rendu. L'avoir
  // en dépendance de l'effet retirait puis reposait les écouteurs à chaque rendu — un clic dans le
  // texte (qui change la sélection, donc redessine l'éditeur de façon synchrone) arrivait pendant la
  // fenêtre où l'écouteur n'existait pas et le menu restait ouvert (bug du 2026-10-26).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    // `setTimeout` : le `contextmenu` natif qui a ouvert ce menu déclenche
    // aussi, juste après, un `mousedown`/`click` fantôme sur certains
    // navigateurs — sans ce délai, le menu se refermerait instantanément
    // lui-même dès son ouverture (même piège que les menus du ruban, voir
    // `Toolbar.tsx`, mais ici sur l'évènement d'OUVERTURE plutôt que sur un
    // clic d'option).
    const t = setTimeout(() => {
      // Phase de CAPTURE : le menu se ferme avant que la page ne traite le clic.
      document.addEventListener("mousedown", onMouseDown, true);
      document.addEventListener("keydown", onKeyDown);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

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
      {/* Correction orthographique (inspirée du menu de suggestions de CasualOffice/docs). */}
      {spell && editable && (
        <>
          {spell.suggestions === null && <div className="xmd-table-ctx-note">Recherche de suggestions…</div>}
          {spell.suggestions?.length === 0 && <div className="xmd-table-ctx-note">Aucune suggestion</div>}
          {spell.suggestions?.map((sug) => (
            <button
              key={sug}
              type="button"
              className="xmd-table-ctx-item xmd-table-ctx-suggestion"
              onMouseDown={keepEditorFocus}
              onClick={() =>
                // insertText conserve les marques (gras, couleur…) du mot remplacé.
                onAction((ed) => ed.view.dispatch(ed.state.tr.insertText(sug, spell.from, spell.to)))
              }
            >
              <span>{sug}</span>
            </button>
          ))}
          {item("Ignorer", (ed) => { ignoreWord(spell.word); refreshSpellcheck(ed.view); })}
          {item("Ajouter au dictionnaire", (ed) => { addUserWord(spell.word); refreshSpellcheck(ed.view); })}
          <div className="xmd-table-ctx-sep" />
        </>
      )}
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
