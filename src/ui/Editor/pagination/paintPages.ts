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

/** Types de nœuds "liste" — paginés à la granularité de leurs ITEMS (voir
 * `collectListItemUnits`) plutôt qu'en un seul bloc, pour permettre à une
 * longue liste (ex. un sommaire généré) de se couper entre deux pages au
 * lieu de déborder — correctif du 2026-10-19, remonté par l'utilisateur
 * ("dans un sommaire il déborde de la page"). Limite acceptée : la coupure
 * se fait seulement ENTRE deux items de PREMIER niveau de cette liste, pas
 * à l'intérieur d'un item ni de sa sous-liste imbriquée — un seul item
 * (avec tout son sous-arbre) plus haut qu'une page entière débordera quand
 * même, comme n'importe quel autre bloc atomique trop grand (même limite
 * déjà acceptée pour un gros tableau ou un très long paragraphe). Partagé
 * avec `selectionHighlight.ts`/`caretPosition.ts`, qui doivent reconnaître
 * exactement les mêmes types de nœuds pour chercher le bon niveau de clone. */
export const LIST_NODE_NAMES = new Set(["bulletList", "orderedList", "taskList"]);

export const SRC_POS_ATTR = "data-src-pos";
/** Poignée de redimensionnement de colonne de tableau (voir `MarkdownEditor.tsx`
 * pour le glisser-déposer réel) — technique reprise de CasualOffice/docs
 * (`layout-painter/renderTable.ts` : une poignée PEINTE directement dans la
 * couche visible à chaque frontière de colonne, pas le plugin natif
 * `ColumnResizing` de `prosemirror-tables`, qui est lié à la VRAIE zone
 * éditable — toujours invisible/hors-écran ici, la souris de l'utilisateur
 * ne la survole donc jamais). Positions mesurées sur le tableau ORIGINAL
 * (déjà attaché au document, donc mesurable) via ses éléments `<col>` —
 * fiable même avec des cellules fusionnées (`colspan`) dans d'autres
 * lignes, contrairement à mesurer juste la première ligne. */
export const COL_RESIZE_HANDLE_CLASS = "xmd-col-resize-handle";
export const COL_RESIZE_TABLE_POS_ATTR = "data-resize-table-pos";
export const COL_RESIZE_COL_INDEX_ATTR = "data-resize-col-index";
/** Même principe pour la hauteur de LIGNE (voir `TableRowStyle.ts` pour
 * l'attribut, `applyRowHeight` dans `MarkdownEditor.tsx` pour l'écriture). */
export const ROW_RESIZE_HANDLE_CLASS = "xmd-row-resize-handle";
export const ROW_RESIZE_TABLE_POS_ATTR = "data-resize-table-pos";
export const ROW_RESIZE_ROW_INDEX_ATTR = "data-resize-row-index";
/** Porte le modèle BRUT (avec variables `{{page}}` non résolues) — permet à
 * l'édition en place (voir MarkdownEditor.tsx) de retrouver le texte à
 * éditer plutôt que sa version déjà substituée pour l'affichage. */
export const HEADER_TEMPLATE_ATTR = "data-header-template";
export const FOOTER_TEMPLATE_ATTR = "data-footer-template";

/** Réglages d'en-tête/pied de page étendus pour la peinture : `text` est
 * le template MARKDOWN brut (sérialisé par le mini-éditeur — c'est lui
 * qui est stocké dans le document et exposé à la ré-édition via
 * `HEADER_TEMPLATE_ATTR`) et `html` sa traduction HTML prête à peindre
 * (calculée par l'appelant via le parseur Markdown de tiptap-markdown :
 * mises en forme, tableaux…). */
type PaintHeaderFooterSettings = HeaderFooterSettings & { html?: string };

/** Construit le contenu affiché d'une zone en-tête/pied de page : contenu
 * RICHE (`html` fourni — `innerHTML` après substitution des variables) ou
 * texte simple historique (texte substitué, AUCUN HTML interprété, jamais
 * passé par `innerHTML`). Les variables `{{page}}` etc. sont substituées
 * dans les deux cas. Retourne un élément (pas une chaîne). */
