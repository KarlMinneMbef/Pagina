/**
 * Panneau latéral contextuel pour la mise en forme de tableau — remplace
 * l'ancienne boîte de dialogue modale `TableBorderDialog` (voir
 * `ROADMAP-CASUALOFFICE.md`, Phase 1 : demande explicite de l'utilisateur
 * après avoir vu le panneau équivalent de CasualOffice/docs, "plus simple à
 * utiliser"). Même principe que leur `TablePropertiesSection.tsx` /
 * `PropertiesPanel.tsx` — mais réimplémenté ici sur nos propres
 * `ToolbarActions`, pas copié : aucune dépendance à leur moteur de
 * pagination/OOXML.
 *
 * S'ouvre automatiquement à l'entrée dans un tableau (voir `App.tsx`, même
 * logique de front montant que l'onglet ruban "Tableau" dans
 * `Toolbar.tsx`), reste fermé si l'utilisateur l'a fermé manuellement tant
 * qu'il ne ressort pas du tableau.
 *
 * Contrairement à `PageSetupDialog`/`HeadingStyleDialog`, n'édite PAS une
 * config persistée : chaque contrôle agit IMMÉDIATEMENT sur la cellule (ou
 * les cellules sélectionnées) de l'éditeur actif via `ToolbarActions`, rien
 * n'est mémorisé au-delà de l'état local du panneau (style/épaisseur/
 * couleur de bordure en cours de réglage).
 */
import { useEffect, useState } from "react";
import type { ToolbarActions } from "../Toolbar/Toolbar";
import type { GridLine } from "../Editor/MarkdownEditor";
import { ColorPicker } from "../ColorPicker/ColorPicker";
import { useHorizontalResize } from "../ResizeHandle/useHorizontalResize";
import { ResizeHandle } from "../ResizeHandle/ResizeHandle";
import {
  IconColLeft,
  IconColRight,
  IconDeleteColumn,
  IconDeleteRow,
  IconMergeCells,
  IconRowAbove,
  IconRowBelow,
  IconTableHeader,
} from "../Toolbar/icons";
import "./TablePropertiesPanel.css";

/** Clé de `Set` pour une ligne de grille — voir `GridLine` dans
 * MarkdownEditor.tsx (`axis`/`index`), simplement sérialisée en chaîne pour
 * pouvoir vivre dans un `Set<string>` React state. */
const lineKey = (l: GridLine) => `${l.axis}-${l.index}`;

/** Lignes EXTÉRIEURES actives par défaut pour une forme de sélection
 * donnée (façon "Encadrement" de Word) — les lignes INTERNES démarrent
 * toujours désactivées, l'utilisateur les active explicitement s'il en a
 * besoin. */
function defaultOuterLines(shape: { rows: number; cols: number }): Set<string> {
  return new Set([
    lineKey({ axis: "row", index: 0 }),
    lineKey({ axis: "row", index: shape.rows }),
    lineKey({ axis: "col", index: 0 }),
    lineKey({ axis: "col", index: shape.cols }),
  ]);
}

const BORDER_STYLES = [
  { value: "solid", label: "Continue" },
  { value: "dashed", label: "Tiretée" },
  { value: "dotted", label: "Pointillée" },
  { value: "double", label: "Double" },
];

const BORDER_WIDTHS = [
  { value: "1px", label: "Fine (1px)" },
  { value: "2px", label: "Moyenne (2px)" },
  { value: "3px", label: "Épaisse (3px)" },
];

const PRESETS: { key: "all" | "outside" | "inside" | "none"; label: string; title: string }[] = [
  { key: "all", label: "Tout", title: "Bordure sur les 4 côtés de chaque cellule sélectionnée" },
  { key: "outside", label: "Extérieur", title: "Bordure uniquement sur le pourtour de la sélection" },
  { key: "inside", label: "Intérieur", title: "Bordure uniquement entre les cellules sélectionnées" },
  { key: "none", label: "Aucune", title: "Retire la bordure des 4 côtés de chaque cellule sélectionnée" },
];

