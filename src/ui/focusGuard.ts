import type { MouseEvent } from "react";

/**
 * À poser sur `onMouseDown` de tout bouton/menu/panneau qui agit sur la
 * sélection de l'éditeur. Un vrai clic émet `mousedown` AVANT `click` : sans
 * ce garde, le `mousedown` retire le focus DOM à l'éditeur invisible et vide
 * la sélection avant que l'action ne s'exécute (l'action s'applique alors à
 * une sélection vide, sans effet visible).
 */
export const keepEditorFocus = (e: MouseEvent): void => e.preventDefault();
