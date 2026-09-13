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
import { SRC_POS_ATTR } from "./paintPages";

export interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function computeSelectionRects(
  view: EditorView,
  canvas: HTMLElement,
  from: number,
  to: number,
  zoom: number,
): SelectionRect[] {
  if (from >= to) return [];

  // .xmd-selection-rect est positionné dans .xmd-selection-layer, FRÈRE de
  // `canvas` (.xmd-page-canvas) dans .xmd-canvas-frame — voir le commentaire
  // détaillé dans caretPosition.ts pour pourquoi c'est le FRAME, jamais
  // `canvas` lui-même, qui doit servir d'origine (les deux coïncident à
  // zoom 100% seulement, d'où un bug resté invisible jusqu'ici).
  const frameRect = (canvas.parentElement as HTMLElement).getBoundingClientRect();
  const rects: SelectionRect[] = [];

  view.state.doc.forEach((node, offset) => {
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
  });

  return rects;
}