function buildHeaderFooterContent(
  settings: PaintHeaderFooterSettings,
  ctx: HeaderFooterContext,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "xmd-header-footer-content";
  if (settings.html) {
    wrap.innerHTML = resolveHeaderFooterText(settings.html, ctx);
  } else {
    wrap.textContent = resolveHeaderFooterText(settings.text, ctx);
  }
  return wrap;
}

/** Ajoute une poignée cliquable à chaque frontière de colonne du tableau
 * peint — mesure les largeurs sur `originalWrapper` (le tableau ORIGINAL,
 * déjà attaché au document invisible, donc mesurable), pose les poignées
 * dans `cloneWrapper` (la copie peinte) aux mêmes positions : les deux
 * tableaux ont une largeur de contenu identique au pixel près (garantie déjà
 * établie ailleurs dans ce module pour la résolution de clic), donc une
 * position mesurée sur l'un s'applique telle quelle à l'autre. Repose sur
 * les éléments `<col>` que `Table.configure({resizable:true})` génère déjà
 * (vérifié : `getBoundingClientRect()` y renvoie une largeur fiable dans
 * Chromium/WebView2) plutôt que sur les cellules de la première ligne, qui
 * donneraient de FAUSSES frontières dès qu'une cellule fusionnée
 * (`colspan`) apparaît ailleurs dans le tableau. */
function injectColumnResizeHandles(originalWrapper: HTMLElement, cloneWrapper: HTMLElement, tablePos: number) {
  const originalTable = originalWrapper.matches("table") ? originalWrapper : originalWrapper.querySelector("table");
  const cloneTable = cloneWrapper.matches("table") ? cloneWrapper : cloneWrapper.querySelector("table");
  if (!originalTable || !cloneTable) return;
  const cols = Array.from(originalTable.querySelectorAll(":scope > colgroup > col")) as HTMLElement[];
  if (cols.length < 2) return; // pas de frontière interne sur une seule colonne

  const tableHeight = originalTable.getBoundingClientRect().height;
  let cumulativeLeft = 0;
  for (let i = 0; i < cols.length - 1; i++) {
    cumulativeLeft += cols[i].getBoundingClientRect().width;
    const handle = document.createElement("div");
    handle.className = COL_RESIZE_HANDLE_CLASS;
    handle.style.position = "absolute";
    handle.style.left = `${cumulativeLeft - 3}px`;
    handle.style.top = "0";
    handle.style.width = "6px";
    handle.style.height = `${tableHeight}px`;
    handle.setAttribute(COL_RESIZE_TABLE_POS_ATTR, String(tablePos));
    handle.setAttribute(COL_RESIZE_COL_INDEX_ATTR, String(i));
    handle.title = "Glisser pour redimensionner la colonne";
    // Posée sur le WRAPPER (pas le <table> cloné) : c'est lui qui porte
    // `position: relative` (voir MarkdownEditor.css), le <table> n'a pas de
    // positionnement propre.
    cloneWrapper.appendChild(handle);
  }
}

/** Même principe que `injectColumnResizeHandles`, sur l'axe vertical : une
 * poignée à chaque frontière de LIGNE (entre les `<tr>` i et i+1), mesurée
 * sur les lignes du tableau ORIGINAL (déjà attaché, donc mesurable). Pas de
 * poignée après la DERNIÈRE ligne (pas de "bord inférieur extensible") —
 * même limite de périmètre que les colonnes, qui n'ont pas non plus de
 * poignée de bord droit. */
function injectRowResizeHandles(originalWrapper: HTMLElement, cloneWrapper: HTMLElement, tablePos: number) {
  const originalTable = originalWrapper.matches("table") ? originalWrapper : originalWrapper.querySelector("table");
  if (!originalTable) return;
  const rows = Array.from(originalTable.querySelectorAll(":scope > tbody > tr, :scope > tr")) as HTMLElement[];
  if (rows.length < 2) return;

  const tableWidth = originalTable.getBoundingClientRect().width;
  let cumulativeTop = 0;
  for (let i = 0; i < rows.length - 1; i++) {
    cumulativeTop += rows[i].getBoundingClientRect().height;
    const handle = document.createElement("div");
    handle.className = ROW_RESIZE_HANDLE_CLASS;
    handle.style.position = "absolute";
    handle.style.left = "0";
    handle.style.top = `${cumulativeTop - 3}px`;
    handle.style.width = `${tableWidth}px`;
    handle.style.height = "6px";
    handle.setAttribute(ROW_RESIZE_TABLE_POS_ATTR, String(tablePos));
    handle.setAttribute(ROW_RESIZE_ROW_INDEX_ATTR, String(i));
    handle.title = "Glisser pour redimensionner la ligne";
    cloneWrapper.appendChild(handle);
  }
}

