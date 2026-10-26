/**
 * Le « handle » impératif de l'éditeur (MarkdownEditorHandle) : toutes les actions du ruban, des panneaux et de la barre de titre
 * (mise en forme, insertions, tableaux, en-tête/pied, recherche, signets, presse-papiers…).
 *
 * Extrait de MarkdownEditor.tsx (dette technique 0.4, 2026-10-26) : le corps est inchangé, seul son emplacement a bougé.
 */
import { useImperativeHandle, type ForwardedRef } from "react";
import type { Editor } from "@tiptap/react";
import type { MarkdownEditorHandle } from "../editorTypes";
import { findCoverZoneAround, coverZoneIndexAt, extractCoverZoneMarkdown } from "../extensions/CoverZone";
import { askLinkUrl, askBookmarkName, askCrossReference } from "../../dialogs/prompts";
import { DOMParser as ProseMirrorDOMParser, Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { getActiveBlockStyle, getActiveMarks, getActiveAlign, getActiveListType, getInsideToc, findMatchesInDoc, getMermaidAtSelection, getCoverZoneAtSelection, getMathAtSelection, currentTextColor, currentFontFamily } from "../editorQueries";
import { applyToSelectedCells, clearSelectedCellContents, applyBorderPreset, getSelectionShape, setGridLineBorder, readGridBorderState } from "../editorTableOps";
import { FONT_SIZE_STEPS, currentFontSizePt, nextCase, copyEditorSelection, cutEditorSelection, pasteIntoEditor, slugifyBookmark, escapeHtmlText, headerFooterTargetNearViewport, revealInViewport } from "../editorUtils";
import type { EditorRefs } from "./editorRefs";

export function useEditorHandle({ editor, cmd, selectMathNodeBeforeCursor, forwardedRef, refs }: {
  editor: Editor;
  cmd: () => Editor;
  selectMathNodeBeforeCursor: () => void;
  forwardedRef: ForwardedRef<MarkdownEditorHandle>;
  refs: EditorRefs;
}) {
  const { canvasRef, pageCountRef, currentPageRef, scrollSelectionIntoViewRef, startHeaderFooterEditRef, insertHeaderFooterVariableRef, startMathEditRef, headerFooterCommitRef, headerFooterModeRef, mathEditRef, pendingMathLatexRef, loadedContentRef } = refs;

  useImperativeHandle(forwardedRef, () => ({
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
}