export function TablePropertiesPanel({
  actions,
  disabled,
  shape,
  onClose,
}: {
  actions: ToolbarActions | null;
  disabled: boolean;
  /** Dimensions de la sélection de cellules courante (voir
   * `EditorStats.tableSelectionShape`) — pilote le schéma de bordures
   * interactif : une sélection de plusieurs cellules fait apparaître des
   * lignes internes en plus des 4 côtés extérieurs. */
  shape: { rows: number; cols: number } | null;
  onClose: () => void;
}) {
  const effectiveShape = shape ?? { rows: 1, cols: 1 };
  const [lines, setLines] = useState<Set<string>>(() => defaultOuterLines(effectiveShape));
  const [style, setStyle] = useState("solid");
  const [width, setWidth] = useState("1px");
  const [color, setColor] = useState("#343334");

  // La forme de la sélection peut changer PENDANT que le panneau reste
  // ouvert (glisser-sélectionner plusieurs cellules sans jamais ressortir
  // du tableau) — on repart alors d'un jeu de lignes par défaut cohérent
  // avec la NOUVELLE forme plutôt que de garder d'anciens index qui
  // n'auraient plus de sens.
  useEffect(() => {
    setLines(defaultOuterLines(effectiveShape));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveShape.rows, effectiveShape.cols]);

  const toggleLine = (line: GridLine) =>
    setLines((prev) => {
      const next = new Set(prev);
      const key = lineKey(line);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectedLines: GridLine[] = [];
  for (let i = 0; i <= effectiveShape.rows; i++) {
    if (lines.has(lineKey({ axis: "row", index: i }))) selectedLines.push({ axis: "row", index: i });
  }
  for (let j = 0; j <= effectiveShape.cols; j++) {
    if (lines.has(lineKey({ axis: "col", index: j }))) selectedLines.push({ axis: "col", index: j });
  }
  const borderCss = `${width} ${style} ${color}`;

  const { width: panelWidth, onHandleMouseDown } = useHorizontalResize(260, { min: 220, max: 520, anchor: "right" });

  return (
    <aside className="tp-panel" style={{ width: panelWidth }}>
      <ResizeHandle side="left" onMouseDown={onHandleMouseDown} />
      <div className="tp-header">
        <span>Tableau</span>
        <button className="tp-close" onClick={onClose} title="Fermer le panneau">
          ✕
        </button>
      </div>

      <div className="tp-body">
        <section className="tp-section">
          <h4 className="tp-section-title">Lignes</h4>
          <div className="tp-row">
            <button className="tp-btn-icon" disabled={disabled} onClick={() => actions?.addRowBefore()} title="Insérer une ligne au-dessus">
              <IconRowAbove size={16} />
            </button>
            <button className="tp-btn-icon" disabled={disabled} onClick={() => actions?.addRowAfter()} title="Insérer une ligne en dessous">
              <IconRowBelow size={16} />
            </button>
            <button className="tp-btn-icon" disabled={disabled} onClick={() => actions?.deleteRow()} title="Supprimer la ligne">
              <IconDeleteRow size={16} />
            </button>
            <button
              className="tp-btn-icon"
              disabled={disabled}
              onClick={() => actions?.toggleHeaderRow()}
              title="Basculer la ligne d'en-tête (première ligne du tableau)"
            >
              <IconTableHeader size={16} />
            </button>
          </div>
        </section>

        <section className="tp-section">
          <h4 className="tp-section-title">Colonnes</h4>
          <div className="tp-row">
            <button className="tp-btn-icon" disabled={disabled} onClick={() => actions?.addColumnBefore()} title="Insérer une colonne à gauche">
              <IconColLeft size={16} />
            </button>
            <button className="tp-btn-icon" disabled={disabled} onClick={() => actions?.addColumnAfter()} title="Insérer une colonne à droite">
              <IconColRight size={16} />
            </button>
            <button className="tp-btn-icon" disabled={disabled} onClick={() => actions?.deleteColumn()} title="Supprimer la colonne">
              <IconDeleteColumn size={16} />
            </button>
          </div>
        </section>

        <section className="tp-section">
          <h4 className="tp-section-title">Cellules</h4>
          <div className="tp-row tp-row-wrap">
            <button className="tp-btn-icon" disabled={disabled} onClick={() => actions?.mergeCells()} title="Fusionner les cellules sélectionnées">
              <IconMergeCells size={16} />
            </button>
            <button className="tp-btn-icon" disabled={disabled} onClick={() => actions?.splitCell()} title="Scinder la cellule">
              ⊟⊟
            </button>
            <ColorPicker
              disabled={disabled}
              title="Couleur de fond de cellule"
              triggerClassName="tp-btn-icon"
              trigger="🎨"
              onAutomatic={() => actions?.setCellBackgroundColor(null)}
              automaticSwatch="#ffffff"
              onChange={(color) => actions?.setCellBackgroundColor(color)}
            />
          </div>
        </section>

        <section className="tp-section">
          <h4 className="tp-section-title">Alignement vertical</h4>
          <div className="tp-row">
            <button className="tp-btn-icon" disabled={disabled} onClick={() => actions?.setCellVerticalAlign("top")} title="Aligner le contenu en haut de la cellule">
              ⬒
            </button>
            <button className="tp-btn-icon" disabled={disabled} onClick={() => actions?.setCellVerticalAlign("middle")} title="Centrer le contenu verticalement dans la cellule">
              ▭
            </button>
            <button className="tp-btn-icon" disabled={disabled} onClick={() => actions?.setCellVerticalAlign("bottom")} title="Aligner le contenu en bas de la cellule">
              ⬓
            </button>
          </div>
        </section>

        <section className="tp-section">
          <h4 className="tp-section-title">Bordures</h4>
          <div className="tp-row tp-row-wrap">
            {PRESETS.map(({ key, label, title }) => (
              <button
                key={key}
                type="button"
                className="tp-preset-btn"
                title={title}
                disabled={disabled}
                onClick={() => actions?.setCellBorderPreset(key, key === "none" ? null : borderCss)}
              >
                {label}
              </button>
            ))}
          </div>

          <BorderDiagram
            shape={effectiveShape}
            lines={lines}
            color={color}
            style={style}
            width={width}
            onToggle={toggleLine}
            disabled={disabled}
          />

          <label className="tp-field">
            Style
            <select value={style} onChange={(e) => setStyle(e.target.value)}>
              {BORDER_STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="tp-field">
            Épaisseur
            <select value={width} onChange={(e) => setWidth(e.target.value)}>
              {BORDER_WIDTHS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <div className="tp-field">
            Couleur
            <ColorPicker
              value={color}
              title="Couleur de bordure"
              triggerClassName="tp-field-color-trigger"
              trigger={<span className="tp-field-color-swatch" style={{ background: color }} />}
              onChange={setColor}
            />
          </div>

          <div className="tp-row">
            <button
              className="tp-btn"
              disabled={disabled || selectedLines.length === 0}
              onClick={() => actions?.setGridLineBorder(selectedLines, null)}
            >
              Retirer
            </button>
            <button
              className="tp-btn tp-btn-primary"
              disabled={disabled || selectedLines.length === 0}
              onClick={() => actions?.setGridLineBorder(selectedLines, borderCss)}
            >
              Appliquer
            </button>
          </div>
        </section>

        <section className="tp-section">
          <button className="tp-btn tp-btn-danger" disabled={disabled} onClick={() => actions?.deleteTable()}>
            🗑 Supprimer le tableau
          </button>
        </section>

        <p className="tp-hint">
          Sans équivalent Markdown standard : le tableau est alors enregistré en HTML dans le fichier .md (toujours
          lisible ailleurs).
        </p>
      </div>
    </aside>
  );
}

/** Schéma de bordure cliquable, façon "Bordures et trame" de Word (captures
 * d'écran de référence fournies par l'utilisateur) — un mini-tableau avec
 * des lignes de texte décoratives (purement illustratives, comme chez
 * Word — pas un second niveau de contrôle), un pourtour pointillé repère
 * visuel, et TOUTES les lignes de la grille (extérieures ET internes,
 * selon `shape`) RÉELLEMENT cliquables : chacune rend directement le style
 * de trait (continu/tireté/pointillé/double), l'épaisseur et la couleur
 * actuellement réglés.
 *
 * Généralisé depuis une première version limitée aux 4 côtés extérieurs
 * d'une seule cellule (sur demande explicite de l'utilisateur, "pouvoir
 * éditer les bordures internes") — `shape` (lignes × colonnes de la
 * sélection courante, voir `EditorStats.tableSelectionShape`) détermine le
 * nombre de lignes de grille à afficher : `{rows:1, cols:1}` redonne
 * exactement l'ancien schéma à 4 côtés (1 ligne de grille par bord, pas de
 * ligne interne), une sélection plus grande ajoute une ligne cliquable à
 * chaque séparation de rangée/colonne.
 *
 * Rendu en SVG plutôt qu'en CSS : `stroke-dasharray` donne un VRAI rendu de
 * tireté/pointillé fidèle au réglage choisi, ce qu'un `border-style` CSS
 * sur un petit `<div>` de quelques pixels de haut ne peut pas reproduire
 * correctement. Le style "double" se dessine comme deux traits fins
 * parallèles (SVG n'a pas de `border-style: double` natif). */
function BorderDiagram({
  shape,
  lines,
  color,
  style,
  width,
  onToggle,
  disabled,
}: {
  shape: { rows: number; cols: number };
  lines: Set<string>;
  color: string;
  style: string;
  width: string;
  onToggle: (line: GridLine) => void;
  disabled?: boolean;
}) {
  const W = 120;
  const H = 84;
  const PAD = 12;
  const x1 = PAD, y1 = PAD, x2 = W - PAD, y2 = H - PAD;
  const { rows, cols } = shape;
  const cellW = (x2 - x1) / cols;
  const cellH = (y2 - y1) / rows;

  const strokeWidth = width === "1px" ? 1.5 : width === "2px" ? 2.5 : 3.5;
  const dashArray = style === "dashed" ? "6 3" : style === "dotted" ? "1.5 3" : undefined;
  const isDouble = style === "double";

  const inactiveColor = "#d9d9d7";

  /** Une ligne de grille = une ligne invisible épaisse (cible de clic
   * confortable, même si le trait visible est fin) + la ligne visible
   * par-dessus. Le style "double" ajoute un second trait parallèle
   * légèrement décalé. */
  const renderLine = (line: GridLine, x1e: number, y1e: number, x2e: number, y2e: number) => {
    const active = lines.has(lineKey(line));
    const stroke = active ? color : inactiveColor;
    const sw = active ? strokeWidth : 1;
    const dash = active ? dashArray : undefined;
    const horizontal = y1e === y2e;
    const offset = active && isDouble ? 1.6 : 0;

    const isOuter = line.axis === "row" ? line.index === 0 || line.index === rows : line.index === 0 || line.index === cols;
    const positionLabel = isOuter
      ? line.axis === "row"
        ? line.index === 0 ? "Haut" : "Bas"
        : line.index === 0 ? "Gauche" : "Droite"
      : `${line.axis === "row" ? "horizontale" : "verticale"} interne n°${line.index}`;

    return (
      <g key={lineKey(line)} className="tp-bd-edge-group" onClick={() => !disabled && onToggle(line)}>
        <title>{`${positionLabel} ${active ? "(activée — cliquer pour retirer)" : "(absente — cliquer pour activer)"}`}</title>
        <line x1={x1e} y1={y1e} x2={x2e} y2={y2e} stroke="transparent" strokeWidth={10} className="tp-bd-hit" />
        {offset > 0 ? (
          <>
            <line
              x1={horizontal ? x1e : x1e - offset}
              y1={horizontal ? y1e - offset : y1e}
              x2={horizontal ? x2e : x2e - offset}
              y2={horizontal ? y2e - offset : y2e}
              stroke={stroke}
              strokeWidth={1.2}
            />
            <line
              x1={horizontal ? x1e : x1e + offset}
              y1={horizontal ? y1e + offset : y1e}
              x2={horizontal ? x2e : x2e + offset}
              y2={horizontal ? y2e + offset : y2e}
              stroke={stroke}
              strokeWidth={1.2}
            />
          </>
        ) : (
          <line x1={x1e} y1={y1e} x2={x2e} y2={y2e} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
        )}
      </g>
    );
  };

  /** Une ligne de "texte" décorative par cellule — purement illustrative
   * (comme les barres grises du schéma Word), aucune interaction. */
  const textLine = (cx: number, cy: number, w: number, keySuffix: string) => (
    <rect key={keySuffix} x={cx - w / 2} y={cy - 1} width={w} height={2} rx={1} fill="#d9d9d7" />
  );

  const rowLines = Array.from({ length: rows + 1 }, (_, i) => i);
  const colLines = Array.from({ length: cols + 1 }, (_, j) => j);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`tp-bd-svg${disabled ? " tp-bd-disabled" : ""}`}
      role="img"
      aria-label="Schéma de bordures du tableau"
    >
      {/* Pourtour pointillé décoratif, façon Word (repère visuel de la
       * zone de sélection, pas une bordure réelle). */}
      <rect x={x1 - 5} y={y1 - 5} width={x2 - x1 + 10} height={y2 - y1 + 10} fill="none" stroke="#c9c9c7" strokeDasharray="1.5 2.5" strokeWidth={1} />

      {/* Contenu décoratif : une ligne de texte par cellule de la sélection. */}
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const cx = x1 + c * cellW + cellW / 2;
          const cy = y1 + r * cellH + cellH / 2;
          return textLine(cx, cy, cellW * 0.6, `t${r}-${c}`);
        })
      )}

      {/* Lignes de grille cliquables : horizontales d'abord (0..rows),
       * verticales ensuite (0..cols) — extérieures ET internes. */}
      {rowLines.map((i) => renderLine({ axis: "row", index: i }, x1, y1 + i * cellH, x2, y1 + i * cellH))}
      {colLines.map((j) => renderLine({ axis: "col", index: j }, x1 + j * cellW, y1, x1 + j * cellW, y2))}
    </svg>
  );
}
