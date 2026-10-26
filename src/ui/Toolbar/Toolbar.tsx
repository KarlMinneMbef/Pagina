/**
 * Ruban principal, façon Word 2024 : deux onglets (Accueil / Insertion), des
 * groupes de commandes légendés, et un panneau contextuel (« Outils de
 * tableau ») qui apparaît à droite du ruban quand le curseur est dans un
 * élément riche. Reste volontairement mince : n'appelle que des commandes
 * exposées par l'éditeur actif (voir `MarkdownEditorHandle`) ou des actions
 * globales. Ne connaît pas le filesystem.
 *
 * Typologie des boutons (comme Word) :
 * - Type A (`.tb-big-btn`) : grande icône ~28px + libellé dessous
 *   (Coller, Saut de page, Tableau, Lien, En-tête, Sommaire, Mermaid,
 *   Explorateur…).
 * - Type B (`.tb-stack-btn`) : petite icône ~15px + libellé à droite,
 *   empilées verticalement dans le groupe (Couper, Copier, Note de bas de
 *   page, Séparateur, Bloc de code, Pied de page, Variable, Mettre à jour,
 *   Formules, Emoji…).
 * - Type C (`.tb-btn-icon`) : petite icône seule avec TOOLTIP OBLIGATOIRE
 *   (Gras, Italique, alignements, listes…).
 * Toutes les icônes sont des SVG vectoriels (voir `icons.tsx`) — les
 * exceptions lettrées (G/I/S/x²/x₂/Aa/A) restent en texte stylé, comme dans
 * Word.
 *
 * Les OUTILS DE TABLEAU contextuels ne sont PAS dans le ruban : ils vivent
 * dans le panneau latéral `TablePropertiesPanel` (à droite du document,
 * comme l'explorateur à gauche) qui s'ouvre automatiquement quand le
 * curseur entre dans un tableau.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ColorPicker } from "../ColorPicker/ColorPicker";
import type { GridLine, GridLineInfo } from "../Editor/editorTableOps";
import { FONT_SIZE_STEPS } from "../Editor/editorUtils";
import { TableSizePicker } from "./TableSizePicker";
import { useColorMemory } from "../colorMemory";
import {
  IconAlignCenter,
  IconAlignJustify,
  IconIndentDecrease,
  IconIndentIncrease,
  IconLineSpacing,
  IconDialogLauncher,
  IconDocumentProperties,
  IconAlignLeft,
  IconAlignRight,
  IconBlockquote,
  IconBookmark,
  IconBulletList,
  IconClearFormat,
  IconCodeBlock,
  IconCodeInline,
  IconCopy,
  IconCrossReference,
  IconCut,
  IconEmoji,
  IconSpecialChar,
  IconExplorer,
  IconFooter,
  IconFootnote,
  IconHeader,
  IconHorizontalRule,
  IconLink,
  IconMathBlock,
  IconMathInline,
  IconMermaid,
  IconOrderedList,
  IconPageBreak,
  IconSectionBreak,
  IconCoverPage,
  IconPageSetup,
  IconComment,
  IconPaste,
  IconTaskList,
  IconTocMarker,
  IconImage,
} from "./icons";
import "./Toolbar.css";
import { keepEditorFocus } from "../focusGuard";
import { useClickOutside } from "../useClickOutside";

/** Caractères spéciaux (bouton « Caractères spéciaux » de l'onglet Insertion) :
 * insérés comme caractère Unicode réel, comme les emoji. Évite volontairement
 * les caractères à signification Markdown/HTML (antislash, astérisque,
 * tiret bas, dièse, esperluette, chevrons, accent grave) : l'insertion passe
 * par le parseur Markdown. Sélection orientée usage MBEF (génie
 * climatique/fluides : °C, m³/h, Ω, Δ, ±, ⌀…). */
