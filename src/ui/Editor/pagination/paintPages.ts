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
import { createCloneIndex, indexCloneBlock, type CloneIndex } from "./cloneIndex";

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

/** Position ProseMirror du nœud source, posée sur chaque clone
 *  (résolution clic/curseur — voir resolveClickPosition.ts). */
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
/** Poignée de largeur de colonne : position de la table source. */
export const COL_RESIZE_TABLE_POS_ATTR = "data-resize-table-pos";
/** Poignée de largeur de colonne : index de la colonne. */
export const COL_RESIZE_COL_INDEX_ATTR = "data-resize-col-index";
/** Même principe pour la hauteur de LIGNE (voir `TableRowStyle.ts` pour
 * l'attribut, `applyRowHeight` dans `MarkdownEditor.tsx` pour l'écriture). */
export const ROW_RESIZE_HANDLE_CLASS = "xmd-row-resize-handle";
/** Poignée de hauteur de ligne : position de la table source. */
export const ROW_RESIZE_TABLE_POS_ATTR = "data-resize-table-pos";
/** Poignée de hauteur de ligne : index de la ligne. */
export const ROW_RESIZE_ROW_INDEX_ATTR = "data-resize-row-index";
/** Porte le modèle BRUT (avec variables `{{page}}` non résolues) — permet à
 * l'édition en place (voir MarkdownEditor.tsx) de retrouver le texte à
 * éditer plutôt que sa version déjà substituée pour l'affichage. */
export const HEADER_TEMPLATE_ATTR = "data-header-template";
/** Gabarit d'en-tête/pied peint sur chaque page. */
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

/** Paramètres d'un repaint : éditeur, conteneur, mise en page, zoom, index. */
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

/** Résultat d'un repaint : pages peintes, hauteur totale, index à jour. */
export interface PaintResult {
  pageCount: number;
  /** Index des clones peints (voir cloneIndex.ts) : nœuds texte du clone
   * → position PM, cellules → plage. Représente l'INTÉGRALITÉ des clones
   * de cette passe de peinture — à transmettre à resolveClickPosition
   * pour la résolution exacte au caractère (recréé à chaque repaint). */
  cloneIndex: CloneIndex;
}

/** Un item de liste APLATI — sa propre "ligne" (sans ses éventuels
 * descendants imbriqués, comptés comme des entrées séparées), sa position
 * ProseMirror, sa profondeur d'imbrication (0 = liste de premier niveau), et
 * la liste DOM d'origine qui le contient directement (pour en cloner les
 * attributs — classe, `data-tight`, `data-type="taskList"`… — lors de la
 * reconstruction, voir `buildNestedFragment`). Voir `LIST_NODE_NAMES`. */
interface TocFlatEntry {
  pos: number;
  ownDom: HTMLElement;
  depth: number;
  parentListDom: HTMLElement;
}

/** Aplatit RÉCURSIVEMENT une liste (potentiellement imbriquée sur plusieurs
 * niveaux — un sommaire généré avec plusieurs niveaux de titres l'est
 * presque toujours, voir TocMarker.ts) en une séquence plate d'entrées dans
 * l'ordre du document, chacune ne portant que SA PROPRE ligne (le premier
 * enfant de son `listItem` — un paragraphe ou un titre — jamais sa
 * sous-liste imbriquée, comptée séparément). C'est cette granularité fine
 * qui permet de couper la pagination ENTRE deux entrées À N'IMPORTE QUEL
 * NIVEAU d'imbrication, pas seulement entre deux items de premier niveau —
 * correctif du 2026-10-20 : un sommaire avec un seul titre de niveau 1 (donc
 * un seul item de PREMIER niveau, contenant tout le reste imbriqué dedans)
 * ne pouvait auparavant jamais être coupé entre deux pages (rien à couper
 * ENTRE un item unique), débordant comme un bloc non divisible — remonté
 * par l'utilisateur ("la suite se retrouve en fin de document"). */
