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
import { useEffect, useRef, useState } from "react";
import { ColorPicker } from "../ColorPicker/ColorPicker";
import type { GridLine } from "../Editor/MarkdownEditor";
import { FONT_SIZE_STEPS } from "../Editor/MarkdownEditor";
import { TableSizePicker } from "./TableSizePicker";
import {
  IconAlignCenter,
  IconAlignJustify,
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
  IconPageSetup,
  IconComment,
  IconPaste,
  IconTaskList,
  IconTocMarker,
  IconTocRefresh,
} from "./icons";
import "./Toolbar.css";

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
  toggleHighlight: () => void;
  clearFormatting: () => void;
  // --- Paragraphe ---
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleTaskList: () => void;
  toggleBlockquote: () => void;
  setTextAlign: (align: "left" | "center" | "right" | "justify") => void;
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
  insertMermaidDiagram: () => void;
  insertInlineMath: () => void;
  insertBlockMath: () => void;
  insertEmoji: (emoji: string) => void;
  // --- Liens (Signet / Renvoi) ---
  insertBookmark: () => void;
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

type RibbonTab = "accueil" | "insertion";

export function Toolbar({
  actions,
  onToggleSidebar,
  sidebarOpen,
  onOpenPageSetup,
  onOpenHeadingStyles,
  activeBlockStyle = "paragraph",
  leger = false,
}: {
  actions: ToolbarActions | null;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onOpenPageSetup: () => void;
  onOpenHeadingStyles: () => void;
  /** Version LÉGÈRE (intégration dans une autre application, ex. MBEF Platform) : uniquement l'onglet
   * « Accueil », sans bouton Explorateur, sans lanceurs de dialogues (mise en page,
   * styles de titres), sans panneau contextuel. Sans effet (false) dans Pagina elle-même. */
  leger?: boolean;
  /** Style de bloc sous le curseur — surligne le bon bouton de la galerie
   * "Styles" (voir `EditorStats.activeBlockStyle` dans MarkdownEditor.tsx). */
  activeBlockStyle?: "paragraph" | 1 | 2 | 3 | 4 | 5 | 6;
}) {
  const disabled = actions === null;
  const [tab, setTab] = useState<RibbonTab>("accueil");

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
                defaultValue=""
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
                defaultValue=""
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
              <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleBold()} title="Gras (Ctrl+B)">
                <span className="tb-letter tb-letter-bold">G</span>
              </button>
              <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleItalic()} title="Italique (Ctrl+I)">
                <span className="tb-letter tb-letter-italic">I</span>
              </button>
              <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleUnderline()} title="Souligné (Ctrl+U)">
                <span className="tb-letter tb-letter-underline">S</span>
              </button>
              <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleStrike()} title="Texte barré">
                <span className="tb-letter tb-letter-strike">S</span>
              </button>
              <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleSubscript()} title="Indice">
                <span className="tb-letter">x<span className="tb-letter-sub">2</span></span>
              </button>
              <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleSuperscript()} title="Exposant">
                <span className="tb-letter">x<span className="tb-letter-sup">2</span></span>
              </button>
              <button
                className="tb-btn-icon"
                disabled={disabled}
                onClick={() => actions?.toggleCode()}
                title="Code en ligne — distinct du bloc de code (dans une phrase, ex. `variable`)"
              >
                <IconCodeInline size={16} />
              </button>
              <ColorPicker
                disabled={disabled}
                title="Couleur du texte"
                triggerClassName="tb-btn-icon tb-btn-with-caret"
                trigger={
                  <>
                    <span className="tb-letter">A</span>
                    <span className="tb-swatch-caret">▾</span>
                  </>
                }
                onAutomatic={() => actions?.unsetColor()}
                automaticSwatch="#343334"
                onChange={(color) => actions?.setColor(color)}
              />
              <button
                className="tb-btn-icon"
                disabled={disabled}
                onClick={() => actions?.toggleHighlight()}
                title="Surlignage"
              >
                <span className="tb-letter tb-letter-highlight">
                  S<span className="tb-highlight-bar" />
                </span>
              </button>
            </div>
          </RibbonGroup>

          <RibbonGroup
            label="Paragraphe"
            launcher={leger ? undefined : { onClick: onOpenPageSetup, title: "Mise en page (format, marges, en-tête/pied de page)" }}
          >
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleBulletList()} title="Liste à puces">
              <IconBulletList size={16} />
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleOrderedList()} title="Liste numérotée">
              <IconOrderedList size={16} />
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleTaskList()} title="Liste de tâches (case à cocher)">
              <IconTaskList size={16} />
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.toggleBlockquote()} title="Citation">
              <IconBlockquote size={16} />
            </button>
            {/* Ordre demandé par l'utilisateur (2026-10-17) :
             * gauche, droite, centré, justifié. */}
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.setTextAlign("left")} title="Aligner à gauche">
              <IconAlignLeft size={16} />
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.setTextAlign("right")} title="Aligner à droite">
              <IconAlignRight size={16} />
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.setTextAlign("center")} title="Centrer">
              <IconAlignCenter size={16} />
            </button>
            <button className="tb-btn-icon" disabled={disabled} onClick={() => actions?.setTextAlign("justify")} title="Justifier">
              <IconAlignJustify size={16} />
            </button>
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
                onClick={() => actions?.insertFootnote()}
                title="Insérer une note de bas de page (numérotée automatiquement, ajoutée en fin de document)"
                icon={<IconFootnote size={15} />}
                label="Note de bas de page"
              />
            </div>
          </RibbonGroup>

          <RibbonGroup label="Tableau" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            <TableSizePicker disabled={disabled} onPick={(rows, cols) => actions?.insertTable(rows, cols)} />
          </RibbonGroup>

          <RibbonGroup label="Éléments" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            {/* Une seule pile, 3 lignes (demande 2026-10-17) :
             * Séparateur, Emoji, Bloc de code. */}
            <div className="tb-stack">
              <StackButton
                disabled={disabled}
                onClick={() => actions?.insertHorizontalRule()}
                title="Séparateur horizontal"
                icon={<IconHorizontalRule size={15} />}
                label="Séparateur"
              />
              <EmojiPicker disabled={disabled} onPick={(emoji) => actions?.insertEmoji(emoji)} />
              <StackButton
                disabled={disabled}
                onClick={() => actions?.toggleCodeBlock()}
                title="Bloc de code"
                icon={<IconCodeBlock size={15} />}
                label="Bloc de code"
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

          <RibbonGroup label="Sommaire" buttonsClassName="tb-group-buttons tb-group-buttons-flex">
            <BigButton
              disabled={disabled}
              onClick={() => actions?.insertTocMarker()}
              title="Insérer un marqueur de sommaire (commentaire HTML invisible, compatible partout)"
              icon={<IconTocMarker size={28} />}
              label="Marqueur"
            />
            <div className="tb-stack">
              <StackButton
                disabled={disabled}
                onClick={() => actions?.generateToc()}
                title="Générer/mettre à jour le sommaire (remplace le marqueur par la liste réelle des titres)"
                icon={<IconTocRefresh size={15} />}
                label="Mettre à jour"
              />
            </div>
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
            ›
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
}: {
  disabled: boolean;
  active: "paragraph" | 1 | 2 | 3 | 4 | 5 | 6;
  onPick: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
  onPickParagraph: () => void;
}) {
  return (
    <div className="tb-style-gallery">
      <button
        className={`tb-style-btn${active === "paragraph" ? " tb-style-btn-active" : ""}`}
        disabled={disabled}
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
          onClick={() => onPick(level)}
          title={`Titre ${level}`}
        >
          Titre {level}
        </button>
      ))}
      <HeadingPicker disabled={disabled} onPick={onPick} />
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

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

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
function EmojiPicker({ disabled, onPick }: { disabled: boolean; onPick: (emoji: string) => void }) {
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
        title="Insérer un emoji"
      >
        <span className="tb-stack-btn-icon">
          <IconEmoji size={15} />
        </span>
        <span className="tb-stack-btn-label">Emoji</span>
        <span className="tb-stack-caret">▾</span>
      </button>
      {open && (
        <div className="tb-emoji-pop" ref={popRef} role="dialog" aria-label="Emoji">
          <div className="tb-emoji-pop-title">Emoji</div>
          {EMOJI_CATEGORIES.map((cat) => (
            <div key={cat.id} className="tb-emoji-cat">
              <div className="tb-emoji-cat-label">{cat.label}</div>
              <div className="tb-emoji-grid">
                {cat.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="tb-emoji-cell"
                    title={emoji}
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
