// Chemin inverse de resolveClickPosition.ts : calcule où dessiner le curseur
// (faux, dessiné à la main) dans la couche peinte, à partir de la vraie
// position de sélection dans l'éditeur invisible.
import type { EditorView } from "@tiptap/pm/view";
import { SRC_POS_ATTR } from "./paintPages";

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

  // Retrouve le bloc de premier niveau contenant `pos`, pour savoir quel
  // clone (identifié par sa position source) chercher dans la couche peinte.
  const resolved = view.state.doc.resolve(pos);
  const blockPos = resolved.depth === 0 ? pos : resolved.before(1);
  const originalBlock = view.nodeDOM(blockPos) as HTMLElement | null;
  if (!originalBlock || !(originalBlock instanceof HTMLElement)) return null;

  const clone = canvas.querySelector<HTMLElement>(`[${SRC_POS_ATTR}="${blockPos}"]`);
  if (!clone) return null;

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
