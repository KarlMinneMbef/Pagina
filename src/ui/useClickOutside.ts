import { useEffect, type RefObject } from "react";

/**
 * Appelle `onClose` quand un `mousedown` tombe hors de l'élément `ref`, tant
 * que `open` est vrai. Sert aux menus/popovers du ruban et aux sélecteurs.
 */
export function useClickOutside(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
    // `onClose` volontairement hors dépendances : les appelants passent une
    // fermeture inline (nouvelle à chaque rendu) et l'écouteur ne doit être
    // posé qu'à l'ouverture/fermeture du menu.
  }, [open, ref]);
}
