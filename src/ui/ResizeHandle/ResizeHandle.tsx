import "./ResizeHandle.css";

/** Poignée de redimensionnement horizontal — voir `useHorizontalResize`.
 * `side` indique de quel BORD du panneau elle dépasse légèrement (gauche
 * pour un panneau ancré à droite, droite pour un panneau ancré à gauche),
 * pas la direction d'agrandissement (gérée par le hook via `anchor`). */
export function ResizeHandle({
  side,
  onMouseDown,
  title = "Glisser pour redimensionner",
}: {
  side: "left" | "right";
  onMouseDown: (e: React.MouseEvent) => void;
  title?: string;
}) {
  return (
    <div
      className={`rh-handle ${side === "left" ? "rh-handle-left" : "rh-handle-right"}`}
      onMouseDown={onMouseDown}
      title={title}
    />
  );
}