function flattenListEntries(listNode: any, listPos: number, listDom: HTMLElement, depth: number, out: TocFlatEntry[]): void {
  const domChildren = Array.from(listDom.children) as HTMLElement[];
  let i = 0;
  listNode.forEach((itemNode: any, relOffset: number) => {
    const liDom = domChildren[i];
    i++;
    if (!(liDom instanceof HTMLElement)) return;
    const itemPos = listPos + 1 + relOffset;
    const ownDom =
      (liDom.querySelector(":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6") as HTMLElement | null) ??
      liDom;
    out.push({ pos: itemPos, ownDom, depth, parentListDom: listDom });

    // Sous-liste imbriquée éventuelle (titres de niveau suivant) : un
    // `listItem` de sommaire n'a jamais qu'UNE sous-liste directe (pas
    // plusieurs), donc on garde la dernière trouvée sans boucle compliquée.
    let nestedListNode: any = null;
    let nestedRelOffset = 0;
    itemNode.forEach((child: any, childOffset: number) => {
      if (LIST_NODE_NAMES.has(child.type.name)) {
        nestedListNode = child;
        nestedRelOffset = childOffset;
      }
    });
    if (nestedListNode) {
      const nestedDom = liDom.querySelector(":scope > ul, :scope > ol") as HTMLElement | null;
      if (nestedDom) {
        flattenListEntries(nestedListNode, itemPos + 1 + nestedRelOffset, nestedDom, depth + 1, out);
      }
    }
  });
}

/** Reconstruit une structure `<ul>`/`<ol>` imbriquée à partir d'une
 * séquence plate d'entrées (voir `flattenListEntries`) — l'inverse de
 * l'aplatissement, appliqué aux SEULES entrées qui reviennent à UNE page.
 * Fonctionne même si le fragment commence à une profondeur > 0 (la coupure
 * tombe en plein milieu d'une sous-liste imbriquée) : les niveaux
 * intermédiaires manquants sont recréés comme de simples `<ul>` sans `<li>`
 * propre sur cette page (juste des conteneurs d'indentation), pour que le
 * niveau visuel reste correct même sans l'item parent visible ici. */
function buildNestedFragment(entries: TocFlatEntry[]): HTMLElement {
  const root = entries[0].parentListDom.cloneNode(false) as HTMLElement;
  const uls: HTMLElement[] = [root];
  const lastLi: (HTMLElement | null)[] = [null];
  for (const entry of entries) {
    const d = entry.depth;
    while (uls.length <= d) {
      const newDepth = uls.length;
      const parentLi = lastLi[newDepth - 1];
      const templateDom = newDepth === d ? entry.parentListDom : uls[uls.length - 1];
      const nestedWrapper = templateDom.cloneNode(false) as HTMLElement;
      if (parentLi) parentLi.appendChild(nestedWrapper);
      else uls[newDepth - 1].appendChild(nestedWrapper);
      uls.push(nestedWrapper);
      lastLi.push(null);
    }
    // Remonte à une profondeur moins profonde : referme les niveaux plus
    // profonds ouverts précédemment (deviennent invalides pour la suite).
    uls.length = d + 1;
    lastLi.length = d + 1;

    const li = document.createElement("li");
    li.appendChild(entry.ownDom.cloneNode(true) as HTMLElement);
    li.setAttribute(SRC_POS_ATTR, String(entry.pos));
    uls[d].appendChild(li);
    lastLi[d] = li;
  }
  return root;
}

type PageBlockEntry =
  | { kind: "node"; pos: number; dom: HTMLElement }
  | { kind: "listItems"; items: TocFlatEntry[] }
  | { kind: "tableRows"; tableDom: HTMLElement; rows: TableRowRef[] };

/** Une ligne de tableau ORIGINALE (dans l'éditeur invisible) : sa position
 * ProseMirror, son `<tr>` et sa hauteur mesurée. */
interface TableRowRef {
  pos: number;
  dom: HTMLElement;
  height: number;
}

/** Découpe un tableau PLUS HAUT QU'UNE PAGE ENTIÈRE en "unités" de lignes
 * (une unité = une ligne, ou plusieurs lignes liées par un `rowspan` — on ne
 * coupe jamais à l'intérieur d'une cellule fusionnée verticalement).
 * Retourne `null` pour tout tableau qui tient sur une page : il reste alors
 * un bloc atomique, peint et déplacé en entier comme avant (comportement
 * historique, évite de couper un tableau qui n'en a pas besoin).
 * Correctif du 2026-10-20 : un tableau plus haut qu'une page débordait de sa
 * page (recouvrait le pied de page, lignes rognées) faute de pouvoir être
 * réparti — même technique que les listes (`flattenListEntries`), à
 * l'échelle de la ligne `<tr>`. */
