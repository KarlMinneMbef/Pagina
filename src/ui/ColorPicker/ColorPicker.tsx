/**
 * Sélecteur de couleur façon Word/Google Docs (demandé explicitement par
 * l'utilisateur, capture d'écran à l'appui) : "Automatique", une grille de
 * "Couleurs du thème" (couleurs de base + nuances), une rangée de
 * "Couleurs standard" fixes, et un champ "Couleur personnalisée" (hex +
 * Appliquer) — remplace les `<input type="color">` natifs utilisés jusqu'ici
 * un peu partout dans l'app (sélecteur du système d'exploitation, sans
 * cohérence visuelle avec le reste de Pagina).
 *
 * Composant générique et réutilisable : ne connaît ni Tiptap ni
 * `ToolbarActions`, uniquement `value`/`onChange` — chaque appelant décide
 * de ce que "Automatique" signifie dans son contexte (`onAutomatic`,
 * optionnel : absent, la ligne "Automatique" n'est pas affichée).
 */
import { useEffect, useRef, useState } from "react";
import { darken, isValidHex, lighten, normalizeHex } from "./colorUtils";
import "./ColorPicker.css";
import { keepEditorFocus } from "../focusGuard";

/** Couleurs de base façon thème Office — chacune décline 5 nuances
 * (2 plus claires, 1 proche, 2 plus sombres) sur les lignes suivantes. */
const THEME_BASE_COLORS = [
  "#FFFFFF", "#000000", "#E7E6E6", "#44546A",
  "#4472C4", "#A6A6A6", "#ED7D31", "#5B9BD5", "#70AD47",
];

const THEME_SHADE_FACTORS = [
  { fn: lighten, amount: 0.8 },
  { fn: lighten, amount: 0.6 },
  { fn: lighten, amount: 0.4 },
  { fn: darken, amount: 0.25 },
  { fn: darken, amount: 0.5 },
];

/** Rangée "Couleurs standard" — valeurs fixes identiques à celles de Word. */
const STANDARD_COLORS = [
  "#C00000", "#FF0000", "#FFC000", "#FFFF00", "#92D050",
  "#00B050", "#00B0F0", "#0070C0", "#002060", "#7030A0",
];

/** Nuancier de couleurs : pastilles, couleur personnalisée, mémorisation de
 *  la dernière couleur — utilisé par le ruban (texte/surlignage) et la
 *  mini-barre de sélection. */
