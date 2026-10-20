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
import type { CloneIndex } from "./cloneIndex";

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
 *
 * `index` (2026-10-17, refonte inspirée de l'audit CasualOffice) : index
 * des clones (voir cloneIndex.ts). Présent, il offre un CHEMIN RAPIDE
 * exact au caractère : `caretRangeFromPoint` du navigateur sur le texte
 * VISIBLE du clone + position de départ du nœud texte indexé. Insensible
 * au zoom, impossible d'atterrir dans une cellule voisine (le nœud texte
 * cliqué est forcément dans la bonne cellule). Le repli géométrique
 * ci-dessus ne sert plus que pour les zones sans texte indexé (cellules
 * vides, marges de blocs, atomes rendus).
 *
 * `target` : élément réellement cliqué dans le clone — sert à borner le
 * repli à la CELLULE en cas de tableau (via index.cells), ce qui élimine
 * le « saut » de sélection inter-cellules du repli lui-même.
 */
export function resolveClickPosition(
  view: EditorView,
  clickX: number,
  clickY: number,
  clonedBlock: HTMLElement,
  zoom: number,
  index?: CloneIndex,
  target?: Element | null,
): number | null {
  const srcPosAttr = clonedBlock.getAttribute(SRC_POS_ATTR);
  if (srcPosAttr === null) return null;
  const srcPos = parseInt(srcPosAttr, 10);

  // --- Chemin rapide : position exacte au caractère sur le texte visible.
  if (index) {
    const caret = document.caretRangeFromPoint(clickX, clickY);
    const container = caret?.startContainer;
    if (caret && container && container.nodeType === Node.TEXT_NODE) {
      const textNode = container as Text;
      const start = index.text.get(textNode);
      // `clonedBlock.contains` : `caretRangeFromPoint` peut renvoyer le
      // texte du bloc VOISIN quand on clique dans un espace entre blocs —
      // on ne l'accepte que s'il appartient au bloc visé.
      if (start !== undefined && textNode.parentElement && clonedBlock.contains(textNode.parentElement)) {
        return start + caret.startOffset;
      }
    }
  }

  const original = view.nodeDOM(srcPos) as HTMLElement | null;
  if (!original || !(original instanceof HTMLElement)) return null;
  const node = view.state.doc.nodeAt(srcPos);
  if (!node) return null;

  // Bornes du balayage de repli : tout le bloc, SAUF si le clic est dans
  // une cellule de tableau dont l'index connaît la plage — la cellule est
  // alors un CONTENANT STRICT (le « saut » inter-cellules venait du
  // balayage qui considérait toutes les cellules de la ligne à égalité).
  let from = srcPos + 1;
  let to = srcPos + node.nodeSize - 1;
  if (index && target instanceof Element) {
    const cellEl = target.closest<HTMLElement>("td,th");
    if (cellEl) {
      const range = index.cells.get(cellEl);
      if (range) {
        // [from+1, to-1] : l'INTÉRIEUR de la cellule (les bornes exactes
        // désignent les balises ouvrante/fermante).
        from = Math.max(from, range.from + 1);
        to = Math.min(to, range.to - 1);
      }
    }
  }
  if (from > to) return srcPos;

  const cloneRect = clonedBlock.getBoundingClientRect();
  const originalRect = original.getBoundingClientRect();
  const relX = (clickX - cloneRect.left) / zoom;
  const relY = (clickY - cloneRect.top) / zoom;

  const targetLeft = originalRect.left + relX;
  const targetTop = originalRect.top + relY;

  return findPosNearCoords(view, from, to, targetLeft, targetTop);
}

/** Remonte depuis `target` jusqu'au clone de bloc de premier niveau le plus proche. */
export function findClonedBlock(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>(`[${SRC_POS_ATTR}]`);
}
