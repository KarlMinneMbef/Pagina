/**
 * PaginaLight — version LÉGÈRE de Pagina, à intégrer dans une autre application (MBEF Platform, plus tard
 * l'app Windows Ingenerix) : ruban réduit à l'onglet « Accueil », WYSIWYG et pages A4 réelles, sans
 * explorateur de fichiers, sans onglets, sans Tauri.
 *
 * Contrat avec l'application hôte :
 * - `value` = le contenu Markdown de départ (avec ou sans les commentaires `<!-- pagina:config -->`).
 *   Il n'est lu qu'au montage (ou quand `resetKey` change) : l'éditeur reste propriétaire de son état
 *   pendant la frappe, comme MarkdownEditor dans Pagina (jamais de va-et-vient qui déplacerait le curseur).
 * - `onChange(markdown)` reçoit le Markdown COMPLET à chaque modification, commentaires de mise en page
 *   réinjectés (comme tabsStore.ts à l'enregistrement dans Pagina) — un fichier .md standard, lisible partout.
 *
 * Ne contient AUCUNE dépendance à Tauri, au système de fichiers ni aux stores de Pagina.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkdownEditor, type MarkdownEditorHandle, type EditorStats } from "../ui/Editor/MarkdownEditor";
import { Toolbar, type ToolbarActions } from "../ui/Toolbar/Toolbar";
import { extractDocumentConfig, withDocumentConfig, type PageLayoutSettings } from "../core/pageLayout";
import "./embed.css";

export interface PaginaLightProps {
  /** Contenu Markdown de départ. */
  value: string;
  /** Markdown complet (commentaires de mise en page inclus) à chaque modification. */
  onChange: (markdown: string) => void;
  /** Demande d'enregistrement (Ctrl+S) — facultatif. */
  onSave?: () => void;
  /** Nom affiché, disponible comme variable `{{filename}}` dans l'en-tête/pied de page. */
  documentTitle?: string;
  /** Hauteur totale du composant (ruban compris) : nombre de pixels ou toute valeur CSS. Défaut : 640. */
  height?: number | string;
  /** Change de valeur pour recharger `value` (ex. après « Régénérer »). */
  resetKey?: string | number;
  /** Lecture seule (document figé) : ruban désactivé, aucune saisie. */
  readOnly?: boolean;
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];
const STATS_INITIALES: EditorStats = {
  words: 0,
  characters: 0,
  pageCount: 1,
  currentPage: 1,
  activeBlockStyle: "paragraph",
  activeMarks: { bold: false, italic: false, underline: false, strike: false, code: false, subscript: false, superscript: false, highlight: false },
  activeAlign: null,
  activeList: null,
  activeFontFamily: null,
  activeColor: null,
  activeFontSizePt: 12,
  insideTable: false,
  tableSelectionShape: null,
  headerFooterEditMode: null,
  insideToc: false,
  math: null,
};

const AUCUNE_ACTION_DIALOGUE = () => {};