export function ColorPicker({
  value,
  onChange,
  onAutomatic,
  automaticLabel = "Automatique",
  automaticSwatch = "#000000",
  trigger,
  triggerClassName,
  caretClassName,
  disabled,
  title,
  onApplyLast,
  applyLastTitle,
}: {
  /** Couleur actuelle (hex) — sert uniquement à présélectionner le champ
   * "Couleur personnalisée", aucune case n'est mise en évidence dans les
   * grilles (trop de nuances générées pour une comparaison fiable). */
  value?: string;
  onChange: (color: string) => void;
  /** Si fourni, affiche la ligne "Automatique" tout en haut du panneau —
   * sémantique laissée à l'appelant (ex. retirer la couleur de texte,
   * remettre le fond de cellule à transparent...). */
  onAutomatic?: () => void;
  automaticLabel?: string;
  /** Pastille affichée à côté du libellé "Automatique" (ex. noir pour la
   * couleur de texte, blanc/transparent pour un fond de cellule). */
  automaticSwatch?: string;
  /** Élément cliquable qui ouvre le panneau — chaque appelant garde son
   * icône/bouton existant, ce composant ne fait qu'ajouter le comportement
   * d'ouverture/fermeture et le panneau lui-même. */
  trigger: React.ReactNode;
  triggerClassName?: string;
  /** Classe du petit chevron séparé (comportement « appliquer la dernière
   * couleur », roadmap 2.3) — l'appelant y met la classe de bouton de son
   * ruban/panneau pour rester cohérent visuellement. */
  caretClassName?: string;
  disabled?: boolean;
  title?: string;
  /** Comportement « comme Word » (roadmap 2.3) : fourni, le DÉCLENCHEUR
   * principal n'ouvre PLUS le panneau — il APPLIQUE la dernière couleur
   * choisie (l'appelant mémorise laquelle) — et un petit chevron séparé
   * ouvre le panneau. Absent : le déclencheur ouvre le panneau comme
   * avant (première utilisation, autres panneaux sans mémoire). */
  onApplyLast?: () => void;
  /** Tooltip du déclencheur principal quand `onApplyLast` est fourni. */
  applyLastTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [customHex, setCustomHex] = useState(value ?? "#000000");
  // Le panneau s'ouvre par défaut vers la droite/le bas (depuis le
  // déclencheur) — mais un déclencheur proche du bord droit/bas de la
  // fenêtre (ex. "Couleur de bordure" dans le panneau Tableau, ancré à
  // droite de l'écran) le ferait déborder hors champ. Mesuré à l'ouverture
  // plutôt qu'en CSS pur (un simple `right: 0` casserait le cas normal où
  // le déclencheur est à gauche de l'écran).
  const [placement, setPlacement] = useState<{ h: "left" | "right"; v: "down" | "up" }>({ h: "left", v: "down" });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const PANEL_WIDTH = 232;
    const PANEL_HEIGHT_ESTIMATE = 420; // approximatif, suffisant pour décider d'un retournement
    const overflowsRight = rect.left + PANEL_WIDTH > window.innerWidth;
    const overflowsBottom = rect.bottom + PANEL_HEIGHT_ESTIMATE > window.innerHeight;
    setPlacement({ h: overflowsRight ? "right" : "left", v: overflowsBottom ? "up" : "down" });
  }, [open]);

  useEffect(() => {
    if (open) setCustomHex(value ?? "#000000");
  }, [open, value]);

  const pick = (color: string) => {
    onChange(color);
    setOpen(false);
  };

  const applyCustom = () => {
    if (!isValidHex(customHex)) return;
    pick(normalizeHex(customHex));
  };

  return (
    <div className="cp-root" ref={rootRef}>
      <button
        type="button"
        className={triggerClassName ?? "cp-trigger"}
        disabled={disabled}
        title={onApplyLast ? (applyLastTitle ?? title) : title}
        onMouseDown={keepEditorFocus}
        onClick={() => (onApplyLast ? onApplyLast() : setOpen((o) => !o))}
      >
        {trigger}
      </button>
      {/* Chevron séparé (roadmap 2.3) : le déclencheur principal applique
       * la dernière couleur, ce chevron ouvre le panneau — exactement le
       * comportement du bouton « A ▾ » de Word. */}
      {onApplyLast && (
        <button
          type="button"
          className={caretClassName ?? "cp-trigger-caret"}
          disabled={disabled}
          title={title}
          onMouseDown={keepEditorFocus}
          onClick={() => setOpen((o) => !o)}
        >
          ▾
        </button>
      )}

      {open && (
        <div
          className={`cp-panel cp-panel-h-${placement.h} cp-panel-v-${placement.v}`}
          onMouseDown={(e) => {
            e.stopPropagation();
            // Empêche tout bouton du panneau de voler le focus DOM à
            // l'éditeur invisible AVANT que son `onClick` ne s'exécute —
            // sinon la sélection de texte/cellule en cours est perdue et
            // l'action (setColor, setCellBackgroundColor...) s'applique à
            // une sélection vide. Même piège déjà rencontré et corrigé pour
            // le menu "Variable" d'en-tête/pied de page (voir
            // MarkdownEditor.tsx). Exclu pour le champ de saisie hex, qui a
            // besoin du focus normal pour que la frappe fonctionne.
            if ((e.target as HTMLElement).tagName !== "INPUT") e.preventDefault();
          }}
        >
          {onAutomatic && (
            <>
              <button
                type="button"
                className="cp-automatic"
                onClick={() => {
                  onAutomatic();
                  setOpen(false);
                }}
              >
                <span className="cp-automatic-swatch" style={{ background: automaticSwatch }} />
                {automaticLabel}
              </button>
              <div className="cp-sep" />
            </>
          )}

          <div className="cp-section-label">Couleurs du thème</div>
          <div className="cp-grid">
            {THEME_BASE_COLORS.map((base) => (
              <button
                key={base}
                type="button"
                className="cp-swatch"
                style={{ background: base }}
                title={base}
                onClick={() => pick(base)}
              />
            ))}
          </div>
          {THEME_SHADE_FACTORS.map((shade, row) => (
            <div className="cp-grid" key={row}>
              {THEME_BASE_COLORS.map((base) => {
                const color = shade.fn(base, shade.amount);
                return (
                  <button
                    key={base + row}
                    type="button"
                    className="cp-swatch"
                    style={{ background: color }}
                    title={color}
                    onClick={() => pick(color)}
                  />
                );
              })}
            </div>
          ))}

          <div className="cp-section-label">Couleurs standard</div>
          <div className="cp-grid">
            {STANDARD_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="cp-swatch"
                style={{ background: color }}
                title={color}
                onClick={() => pick(color)}
              />
            ))}
          </div>

          <div className="cp-section-label">Couleur personnalisée</div>
          <div className="cp-custom">
            <span className="cp-custom-hash">#</span>
            <input
              className="cp-custom-input"
              value={customHex.replace(/^#/, "")}
              onChange={(e) => setCustomHex(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyCustom()}
              maxLength={6}
            />
            <button type="button" className="cp-custom-apply" disabled={!isValidHex(customHex)} onClick={applyCustom}>
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
