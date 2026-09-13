// Répartit les blocs de premier niveau du document en pages de hauteur FIXE
// (jamais recalculée après coup) et peint des CLONES en lecture seule de
// leur DOM déjà rendu dans des boîtes de taille constante.
//
// Pourquoi des clones plutôt que d'éditer directement dans ces boîtes :
// ProseMirror gère lui-même le DOM de sa zone éditable (la "vraie" zone,
// invisible — voir `xmd-live-editor-host` dans MarkdownEditor.tsx) ; si on
// déplaçait ces nœuds au lieu de les cloner, on casserait son suivi interne
// DOM ↔ document. Les boîtes visibles ici ne sont donc jamais éditées
// directement : les clics dessus sont traduits en position réelle dans
// l'éditeur invisible (voir `resolveClickPosition.ts`), qui reste la seule
// source de vérité éditable — undo/redo, sélection, IME, etc. restent 100%
// natifs à ProseMirror, seul l'AFFICHAGE est repeint ici.
//
// Cette technique (éditeur invisible + couche peinte à taille fixe) est
// celle qu'utilise CasualOffice/docs (voir leur `PagedEditor.tsx` /
// `layout-painter/`) — on s'en inspire pour la technique, pas pour le code :
// notre version ne fait qu'une chose (peindre des blocs clonés dans des
// boîtes A4 fixes), pas la mise en page fine ligne par ligne qu'ils font.
import type { EditorView } from "@tiptap/pm/view";
import { createPaginator } from "./paginator";
import { resolveHeaderFooterText, type HeaderFooterSettings, type HeaderFooterContext } from "../../../core/pageLayout";
import { uniqueHeadingSlug } from "./slug";

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

export const SRC_POS_ATTR = "data-src-pos";
/** Porte le modèle BRUT (avec variables `{{page}}` non résolues) — permet à
 * l'édition en place (voir MarkdownEditor.tsx) de retrouver le texte à
 * éditer plutôt que sa version déjà substituée pour l'affichage. */
export const HEADER_TEMPLATE_ATTR = "data-header-template";
export const FOOTER_TEMPLATE_ATTR = "data-footer-template";

export interface PaintPagesOptions {
  pageHeightPx: number;
  marginTopPx: number;
  marginBottomPx: number;
  header: HeaderFooterSettings;
  footer: HeaderFooterSettings;
  /** Tout le contexte de substitution des variables SAUF `page`/`pages`,
   * qui dépendent de la page en cours de peinture — calculés ici. */
  context: Omit<HeaderFooterContext, "page" | "pages">;
}

export interface PaintResult {
  pageCount: number;
}

/**
 * Mesure chaque bloc de premier niveau du document (dans `view`, l'éditeur
 * invisible), décide sur quelle page il tombe (voir `paginator.ts`), et
 * reconstruit entièrement le contenu de `canvas` : une boîte `.xmd-page` par
 * page, hauteur CSS fixe, contenant des clones des blocs qui lui reviennent.
 */
