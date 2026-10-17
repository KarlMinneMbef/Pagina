/**
 * Redimensionnement horizontal à la souris pour un panneau latéral de
 * largeur fixe (Explorateur de fichiers, panneau Tableau...) — demandé
 * explicitement par l'utilisateur, même esprit que la poignée native
 * `resize: both` déjà posée sur les dialogues modaux, mais celle-ci ne
 * convient pas ici : son coin est TOUJOURS en bas-à-droite de l'élément,
 * ce qui ne fonctionne que pour un panneau ancré à GAUCHE de l'écran (sa
 * bordure "libre" est à droite). Un panneau ancré à DROITE (panneau
 * Tableau) a sa bordure libre à GAUCHE : agrandir en tirant son coin
 * bas-droit le pousserait hors de la fenêtre au lieu de l'élargir vers
 * l'éditeur. D'où ce petit hook maison, générique via `anchor`.
 */
import { useCallback, useRef, useState } from "react";

export function useHorizontalResize(
  initialWidth: number,
  { min = 180, max = 520, anchor }: { min?: number; max?: number; anchor: "left" | "right" }
) {
  const [width, setWidth] = useState(initialWidth);
  const startRef = useRef<{ x: number; width: number } | null>(null);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startRef.current = { x: e.clientX, width };

      const onMove = (ev: MouseEvent) => {
        if (!startRef.current) return;
        const delta = ev.clientX - startRef.current.x;
        // Panneau ancré à gauche : tirer vers la droite (delta positif)
        // l'élargit. Ancré à droite : c'est l'inverse (tirer vers la
        // gauche, delta négatif, l'élargit).
        const signedDelta = anchor === "left" ? delta : -delta;
        setWidth(Math.min(max, Math.max(min, startRef.current.width + signedDelta)));
      };
      const onUp = () => {
        startRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [width, min, max, anchor]
  );

  return { width, onHandleMouseDown };
}
