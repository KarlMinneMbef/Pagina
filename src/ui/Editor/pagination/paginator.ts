// Moteur de pagination — technique inspirée de l'algorithme de mise en page
// de CasualOffice/docs (packages/core/src/layout-engine/paginator.ts, MIT),
// mais réécrit et très simplifié pour nos besoins : une seule colonne, une
// seule section, pas d'en-tête/pied de page pour l'instant. Contrairement à
// leur version, celle-ci ne connaît RIEN au format .docx — elle ne prend en
// entrée que des hauteurs de blocs, ce qui la rend directement utilisable sur
// n'importe quel document (ici, les blocs de premier niveau de notre document
// ProseMirror).
//
// Remplace l'ancien système de recherche par dichotomie sur les coordonnées
// écran (`findPosNearY`/`snapToBlockStart` dans MarkdownEditor.tsx) : au lieu
// de chercher après coup où couper dans un flux déjà rendu, on avance un
// curseur bloc par bloc, comme le ferait un vrai moteur de mise en page.

export interface PageMargins {
  top: number;
  bottom: number;
}

export interface PaginatorOptions {
  /** Hauteur totale d'une page (mm convertis en px), marges incluses. */
  pageHeight: number;
  margins: PageMargins;
}

export interface BlockPlacement {
  /** Numéro de page (1-indexé), comme dans Word. */
  pageNumber: number;
  /** Vrai si ce bloc est le premier de sa page (donc juste après une coupure). */
  startsNewPage: boolean;
  /**
   * Espace non utilisé au bas de la page PRÉCÉDENTE, seulement quand
   * `startsNewPage` est vrai suite à une coupure naturelle (pas un saut de
   * page manuel) — c'est le trou à ajouter pour que cette page précédente
   * fasse quand même une hauteur pleine, comme les autres.
   */
  previousPageLeftover: number;
}

interface PageState {
  pageNumber: number;
  /**
   * Hauteur de ZONE DE CONTENU déjà consommée sur cette page, à partir de 0.
   * Volontairement PAS mesurée à partir du haut de la page (0 ≠ le haut
   * visuel de la feuille) : dans le rendu, les marges de haut/bas de chaque
   * page sont entièrement portées par le "trou" (widget de décoration) qui
   * la précède/suit (voir `createGapDecoration`) — la zone de contenu
   * elle-même n'a donc besoin de tracker que sa propre occupation, sans
   * décalage initial. Mélanger les deux (comme une première version de ce
   * fichier le faisait, en initialisant le curseur à `margins.top`) compte
   * une marge de trop par page et désynchronise la hauteur réelle des pages.
   */
  cursorY: number;
  trailingSpacing: number;
}

/**
 * Machine à états qui place des blocs les uns après les autres sur des
 * pages de hauteur fixe, en gérant le cumul d'espacement façon Word (l'espace
 * "après" d'un bloc s'additionne à l'espace "avant" du suivant, il ne se
 * contente pas du plus grand des deux comme le ferait un margin-collapse CSS).
 */
export function createPaginator({ pageHeight, margins }: PaginatorOptions) {
  const contentHeight = pageHeight - margins.top - margins.bottom;
  if (contentHeight <= 0) {
    throw new Error("createPaginator: la hauteur de page et les marges ne laissent aucune place au contenu");
  }

  const pages: PageState[] = [];

  function newPage(): PageState {
    const state: PageState = {
      pageNumber: pages.length + 1,
      cursorY: 0,
      trailingSpacing: 0,
    };
    pages.push(state);
    return state;
  }

  function current(): PageState {
    return pages.length > 0 ? pages[pages.length - 1] : newPage();
  }

  /**
   * Place un bloc de la hauteur donnée. `forceBreakBefore` correspond à un
   * saut de page manuel (`<!-- pagebreak -->`) : la page est toujours
   * terminée avant ce bloc, même s'il restait de la place.
   */
  function placeBlock(height: number, spaceBefore: number, spaceAfter: number, forceBreakBefore: boolean): BlockPlacement {
    let state = current();
    let startsNewPage = false;
    let previousPageLeftover = 0;

    if (forceBreakBefore && !(state.cursorY === 0 && state.trailingSpacing === 0)) {
      // Saut manuel : comme dans Word, la page qui se termine reste quand
      // même affichée pleine hauteur (l'espace restant est simplement vide) —
      // on compense donc exactement comme pour une coupure naturelle.
      // Idempotent : pas de nouvelle page si celle-ci est déjà vide.
      previousPageLeftover = contentHeight - state.cursorY;
      state = newPage();
      startsNewPage = true;
    }

    const effectiveSpaceBefore = spaceBefore + state.trailingSpacing;
    const totalHeight = effectiveSpaceBefore + height;
    const safeHeight = Number.isFinite(totalHeight) && totalHeight > 0 ? totalHeight : 0;
    const available = contentHeight - state.cursorY;

    if (safeHeight > available && state.cursorY !== 0) {
      // Ne tient pas sur cette page (et la page n'est pas vide) : coupure
      // naturelle. On compense pour que la page qui se termine fasse quand
      // même une hauteur pleine (comme les autres, façon Word).
      previousPageLeftover = contentHeight - state.cursorY;
      state = newPage();
      startsNewPage = true;
    }
    // Si le bloc est plus grand qu'une page entière même vide, on le place
    // quand même en overflow plutôt que de boucler indéfiniment.

    state.cursorY += effectiveSpaceBefore + height;
    state.trailingSpacing = spaceAfter;

    return { pageNumber: state.pageNumber, startsNewPage, previousPageLeftover };
  }

  return {
    placeBlock,
    get pageCount() {
      return Math.max(pages.length, 1);
    },
  };
}
