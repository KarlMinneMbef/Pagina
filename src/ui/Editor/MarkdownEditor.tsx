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
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableMarkdown as Table } from "./extensions/TableMarkdown";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
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
import { useEffect, useImperativeHandle, forwardRef, useRef, useMemo, type CSSProperties } from "react";
import { PageBreak } from "./extensions/PageBreak";
import { ParagraphMarkdown } from "./extensions/ParagraphMarkdown";
import { TocMarker } from "./extensions/TocMarker";
import { FootnoteReference, FootnoteDefinition } from "./extensions/Footnote";
import { MermaidDiagram } from "./extensions/MermaidDiagram";
import { InlineMath, BlockMath } from "./extensions/Math";
import { applyHeadingNumbering } from "./extensions/HeadingAutoNumber";
import { paintPages, HEADER_TEMPLATE_ATTR, FOOTER_TEMPLATE_ATTR } from "./pagination/paintPages";
import { resolveClickPosition, findClonedBlock } from "./pagination/resolveClickPosition";
import { computeCaretScreenPosition } from "./pagination/caretPosition";
import { computeSelectionRects } from "./pagination/selectionHighlight";
import { resolvePageSizeMm, formatTodayForHeaderFooter, type PageLayoutSettings } from "../../core/pageLayout";
import "katex/dist/katex.min.css";
import "./MarkdownEditor.css";

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
  /** Langage de coloration syntaxique du bloc de code où se trouve le
   * curseur (aucun effet si le curseur n'est pas dans un bloc de code). */
  setCodeBlockLanguage: (language: string) => void;
  setLink: () => void;
  insertImage: (src: string, alt?: string) => void;
  insertTable: () => void;
  insertHorizontalRule: () => void;
  insertPageBreak: () => void;
  setFontFamily: (family: string) => void;
  unsetFontFamily: () => void;
  setFontSize: (size: string) => void;
  unsetFontSize: () => void;
  setColor: (color: string) => void;
  unsetColor: () => void;
  toggleHighlight: () => void;
  setTextAlign: (align: "left" | "center" | "right" | "justify") => void;
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
  insertTocMarker: () => void;
  generateToc: () => void;
  /** Insère une référence `[^n]` au curseur ET la définition correspondante
   * en fin de document (n = 1 + le plus grand id de note déjà utilisé). */
  insertFootnote: () => void;
  insertMermaidDiagram: () => void;
  insertInlineMath: () => void;
  insertBlockMath: () => void;
  insertEmoji: (emoji: string) => void;
}

// Coloration syntaxique des blocs de code : "common" couvre les langages les
// plus courants (JS/TS, Python, C/C++/C#, Java, HTML/CSS, JSON, Bash, SQL,
// YAML...) sans alourdir le bundle avec les ~190 langages disponibles.
const lowlight = createLowlight(common);
export const CODE_BLOCK_LANGUAGES = Object.keys(common).sort();

function mmToPx(mm: number): number {
  const probe = document.createElement("div");
  probe.style.height = `${mm}mm`;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return px;
}

/** Style de bloc sous le curseur (paragraphe normal ou Titre 1-6) — voir
 * `EditorStats.activeBlockStyle`. */
function getActiveBlockStyle(editor: Editor): EditorStats["activeBlockStyle"] {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    if (editor.isActive("heading", { level })) return level;
  }
  return "paragraph";
}

