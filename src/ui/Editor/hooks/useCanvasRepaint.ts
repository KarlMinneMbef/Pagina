/**
 * Couche peinte : repaint() reconstruit les pages (paintPages.ts), replace le curseur et la sélection dessinés, pousse les statistiques au ruban ;
 * rappelé à chaque changement de document, de mise en page ou de zoom.
 *
 * Extrait de MarkdownEditor.tsx (dette technique 0.4, 2026-10-26) : le corps est inchangé, seul son emplacement a bougé.
 */
import type { Editor } from "@tiptap/core";
import { useEffect } from "react";
import { setTocMaxLevel } from "../extensions/TocMarker";
import { setMermaidRenderedCallback } from "../extensions/MermaidDiagram";
import { setCoverRenderProviders, refreshAllCoverPages } from "../extensions/CoverPage";
import { setDocFieldContext, refreshAllDocFields } from "../extensions/DocField";
import { applyHeadingNumbering } from "../extensions/HeadingAutoNumber";
import { paintPages } from "../pagination/paintPages";
import { computeCaretScreenPosition } from "../pagination/caretPosition";
import { computeSelectionRects } from "../pagination/selectionHighlight";
import { formatTodayForHeaderFooter, type PageLayoutSettings } from "../../../core/pageLayout";
import { getActiveBlockStyle, getActiveMarks, getActiveAlign, getActiveListType, getInsideToc, getMermaidAtSelection, getCoverZoneAtSelection, getMathAtSelection, currentTextColor, currentFontFamily } from "../editorQueries";
import { getSelectionShape } from "../editorTableOps";
import { currentFontSizePt } from "../editorUtils";
import type { EditorRefs } from "./editorRefs";

export function useCanvasRepaint({ editor, geometry, layout, zoom, cmd, refs }: {
  editor: Editor;
  geometry: { pageHeightPx: number; marginTopPx: number; marginBottomPx: number; contentWidthPx: number };
  layout: PageLayoutSettings;
  zoom: number;
  cmd: () => Editor;
  refs: EditorRefs;
}) {
  const { canvasRef, caretRef, selectionLayerRef, liveHostRef, pageCountRef, currentPageRef, zoomRef, layoutRef, documentTitleRef, onStatsRef, repaintRef, repaintCaretRef, selBarSyncRef, codeLangSyncRef, headerMiniEditorRef, headerFooterModeRef, cloneIndexRef } = refs;

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

      // Un champ d'en-tête/pied de page est en cours d'édition : c'est LUI qui porte le curseur. Celui
      // du corps (copie peinte de l'ancienne sélection) est masqué — sinon deux curseurs s'affichent
      // en même temps (bug du 2026-10-26).
      if (headerMiniEditorRef.current) {
        caret.style.display = "none";
        selectionLayer?.replaceChildren();
        return;
      }

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
    // Profondeur des sommaires générés (style du sommaire).
    setTocMaxLevel(layout.toc.maxLevel);
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
        pageBorder: layout.pageBorder,
        tocPageNumbers: layout.toc.pageNumbers,
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
}