export interface PaintPagesOptions {
  pageHeightPx: number;
  marginTopPx: number;
  marginBottomPx: number;
  header: PaintHeaderFooterSettings;
  footer: PaintHeaderFooterSettings;
  /** Tout le contexte de substitution des variables SAUF `page`/`pages`,
   * qui dépendent de la page en cours de peinture — calculés ici. */
  context: Omit<HeaderFooterContext, "page" | "pages">;
}

export interface PaintResult {
  pageCount: number;
}

/** Un item (listItem/taskItem) d'une liste de premier niveau, avec sa
 * position ProseMirror et son DOM réel (dans l'éditeur invisible) — voir
 * `LIST_NODE_NAMES`. */
interface ListItemUnit {
  pos: number;
  dom: HTMLElement;
}

/** Associe chaque enfant PM d'une liste à son élément DOM réel (même ordre,
 * correspondance garantie 1:1 — c'est ainsi que ProseMirror rend un nœud).
 * `listPos` est la position ABSOLUE du nœud liste lui-même (pas de son
 * contenu) — les positions des enfants s'obtiennent en ajoutant
 * `listPos + 1` (après le délimiteur d'ouverture de la liste) au décalage
 * RELATIF que `node.forEach` fournit. */
function collectListItemUnits(listNode: any, listPos: number, listDom: HTMLElement): ListItemUnit[] {
  const domChildren = Array.from(listDom.children) as HTMLElement[];
  const units: ListItemUnit[] = [];
  let i = 0;
  listNode.forEach((_child: any, relOffset: number) => {
    const dom = domChildren[i];
    i++;
    if (dom instanceof HTMLElement) units.push({ pos: listPos + 1 + relOffset, dom });
  });
  return units;
}

type PageBlockEntry =
  | { kind: "node"; pos: number; dom: HTMLElement }
  | { kind: "listItems"; listDom: HTMLElement; items: ListItemUnit[] };

/**
 * Mesure chaque bloc de premier niveau du document (dans `view`, l'éditeur
 * invisible), décide sur quelle page il tombe (voir `paginator.ts`), et
 * reconstruit entièrement le contenu de `canvas` : une boîte `.xmd-page` par
 * page, hauteur CSS fixe, contenant des clones des blocs qui lui reviennent.
 * Une liste (voir `LIST_NODE_NAMES`) est paginée item par item, pas comme un
 * seul bloc — voir le commentaire de `LIST_NODE_NAMES`.
 */