function planTableSplit(node: any, offset: number, nodeDom: HTMLElement, contentHeightPx: number): TableRowRef[][] | null {
  const table = nodeDom.matches("table") ? nodeDom : nodeDom.querySelector("table");
  if (!table) return null;
  const rowDoms = Array.from(table.querySelectorAll(":scope > tbody > tr, :scope > tr")) as HTMLElement[];
  if (rowDoms.length < 2 || rowDoms.length !== node.childCount) return null;
  if (nodeDom.getBoundingClientRect().height <= contentHeightPx) return null;

  const rows: TableRowRef[] = [];
  const reach: number[] = [];
  node.forEach((rowNode: any, rel: number, i: number) => {
    let r = i + 1;
    rowNode.forEach((cell: any) => {
      r = Math.max(r, i + (cell.attrs?.rowspan || 1));
    });
    reach.push(r);
    rows.push({ pos: offset + 1 + rel, dom: rowDoms[i], height: rowDoms[i].getBoundingClientRect().height });
  });

  const units: TableRowRef[][] = [];
  let i = 0;
  while (i < rows.length) {
    let end = reach[i];
    for (let j = i + 1; j < end && j < rows.length; j++) end = Math.max(end, reach[j]);
    end = Math.min(end, rows.length);
    units.push(rows.slice(i, end));
    i = end;
  }
  return units;
}

/** Reconstruit un fragment de tableau (wrapper Tiptap + `<table>` +
 * `<colgroup>` + `<tbody>`) ne contenant que `rows`. Les largeurs de colonnes
 * sont FIGÉES (`table-layout: fixed`, largeurs mesurées sur l'original) :
 * en layout automatique, la largeur des colonnes dépendrait des SEULES
 * lignes présentes dans le fragment, donc différerait d'une page à l'autre
 * et des hauteurs mesurées. Chaque `<tr>` cloné porte SON PROPRE
 * `SRC_POS_ATTR` (comme les `<li>` des listes) : la résolution de clic, le
 * curseur et la sélection fonctionnent ligne par ligne. */