const SPECIAL_CHAR_CATEGORIES: { id: string; label: string; emojis: string[] }[] = [
  {
    id: "technique",
    label: "Unités et technique",
    emojis: ["°", "℃", "℉", "²", "³", "µ", "Ω", "±", "×", "÷", "‰", "‱", "⌀", "∅", "№", "㎡", "㎥", "㎜", "㎝", "㎞", "㎏", "㎖"],
  },
  {
    id: "maths",
    label: "Mathématiques",
    emojis: ["≤", "≥", "≠", "≈", "≡", "∞", "√", "∛", "∑", "∏", "∫", "∂", "∆", "∇", "∝", "∈", "∉", "∪", "∩", "⊂", "⊃", "∀", "∃", "∴", "∵", "¬", "∧", "∨", "⊕", "⊗", "∥", "⊥", "∠", "′", "″"],
  },
  {
    id: "grec",
    label: "Lettres grecques",
    emojis: ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ", "ι", "κ", "λ", "μ", "ν", "ξ", "π", "ρ", "σ", "τ", "υ", "φ", "χ", "ψ", "ω", "Γ", "Δ", "Θ", "Λ", "Ξ", "Π", "Σ", "Φ", "Ψ", "Ω"],
  },
  {
    id: "fleches",
    label: "Flèches",
    emojis: ["←", "→", "↑", "↓", "↔", "↕", "⇐", "⇒", "⇑", "⇓", "⇔", "↩", "↪", "↗", "↘", "↙", "↖", "⟵", "⟶", "⟷"],
  },
  {
    id: "ponctuation",
    label: "Ponctuation et typographie",
    emojis: ["«", "»", "“", "”", "‘", "’", "„", "‹", "›", "…", "–", "—", "•", "·", "§", "¶", "†", "‡", "©", "®", "™", "¡", "¿", "‣", "※"],
  },
  {
    id: "monnaies",
    label: "Monnaies, fractions, exposants",
    emojis: ["€", "£", "¥", "¢", "$", "₣", "₹", "₽", "₿", "½", "⅓", "⅔", "¼", "¾", "⅕", "⅛", "⅜", "⅝", "⅞", "¹", "⁰", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹", "₀", "₁", "₂", "₃", "₄"],
  },
  {
    id: "lettres",
    label: "Lettres accentuées et latines",
    emojis: ["À", "Â", "Ä", "Ç", "É", "È", "Ê", "Ë", "Î", "Ï", "Ô", "Ö", "Ù", "Û", "Ü", "Ÿ", "Œ", "Æ", "à", "â", "ä", "ç", "é", "è", "ê", "ë", "î", "ï", "ô", "ö", "ù", "û", "ü", "ÿ", "œ", "æ", "ß", "Ñ", "ñ", "ª", "º"],
  },
  {
    id: "formes",
    label: "Formes et cases",
    emojis: ["■", "□", "▪", "▫", "▲", "△", "▼", "▽", "◆", "◇", "●", "○", "◉", "★", "☆", "✓", "✔", "✗", "✘", "☐", "☑", "☒", "♠", "♣", "♥", "♦", "⚠", "☎", "✉", "☀", "☁", "❄"],
  },
];

/** Emoji courants — insérés comme caractère Unicode réel (pas un code
 * `:smile:` à convertir), donc lisibles tels quels dans n'importe quel
 * autre outil Markdown, sans dépendance à un rendu spécial. Le DÉCLENCHEUR
 * du menu porte l'icône SVG fournie (visage), pas un emoji. */
/** Fenêtre Emoji (refaite 2026-10-17 sur demande : catégories à la
 * façon des sélecteurs modernes — l'ancienne liste plate de 30 émojis
 * est répartie dans les catégories, complétée). */
const EMOJI_CATEGORIES: { id: string; label: string; emojis: string[] }[] = [
  {
    id: "smileys",
    label: "Smileys & émotions",
    emojis: ["😀", "😃", "😄", "😁", "😉", "😂", "🙂", "😊", "😍", "🤩", "😘", "😜", "🤔", "🤨", "😐", "😮", "😴", "😢", "😭", "😤", "😡", "🥳", "🤒"],
  },
  {
    id: "animaux",
    label: "Animaux & nature",
    emojis: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🌿", "🍀", "🌱", "🌳", "🌸"],
  },
  {
    id: "nourriture",
    label: "Nourriture & boissons",
    emojis: ["🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🥕", "🌽", "🍞", "🧀", "🍗", "🍕", "🍔", "🍟", "☕", "🍵", "🍺", "💧"],
  },
  {
    id: "voyages",
    label: "Voyages & lieux",
    emojis: ["🏠", "🏢", "🏭", "🏥", "🏦", "🏨", "🏫", "🏗️", "⛰️", "🌋", "🏝️", "🏞️", "🚗", "🚌", "✈️", "🚀", "🚲", "🚂", "🗺️"],
  },
  {
    id: "activites",
    label: "Activités",
    emojis: ["⚽", "🏀", "🏈", "🎾", "🏐", "🏓", "🏸", "🥊", "🎯", "🎲", "🎮", "🎸", "🎤", "🎧", "🎨", "🎬", "🏆", "🥇", "🎪"],
  },
  {
    id: "objets",
    label: "Objets",
    emojis: ["⌚", "📱", "💻", "🖥️", "🖨️", "📞", "📧", "📷", "🔋", "💡", "🔦", "📚", "📝", "✏️", "📅", "🕒", "📌", "📎", "🔗", "🔒", "🔑", "🛠️"],
  },
  {
    id: "symboles",
    label: "Symboles",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "✅", "❌", "⚠️", "❗", "❓", "⭐", "🔥", "👍", "👎", "👏", "🙏", "💪", "➡️"],
  },
  {
    id: "drapeaux",
    label: "Drapeaux",
    emojis: ["🏁", "🚩", "🎌", "🏴", "🏳️", "🇫🇷", "🇪🇺", "🇩🇪", "🇬🇧", "🇧🇪", "🇪🇸", "🇮🇹", "🇺🇸", "🇨🇭"],
  },
];

const HEADING_PREVIEW_SIZE: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 22,
  2: 19,
  3: 17,
  4: 15,
  5: 13,
  6: 12,
};

/** Toutes les commandes du ruban, implémentées par MarkdownEditorHandle —
 *  contrat unique entre Toolbar et l'éditeur. */
export interface ToolbarActions {
  undo: () => void;
  redo: () => void;
  // --- Presse-papiers ---
  copySelection: () => void;
  cutSelection: () => void;
  pasteClipboard: () => void;
  // --- Police ---
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  setFontFamily: (family: string) => void;
  unsetFontFamily: () => void;
  setFontSize: (size: string) => void;
  unsetFontSize: () => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  changeCase: () => void;
  setColor: (color: string) => void;
  unsetColor: () => void;
  /** Surligne la sélection avec la couleur donnée (roadmap 2.3 —
   * multicolor ; re-sélectionner la même couleur l'enlève). */
  setHighlightColor: (color: string) => void;
  clearFormatting: () => void;
  // --- Paragraphe ---
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleTaskList: () => void;
  toggleBlockquote: () => void;
  setTextAlign: (align: "left" | "center" | "right" | "justify") => void;
  /** Tabulation ± (roadmap 2.1) : retrait du paragraphe courant. */
  increaseIndent: () => void;
  decreaseIndent: () => void;
  // --- Interligne / espacement (roadmap 2.2, réglages du document) ---
  /** Interligne du document (1,0 / 1,15 / 1,5 / 2,0 / 3,0). */
  setLineSpacing: (value: number) => void;
  /** Espace AVANT chaque paragraphe, en points. */
  setParagraphSpacingBefore: (pt: number) => void;
  /** Espace APRÈS chaque paragraphe, en points. */
  setParagraphSpacingAfter: (pt: number) => void;
  // --- Styles ---
  toggleHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
  setParagraph: () => void;
  // --- Insertion ---
  setLink: () => void;
  insertTable: (rows: number, cols: number) => void;
  insertHorizontalRule: () => void;
  toggleCodeBlock: () => void;
  insertPageBreak: () => void;
  insertFootnote: () => void;
  editHeader: () => void;
  editFooter: () => void;
  insertHeaderFooterVariable: (token: string) => void;
  insertTocMarker: () => void;
  generateToc: () => void;
  // --- Sommaire (panneau contextuel) ---
  updateTocAtCursor: () => void;
  deleteTocAtCursor: () => void;
  insertMermaidDiagram: () => void;
  insertInlineMath: () => void;
  insertBlockMath: () => void;
  insertEmoji: (emoji: string) => void;
  // --- Liens (Signet / Renvoi) ---
  insertBookmark: () => void;
  /** Insère une ou plusieurs images choisies sur le disque (le document passe au format .xmd si besoin). */
  insertImage: () => void;
  insertCrossReference: () => void;
  // --- Code en ligne (groupe Police) ---
  toggleCode: () => void;
  toggleSubscript: () => void;
  toggleSuperscript: () => void;
  // --- Tableau (panneau contextuel) ---
  addRowBefore: () => void;
  addRowAfter: () => void;
  deleteRow: () => void;
  addColumnBefore: () => void;
  addColumnAfter: () => void;
  deleteColumn: () => void;
  deleteTable: () => void;
  mergeCells: () => void;
  splitCell: () => void;
  toggleHeaderRow: () => void;
  /** Vide le contenu de la cellule courante (ou des cellules
   * sélectionnées) — bouton « Vider » du panneau Tableau. */
  clearCellContents: () => void;
  setCellBackgroundColor: (color: string | null) => void;
  setCellBorder: (sides: ("top" | "right" | "bottom" | "left")[], css: string | null) => void;
  setCellBorderPreset: (preset: "all" | "outside" | "inside" | "none", css: string | null) => void;
  setGridLineBorder: (lines: GridLine[], css: string | null) => void;
  /** État RÉEL des lignes de grille de la sélection (schéma du panneau Tableau), `null` hors tableau. */
  getGridBorderState: () => Map<string, GridLineInfo> | null;
  setCellVerticalAlign: (align: "top" | "middle" | "bottom") => void;
}

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Calibri", value: "Calibri, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

