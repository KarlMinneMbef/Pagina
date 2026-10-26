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


import { useEffect, forwardRef, useRef, useMemo, useState, type CSSProperties } from "react";
import { migrateCoverMarkdown } from "./extensions/CoverZone";

import { buildEditorExtensions } from "./editorExtensions";
import { syncAssetUrls } from "./assetUrls";
import { imageFilesFromTransfer, insertImageFiles, isPureImagePaste, type AddImage } from "./imageInsert";
import type { XmdAsset } from "../../core/xmd/container";
import type { EditorRefs } from "./hooks/editorRefs";
import { useCanvasRepaint } from "./hooks/useCanvasRepaint";
import { useHeaderFooterEdit } from "./hooks/useHeaderFooterEdit";
import { useMathEdit } from "./hooks/useMathEdit";
import { useCanvasMouse, type TableContextMenuState } from "./hooks/useCanvasMouse";
import { useEditorHandle } from "./hooks/useEditorHandle";
import { useViewportTracking } from "./hooks/useViewportTracking";
import { TableContextMenu } from "./TableContextMenu";


import { HorizontalRuler, VerticalRuler } from "./pagination/Ruler";
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
import { getActiveBlockStyle, getActiveMarks, getActiveAlign, getActiveListType, getInsideToc, getMermaidAtSelection, getCoverZoneAtSelection, getMathAtSelection, currentTextColor, currentFontFamily } from "./editorQueries";
import { getSelectionShape } from "./editorTableOps";
import { currentFontSizePt, mmToPx } from "./editorUtils";
import { useCodeLangChip } from "./hooks/useCodeLangChip";
import { useSelectionBarSync } from "./hooks/useSelectionBarSync";

export type { FindReplaceOptions, FindMatchResult, MarkdownEditorHandle, EditorStats } from "./editorTypes";
import type { MarkdownEditorHandle, EditorStats } from "./editorTypes";

interface MarkdownEditorProps {
  initialContent: string;
  /** Images du document (par lien relatif) : leurs adresses d'affichage sont préparées AVANT la création de l'éditeur. */
  assets?: Record<string, XmdAsset>;
  /** Range une image dans le document et renvoie son lien relatif (voir imageInsert.ts). */
  onAddImage?: AddImage;
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
  ({ initialContent, onChange, onBaseline, assets, onAddImage, onSaveRequest, onStats, layout, documentTitle, onLayoutChange, zoom = 1, showRulers = true, onZoomChange, readOnly = false }, ref) => {
    // Contenu initial MIGRÉ (CoverZone.ts) : un document écrit avec
    // l'ancien bloc atomique `coverPage` s'ouvre directement en zone
    // transparente + contenu normal. Idempotent sur les documents
    // récents. `loadedContentRef` doit pointer sur la MÊME chaîne que
    // celle posée dans l'éditeur, sinon l'effet de synchronisation
    // ci-dessous rappellerait `setContent` avec le contenu BRUT et
    // détruirait la migration.
    const initialContentMigrated = useMemo(() => migrateCoverMarkdown(initialContent), [initialContent]);
    // Adresses d'affichage des images : prêtes AVANT la création de l'éditeur (le rendu des images les consulte). Idempotent.
    useMemo(() => syncAssetUrls(assets), [assets]);
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
    const addImageRef = useRef(onAddImage);
    addImageRef.current = onAddImage;
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
      documentTitleRef, onStatsRef, onLayoutChangeRef, addImageRef, repaintRef, repaintCaretRef, selBarSyncRef, codeLangSyncRef,
      scrollSelectionIntoViewRef, startHeaderFooterEditRef, insertHeaderFooterVariableRef, startMathEditRef,
      headerMiniEditorRef, headerFooterCommitRef, headerFooterModeRef, mathEditRef, pendingMathLatexRef, cloneIndexRef,
      loadedContentRef,
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
        // Capture d'écran collée (image SEULE dans le presse-papiers) : rangée dans le document comme une image insérée.
        // Un collage mixte (page web, Word : HTML + image) reste un collage de texte.
        handlePaste: (view, event) => {
          if (!isPureImagePaste(event.clipboardData)) return false;
          event.preventDefault();
          void imageFilesFromTransfer(event.clipboardData).then((files) => insertImageFiles(view, files, addImageRef.current));
          return true;
        },
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

    useEditorHandle({ editor, cmd, selectMathNodeBeforeCursor, forwardedRef: ref, refs });

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

    useViewportTracking({ editor, cmd, layout, zoom, onZoomChange, setVRulerPeriods, refs });

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

