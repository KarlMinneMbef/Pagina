// Traduit un point cliqué dans la couche peinte (clones en lecture seule,
// voir paintPages.ts) en position réelle dans le document ProseMirror, en
// passant par le bloc ORIGINAL correspondant dans l'éditeur invisible.
//
// Principe : un clone est visuellement identique à son original (même
// largeur, donc même mise en ligne du texte) — la position RELATIVE d'un
// clic à l'intérieur du clone (distance depuis son coin haut-gauche) est
// donc exactement la même que la position relative équivalente dans
// l'original. On calcule cette position relative, on l'applique aux
// coordonnées de l'original, puis on cherche la position document dont
// `coordsAtPos` tombe le plus près.
//
// Pourquoi pas `view.posAtCoords` (l'API native de ProseMirror pour ça) :
// elle échoue silencieusement dès que l'élément est hors du viewport
// visible — quelle que soit la distance (testé de -100000px à -5000px,
// même résultat faux) — vraisemblablement parce qu'elle s'appuie en
// interne sur du hit-testing navigateur (type `elementFromPoint`), qui ne
// fonctionne QUE pour des coordonnées dans la fenêtre visible. Or l'éditeur
// invisible DOIT être hors du viewport (voir MarkdownEditor.css). Contourné
// avec `coordsAtPos` à la place (position → coordonnées, le sens inverse) :
// celui-là fonctionne très bien hors écran (déjà utilisé pour le curseur
// dessiné, voir caretPosition.ts) — on cherche donc par balayage la
// position dont les coordonnées sont les plus proches de la cible, plutôt
// que de demander au navigateur "quelle position est sous ce pixel".
import type { EditorView } from "@tiptap/pm/view";
import { SRC_POS_ATTR } from "./paintPages";

/** Position dans `[from, to]` dont `coordsAtPos` tombe le plus près de (x, y). */
function findPosNearCoords(view: EditorView, from: number, to: number, x: number, y: number): number {
  let bestPos = from;
  let bestDist = Infinity;
  for (let pos = from; pos <= to; pos++) {
    // `coordsAtPos(pos, side)` : à une frontière de ligne (ex. juste après un
    // retour à la ligne dans un bloc de code), la même position peut désigner
    // soit la fin de la ligne précédente (side -1) soit le début de la
    // suivante (side 1) — sans préciser le côté, ProseMirror choisit un seul
    // des deux arbitrairement, ce qui faisait parfois atterrir un clic en fin
    // de ligne sur la ligne d'au-dessus. On teste les deux côtés et on garde
    // le meilleur des deux pour cette position.
    for (const side of [-1, 1] as const) {
      let coords;
      try {
        coords = view.coordsAtPos(pos, side);
      } catch {
        continue;
      }
      const cy = (coords.top + coords.bottom) / 2;
      const dy = Math.abs(cy - y);
      const dx = Math.abs(coords.left - x);
      // Priorité à la bonne LIGNE (poids fort sur l'écart vertical) : sur une
      // grille de tableau, deux cellules de colonnes différentes mais de la
      // même ligne ont un `top` quasi identique — sans ce poids, un petit
      // écart horizontal pourrait faire préférer à tort une position de la
      // ligne d'au-dessus ou d'en-dessous.
      const dist = dy * 1000 + dx;
      if (dist < bestDist) {
        bestDist = dist;
        bestPos = pos;
      }
    }
  }
  return bestPos;
}

/**
 * `zoom` : le clic est capté sur la couche peinte, qui peut être zoomée
 * (`transform: scale()`) — la distance mesurée en pixels écran doit être
 * ramenée en pixels "logiques" (ceux de l'éditeur invisible, jamais zoomé)
 * avant d'être appliquée à l'original.
 */
export function resolveClickPosition(
  view: EditorView,
  clickX: number,
  clickY: number,
  clonedBlock: HTMLElement,
  zoom: number,
): number | null {
  const srcPosAttr = clonedBlock.getAttribute(SRC_POS_ATTR);
  if (srcPosAttr === null) return null;
  const srcPos = parseInt(srcPosAttr, 10);
  const original = view.nodeDOM(srcPos) as HTMLElement | null;
  if (!original || !(original instanceof HTMLElement)) return null;
  const node = view.state.doc.nodeAt(srcPos);
  if (!node) return null;

  const cloneRect = clonedBlock.getBoundingClientRect();
  const originalRect = original.getBoundingClientRect();
  const relX = (clickX - cloneRect.left) / zoom;
  const relY = (clickY - cloneRect.top) / zoom;

  const targetLeft = originalRect.left + relX;
  const targetTop = originalRect.top + relY;

  // [srcPos, srcPos + nodeSize] est l'intervalle du bloc ENTIER, ouverture
  // et fermeture comprises ; on balaie une position à l'intérieur, pas les
  // bornes exactes (qui pourraient être hors du nœud pour du contenu imbriqué).
  const from = srcPos + 1;
  const to = srcPos + node.nodeSize - 1;
  if (from > to) return srcPos;
  return findPosNearCoords(view, from, to, targetLeft, targetTop);
}

/** Remonte depuis `target` jusqu'au clone de bloc de premier niveau le plus proche. */
export function findClonedBlock(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>(`[${SRC_POS_ATTR}]`);
}
