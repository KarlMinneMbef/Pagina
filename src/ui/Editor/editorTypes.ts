/**
 * Types publics de l'éditeur : options de recherche, handle impératif (MarkdownEditorHandle — toutes les actions du ruban) et statistiques (EditorStats).
 *
 * Extrait de MarkdownEditor.tsx (dette technique 0.4, 2026-10-26).
 */
import { type CoverZoneInfo } from "./extensions/CoverZone";
import { type GridLineInfo, type GridLine } from "./editorTableOps";

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