/** Échelle partagée avec l'éditeur (voir `FONT_SIZE_STEPS` dans
 * MarkdownEditor.tsx — les boutons Agrandir/Réduire y font référence). */
const FONT_SIZES = FONT_SIZE_STEPS.map((pt) => `${pt}pt`);

/** Interlignes proposés — l'échelle EXACTE du menu Word : 1,0 / 1,15
 * (défaut Word « Multiple 1,15 ») / 1,5 / 2,0 / 2,5 / 3,0. Une valeur
 * personnalisée du document hors échelle apparaît comme option
 * supplémentaire plutôt que de « sauter » au plus proche. */
const LINE_SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];

/** Libellé façon Word : au moins une décimale (1 → « 1,0 », 1,5 → « 1,5 »). */
const fmtLineSpacing = (v: number) =>
  v % 1 === 0 ? `${v.toFixed(1).replace(".", ",")}` : String(v).replace(".", ",");

type RibbonTab = "accueil" | "insertion";

const EMPTY_ACTIVE_MARKS = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  subscript: false,
  superscript: false,
  highlight: false,
};

/** Ruban à la Word : onglets Accueil / Format avancé, groupes à légende,
 *  coin droit Explorateur/Commenter (détail en tête de fichier). */
export function Toolbar({
  actions,
  onToggleSidebar,
  sidebarOpen,
  onOpenPageSetup,
  onOpenHeadingStyles,
  onOpenDocumentProperties,
  onInsertSectionBreak,
  onOpenCoverGallery,
  onOpenParagraphDialog,
  onToggleHeadingPanel,
  headingPanelOpen = false,
  activeBlockStyle = "paragraph",
  activeMarks = EMPTY_ACTIVE_MARKS,
  activeAlign = null,
  activeList = null,
  activeFontFamily = null,
  activeColor = null,
  activeFontSizePt = 12,
  lineSpacing = 1.15,
  spacingBeforePt = 0,
  leger = false,
}: {
  actions: ToolbarActions | null;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onOpenPageSetup: () => void;
  onOpenHeadingStyles: () => void;
  /** Ouvre la fenêtre « Propriétés du document » (roadmap 1.3). */
  onOpenDocumentProperties: () => void;
  /** Ouvre la fenêtre « Saut de section » (titre + reprise de
   *  numérotation — sections, 2026-10-22). */
  onInsertSectionBreak: () => void;
  /** Ouvre la galerie de pages de garde (modèles + variables). */
  onOpenCoverGallery: () => void;
  /** Ouvre la fenêtre « Paragraphe — Retrait et espacement » (comme le
   * lanceur du groupe Paragraphe de Word + « Options d'interligne… »). */
  onOpenParagraphDialog: () => void;
  /** Ouvre/ferme le panneau latéral « Styles de titres » (chevron de la
   * galerie de styles). Absent → le chevron garde l'ancien menu déroulant. */
  onToggleHeadingPanel?: () => void;
  headingPanelOpen?: boolean;
  /** Version LÉGÈRE (intégration dans une autre application, ex. MBEF Platform) : uniquement l'onglet
   * « Accueil », sans bouton Explorateur, sans lanceurs de dialogues (mise en page,
   * styles de titres), sans panneau contextuel. Sans effet (false) dans Pagina elle-même. */
  leger?: boolean;
  /** Style de bloc sous le curseur — surligne le bon bouton de la galerie
   * "Styles" (voir `EditorStats.activeBlockStyle` dans MarkdownEditor.tsx). */
  activeBlockStyle?: "paragraph" | 1 | 2 | 3 | 4 | 5 | 6;
  /** Marques actives sous le curseur — surligne Gras/Italique/Souligné... comme Word. */
  activeMarks?: {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    code: boolean;
    subscript: boolean;
    superscript: boolean;
    highlight: boolean;
  };
  /** Alignement actif — surligne le bon bouton d'alignement. */
  activeAlign?: "left" | "center" | "right" | "justify" | null;
  /** Type de liste/bloc actif — surligne Puces/Numérotée/Tâches/Citation. */
  activeList?: "bullet" | "ordered" | "task" | "blockquote" | null;
  /** Police de la sélection — affichée dans le sélecteur "Police". */
  activeFontFamily?: string | null;
  /** Couleur de texte de la sélection — colore la barre sous le « A ». */
  activeColor?: string | null;
  /** Taille de police de la sélection (pt) — affichée dans le sélecteur "Taille". */
  activeFontSizePt?: number;
  /** Interligne du document (layout.lineHeight) — affiché dans le sélecteur
   * "Interligne" du groupe Paragraphe (roadmap 2.2). */
  lineSpacing?: number;
  /** Espace avant chaque paragraphe, en points (layout.spacingBeforePt) —
   * sert au menu Interligne (« Ajouter de l'espace avant »). */
  spacingBeforePt?: number;
}) {
  const disabled = actions === null;
  const [tab, setTab] = useState<RibbonTab>("accueil");

  // Dernières couleurs choisies (roadmap 2.3, comme Word : le bouton APPLIQUE, le chevron
  // choisit) — mémoire PARTAGÉE avec la mini-barre de sélection (ui/colorMemory.ts).
  const lastTextColor = useColorMemory((m) => m.lastTextColor);
  const lastHighlightColor = useColorMemory((m) => m.lastHighlightColor);
  const rememberTextColor = useColorMemory((m) => m.rememberTextColor);
  const rememberHighlightColor = useColorMemory((m) => m.rememberHighlightColor);
  // Menu Interligne façon Word (2026-10-21) : préréglages + Options
  // d'interligne… + ajout/suppression d'espace — rempli à la demande,
  // refermé au clic extérieur (même comportement que le ColorPicker).
  const [lineSpacingMenuOpen, setLineSpacingMenuOpen] = useState(false);
  const lineSpacingMenuRef = useRef<HTMLDivElement>(null);
  useClickOutside(lineSpacingMenuRef, lineSpacingMenuOpen, () => setLineSpacingMenuOpen(false));

  const showAccueil = leger || tab === "accueil";

  return (
    <div className="tb-ribbon-stack">

      {/* Barre d'onglets du ruban (absente en version légère : un seul onglet). */}
      {!leger && <div className="tb-tabbar">
        <button
          className={`tb-tab${showAccueil ? " tb-tab-active" : ""}`}
          onClick={() => setTab("accueil")}
        >
          Accueil
        </button>
        <button
          className={`tb-tab${tab === "insertion" ? " tb-tab-active" : ""}`}
          onClick={() => setTab("insertion")}
        >
          Insertion
        </button>

        {/* Coin droit du ruban (demande 2026-10-17) : Explorateur au
         * même emplacement que « Partager » dans Word, Commenter à
         * côté — inactif tant que la fonctionnalité n'existe pas. */}
        <div className="tb-tabbar-right">
          <button
            type="button"
            className={`tb-corner-btn${sidebarOpen ? " tb-corner-btn-active" : ""}`}
            onClick={onToggleSidebar}
            title={sidebarOpen ? "Masquer l'explorateur" : "Afficher l'explorateur"}
          >
            <IconExplorer size={16} />
            Explorateur
          </button>
          <button type="button" className="tb-corner-btn" disabled title="Commenter (bientôt disponible)">
            <IconComment size={16} />
            Commenter
          </button>
        </div>
      </div>}

      {showAccueil && (
        <div className="tb-ribbon">
          <RibbonGroup label="Presse-papiers" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            <BigButton
              disabled={disabled}
              onClick={() => actions?.pasteClipboard()}
              title="Coller le contenu du presse-papiers (le Markdown collé est converti)"
              icon={<IconPaste size={28} />}
              label="Coller"
            />
            <div className="tb-stack">
              <StackButton
                disabled={disabled}
                onClick={() => actions?.cutSelection()}
                title="Couper la sélection (copie en Markdown, puis supprime)"
                icon={<IconCut size={15} />}
                label="Couper"
              />
              <StackButton
                disabled={disabled}
                onClick={() => actions?.copySelection()}
                title="Copier la sélection en Markdown"
                icon={<IconCopy size={15} />}
                label="Copier"
              />
            </div>
          </RibbonGroup>

          <RibbonGroup label="Police">
            <div className="tb-group-row">
              <select
                className="tb-select"
                disabled={disabled}
                /* Contrôlé par la sélection courante (voir `EditorStats.activeFontFamily`) —
                 * reste sur le placeholder si aucune police personnalisée n'est posée, ou si la
                 * police posée ne fait pas partie de cette liste fixe. */
                value={FONT_FAMILIES.some((f) => f.value === activeFontFamily) ? activeFontFamily! : ""}
                title="Police"
                onChange={(e) => {
                  if (e.target.value) actions?.setFontFamily(e.target.value);
                  else actions?.unsetFontFamily();
                }}
              >
                <option value="">Police</option>
                {FONT_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                className="tb-select tb-select-narrow"
                disabled={disabled}
                /* Contrôlé par la taille courante (voir `EditorStats.activeFontSizePt`) — reste
                 * sur le placeholder si cette taille ne fait pas partie de l'échelle fixe. */
                value={FONT_SIZES.includes(`${activeFontSizePt}pt`) ? `${activeFontSizePt}pt` : ""}
                title="Taille"
                onChange={(e) => {
                  if (e.target.value) actions?.setFontSize(e.target.value);
                  else actions?.unsetFontSize();
                }}
              >
                <option value="">Taille</option>
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              {/* Boutons lettrés "A + chevron", comme Word (voir exceptions
               * admises du cahier des charges icônes). */}
              <button
                className="tb-btn-icon"
                disabled={disabled}
                onClick={() => actions?.increaseFontSize()}
                title="Agrandir la police (pas suivant dans l'échelle des tailles)"
              >
                <span className="tb-letter">A<span className="tb-caret-up">˄</span></span>
              </button>
              <button
                className="tb-btn-icon"
                disabled={disabled}
                onClick={() => actions?.decreaseFontSize()}
                title="Réduire la police (pas précédent dans l'échelle des tailles)"
              >
                <span className="tb-letter">A<span className="tb-caret-down">˅</span></span>
              </button>
              <button
                className="tb-btn-icon"
                disabled={disabled}
                onClick={() => actions?.changeCase()}
                title="Modifier la casse (MAJUSCULES → Casse de titre → minuscules)"
              >
                <span className="tb-letter">Aa</span>
              </button>
              <button
                className="tb-btn-icon"
                disabled={disabled}
                onClick={() => actions?.clearFormatting()}
                title="Effacer toute la mise en forme"
              >
                <IconClearFormat size={16} />
              </button>
            </div>
            <div className="tb-group-row">
              <button className={activeBtnClass(activeMarks.bold)} disabled={disabled} onClick={() => actions?.toggleBold()} title="Gras (Ctrl+B)">
                <span className="tb-letter tb-letter-bold">G</span>
              </button>
              <button className={activeBtnClass(activeMarks.italic)} disabled={disabled} onClick={() => actions?.toggleItalic()} title="Italique (Ctrl+I)">
                <span className="tb-letter tb-letter-italic">I</span>
              </button>
              <button className={activeBtnClass(activeMarks.underline)} disabled={disabled} onClick={() => actions?.toggleUnderline()} title="Souligné (Ctrl+U)">
                <span className="tb-letter tb-letter-underline">S</span>
              </button>
              <button className={activeBtnClass(activeMarks.strike)} disabled={disabled} onClick={() => actions?.toggleStrike()} title="Texte barré">
                <span className="tb-letter tb-letter-strike">S</span>
              </button>
              <button className={activeBtnClass(activeMarks.subscript)} disabled={disabled} onClick={() => actions?.toggleSubscript()} title="Indice">
                <span className="tb-letter">x<span className="tb-letter-sub">2</span></span>
              </button>
              <button className={activeBtnClass(activeMarks.superscript)} disabled={disabled} onClick={() => actions?.toggleSuperscript()} title="Exposant">
                <span className="tb-letter">x<span className="tb-letter-sup">2</span></span>
              </button>
              <button
                className={activeBtnClass(activeMarks.code)}
                disabled={disabled}
                onClick={() => actions?.toggleCode()}
                title="Code en ligne — distinct du bloc de code (dans une phrase, ex. `variable`)"
              >
                <IconCodeInline size={16} />
              </button>
              {/* Couleur du texte (roadmap 2.3, comme Word) : le « A »
               * APPLIQUE la dernière couleur choisie (mémorisée, persistée
               * en localStorage), le chevron ouvre le panneau. Tant
               * qu'aucune couleur n'a été choisie, tout le bouton ouvre le
               * panneau. */}
              <ColorPicker
                disabled={disabled}
                title="Couleur du texte"
                triggerClassName="tb-btn-icon"
                caretClassName="tb-btn-icon"
                trigger={
                  <span className="tb-letter tb-letter-highlight">
                    A<span className="tb-highlight-bar" style={{ background: activeColor ?? (lastTextColor ?? "#ffffff") }} />
                  </span>
                }
                onApplyLast={lastTextColor ? () => actions?.setColor(lastTextColor) : undefined}
                applyLastTitle={
                  lastTextColor ? `Appliquer la dernière couleur choisie (${lastTextColor})` : "Couleur du texte"
                }
                onAutomatic={() => actions?.unsetColor()}
                automaticSwatch="#343334"
                onChange={(color) => {
                  rememberTextColor(color);
                  actions?.setColor(color);
                }}
              />
              {/* Surlignage (roadmap 2.3, comme Word) : même mécanique —
               * le bouton applique la dernière couleur de surlignage
               * (jaune par défaut), le chevron ouvre le panneau. */}
              <ColorPicker
                disabled={disabled}
                title="Couleur de surlignage"
                triggerClassName="tb-btn-icon"
                caretClassName="tb-btn-icon"
                trigger={
                  <span className="tb-letter tb-letter-highlight">
                    S<span className="tb-highlight-bar" style={{ background: lastHighlightColor }} />
                  </span>
                }
                onApplyLast={() => actions?.setHighlightColor(lastHighlightColor)}
                applyLastTitle={`Surligner avec ${lastHighlightColor}`}
                onChange={(color) => {
                  rememberHighlightColor(color);
                  actions?.setHighlightColor(color);
                }}
              />
            </div>
          </RibbonGroup>

          <RibbonGroup
            label="Paragraphe"
            /* Comme Word : le lanceur du groupe Paragraphe ouvre la
             * fenêtre « Paragraphe » (Retrait et espacement), PAS la mise
             * en page — celle-ci reste au grand bouton Mise en page. */
            launcher={leger ? undefined : { onClick: onOpenParagraphDialog, title: "Paragraphe (alignement, retrait, espacement, interligne)" }}
          >
            {/* Disposition de Word (2026-10-25) : ligne 1 = listes puis retraits,
             * ligne 2 = alignements (gauche, centré, droite, justifié) puis interligne. */}
            <div className="tb-group-row">
              <button className={activeBtnClass(activeList === "bullet")} disabled={disabled} onClick={() => actions?.toggleBulletList()} title="Liste à puces">
                <IconBulletList size={16} />
              </button>
              <button className={activeBtnClass(activeList === "ordered")} disabled={disabled} onClick={() => actions?.toggleOrderedList()} title="Liste numérotée">
                <IconOrderedList size={16} />
              </button>
              <button className={activeBtnClass(activeList === "task")} disabled={disabled} onClick={() => actions?.toggleTaskList()} title="Liste de tâches (case à cocher)">
                <IconTaskList size={16} />
              </button>
              <button className={activeBtnClass(activeList === "blockquote")} disabled={disabled} onClick={() => actions?.toggleBlockquote()} title="Citation">
                <IconBlockquote size={16} />
              </button>
              <span className="tb-row-sep" />
              {/* Tabulation ± (roadmap 2.1) : retrait du paragraphe courant
               * d'un pas de 1,25 cm, comme les boutons Increase/Decrease
               * Indent de Word/Casual. Raccourcis : Ctrl+M / Ctrl+Shift+M. */}
              <button className={activeBtnClass(false)} disabled={disabled} onClick={() => actions?.decreaseIndent()} title="Diminuer le retrait (Tabulation −, Ctrl+Shift+M)">
                <IconIndentDecrease size={16} />
              </button>
              <button className={activeBtnClass(false)} disabled={disabled} onClick={() => actions?.increaseIndent()} title="Augmenter le retrait (Tabulation +, Ctrl+M)">
                <IconIndentIncrease size={16} />
              </button>
            </div>
            <div className="tb-group-row">
              <button className={activeBtnClass(activeAlign === "left")} disabled={disabled} onClick={() => actions?.setTextAlign("left")} title="Aligner à gauche">
                <IconAlignLeft size={16} />
              </button>
              <button className={activeBtnClass(activeAlign === "center")} disabled={disabled} onClick={() => actions?.setTextAlign("center")} title="Centrer">
                <IconAlignCenter size={16} />
              </button>
              <button className={activeBtnClass(activeAlign === "right")} disabled={disabled} onClick={() => actions?.setTextAlign("right")} title="Aligner à droite">
                <IconAlignRight size={16} />
              </button>
              <button className={activeBtnClass(activeAlign === "justify")} disabled={disabled} onClick={() => actions?.setTextAlign("justify")} title="Justifier">
                <IconAlignJustify size={16} />
              </button>
              <span className="tb-row-sep" />
              {/* Menu Interligne façon Word (2026-10-21) : préréglages,
               * « Options d'interligne… » (fenêtre Paragraphe), ajout/
               * suppression d'espace — comme le menu du même nom de Word. */}
              <div className="tb-linespacing" ref={lineSpacingMenuRef}>
                <button
                  type="button"
                  className="tb-linespacing-trigger"
                  disabled={disabled}
                  title={`Interligne et espacement du paragraphe (actuel : ${fmtLineSpacing(lineSpacing)})`}
                  onClick={() => setLineSpacingMenuOpen((o) => !o)}
                >
                  <IconLineSpacing size={16} />
                  <span className="tb-linespacing-caret">▾</span>
                </button>
                {lineSpacingMenuOpen && (
                  <div className="tb-linespacing-menu">
                    {(LINE_SPACINGS.includes(lineSpacing) ? LINE_SPACINGS : [...LINE_SPACINGS, lineSpacing])
                      .slice()
                      .sort((a, b) => a - b)
                      .map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={`tb-linespacing-item${v === lineSpacing ? " tb-linespacing-item-active" : ""}`}
                          onClick={() => {
                            actions?.setLineSpacing(v);
                            setLineSpacingMenuOpen(false);
                          }}
                        >
                          <span className="tb-linespacing-check">{v === lineSpacing ? "✓" : ""}</span>
                          {fmtLineSpacing(v)}
                        </button>
                      ))}
                    <div className="tb-linespacing-sep" />
                    <button
                      type="button"
                      className="tb-linespacing-item"
                      onClick={() => {
                        setLineSpacingMenuOpen(false);
                        onOpenParagraphDialog();
                      }}
                    >
                      <span className="tb-linespacing-check" />
                      Options d'interligne…
                    </button>
                    <button
                      type="button"
                      className="tb-linespacing-item"
                      onClick={() => {
                        actions?.setParagraphSpacingBefore(spacingBeforePt + 6);
                        setLineSpacingMenuOpen(false);
                      }}
                    >
                      <span className="tb-linespacing-check" />
                      Ajouter de l'espace avant le paragraphe
                    </button>
                    <button
                      type="button"
                      className="tb-linespacing-item"
                      onClick={() => {
                        actions?.setParagraphSpacingAfter(0);
                        setLineSpacingMenuOpen(false);
                      }}
                    >
                      <span className="tb-linespacing-check" />
                      Supprimer l'espace après le paragraphe
                    </button>
                  </div>
                )}
              </div>
            </div>
          </RibbonGroup>

          <RibbonGroup
            label="Styles"
            launcher={leger ? undefined : { onClick: onOpenHeadingStyles, title: "Styles de titres (police, couleur, numérotation automatique par niveau)" }}
          >
            <StyleGallery
              disabled={disabled}
              active={activeBlockStyle}
              onPick={(level) => actions?.toggleHeading(level)}
              onPickParagraph={() => actions?.setParagraph()}
              onTogglePanel={onToggleHeadingPanel}
              panelOpen={headingPanelOpen}
            />
          </RibbonGroup>

          {/* Mise en page : grande icône séparée à la FIN du bandeau
           * Accueil (demande 2026-10-17 : reprend la place de
           * l'ancien bouton Explorateur, déplacé au coin droit du
           * ruban comme « Partager » dans Word). */}
          {!leger && (
            <>
              <div className="tb-ribbon-spacer" />
              <BigButton
                onClick={onOpenPageSetup}
                title="Mise en page (format, marges, en-tête/pied de page)"
                icon={<IconPageSetup size={28} />}
                label="Mise en page"
              />
              <BigButton
                onClick={onOpenDocumentProperties}
                title="Propriétés du document (titre, sujet, auteur, mots-clés, champs personnalisés)"
                icon={<IconDocumentProperties size={28} />}
                label="Propriétés"
              />
            </>
          )}
        </div>
      )}

      {!leger && tab === "insertion" && (
        <div className="tb-ribbon">
          <RibbonGroup label="Pages" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            <div className="tb-stack">
              <StackButton
                disabled={disabled}
                onClick={() => actions?.insertPageBreak()}
                title="Saut de page (Ctrl+Entrée) — commentaire HTML invisible, compatible partout"
                icon={<IconPageBreak size={15} />}
                label="Saut de page"
              />
              <StackButton
                disabled={disabled}
                onClick={onInsertSectionBreak}
                title="Saut de section — commence une nouvelle partie : numérotation des titres et sommaire dédiés"
                icon={<IconSectionBreak size={15} />}
                label="Saut de section"
              />
              <StackButton
                disabled={disabled}
                onClick={onOpenCoverGallery}
                title="Page de garde — modèles réutilisables avec variables de document ({{title}}, {{author}}…)"
                icon={<IconCoverPage size={15} />}
                label="Page de garde"
              />
            </div>
          </RibbonGroup>

          <RibbonGroup label="Tableau" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            <TableSizePicker disabled={disabled} onPick={(rows, cols) => actions?.insertTable(rows, cols)} />
          </RibbonGroup>

          <RibbonGroup label="Éléments" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            {/* Une seule pile, 3 lignes : Séparateur, Bloc de code, Note de bas de
             * page (déplacée ici le 2026-10-26 : ce n'est pas une commande de page). */}
            <div className="tb-stack">
              <StackButton
                disabled={disabled}
                onClick={() => actions?.insertHorizontalRule()}
                title="Séparateur horizontal"
                icon={<IconHorizontalRule size={15} />}
                label="Séparateur"
              />
              <StackButton
                disabled={disabled}
                onClick={() => actions?.toggleCodeBlock()}
                title="Bloc de code"
                icon={<IconCodeBlock size={15} />}
                label="Bloc de code"
              />
              <StackButton
                disabled={disabled}
                onClick={() => actions?.insertFootnote()}
                title="Insérer une note de fin de document (numérotée automatiquement, regroupée en fin de document)"
                icon={<IconFootnote size={15} />}
                label="Note de fin de document"
              />
            </div>
          </RibbonGroup>

          <RibbonGroup label="Symboles" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            <div className="tb-stack">
              <EmojiPicker disabled={disabled} onPick={(emoji) => actions?.insertEmoji(emoji)} />
              {/* Même action que les emoji : insère un caractère Unicode réel. */}
              <EmojiPicker
                disabled={disabled}
                onPick={(c) => actions?.insertEmoji(c)}
                label="Caractères spéciaux"
                title="Insérer un caractère spécial (°, ², Ω, ≤, →, «…)"
                categories={SPECIAL_CHAR_CATEGORIES}
                icon={<IconSpecialChar size={15} />}
              />
            </div>
          </RibbonGroup>

          <RibbonGroup label="Liens" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            <div className="tb-stack">
              <StackButton
                disabled={disabled}
                onClick={() => actions?.setLink()}
                title="Lien hypertexte sur la sélection"
                icon={<IconLink size={15} />}
                label="Lien"
              />
              <StackButton
                disabled={disabled}
                onClick={() => actions?.insertBookmark()}
                title="Signet : pose une ancre invisible à cette position, cible des renvois"
                icon={<IconBookmark size={15} />}
                label="Signet"
              />
              <StackButton
                disabled={disabled}
                onClick={() => actions?.insertCrossReference()}
                title="Renvoi : insère un lien vers un signet du document"
                icon={<IconCrossReference size={15} />}
                label="Renvoi"
              />
            </div>
          </RibbonGroup>

          <RibbonGroup label="En-tête et pied" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            <BigButton
              disabled={disabled}
              onClick={() => actions?.editHeader()}
              title="Modifier l'en-tête (identique à cliquer directement sur l'en-tête d'une page)"
              icon={<IconHeader size={28} />}
              label="En-tête"
            />
            <BigButton
              disabled={disabled}
              onClick={() => actions?.editFooter()}
              title="Modifier le pied de page (identique à cliquer directement sur le pied de page d'une page)"
              icon={<IconFooter size={28} />}
              label="Pied de page"
            />
            {/* Les variables ({{page}}, {{date}}...) vivent désormais dans le
             * panneau latéral « Variables » qui s'ouvre avec le champ
             * d'édition (voir HeaderFooterPanel dans App.tsx). */}
          </RibbonGroup>

          <RibbonGroup label="Illustrations" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            <BigButton
              disabled={disabled}
              onClick={() => actions?.insertImage()}
              title="Insérer une image (png, jpg, gif, webp, svg) — les images sont embarquées dans le fichier .xmd"
              icon={<IconImage size={28} />}
              label="Image"
            />
          </RibbonGroup>

          <RibbonGroup label="Sommaire" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            <BigButton
              disabled={disabled}
              onClick={() => actions?.insertTocMarker()}
              title="Insérer un marqueur de sommaire (cliquer dessus ensuite pour le remplir — voir aussi le panneau « Sommaire » une fois rempli)"
              icon={<IconTocMarker size={28} />}
              label="Sommaire"
            />
          </RibbonGroup>

          <RibbonGroup label="Diagrammes et formules" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            <BigButton
              disabled={disabled}
              onClick={() => actions?.insertMermaidDiagram()}
              title="Insérer un diagramme Mermaid (source éditable, aperçu rendu en direct)"
              icon={<IconMermaid size={28} />}
              label="Mermaid"
            />
            <div className="tb-stack">
              <StackButton
                disabled={disabled}
                onClick={() => actions?.insertInlineMath()}
                title="Formule en ligne (dans une phrase)"
                icon={<IconMathInline size={15} />}
                label="Formule en ligne"
              />
              <StackButton
                disabled={disabled}
                onClick={() => actions?.insertBlockMath()}
                title="Formule en bloc (seule sur sa ligne, centrée)"
                icon={<IconMathBlock size={15} />}
                label="Formule en bloc"
              />
            </div>
          </RibbonGroup>
        </div>
      )}

    </div>
  );
}