export function paintPages(view: EditorView, canvas: HTMLElement, options: PaintPagesOptions): PaintResult {
  const { pageHeightPx, marginTopPx, marginBottomPx, header, footer, context } = options;
  const paginator = createPaginator({
    pageHeight: pageHeightPx,
    margins: { top: marginTopPx, bottom: marginBottomPx },
  });

  const pageBlocks: PageBlockEntry[][] = [[]];
  let forceNextBreak = false;

  view.state.doc.forEach((node, offset) => {
    const nodeDom = view.nodeDOM(offset) as HTMLElement | null;
    if (!nodeDom || !(nodeDom instanceof HTMLElement)) return;

    if (LIST_NODE_NAMES.has(node.type.name)) {
      const items = collectListItemUnits(node, offset, nodeDom);
      if (items.length === 0) return;
      // L'espacement "avant"/"après" de la liste ENTIÈRE (ex. l'espacement
      // façon Word après un paragraphe, voir MarkdownEditor.css) ne porte
      // que sur son PREMIER/DERNIER item désormais — les items du milieu
      // n'ont aucun espacement entre eux (c'est la liste elle-même qui
      // gérait déjà tout l'espacement visuel interne via son padding/
      // line-height, pas un margin par item).
      const listStyle = getComputedStyle(nodeDom);
      const listSpaceBefore = parseFloat(listStyle.marginTop) || 0;
      const listSpaceAfter = parseFloat(listStyle.marginBottom) || 0;

      let pendingEntry: Extract<PageBlockEntry, { kind: "listItems" }> | null = null;
      let pendingPageIndex = -1;

      items.forEach((item, idx) => {
        const height = item.dom.getBoundingClientRect().height;
        const isFirstItem = idx === 0;
        const isLastItem = idx === items.length - 1;
        const spaceBefore = isFirstItem ? listSpaceBefore : 0;
        const spaceAfter = isLastItem ? listSpaceAfter : 0;
        // Un saut de page manuel juste avant la liste ne peut s'appliquer
        // qu'à son tout premier item (les suivants ne font jamais démarrer
        // une nouvelle page de force).
        const placement = paginator.placeBlock(height, spaceBefore, spaceAfter, isFirstItem && forceNextBreak);

        while (pageBlocks.length < placement.pageNumber) pageBlocks.push([]);
        const pageIndex = placement.pageNumber - 1;
        if (!pendingEntry || pendingPageIndex !== pageIndex) {
          pendingEntry = { kind: "listItems", listDom: nodeDom, items: [] };
          pendingPageIndex = pageIndex;
          pageBlocks[pageIndex].push(pendingEntry);
        }
        pendingEntry.items.push(item);
      });

      forceNextBreak = false;
      return;
    }

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
    pageBlocks[placement.pageNumber - 1].push({ kind: "node", pos: offset, dom: nodeDom });
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
        headerEl.appendChild(buildHeaderFooterContent(header, fullContext));
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
      for (const entry of blocks) {
        if (entry.kind === "node") {
          const { pos, dom } = entry;
          const clone = dom.cloneNode(true) as HTMLElement;
          clone.setAttribute(SRC_POS_ATTR, String(pos));
          // Poignées de redimensionnement colonne/ligne — uniquement si ce
          // bloc EST un tableau ; sans effet silencieusement sur tout autre
          // type de bloc.
          injectColumnResizeHandles(dom, clone, pos);
          injectRowResizeHandles(dom, clone, pos);
          // `id` posé sur chaque titre peint pour que les liens du sommaire
          // (voir TocMarker.ts, `generateToc`) puissent y sauter — voir
          // slug.ts pour l'algorithme, partagé entre les deux fichiers.
          const headingEl = clone.matches(HEADING_SELECTOR) ? clone : clone.querySelector(HEADING_SELECTOR);
          if (headingEl) {
            headingEl.id = uniqueHeadingSlug(headingEl.textContent ?? "", usedSlugs);
          }
          content.appendChild(clone);
        } else {
          // Fragment de liste (voir `LIST_NODE_NAMES`) : un wrapper neuf,
          // même balise/attributs que la liste originale (préserve puces/
          // numérotation/classe `tight`/`data-type="taskList"`…), contenant
          // les clones des SEULS items qui reviennent à CETTE page. Chaque
          // `<li>` cloné porte SON PROPRE `SRC_POS_ATTR` (pas le wrapper) —
          // le reste du module (résolution de clic, curseur dessiné,
          // surbrillance de sélection) continue de fonctionner SANS
          // adaptation particulière ici, puisqu'un item cloné correspond
          // toujours à UN SEUL nœud, exactement comme n'importe quel autre
          // bloc de premier niveau avant cette fonctionnalité.
          const wrapper = entry.listDom.cloneNode(false) as HTMLElement;
          for (const item of entry.items) {
            const liClone = item.dom.cloneNode(true) as HTMLElement;
            liClone.setAttribute(SRC_POS_ATTR, String(item.pos));
            wrapper.appendChild(liClone);
          }
          content.appendChild(wrapper);
        }
      }
      page.appendChild(content);

      if (footer.showOnFirstPage || !isFirstPage) {
        const footerEl = document.createElement("div");
        footerEl.className = "xmd-page-footer";
        footerEl.appendChild(buildHeaderFooterContent(footer, fullContext));
        footerEl.setAttribute(FOOTER_TEMPLATE_ATTR, footer.text);
        footerEl.title = "Cliquer pour modifier le pied de page";
        page.appendChild(footerEl);
      }

      return page;
    }),
  );

  return { pageCount };
}