function buildTableFragment(
  tableDom: HTMLElement,
  rows: TableRowRef[],
  onRowCloned?: (original: HTMLElement, clone: HTMLElement) => void,
): HTMLElement {
  const originalTable = (tableDom.matches("table") ? tableDom : tableDom.querySelector("table")) as HTMLElement;
  const table = originalTable.cloneNode(false) as HTMLElement;
  const cols = Array.from(originalTable.querySelectorAll(":scope > colgroup > col")) as HTMLElement[];
  if (cols.length > 0) {
    const colgroup = document.createElement("colgroup");
    for (const c of cols) {
      const col = c.cloneNode(false) as HTMLElement;
      col.style.width = `${c.getBoundingClientRect().width}px`;
      colgroup.appendChild(col);
    }
    table.appendChild(colgroup);
    const w = `${originalTable.getBoundingClientRect().width}px`;
    table.style.tableLayout = "fixed";
    table.style.width = w;
    table.style.minWidth = w;
  }
  const originalBody = originalTable.querySelector(":scope > tbody");
  const body = originalBody ? (originalBody.cloneNode(false) as HTMLElement) : document.createElement("tbody");
  for (const row of rows) {
    const tr = row.dom.cloneNode(true) as HTMLElement;
    tr.setAttribute(SRC_POS_ATTR, String(row.pos));
    onRowCloned?.(row.dom, tr);
    body.appendChild(tr);
  }
  table.appendChild(body);
  if (tableDom.matches("table")) return table;
  const wrapper = tableDom.cloneNode(false) as HTMLElement;
  wrapper.appendChild(table);
  return wrapper;
}

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
  // Reconstruit à CHAQUE peinture (les clones sont recréés de zéro) —
  // voir cloneIndex.ts.
  const cloneIndex = createCloneIndex();
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
      const flatEntries: TocFlatEntry[] = [];
      flattenListEntries(node, offset, nodeDom, 0, flatEntries);
      if (flatEntries.length === 0) return;
      // L'espacement "avant"/"après" de la liste ENTIÈRE (ex. l'espacement
      // façon Word après un paragraphe, voir MarkdownEditor.css) ne porte
      // que sur la PREMIÈRE/DERNIÈRE entrée de TOUTE la séquence aplatie
      // (tous niveaux confondus) — les entrées du milieu n'ont aucun
      // espacement entre elles (c'est la liste elle-même qui gérait déjà
      // tout l'espacement visuel interne via son padding/line-height, pas
      // un margin par item).
      const listStyle = getComputedStyle(nodeDom);
      const listSpaceBefore = parseFloat(listStyle.marginTop) || 0;
      const listSpaceAfter = parseFloat(listStyle.marginBottom) || 0;

      let pendingEntry: Extract<PageBlockEntry, { kind: "listItems" }> | null = null;
      let pendingPageIndex = -1;

      flatEntries.forEach((flatEntry, idx) => {
        const height = flatEntry.ownDom.getBoundingClientRect().height;
        const isFirstEntry = idx === 0;
        const isLastEntry = idx === flatEntries.length - 1;
        const spaceBefore = isFirstEntry ? listSpaceBefore : 0;
        const spaceAfter = isLastEntry ? listSpaceAfter : 0;
        // Un saut de page manuel juste avant la liste ne peut s'appliquer
        // qu'à sa toute première entrée (les suivantes ne font jamais
        // démarrer une nouvelle page de force).
        const placement = paginator.placeBlock(height, spaceBefore, spaceAfter, isFirstEntry && forceNextBreak);

        while (pageBlocks.length < placement.pageNumber) pageBlocks.push([]);
        const pageIndex = placement.pageNumber - 1;
        if (!pendingEntry || pendingPageIndex !== pageIndex) {
          pendingEntry = { kind: "listItems", items: [] };
          pendingPageIndex = pageIndex;
          pageBlocks[pageIndex].push(pendingEntry);
        }
        pendingEntry.items.push(flatEntry);
      });

      forceNextBreak = false;
      return;
    }

    // Tableau plus haut qu'une page : réparti ligne par ligne (voir
    // `planTableSplit`). Un tableau qui tient sur une page n'est pas concerné.
    if (node.type.name === "table") {
      const units = planTableSplit(node, offset, nodeDom, pageHeightPx - marginTopPx - marginBottomPx);
      if (units) {
        const tableStyle = getComputedStyle(nodeDom);
        const tableSpaceBefore = parseFloat(tableStyle.marginTop) || 0;
        const tableSpaceAfter = parseFloat(tableStyle.marginBottom) || 0;
        let pending: Extract<PageBlockEntry, { kind: "tableRows" }> | null = null;
        let pendingPageIndex = -1;
        units.forEach((unit, idx) => {
          const unitHeight = unit.reduce((sum, r) => sum + r.height, 0);
          const isFirst = idx === 0;
          const isLast = idx === units.length - 1;
          const placement = paginator.placeBlock(
            unitHeight,
            isFirst ? tableSpaceBefore : 0,
            isLast ? tableSpaceAfter : 0,
            isFirst && forceNextBreak,
          );
          while (pageBlocks.length < placement.pageNumber) pageBlocks.push([]);
          const pageIndex = placement.pageNumber - 1;
          if (!pending || pendingPageIndex !== pageIndex) {
            pending = { kind: "tableRows", tableDom: nodeDom, rows: [] };
            pendingPageIndex = pageIndex;
            pageBlocks[pageIndex].push(pending);
          }
          pending.rows.push(...unit);
        });
        forceNextBreak = false;
        return;
      }
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
          // Index texte/cellule du clone (résolution clic exacte au
          // caractère — voir cloneIndex.ts) : original et clone ont une
          // structure identique, on les parcourt en parallèle.
          indexCloneBlock(view, dom, clone, cloneIndex);
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
        } else if (entry.kind === "tableRows") {
          // Chaque ligne clonée est indexée (cloneIndex.ts) : clic exact au
          // caractère, comme pour un bloc entier.
          content.appendChild(
            buildTableFragment(entry.tableDom, entry.rows, (orig, clone) => indexCloneBlock(view, orig, clone, cloneIndex)),
          );
        } else {
          // Fragment de liste (voir `LIST_NODE_NAMES`/`flattenListEntries`) :
          // reconstruit une structure imbriquée pour CETTE page à partir des
          // SEULES entrées qui lui reviennent (`buildNestedFragment`),
          // préservant le niveau d'indentation même si la coupure tombe en
          // plein milieu d'une sous-liste imbriquée. Chaque `<li>` reconstruit
          // porte SON PROPRE `SRC_POS_ATTR` (pas les wrappers englobants) —
          // le reste du module (résolution de clic, curseur dessiné,
          // surbrillance de sélection) continue de fonctionner SANS
          // adaptation particulière ici.
          content.appendChild(buildNestedFragment(entry.items));
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

  return { pageCount, cloneIndex };
}