/** Classe d'un bouton `.tb-btn-icon`, avec le modificateur actif (fond/texte
 * accentués) quand la marque/l'option correspondante est active sous le
 * curseur — voir `EditorStats.activeMarks`/`activeAlign`/`activeList`. */
function activeBtnClass(active: boolean): string {
  return active ? "tb-btn-icon tb-btn-icon-active" : "tb-btn-icon";
}

/** Bouton de type A : grande icône (~28px) + libellé dessous. */
function BigButton({
  icon,
  label,
  title,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="tb-big-btn" onClick={onClick} disabled={disabled} title={title}>
      <span className="tb-big-btn-icon">{icon}</span>
      <span className="tb-big-btn-label">{label}</span>
    </button>
  );
}

/** Bouton de type B : petite icône (~15px) + libellé à droite. */
function StackButton({
  icon,
  label,
  title,
  onClick,
  disabled = false,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`tb-stack-btn ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <span className="tb-stack-btn-icon">{icon}</span>
      <span className="tb-stack-btn-label">{label}</span>
    </button>
  );
}

/** Un groupe de commandes légendé, comme dans le ruban de Word (icônes en
 * haut, nom du groupe centré en dessous). */
function RibbonGroup({
  label,
  title,
  launcher,
  buttonsClassName = "tb-group-buttons",
  children,
}: {
  label: string;
  title?: string;
  /** Icône "lanceur" affichée juste après le libellé du groupe (façon Word,
   * la petite flèche qui ouvre une boîte de dialogue détaillée). */
  launcher?: { onClick?: () => void; title?: string };
  /** Variante de disposition des boutons (grille 2 lignes par défaut,
   * ou flex pour les groupes type A + piles type B). */
  buttonsClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="tb-group">
      <div className={buttonsClassName}>{children}</div>
      <div className="tb-group-caption" title={title}>
        {label}
        {launcher && (
          <button
            type="button"
            className="tb-group-launcher"
            onClick={launcher.onClick}
            disabled={!launcher.onClick}
            title={launcher.title}
          >
            <IconDialogLauncher size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Galerie de styles de paragraphe (Normal / Titre 1 / Titre 2 / autres
 * niveaux via le chevron), façon groupe "Styles" de Word — remplace
 * l'ancien menu déroulant "Titre ▾". Le bouton du style courant (sous
 * le curseur) est mis en évidence. */
function StyleGallery({
  disabled,
  active,
  onPick,
  onPickParagraph,
  onTogglePanel,
  panelOpen = false,
}: {
  disabled: boolean;
  active: "paragraph" | 1 | 2 | 3 | 4 | 5 | 6;
  onPick: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
  onPickParagraph: () => void;
  onTogglePanel?: () => void;
  panelOpen?: boolean;
}) {
  return (
    <div className="tb-style-gallery">
      <button
        className={`tb-style-btn${active === "paragraph" ? " tb-style-btn-active" : ""}`}
        disabled={disabled}
        onMouseDown={keepEditorFocus}
        onClick={onPickParagraph}
        title="Normal"
      >
        Normal
      </button>
      {([1, 2] as const).map((level) => (
        <button
          key={level}
          className={`tb-style-btn${active === level ? " tb-style-btn-active" : ""}`}
          disabled={disabled}
          onMouseDown={keepEditorFocus}
          onClick={() => onPick(level)}
          title={`Titre ${level}`}
        >
          Titre {level}
        </button>
      ))}
      {onTogglePanel ? (
        <button
          className={`tb-btn-icon tb-heading-picker-trigger${panelOpen ? " tb-btn-icon-active" : ""}`}
          disabled={disabled}
          onMouseDown={keepEditorFocus}
          onClick={onTogglePanel}
          title="Panneau des styles de titres (Titre 1 à 6, avec aperçu et niveau actif)"
        >
          ⌄
        </button>
      ) : (
        <HeadingPicker disabled={disabled} onPick={onPick} />
      )}
    </div>
  );
}

/** Sélecteur de titre affichant chaque niveau dans sa vraie taille (galerie de styles, comme Word). */
function HeadingPicker({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useClickOutside(rootRef, open, () => setOpen(false));

  return (
    <div className="tb-heading-picker" ref={rootRef}>
      <button
        className="tb-btn-icon tb-heading-picker-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="Autres niveaux de titre"
      >
        ⌄
      </button>
      {open && (
        <div className="tb-heading-menu">
          {([1, 2, 3, 4, 5, 6] as const).map((level) => (
            <button
              key={level}
              className="tb-heading-option"
              style={{ fontSize: HEADING_PREVIEW_SIZE[level] }}
              onClick={() => {
                onPick(level);
                setOpen(false);
              }}
            >
              Titre {level}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}



/** Menu d'insertion d'emoji — grille plutôt qu'une liste verticale (les
 * libellés textuels des autres menus n'ont pas de sens ici, l'emoji EST
 * son propre libellé). Le DÉCLENCHEUR porte l'icône SVG fournie (visage),
 * pas un emoji. */
/** Sélecteur à catégories (fenêtre popup) : sert aux Emoji ET aux Caractères
 * spéciaux — mêmes comportements (recalage dans la fenêtre, Échap, clic
 * extérieur), seuls libellé/icône/catégories changent. */
function EmojiPicker({
  disabled,
  onPick,
  label = "Emoji",
  title = "Insérer un emoji",
  categories = EMOJI_CATEGORIES,
  icon = <IconEmoji size={15} />,
}: {
  disabled: boolean;
  onPick: (emoji: string) => void;
  label?: string;
  title?: string;
  categories?: { id: string; label: string; emojis: string[] }[];
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Recale la fenêtre dans le viewport à l'ouverture (le bouton Emoji
  // vit en bout de ruban : aligné à droite par défaut, elle déborderait de
  // la fenêtre si celle-ci est étroite — même logique que le ColorPicker).
  useEffect(() => {
    if (!open) return;
    const pop = popRef.current;
    if (!pop) return;
    const rect = pop.getBoundingClientRect();
    const overflowRight = rect.right - (window.innerWidth - 8);
    if (overflowRight > 0) {
      pop.style.right = `${parseFloat(pop.style.right || "0") + overflowRight}px`;
    }
    // Débordement à GAUCHE (le bouton est ancré à droite de la fenêtre et le
    // groupe « Symboles » est plus au centre du ruban) : on décale vers la droite.
    const overflowLeft = 8 - pop.getBoundingClientRect().left;
    if (overflowLeft > 0) {
      pop.style.right = `${parseFloat(pop.style.right || "0") - overflowLeft}px`;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="tb-heading-picker" ref={rootRef}>
      <button
        className="tb-stack-btn tb-stack-btn-with-caret"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={title}
      >
        <span className="tb-stack-btn-icon">{icon}</span>
        <span className="tb-stack-btn-label">{label}</span>
        <span className="tb-stack-caret">▾</span>
      </button>
      {open && (
        <div className="tb-emoji-pop" ref={popRef} role="dialog" aria-label={label}>
          <div className="tb-emoji-pop-title">{label}</div>
          {categories.map((cat) => (
            <div key={cat.id} className="tb-emoji-cat">
              <div className="tb-emoji-cat-label">{cat.label}</div>
              <div className="tb-emoji-grid">
                {cat.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="tb-emoji-cell"
                    title={emoji}
                    onMouseDown={keepEditorFocus}
                    onClick={() => {
                      onPick(emoji);
                      setOpen(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