export function PaginaLight({ value, onChange, onSave, documentTitle = "Document", height = 640, resetKey = 0, readOnly = false }: PaginaLightProps) {
  // Décomposition du fichier : la config de mise en page vit hors du texte donné à l'éditeur (un commentaire
  // HTML n'a pas de nœud de schéma et disparaîtrait au premier aller-retour — voir pageLayout.ts).
  const initial = useMemo(() => extractDocumentConfig(value), [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [layout, setLayout] = useState<PageLayoutSettings>(initial.layout);
  const [stats, setStats] = useState<EditorStats>(STATS_INITIALES);
  const [zoom, setZoom] = useState(1);
  const [actions, setActions] = useState<ToolbarActions | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const contenuRef = useRef(initial.content);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // À l'ouverture, Tiptap normalise le document (deux `onUpdate` sans aucune action de l'utilisateur) : les
  // transmettre à l'application hôte lui ferait croire que le document a été modifié dès son chargement.
  // On n'émet donc qu'après une vraie interaction (frappe, collage, coupe, dépôt, clic dans le ruban).
  // Le drapeau est remis à zéro PENDANT le rendu quand `resetKey` change, donc avant le montage du nouvel
  // éditeur — un effet s'exécuterait trop tard (les effets des enfants passent en premier).
  const interactionRef = useRef(false);
  const cleVueRef = useRef(resetKey);
  if (cleVueRef.current !== resetKey) {
    cleVueRef.current = resetKey;
    interactionRef.current = false;
  }
  const marquerInteraction = () => {
    interactionRef.current = true;
  };

  // Un nouveau `resetKey` recharge le contenu : la mise en page repart de celle du nouveau fichier.
  useEffect(() => {
    setLayout(initial.layout);
    contenuRef.current = initial.content;
  }, [initial]);

  const emettre = useCallback((markdown: string, layoutCourant: PageLayoutSettings) => {
    onChangeRef.current(withDocumentConfig(layoutCourant, markdown));
  }, []);

  // Le handle de l'éditeur est stable tant que le composant n'est pas remonté (même principe que App.tsx).
  useEffect(() => {
    const handle = editorRef.current;
    if (!handle) return;
    setActions({
      undo: () => handle.undo(),
      redo: () => handle.redo(),
      copySelection: () => handle.copySelection(),
      cutSelection: () => handle.cutSelection(),
      pasteClipboard: () => handle.pasteClipboard(),
      toggleBold: () => handle.toggleBold(),
      toggleItalic: () => handle.toggleItalic(),
      toggleUnderline: () => handle.toggleUnderline(),
      toggleStrike: () => handle.toggleStrike(),
      toggleHeading: (level) => handle.toggleHeading(level),
      setParagraph: () => handle.setParagraph(),
      toggleBulletList: () => handle.toggleBulletList(),
      toggleOrderedList: () => handle.toggleOrderedList(),
      toggleBlockquote: () => handle.toggleBlockquote(),
      toggleCodeBlock: () => handle.toggleCodeBlock(),
      toggleCode: () => handle.toggleCode(),
      setLink: () => handle.setLink(),
      insertTable: (rows, cols) => handle.insertTable(rows, cols),
      addRowBefore: () => handle.addRowBefore(),
      addRowAfter: () => handle.addRowAfter(),
      deleteRow: () => handle.deleteRow(),
      addColumnBefore: () => handle.addColumnBefore(),
      addColumnAfter: () => handle.addColumnAfter(),
      deleteColumn: () => handle.deleteColumn(),
      deleteTable: () => handle.deleteTable(),
      mergeCells: () => handle.mergeCells(),
      splitCell: () => handle.splitCell(),
      toggleHeaderRow: () => handle.toggleHeaderRow(),
      clearCellContents: () => handle.clearCellContents(),
      setCellBackgroundColor: (color: string | null) => handle.setCellBackgroundColor(color),
      setCellBorder: (sides, css) => handle.setCellBorder(sides, css),
      setCellBorderPreset: (preset, css) => handle.setCellBorderPreset(preset, css),
      setGridLineBorder: (lines, css) => handle.setGridLineBorder(lines, css),
      setCellVerticalAlign: (align) => handle.setCellVerticalAlign(align),
      insertHorizontalRule: () => handle.insertHorizontalRule(),
      insertPageBreak: () => handle.insertPageBreak(),
      setFontFamily: (family) => handle.setFontFamily(family),
      unsetFontFamily: () => handle.unsetFontFamily(),
      setFontSize: (size) => handle.setFontSize(size),
      unsetFontSize: () => handle.unsetFontSize(),
      increaseFontSize: () => handle.increaseFontSize(),
      decreaseFontSize: () => handle.decreaseFontSize(),
      changeCase: () => handle.changeCase(),
      setColor: (color) => handle.setColor(color),
      unsetColor: () => handle.unsetColor(),
      toggleHighlight: () => handle.toggleHighlight(),
      setTextAlign: (align) => handle.setTextAlign(align),
      increaseIndent: () => handle.increaseIndent(),
      decreaseIndent: () => handle.decreaseIndent(),
      toggleSubscript: () => handle.toggleSubscript(),
      toggleSuperscript: () => handle.toggleSuperscript(),
      toggleTaskList: () => handle.toggleTaskList(),
      clearFormatting: () => handle.clearFormatting(),
      editHeader: () => handle.editHeader(),
      editFooter: () => handle.editFooter(),
      insertHeaderFooterVariable: (token) => handle.insertHeaderFooterVariable(token),
      insertTocMarker: () => handle.insertTocMarker(),
      generateToc: () => handle.generateToc(),
      updateTocAtCursor: () => handle.updateTocAtCursor(),
      deleteTocAtCursor: () => handle.deleteTocAtCursor(),
      insertFootnote: () => handle.insertFootnote(),
      insertMermaidDiagram: () => {}, // absents de la version légère
      insertInlineMath: () => {},
      insertBlockMath: () => {},
      insertEmoji: (emoji) => handle.insertEmoji(emoji),
      insertBookmark: () => handle.insertBookmark(),
      insertCrossReference: () => handle.insertCrossReference(),
    });
  }, [resetKey]);

  const hauteur = typeof height === "number" ? `${height}px` : height;

  return (
    <div
      className="xmd-embed"
      style={{ height: hauteur }}
      onKeyDownCapture={marquerInteraction}
      onBeforeInputCapture={marquerInteraction}
      onPasteCapture={marquerInteraction}
      onCutCapture={marquerInteraction}
      onDropCapture={marquerInteraction}
    >
      <div onMouseDownCapture={marquerInteraction}>
        <Toolbar
          leger
          actions={readOnly ? null : actions}
          onToggleSidebar={AUCUNE_ACTION_DIALOGUE}
          sidebarOpen={false}
          onOpenPageSetup={AUCUNE_ACTION_DIALOGUE}
          onOpenHeadingStyles={AUCUNE_ACTION_DIALOGUE}
          activeBlockStyle={stats.activeBlockStyle}
          activeMarks={stats.activeMarks}
          activeAlign={stats.activeAlign}
          activeList={stats.activeList}
          activeFontFamily={stats.activeFontFamily}
        activeColor={stats.activeColor}
          activeFontSizePt={stats.activeFontSizePt}
        />
      </div>
      <div className="xmd-embed-editor-area">
        <MarkdownEditor
          key={resetKey}
          ref={editorRef}
          initialContent={initial.content}
          onChange={(markdown) => {
            contenuRef.current = markdown;
            if (interactionRef.current) emettre(markdown, layoutRef.current);
          }}
          onSaveRequest={() => onSaveRef.current?.()}
          onStats={setStats}
          layout={layout}
          documentTitle={documentTitle}
          onLayoutChange={(nouveau) => {
            setLayout(nouveau);
            if (interactionRef.current) emettre(contenuRef.current, nouveau);
          }}
          readOnly={readOnly}
          zoom={zoom}
          onZoomChange={(z) => setZoom(Math.min(1.5, Math.max(0.5, z)))}
        />
      </div>
      <div className="xmd-embed-statusbar">
        <span>Page {stats.currentPage} / {stats.pageCount}</span>
        <span>{stats.words} mots</span>
        <span className="xmd-embed-statusbar-spacer" />
        <label>
          Zoom{" "}
          <select className="xmd-embed-zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            {ZOOMS.map((z) => (
              <option key={z} value={z}>{Math.round(z * 100)} %</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