export function paintPages(view: EditorView, canvas: HTMLElement, options: PaintPagesOptions): PaintResult {
  const { pageHeightPx, marginTopPx, marginBottomPx, header, footer, context } = options;
  const paginator = createPaginator({
    pageHeight: pageHeightPx,
    margins: { top: marginTopPx, bottom: marginBottomPx },
  });

  const pageBlocks: { pos: number; dom: HTMLElement }[][] = [[]];
  let forceNextBreak = false;

  view.state.doc.forEach((node, offset) => {
    const nodeDom = view.nodeDOM(offset) as HTMLElement | null;
    if (!nodeDom || !(nodeDom instanceof HTMLElement)) return;

    // Précision sub-pixel (voir CLAUDE.md : `.offsetHeight` arrondit à
    // l'entier, l'erreur s'accumule sur 20+ blocs et désynchronise la
    // hauteur réelle des pages). PAS de division par le zoom ici : `nodeDom`
    // vit dans `.xmd-live-editor-host`, l'éditeur invisible, qui n'est
    // JAMAIS affecté par `transform: scale()` (seule `.xmd-page-canvas`, la
    // couche peinte séparée, porte ce transform) — sa mesure est déjà en
    // pixels "logiques", zoom-indépendante par construction.
    const height = nodeDom.getBoundingClientRect().height;
    const style = getComputedStyle(nodeDom);
    const spaceBefore = parseFloat(style.marginTop) || 0;
    const spaceAfter = parseFloat(style.marginBottom) || 0;

    const placement = paginator.placeBlock(height, spaceBefore, spaceAfter, forceNextBreak);
    forceNextBreak = node.type.name === "pageBreak";

    while (pageBlocks.length < placement.pageNumber) pageBlocks.push([]);
    pageBlocks[placement.pageNumber - 1].push({ pos: offset, dom: nodeDom });
  });

  const pageCount = pageBlocks.length;
  // Partagé sur TOUTE la boucle (pas réinitialisé par page) : les slugs
  // doivent être uniques sur l'ensemble du document, comme sur GitHub — et
  // calculés dans le même ordre que `TocMarker.ts` (`collectHeadings`) pour
  // que les liens du sommaire pointent vers le bon `id`.
  const usedSlugs = new Set<string>();

  canvas.replaceChildren(
    ...pageBlocks.map((blocks, index) => {
      const pageNumber = index + 1;
      const isFirstPage = index === 0;
      const page = document.createElement("div");
      page.className = "xmd-page";

      const fullContext: HeaderFooterContext = { ...context, page: pageNumber, pages: pageCount };

      // Toujours peint dès que la page l'autorise, MÊME SI le texte est
      // vide — sinon il n'existe tout simplement rien à cliquer pour
      // commencer à taper un en-tête (piège vécu : impossible de cliquer
      // sur "rien"). Un en-tête/pied de page vide reste invisible en
      // fonctionnement normal (pas de bordure ni de fond) ; seule une
      // info-bulle au survol invite à cliquer (voir MarkdownEditor.css).
      if (header.showOnFirstPage || !isFirstPage) {
        const headerEl = document.createElement("div");
        headerEl.className = "xmd-page-header";
        headerEl.textContent = resolveHeaderFooterText(header.text, fullContext);
        headerEl.setAttribute(HEADER_TEMPLATE_ATTR, header.text);
        headerEl.title = "Cliquer pour modifier l'en-tête";
        page.appendChild(headerEl);
      }

      const content = document.createElement("div");
      // "xmd-prosemirror" en plus de "xmd-page-content" : les règles CSS de
      // mise en forme (p, table, listes de tâches...) ciblent cette classe,
      // partagée avec la vraie zone éditable invisible — sans ça, les
      // clones perdraient tout leur style puisqu'ils ne sont plus
      // descendants du `.xmd-prosemirror` original.
      content.className = "xmd-page-content xmd-prosemirror";
      for (const { pos, dom } of blocks) {
        const clone = dom.cloneNode(true) as HTMLElement;
        clone.setAttribute(SRC_POS_ATTR, String(pos));
        // `id` posé sur chaque titre peint pour que les liens du sommaire
        // (voir TocMarker.ts, `generateToc`) puissent y sauter — voir
        // slug.ts pour l'algorithme, partagé entre les deux fichiers.
        const headingEl = clone.matches(HEADING_SELECTOR) ? clone : clone.querySelector(HEADING_SELECTOR);
        if (headingEl) {
          headingEl.id = uniqueHeadingSlug(headingEl.textContent ?? "", usedSlugs);
        }
        content.appendChild(clone);
      }
      page.appendChild(content);

      if (footer.showOnFirstPage || !isFirstPage) {
        const footerEl = document.createElement("div");
        footerEl.className = "xmd-page-footer";
        footerEl.textContent = resolveHeaderFooterText(footer.text, fullContext);
        footerEl.setAttribute(FOOTER_TEMPLATE_ATTR, footer.text);
        footerEl.title = "Cliquer pour modifier le pied de page";
        page.appendChild(footerEl);
      }

      return page;
    }),
  );

  return { pageCount };
}
