// Chemin inverse de resolveClickPosition.ts : calcule où dessiner le curseur
// (faux, dessiné à la main) dans la couche peinte, à partir de la vraie
// position de sélection dans l'éditeur invisible.
import type { EditorView } from "@tiptap/pm/view";
import { LIST_NODE_NAMES, SRC_POS_ATTR } from "./paintPages";

/** Position écran du curseur, recalculée à chaque repaint pour le dessiner
 *  dans la couche peinte. */
export interface CaretScreenPosition {
  left: number;
  top: number;
  height: number;
}

/**
 * `canvas` : conteneur de la couche peinte (les boîtes de page clonées).
 * Retourne des coordonnées relatives au coin haut-gauche de `canvas`
 * (adaptées à un positionnement `position: absolute` à l'intérieur), ou
 * `null` si le bloc contenant la position n'a pas (encore) de clone peint —
 * par exemple juste après une frappe, avant le prochain repeint.
 */
export function computeCaretScreenPosition(
  view: EditorView,
  canvas: HTMLElement,
  pos: number,
  zoom: number,
): CaretScreenPosition | null {
  let coords;
  try {
    coords = view.coordsAtPos(pos);
  } catch {
    return null;
  }

  // Retrouve le bloc PEINT contenant `pos`, pour savoir quel clone (identifié
  // par sa position source) chercher dans la couche peinte. Normalement le
  // bloc de PREMIER NIVEAU (depth 1) — SAUF à l'intérieur d'une liste (voir
  // `LIST_NODE_NAMES`), où c'est désormais le LISTITEM LE PLUS PROFOND
  // contenant `pos` qui porte `SRC_POS_ATTR`, pas la liste elle-même : une
  // liste imbriquée sur PLUSIEURS niveaux (ex. un sommaire généré à partir
  // d'un document n'ayant qu'un seul titre de niveau 1 — tout le reste
  // imbriqué dessous, voir `flattenListEntries`) peut être coupée entre
  // deux pages À N'IMPORTE QUEL NIVEAU, pas seulement entre deux items de
  // premier niveau — chercher spécifiquement "depth 2" ne suffit donc plus.
  const resolved = view.state.doc.resolve(pos);
  let blockPos = pos;
  if (resolved.depth >= 1) {
    const topNode = resolved.node(1);
    if (LIST_NODE_NAMES.has(topNode.type.name)) {
      let itemDepth = -1;
      for (let d = resolved.depth; d >= 2; d--) {
        const n = resolved.node(d);
        if (n.type.name === "listItem" || n.type.name === "taskItem") {
          itemDepth = d;
          break;
        }
      }
      blockPos = itemDepth >= 0 ? resolved.before(itemDepth) : resolved.before(1);
    } else {
      blockPos = resolved.before(1);
    }
  }
  let clone = canvas.querySelector<HTMLElement>(`[${SRC_POS_ATTR}="${blockPos}"]`);
  // Tableau plus haut qu'une page, peint LIGNE PAR LIGNE (voir
  // `planTableSplit` dans paintPages.ts) : c'est alors le `<tr>` qui porte
  // `SRC_POS_ATTR`, pas le tableau.
  if (!clone && resolved.depth >= 2 && resolved.node(1).type.name === "table") {
    blockPos = resolved.before(2);
    clone = canvas.querySelector<HTMLElement>(`[${SRC_POS_ATTR}="${blockPos}"]`);
  }
  if (!clone) return null;
  const originalBlock = view.nodeDOM(blockPos) as HTMLElement | null;
  if (!originalBlock || !(originalBlock instanceof HTMLElement)) return null;

  const originalRect = originalBlock.getBoundingClientRect();
  const cloneRect = clone.getBoundingClientRect();
  // Le curseur dessiné (.xmd-fake-caret) est un FRÈRE de `canvas`
  // (.xmd-page-canvas) à l'intérieur de .xmd-canvas-frame — pas un
  // descendant — donc positionné (CSS `left`/`top` en absolu) relativement
  // au coin haut-gauche du FRAME, jamais de `canvas` lui-même. Les deux
  // coïncident à zoom 100% (d'où le bug invisible jusqu'ici), mais divergent
  // dès que `transform: scale()` s'applique : `transform-origin: top center`
  // sur `.xmd-page-canvas` conserve son centre-haut fixe et l'étend
  // symétriquement de part et d'autre en largeur, donc son bord GAUCHE
  // rendu s'écarte de celui du frame de `(largeurZoomée - largeurRéelle)/2`
  // — jamais en hauteur (l'origine verticale est à 0%, le haut ne bouge
  // pas). Un décalage purement horizontal, proportionnel à l'écart avec
  // 100%, correspond exactement au bug remonté par l'utilisateur ("décalage
  // de curseur quand je fais un zoom").
  const frameRect = (canvas.parentElement as HTMLElement).getBoundingClientRect();

  // Position relative au bloc ORIGINAL (jamais zoomé), puis reportée sur le
  // clone (potentiellement zoomé) en pixels écran réels.
  const relX = coords.left - originalRect.left;
  const relTop = coords.top - originalRect.top;
  const relHeight = coords.bottom - coords.top;

  return {
    left: cloneRect.left - frameRect.left + relX * zoom,
    top: cloneRect.top - frameRect.top + relTop * zoom,
    height: relHeight * zoom,
  };
}
