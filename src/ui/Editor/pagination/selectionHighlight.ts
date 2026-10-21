// Calcule les rectangles de surbrillance d'une sélection étendue (non
// collapsed) dans la couche peinte, en réutilisant la même technique que
// caretPosition.ts (voir ce fichier pour le principe général : mesurer dans
// l'éditeur invisible ORIGINAL, puis reporter le décalage relatif sur le
// clone correspondant dans la couche peinte).
//
// Une sélection peut traverser plusieurs blocs de premier niveau (donc
// potentiellement plusieurs pages) : on la découpe d'abord bloc par bloc
// (les mêmes blocs que paintPages.ts clone un par un), puis pour chaque
// bloc on utilise `Range.getClientRects()` du navigateur — qui renvoie
// nativement un rectangle par LIGNE VISUELLE, gérant tout seul les
// retours à la ligne, ce que `coordsAtPos` ne fait pas (lui ne donne qu'un
// point, pas une étendue).
import type { EditorView } from "@tiptap/pm/view";
import type { Selection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { LIST_NODE_NAMES, SRC_POS_ATTR } from "./paintPages";

/** Rectangle de sélection à l'écran (un par ligne de texte). */
export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Index [rangée, colonne] d'une cellule au sein de son `<table>` — sert à
 * retrouver la cellule CORRESPONDANTE dans le clone peint, qui a EXACTEMENT
 * la même structure (c'est un `cloneNode(true)` du tableau entier, voir
 * `paintPages.ts`) : la position Nième ligne/Nième colonne est donc fiable,
 * même si on ne peut pas tagger chaque cellule individuellement comme les
 * blocs de premier niveau (seul le TABLEAU ENTIER porte `SRC_POS_ATTR`). */
function cellIndexPath(cell: HTMLElement): [number, number] | null {
  const row = cell.closest("tr");
  const table = cell.closest("table");
  if (!row || !table) return null;
  const rowIndex = Array.from(table.querySelectorAll("tr")).indexOf(row);
  const colIndex = Array.from(row.children).indexOf(cell);
  if (rowIndex < 0 || colIndex < 0) return null;
  return [rowIndex, colIndex];
}

/** Rectangles de surbrillance pour une `CellSelection` (glisser-sélectionner
 * un rectangle de cellules d'un tableau) — un rectangle par CELLULE ENTIÈRE,
 * pas par ligne de texte : contrairement à une sélection de texte normale,
 * `Range.getClientRects()` sur l'étendue [from,to] d'une CellSelection ne
 * fonctionne pas (cette étendue n'est qu'un englobant, les vraies cellules
 * sélectionnées peuvent être non contiguës dans le document — ex. glisser
 * verticalement dans une colonne traverse plusieurs `<tr>` séparés par du
 * texte d'AUTRES colonnes qui ne sont PAS sélectionnées) ; corrigé le
 * 2026-10-13, remonté par l'utilisateur ("j'ai du mal à sélectionner les
 * lignes et colonnes" — la sélection sous-jacente était en fait correcte,
 * seul l'AFFICHAGE en manquait la moitié). */
function computeCellSelectionRects(
  view: EditorView,
  canvas: HTMLElement,
  selection: CellSelection,
  zoom: number,
): SelectionRect[] {
  const tablePos = selection.$anchorCell.start(-1) - 1;
  // `SRC_POS_ATTR` est posé sur l'élément renvoyé par `view.nodeDOM(tablePos)`
  // — pour un tableau avec `resizable: true` (voir MarkdownEditor.tsx),
  // Tiptap enveloppe `<table>` dans un `<div class="tableWrapper">` pour les
  // poignées de redimensionnement : c'est CE DIV qui porte l'attribut, pas
  // `<table>` directement. Un sélecteur `table[...]` ne le trouvait donc
  // jamais — il faut chercher l'attribut sans restreindre la balise, puis
  // redescendre jusqu'au vrai `<table>` à l'intérieur si besoin.
  const cloneWrapper = canvas.querySelector<HTMLElement>(`[${SRC_POS_ATTR}="${tablePos}"]`);
  const cloneTable = cloneWrapper?.tagName === "TABLE" ? cloneWrapper : cloneWrapper?.querySelector<HTMLElement>("table");
  // Pas de clone du tableau entier : tableau réparti ligne par ligne (voir
  // `planTableSplit`), chaque `<tr>` porte alors son propre `SRC_POS_ATTR`.
  const splitByRows = !cloneTable;

  const frameRect = (canvas.parentElement as HTMLElement).getBoundingClientRect();
  const rects: SelectionRect[] = [];

  selection.forEachCell((_node, cellPos) => {
    const originalCell = view.nodeDOM(cellPos) as HTMLElement | null;
    if (!originalCell) return;
    const path = cellIndexPath(originalCell);
    if (!path) return;
    const [rowIndex, colIndex] = path;
    let cloneRow: Element | undefined;
    if (splitByRows) {
      const $cell = view.state.doc.resolve(cellPos);
      cloneRow = canvas.querySelector(`[${SRC_POS_ATTR}="${$cell.before($cell.depth)}"]`) ?? undefined;
    } else {
      cloneRow = cloneTable!.querySelectorAll("tr")[rowIndex];
    }
    const cloneCell = cloneRow?.children[colIndex] as HTMLElement | undefined;
    if (!cloneCell) return;
    const r = cloneCell.getBoundingClientRect();
    rects.push({
      left: r.left - frameRect.left,
      top: r.top - frameRect.top,
      width: r.width,
      height: r.height,
    });
  });

  void zoom; // Les rects du clone sont déjà à l'échelle réelle à l'écran.
  return rects;
}

/** Calcule les rectangles écran de la sélection courante dans la couche
 *  peinte (surbrillance + mini-barre de sélection). */
export function computeSelectionRects(
  view: EditorView,
  canvas: HTMLElement,
  selection: Selection,
  zoom: number,
): SelectionRect[] {
  if (selection instanceof CellSelection) {
    return computeCellSelectionRects(view, canvas, selection, zoom);
  }
  const { from, to } = selection;
  if (from >= to) return [];

  // .xmd-selection-rect est positionné dans .xmd-selection-layer, FRÈRE de
  // `canvas` (.xmd-page-canvas) dans .xmd-canvas-frame — voir le commentaire
  // détaillé dans caretPosition.ts pour pourquoi c'est le FRAME, jamais
  // `canvas` lui-même, qui doit servir d'origine (les deux coïncident à
  // zoom 100% seulement, d'où un bug resté invisible jusqu'ici).
  const frameRect = (canvas.parentElement as HTMLElement).getBoundingClientRect();
  const rects: SelectionRect[] = [];

  // Calcule les rects de surbrillance pour UN nœud peint individuellement
  // (identifié par sa propre position `offset`, qui doit correspondre à un
  // clone portant `SRC_POS_ATTR` — un bloc de premier niveau normal, OU un
  // item de liste — voir l'appel récursif plus bas pour les listes).
  const collectForNode = (node: any, offset: number) => {
    const nodeFrom = offset;
    const nodeTo = offset + node.nodeSize;
    const overlapFrom = Math.max(from, nodeFrom);
    const overlapTo = Math.min(to, nodeTo);
    if (overlapFrom >= overlapTo) return;

    // Le contenu texte d'un bloc commence après son délimiteur d'ouverture
    // et finit avant celui de fermeture (comme dans resolveClickPosition.ts).
    const contentFrom = Math.max(overlapFrom, nodeFrom + 1);
    const contentTo = Math.min(overlapTo, nodeTo - 1);
    if (contentFrom >= contentTo) return;

    const original = view.nodeDOM(offset) as HTMLElement | null;
    if (!original || !(original instanceof HTMLElement)) return;
    const clone = canvas.querySelector<HTMLElement>(`[${SRC_POS_ATTR}="${offset}"]`);
    if (!clone) return;

    let domFrom, domTo;
    try {
      domFrom = view.domAtPos(contentFrom);
      domTo = view.domAtPos(contentTo);
    } catch {
      return;
    }

    const range = document.createRange();
    try {
      range.setStart(domFrom.node, domFrom.offset);
      range.setEnd(domTo.node, domTo.offset);
    } catch {
      return;
    }

    const originalRect = original.getBoundingClientRect();
    const cloneRect = clone.getBoundingClientRect();

    for (const rect of Array.from(range.getClientRects())) {
      // Ignore les rectangles nuls (arrivent parfois en frontière de bloc).
      if (rect.width === 0 && rect.height === 0) continue;
      const relX = rect.left - originalRect.left;
      const relTop = rect.top - originalRect.top;
      rects.push({
        left: cloneRect.left - frameRect.left + relX * zoom,
        top: cloneRect.top - frameRect.top + relTop * zoom,
        width: rect.width * zoom,
        height: rect.height * zoom,
      });
    }
  };

  // Une liste (voir `LIST_NODE_NAMES`/`flattenListEntries` dans
  // `paintPages.ts`) est peinte item par item, à N'IMPORTE QUEL niveau
  // d'imbrication — `SRC_POS_ATTR` est porté par chaque `listItem`, pas par
  // la liste elle-même ni seulement ses enfants directs (un sommaire
  // généré imbrique presque toujours plusieurs niveaux de titres). Il faut
  // donc descendre RÉCURSIVEMENT dans les sous-listes, pas une seule fois.
  const collectListRecursive = (listNode: any, listOffset: number) => {
    listNode.forEach((itemNode: any, relOffset: number) => {
      const itemPos = listOffset + 1 + relOffset;
      collectForNode(itemNode, itemPos);
      itemNode.forEach((child: any, childRelOffset: number) => {
        if (LIST_NODE_NAMES.has(child.type.name)) {
          collectListRecursive(child, itemPos + 1 + childRelOffset);
        }
      });
    });
  };

  view.state.doc.forEach((node, offset) => {
    if (LIST_NODE_NAMES.has(node.type.name)) {
      collectListRecursive(node, offset);
      return;
    }
    // Tableau réparti ligne par ligne : chaque ligne est un clone à part.
    if (node.type.name === "table" && !canvas.querySelector(`[${SRC_POS_ATTR}="${offset}"]`)) {
      node.forEach((rowNode: any, rel: number) => collectForNode(rowNode, offset + 1 + rel));
      return;
    }
    collectForNode(node, offset);
  });

  return rects;
}
