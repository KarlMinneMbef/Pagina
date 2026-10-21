/**
 * Index des clones peints (2026-10-17, refonte de la résolution clic →
 * position inspirée de l'audit du paged-editor de CasualOffice — cf.
 * ROADMAP-CASUALOFFICE.md : réimplémenté sur NOTRE modèle, aucun code
 * copié).
 *
 * Problème d'origine (remonté par l'utilisateur) : `posAtCoords` échoue
 * hors viewport, donc la résolution passait par un BALAYAGE LINÉAIRE de
 * toutes les positions du bloc (`coordsAtPos` × 2 côtés par position) —
 * O(N) par événement de souris, et surtout, pour un tableau, le balayage
 * couvrait TOUTES les cellules : deux cellules d'une même ligne ont un
 * écart vertical quasi identique, c'est l'écart horizontal qui départage,
 * et le moindre écart sub-pixel faisait SAUTER la sélection dans la
 * cellule voisine (« la sélection saute »).
 *
 * Solution : les pages affichées sont des `cloneNode(true)` de l'éditeur
 * invisible — leurs nœuds texte sont en correspondance 1:1 avec les
 * originaux, DANS LE MÊME ORDRE. On parcourt donc original et clone EN
 * PARALLÈLE (TreeWalker en pas synchronisé) pour construire :
 * - `text` : chaque nœud texte du CLONE → position ProseMirror de son
 *   premier caractère (`view.posAtDOM(originalText, 0)`). La position
 *   d'un clic = start + offsetDuTexte — précision CARACTÈRE exacte,
 *   mesurée par le navigateur LUI-MÊME (`caretRangeFromPoint`) sur le
 *   texte VISIBLE (zéro traduction clone↔original, insensible au zoom).
 * - `cells` : chaque cellule (td/th) du CLONE → plage [from, to] du
 *   NŒUD cellule dans le document — borne le repli géométrique à la
 *   cellule cliquée, impossible d'atterrir dans une voisine.
 *
 * Reconstruit à CHAQUE repaint (les clones sont recréés), coût O(nœuds
 * texte) par bloc — négligeable devant le repaint lui-même, et sans
 * commune mesure avec l'ancien O(positions) PAR CLIC.
 */
import type { EditorView } from "@tiptap/pm/view";

/** Index reconstruit à chaque repaint : lien clone peint ↔ document
 *  ProseMirror (positions de texte, plages de cellules). */
export interface CloneIndex {
  /** Nœud texte du clone → position PM de son premier caractère. */
  text: Map<Text, number>;
  /** Cellule (td/th) du clone → [from, to] du nœud cellule dans le doc. */
  cells: Map<HTMLElement, { from: number; to: number }>;
}

/** Crée un index de clones vide — rempli pendant le parcours de paintPages. */
export function createCloneIndex(): CloneIndex {
  return { text: new Map(), cells: new Map() };
}

/** Indexe un bloc cloné : parcourt original et clone en parallèle (leur
 * structure est identique par construction) et remplit l'index. Les
 * échecs individuels (`posAtDOM` sur du DOM étranger : KaTeX, Mermaid…)
 * sont ignorés — ces zones retombent sur le repli géométrique. */
export function indexCloneBlock(view: EditorView, original: HTMLElement, clone: HTMLElement, index: CloneIndex): void {
  const doc = view.state.doc;

  // Nœuds texte : nœud du clone → position PM du premier caractère.
  const origTexts = document.createTreeWalker(original, NodeFilter.SHOW_TEXT);
  const cloneTexts = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  while (origTexts.nextNode() && cloneTexts.nextNode()) {
    const origNode = origTexts.currentNode as Text;
    const cloneNode = cloneTexts.currentNode as Text;
    try {
      const start = view.posAtDOM(origNode, 0);
      if (Number.isFinite(start)) index.text.set(cloneNode, start);
    } catch {
      /* DOM étranger (rendu d'atome : KaTeX, Mermaid…) — ignoré. */
    }
  }

  // Cellules : élément du clone → plage du nœud cellule dans le doc.
  const origEls = document.createTreeWalker(original, NodeFilter.SHOW_ELEMENT);
  const cloneEls = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
  while (origEls.nextNode() && cloneEls.nextNode()) {
    const origEl = origEls.currentNode as HTMLElement;
    const cloneEl = cloneEls.currentNode as HTMLElement;
    if (cloneEl.tagName !== "TD" && cloneEl.tagName !== "TH") continue;
    try {
      const inner = view.posAtDOM(origEl, 0);
      const $pos = doc.resolve(inner);
      for (let d = $pos.depth; d >= 1; d--) {
        const node = $pos.node(d);
        if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
          const from = $pos.before(d);
          index.cells.set(cloneEl, { from, to: from + node.nodeSize });
          break;
        }
      }
    } catch {
      /* Ignoré. */
    }
  }
}