export interface EditorStats {
  words: number;
  characters: number;
  pageCount: number;
  currentPage: number;
  /** Style de bloc sous le curseur — pour surligner le bon bouton dans la
   * galerie de styles du ruban (voir RibbonGroup "Styles" dans Toolbar.tsx). */
  activeBlockStyle: "paragraph" | 1 | 2 | 3 | 4 | 5 | 6;
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
  /** Ctrl+molette : proposition d'un nouveau niveau de zoom (paliers gérés par l'appelant). */
  onZoomChange?: (zoom: number) => void;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  ({ initialContent, onChange, onSaveRequest, onStats, layout, documentTitle, onLayoutChange, zoom = 1, onZoomChange }, ref) => {
    const loadedContentRef = useRef(initialContent);
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
    const activeHeaderFooterInputRef = useRef<HTMLInputElement | null>(null);
    // Peuplée après le montage de l'éditeur (voir plus bas) — permet aux
    // callbacks `onUpdate`/`onSelectionUpdate`, créés une seule fois par
    // Tiptap, d'appeler la version toujours à jour de `repaint`.
    const repaintRef = useRef<() => void>(() => {});
    const repaintCaretRef = useRef<() => void>(() => {});

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

    const editor = useEditor({
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
        Highlight.configure({ multicolor: false }),
        TextAlign.configure({ types: ["heading", "paragraph", "tableCell", "tableHeader"] }),
        Subscript,
        Superscript,
        TaskList,
        TaskItem.configure({ nested: true }),
        CharacterCount,
        PageBreak,
        TocMarker,
        FootnoteReference,
        FootnoteDefinition,
        MermaidDiagram,
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
          activeBlockStyle: getActiveBlockStyle(editor),
        });
      },
    });

    useImperativeHandle(ref, () => ({
      getMarkdown: () => {
        if (!editor) return loadedContentRef.current;
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        return editor.storage.markdown.getMarkdown();
      },
      getHTML: () => editor?.getHTML() ?? "",
      focus: () => editor?.commands.focus(),
      undo: () => editor?.chain().focus(undefined, { scrollIntoView: false }).undo().run(),
      redo: () => editor?.chain().focus(undefined, { scrollIntoView: false }).redo().run(),
      toggleBold: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleBold().run(),
      toggleItalic: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleItalic().run(),
      toggleUnderline: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleUnderline().run(),
      toggleStrike: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleStrike().run(),
      toggleHeading: (level) => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level }).run(),
      setParagraph: () => editor?.chain().focus(undefined, { scrollIntoView: false }).setParagraph().run(),
      toggleBulletList: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleBulletList().run(),
      toggleOrderedList: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleOrderedList().run(),
      toggleBlockquote: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleBlockquote().run(),
      toggleCodeBlock: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleCodeBlock().run(),
      toggleCode: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleCode().run(),
      setCodeBlockLanguage: (language) =>
        editor?.chain().focus(undefined, { scrollIntoView: false }).updateAttributes("codeBlock", { language }).run(),
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
      insertImage: (src, alt) => editor?.chain().focus(undefined, { scrollIntoView: false }).setImage({ src, alt }).run(),
      insertTable: () =>
        editor?.chain().focus(undefined, { scrollIntoView: false }).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      insertHorizontalRule: () => editor?.chain().focus(undefined, { scrollIntoView: false }).setHorizontalRule().run(),
      insertPageBreak: () => editor?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "pageBreak" }).run(),
      setFontFamily: (family) => editor?.chain().focus(undefined, { scrollIntoView: false }).setFontFamily(family).run(),
      unsetFontFamily: () => editor?.chain().focus(undefined, { scrollIntoView: false }).unsetFontFamily().run(),
      setFontSize: (size) => editor?.chain().focus(undefined, { scrollIntoView: false }).setFontSize(size).run(),
      unsetFontSize: () => editor?.chain().focus(undefined, { scrollIntoView: false }).unsetFontSize().run(),
      setColor: (color) => editor?.chain().focus(undefined, { scrollIntoView: false }).setColor(color).run(),
      unsetColor: () => editor?.chain().focus(undefined, { scrollIntoView: false }).unsetColor().run(),
      toggleHighlight: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleHighlight().run(),
      setTextAlign: (align) => editor?.chain().focus(undefined, { scrollIntoView: false }).setTextAlign(align).run(),
      toggleSubscript: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleSubscript().run(),
      toggleSuperscript: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleSuperscript().run(),
      toggleTaskList: () => editor?.chain().focus(undefined, { scrollIntoView: false }).toggleTaskList().run(),
      clearFormatting: () =>
        editor?.chain().focus(undefined, { scrollIntoView: false }).unsetAllMarks().unsetFontFamily().unsetFontSize().unsetColor().run(),
      getStats: () => ({
        words: editor?.storage.characterCount.words() ?? 0,
        characters: editor?.storage.characterCount.characters() ?? 0,
        activeBlockStyle: editor ? getActiveBlockStyle(editor) : "paragraph",
        pageCount: pageCountRef.current,
        currentPage: currentPageRef.current,
      }),
      editHeader: () => {
        const el = canvasRef.current?.querySelector<HTMLElement>(".xmd-page-header");
        if (el) startHeaderFooterEditRef.current(el);
      },
      editFooter: () => {
        const el = canvasRef.current?.querySelector<HTMLElement>(".xmd-page-footer");
        if (el) startHeaderFooterEditRef.current(el);
      },
      insertHeaderFooterVariable: (token) => insertHeaderFooterVariableRef.current(token),
      insertTocMarker: () => editor?.chain().focus(undefined, { scrollIntoView: false }).insertTocMarker().run(),
      generateToc: () => editor?.chain().focus(undefined, { scrollIntoView: false }).generateToc().run(),
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
      insertMermaidDiagram: () =>
        editor?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "mermaidDiagram" }).run(),
      insertInlineMath: () => {
        const source = window.prompt("Formule LaTeX (en ligne) :", "E = mc^2");
        if (!source) return;
        editor?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "inlineMath", attrs: { source } }).run();
      },
      insertBlockMath: () => {
        const source = window.prompt("Formule LaTeX (bloc) :", "\\int_0^\\infty e^{-x} dx = 1");
        if (!source) return;
        editor?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "blockMath", attrs: { source } }).run();
      },
      insertEmoji: (emoji) => editor?.chain().focus(undefined, { scrollIntoView: false }).insertContent(emoji).run(),
    }));

    // Si le contenu initial change (changement d'onglet actif), recharger l'éditeur.
    useEffect(() => {
      if (editor && initialContent !== loadedContentRef.current) {
        editor.commands.setContent(initialContent);
        loadedContentRef.current = initialContent;
      }
    }, [initialContent, editor]);

    // repaint() reconstruit entièrement la couche peinte (répartition en
    // pages + clones, voir paintPages.ts) et replace le curseur dessiné à la
    // main. Appelée à chaque modification du document (onUpdate ci-dessus),
    // au montage, et si le zoom change (les mesures dépendent du zoom).
    useEffect(() => {
      if (!editor) return;

      const repaintCaretOnly = () => {
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
            const rects = computeSelectionRects(editor.view, canvas, from, to, zoomRef.current);
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
            const realWidth =
              renderedContent.getBoundingClientRect().width -
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
          header: layout.header,
          footer: layout.footer,
          context: {
            date: formatTodayForHeaderFooter(),
            filename: documentTitleRef.current,
            version: layout.documentVersion,
            author: layout.author,
          },
        });
        pageCountRef.current = result.pageCount;
        repaintCaretOnly();
        const words: number = editor.storage.characterCount.words();
        const characters: number = editor.storage.characterCount.characters();
        onStatsRef.current?.({
          words,
          characters,
          pageCount: pageCountRef.current,
          currentPage: currentPageRef.current,
          activeBlockStyle: getActiveBlockStyle(editor),
        });
      };
      repaintRef.current = repaint;

      repaint();
      // Un changement de fenêtre (redimensionnement) peut changer la mise en
      // ligne du texte dans l'éditeur invisible (largeur inchangée en
      // pratique — fixe en mm — mais on reste robuste si ça change un jour).
      const ro = new ResizeObserver(repaint);
      const dom = editor.view.dom as HTMLElement;
      ro.observe(dom);
      return () => ro.disconnect();
    }, [editor, geometry, layout]);

    // Le zoom change les mesures géométriques (transform: scale()) : on
    // repeint pour que la pagination et la position du curseur restent
    // cohérentes avec le nouveau niveau de zoom.
    useEffect(() => {
      repaintRef.current();
    }, [zoom]);

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

      const input = document.createElement("input");
      input.type = "text";
      input.className = "xmd-header-footer-edit";
      input.value = template;
      input.style.left = `${rect.left}px`;
      input.style.top = `${rect.top}px`;
      input.style.width = `${rect.width}px`;
      input.style.height = `${rect.height}px`;
      document.body.appendChild(input);
      input.focus();
      input.select();
      activeHeaderFooterInputRef.current = input;

      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        if (activeHeaderFooterInputRef.current === input) activeHeaderFooterInputRef.current = null;
        const nextText = input.value;
        input.remove();
        const current = layoutRef.current;
        const field = isHeader ? "header" : "footer";
        if (current[field].text === nextText) return; // rien à faire, évite un dirty inutile
        onLayoutChangeRef.current({ ...current, [field]: { ...current[field], text: nextText } });
      };
      const cancel = () => {
        if (committed) return;
        committed = true;
        if (activeHeaderFooterInputRef.current === input) activeHeaderFooterInputRef.current = null;
        input.remove();
      };
      // `mousedown` (pas seulement `blur`) sur les boutons "insérer une
      // variable" du ruban appelle `preventDefault()` pour ne PAS voler le
      // focus au champ — sans ça, `blur` se déclencherait avant `onClick` et
      // fermerait l'édition avant d'avoir pu y insérer quoi que ce soit.
      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      });
    };
    startHeaderFooterEditRef.current = startHeaderFooterEdit;

    /** Insère une variable (`{{page}}`, etc.) dans le champ d'en-tête/pied de
     * page actuellement ouvert ; s'il n'y en a aucun, ouvre celui de
     * l'en-tête (choix par défaut) et insère à la fin du texte existant. */
    insertHeaderFooterVariableRef.current = (token: string) => {
      const insertInto = (input: HTMLInputElement) => {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, start) + token + input.value.slice(end);
        const newPos = start + token.length;
        input.focus();
        input.setSelectionRange(newPos, newPos);
      };

      const active = activeHeaderFooterInputRef.current;
      if (active && document.body.contains(active)) {
        insertInto(active);
        return;
      }
      const el = canvasRef.current?.querySelector<HTMLElement>(".xmd-page-header");
      if (!el) return;
      startHeaderFooterEditRef.current(el);
      const opened = activeHeaderFooterInputRef.current;
      if (opened) {
        // `startHeaderFooterEdit` sélectionne tout le texte existant par
        // défaut (pratique pour un remplacement rapide) — ici on veut au
        // contraire AJOUTER à la fin, donc on déplace d'abord le curseur.
        opened.setSelectionRange(opened.value.length, opened.value.length);
        insertInto(opened);
      }
    };

    // Clics sur la couche peinte : traduits en position réelle dans
    // l'éditeur invisible (voir resolveClickPosition.ts), qui reprend le
    // focus. Glisser (mousedown puis mousemove) étend la sélection.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !editor) return;

      let dragging = false;
      let anchorPos: number | null = null;

      const posFromEvent = (e: MouseEvent): number | null => {
        const block = findClonedBlock(e.target);
        if (!block) return null;
        return resolveClickPosition(editor.view, e.clientX, e.clientY, block, zoomRef.current);
      };

      const onMouseDown = (e: MouseEvent) => {
        const headerFooterTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-page-header, .xmd-page-footer");
        if (headerFooterTarget) {
          e.preventDefault();
          startHeaderFooterEdit(headerFooterTarget);
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
        const mathTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-math");
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
          const next = window.prompt("Formule LaTeX :", node!.attrs.source);
          if (next === null) return;
          editor.view.dispatch(editor.view.state.tr.setNodeAttribute(mathPos, "source", next));
          return;
        }
        const pos = posFromEvent(e);
        if (pos === null) return;
        e.preventDefault();
        dragging = true;
        anchorPos = pos;
        editor.commands.focus(undefined, { scrollIntoView: false });
        editor.commands.setTextSelection(pos);
      };
      const onMouseMove = (e: MouseEvent) => {
        if (!dragging || anchorPos === null) return;
        const pos = posFromEvent(e);
        if (pos === null) return;
        editor.commands.setTextSelection({ from: anchorPos, to: pos });
      };
      const onMouseUp = () => {
        dragging = false;
        anchorPos = null;
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

      canvas.addEventListener("mousedown", onMouseDown);
      canvas.addEventListener("click", onClick);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return () => {
        canvas.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("click", onClick);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
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
            activeBlockStyle: getActiveBlockStyle(editor),
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
      "--xmd-zoom": zoom,
      "--xmd-page-height": `${pageHeightMm}mm`,
      "--xmd-page-width": `${pageWidthMm}mm`,
      "--xmd-margin-top": `${layout.marginTopMm}mm`,
      "--xmd-margin-right": `${layout.marginRightMm}mm`,
      "--xmd-margin-bottom": `${layout.marginBottomMm}mm`,
      "--xmd-margin-left": `${layout.marginLeftMm}mm`,
      "--xmd-header-height": `${layout.header.heightMm}mm`,
      "--xmd-footer-height": `${layout.footer.heightMm}mm`,
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
          ];
        }),
      ),
    } as CSSProperties;

    return (
      <div className="xmd-page-wrap" ref={wrapRef} style={pageVars}>
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
        <div className="xmd-canvas-frame">
          <div className="xmd-page-canvas" ref={canvasRef} />
          <div className="xmd-selection-layer" ref={selectionLayerRef} />
          <div className="xmd-fake-caret" ref={caretRef} />
        </div>
      </div>
    );
  }
);
MarkdownEditor.displayName = "MarkdownEditor";
