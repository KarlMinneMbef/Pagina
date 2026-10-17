import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface TreeMenuAction {
  id: string;
  label: string;
  onAction: () => void;
}

/**
 * Menu contextuel de l'explorateur (clic droit sur un fichier, un dossier ou
 * le fond de l'arbre). Navigation clavier : flèches haut/bas, Entrée (le
 * bouton focalisé s'active naturellement), Échap. Se ferme au clic
 * extérieur. Le positionnement est inversé près des bords de la fenêtre
 * pour ne jamais déborder.
 */
export function TreeMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: TreeMenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  // Retournement près des bords : mesure le menu une fois rendu et le
  // décale pour qu'il tienne entièrement dans la fenêtre.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = x + r.width > window.innerWidth ? Math.max(4, x - r.width) : x;
    const top = y + r.height > window.innerHeight ? Math.max(4, y - r.height) : y;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    itemRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  const moveFocus = (delta: number) => {
    const items = itemRefs.current;
    const n = items.length;
    if (n === 0) return;
    const idx = items.findIndex((el) => el === document.activeElement);
    const next = (((idx === -1 ? 0 : idx) + delta) % n + n) % n;
    items[next]?.focus();
  };

  return (
    <div
      ref={ref}
      className="fx-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      aria-label="Actions sur l'élément"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          moveFocus(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          moveFocus(-1);
        }
      }}
    >
      {actions.map((a, i) => (
        <button
          key={a.id}
          role="menuitem"
          className="fx-menu-item"
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          onClick={() => {
            onClose();
            a.onAction();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
