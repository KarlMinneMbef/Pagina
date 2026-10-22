/**
 * Sélecteur de taille de tableau façon Word : une grille survolée, la
 * portion en haut à gauche du pointeur se surligne, un libellé "R × C"
 * indique la taille qui serait insérée, cliquer insère exactement cette
 * taille. Le DÉCLENCHEUR est un bouton de type A (grande icône Tableau +
 * libellé). Partagé entre le ruban (groupe « Tableau ») et le panneau
 * « En-tête/Pied de page » (tableaux dans la zone d'édition riche).
 */
import { useEffect, useRef, useState } from "react";
import { IconTable } from "./icons";
import { keepEditorFocus } from "../focusGuard";

const TABLE_PICKER_MAX_COLS = 8;
const TABLE_PICKER_MAX_ROWS = 6;

/** Grille de sélection lignes × colonnes pour créer un tableau, façon Word. */
export function TableSizePicker({
  disabled,
  onPick,
  title = "Tableau — choisir la taille dans la grille",
}: {
  disabled: boolean;
  onPick: (rows: number, cols: number) => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<{ rows: number; cols: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const closeAndReset = () => {
    setOpen(false);
    setHover(null);
  };

  return (
    <div className="tb-heading-picker" ref={rootRef}>
      <button
        type="button"
        className="tb-big-btn tb-btn-with-caret"
        disabled={disabled}
        onMouseDown={keepEditorFocus}
        onClick={() => setOpen((o) => !o)}
        title={title}
      >
        <span className="tb-big-btn-icon">
          <IconTable size={28} />
        </span>
        <span className="tb-big-btn-label">Tableau</span>
        <span className="tb-swatch-caret">▾</span>
      </button>
      {open && (
        <div className="tb-table-size-menu" onMouseLeave={() => setHover(null)}>
          <div className="tb-table-size-grid">
            {Array.from({ length: TABLE_PICKER_MAX_ROWS }, (_, r) =>
              Array.from({ length: TABLE_PICKER_MAX_COLS }, (_, c) => {
                const rows = r + 1;
                const cols = c + 1;
                const active = !!hover && rows <= hover.rows && cols <= hover.cols;
                return (
                  <button
                    key={`${rows}x${cols}`}
                    type="button"
                    className={`tb-table-size-cell${active ? " tb-table-size-cell-active" : ""}`}
                    onMouseEnter={() => setHover({ rows, cols })}
                    onClick={() => {
                      onPick(rows, cols);
                      closeAndReset();
                    }}
                  />
                );
              })
            )}
          </div>
          <div className="tb-table-size-label">
            {hover ? `${hover.rows} × ${hover.cols}` : "Taille du tableau"}
          </div>
        </div>
      )}
    </div>
  );
}
