/**
 * Édition en place de l'en-tête / du pied de page : un clic ouvre un mini-éditeur Tiptap flottant sur la zone peinte ;
 * l'insertion de variables ({{page}}…) du panneau latéral passe par insertHeaderFooterVariableRef.
 *
 * Extrait de MarkdownEditor.tsx (dette technique 0.4, 2026-10-26) : le corps est inchangé, seul son emplacement a bougé.
 */
import { type Editor } from "@tiptap/react";
import { Editor as TiptapEditor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TableMarkdown as Table } from "../extensions/TableMarkdown";
import { TableRowStyled as TableRow } from "../extensions/TableRowStyle";
import { TableCellStyled as TableCell, TableHeaderStyled as TableHeader } from "../extensions/TableCellStyle";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import { FontSize } from "../extensions/FontSize";
import { Markdown } from "tiptap-markdown";
import { ParagraphMarkdown } from "../extensions/ParagraphMarkdown";
import { HEADER_TEMPLATE_ATTR, FOOTER_TEMPLATE_ATTR } from "../pagination/paintPages";
import { getActiveBlockStyle, getActiveMarks, getActiveAlign, getActiveListType, getInsideToc, getMermaidAtSelection, getImageAtSelection, getCoverZoneAtSelection, getMathAtSelection, currentTextColor, currentFontFamily } from "../editorQueries";
import { getSelectionShape } from "../editorTableOps";
import { currentFontSizePt, headerFooterTargetNearViewport } from "../editorUtils";
import type { EditorRefs } from "./editorRefs";

export function useHeaderFooterEdit({ editor, cmd, refs }: {
  editor: Editor;
  cmd: () => Editor;
  refs: EditorRefs;
}) {
  const { canvasRef, pageCountRef, currentPageRef, layoutRef, onStatsRef, onLayoutChangeRef, repaintCaretRef, startHeaderFooterEditRef, insertHeaderFooterVariableRef, headerMiniEditorRef, headerFooterCommitRef, headerFooterModeRef } = refs;

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
        image: getImageAtSelection(editor),
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
          // Mêmes tableaux que le corps (bordures par côté, fond, largeurs) ET colonnes
          // redimensionnables à la souris : le champ d'édition est visible, le plugin natif
          // de poignées de colonnes y fonctionne (voir les règles `.xmd-hf-prosemirror` du CSS).
          Table.configure({ resizable: true }),
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
    repaintCaretRef.current(); // masque tout de suite le curseur du corps
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
      repaintCaretRef.current(); // le curseur du corps réapparaît
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
}
