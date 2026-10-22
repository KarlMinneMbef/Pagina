/**
 * Panneau latéral contextuel « Tableau » — présentation sobre gris clair
 * (2026-10-17) avec l'ENSEMBLE des fonctionnalités : lignes/colonnes/cellules,
 * ligne d'en-tête, couleur de fond, alignement vertical, bordures (présets +
 * schéma cliquable de lignes de grille, façon « Bordures et trame » de Word).
 * Aucune logique ici : chaque contrôle appelle exactement la même action
 * `ToolbarActions` qu'avant (seule exception : « Vider », action
 * `clearCellContents` ajoutée le même jour).
 *
 * S'ouvre automatiquement à l'entrée dans un tableau (voir `App.tsx`,
 * front montant de `stats.insideTable`), se rouvre dès que le curseur y
 * revient même après une fermeture manuelle (tant qu'il en est ressorti
 * entre-temps).
 */
import { useEffect, useState } from "react";
import type { ToolbarActions } from "../Toolbar/Toolbar";
import type { GridLine } from "../Editor/MarkdownEditor";
import { ColorPicker } from "../ColorPicker/ColorPicker";
import {
  IconClearCell,
  IconColDelete,
  IconColLeft,
  IconColRight,
  IconMergeCells,
  IconRowAbove,
  IconRowBelow,
  IconRowDelete,
  IconSplitCells,
  IconTableHeader,
  IconValignBottom,
  IconValignMiddle,
  IconValignTop,
  IconTrash,
} from "../Toolbar/icons";
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import "./TablePropertiesPanel.css";
import { keepEditorFocus } from "../focusGuard";

/** Clé de `Set` pour une ligne de grille — voir `GridLine` dans
 * MarkdownEditor.tsx (`axis`/`index`), simplement sérialisée en chaîne pour
 * pouvoir vivre dans un `Set<string>` React state. */
const lineKey = (l: GridLine) => `${l.axis}-${l.index}`;

/** Reconstruit la liste des `GridLine` actives d'un `Set` de clés, bornée à
 * la forme courante de la sélection (rows+1 lignes horizontales,
 * cols+1 verticales). */
function linesOfSet(set: Set<string>, shape: { rows: number; cols: number }): GridLine[] {
  const out: GridLine[] = [];
  for (let i = 0; i <= shape.rows; i++) {
    if (set.has(lineKey({ axis: "row", index: i }))) out.push({ axis: "row", index: i });
  }
  for (let j = 0; j <= shape.cols; j++) {
    if (set.has(lineKey({ axis: "col", index: j }))) out.push({ axis: "col", index: j });
  }
  return out;
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

/** Panneau contextuel des tableaux : lignes, colonnes, cellules, alignement
 *  vertical, bordures sur schéma interactif. */
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
  const inactive = disabled || actions === null;
  const effectiveShape = shape ?? { rows: 1, cols: 1 };
  /** Lignes de grille actives dans le schéma — en ÉDITION DIRECTE : chaque
   * clic ajoute/retire immédiatement la bordure correspondante dans le
   * tableau (plus de bouton « Appliquer »). Le schéma reflète donc les
   * bascules de CETTE session, pas une lecture de l'état du document. */
  const [lines, setLines] = useState<Set<string>>(() => new Set());
  const [style, setStyle] = useState("solid");
  const [width, setWidth] = useState("1px");
  const [color, setColor] = useState("#343334");
  const borderCss = `${width} ${style} ${color}`;

  // La forme de la sélection peut changer PENDANT que le panneau reste
  // ouvert (glisser-sélectionner plusieurs cellules sans jamais ressortir
  // du tableau) — on repart d'un schéma vierge cohérent avec la nouvelle
  // forme plutôt que de garder d'anciens index qui n'auraient plus de sens.
  useEffect(() => {
    setLines(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveShape.rows, effectiveShape.cols]);

  /** Clic sur une ligne du schéma : application IMMÉDIATE au tableau —
   * ligne absente → ajoute la bordure avec le pinceau courant (style/
   * épaisseur/couleur), ligne active → la retire. */
  const toggleLine = (line: GridLine) => {
    const key = lineKey(line);
    const active = lines.has(key);
    if (active) {
      actions?.setGridLineBorder([line], null);
    } else {
      actions?.setGridLineBorder([line], borderCss);
    }
    setLines((prev) => {
      const next = new Set(prev);
      if (active) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** Changement de Style/Épaisseur/Couleur : re-application IMMÉDIATE aux
   * lignes actuellement actives du schéma (édition directe, plus de
   * bouton « Appliquer ») — et mise à jour du pinceau pour les prochains
   * clics s'il n'y a pas de ligne active. */
  useEffect(() => {
    if (lines.size === 0 || !actions || inactive) return;
    actions.setGridLineBorder(linesOfSet(lines, effectiveShape), borderCss);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, width, color]);



  return (
    <div className="tp-panel">
      <PanelHeader
        title="Tableau"
        actions={[
          {
            icon: <IconTrash size={15} />,
            title: "Supprimer tout le tableau",
            onClick: () => actions?.deleteTable(),
            danger: true,
          },
        ]}
        onClose={onClose}
        closeTitle="Masquer le panneau (réapparaît dès que le curseur revient dans un tableau)"
      />

      <div className="tp-body">
        <section className="tp-section">
          <h4 className="tp-section-title">Lignes</h4>
          <div className="tp-grid tp-grid-4">
            <ActionButton
              title="Insérer une ligne au-dessus du curseur"
              icon={<IconRowAbove size={20} />}
              label="Au-dessus"
              onClick={() => actions?.addRowBefore()}
              disabled={inactive}
            />
            <ActionButton
              title="Insérer une ligne en dessous du curseur"
              icon={<IconRowBelow size={20} />}
              label="En dessous"
              onClick={() => actions?.addRowAfter()}
              disabled={inactive}
            />
            <ActionButton
              title="Supprimer la ligne du curseur"
              icon={<IconRowDelete size={20} />}
              label="Supprimer"
              onClick={() => actions?.deleteRow()}
              disabled={inactive}
            />
            <ActionButton
              title="Basculer la ligne d'en-tête (première ligne du tableau)"
              icon={<IconTableHeader size={20} />}
              label="En-tête"
              onClick={() => actions?.toggleHeaderRow()}
              disabled={inactive}
            />
          </div>
        </section>

        <section className="tp-section">
          <h4 className="tp-section-title">Colonnes</h4>
          <div className="tp-grid">
            <ActionButton
              title="Insérer une colonne à gauche du curseur"
              icon={<IconColLeft size={20} />}
              label="À gauche"
              onClick={() => actions?.addColumnBefore()}
              disabled={inactive}
            />
            <ActionButton
              title="Insérer une colonne à droite du curseur"
              icon={<IconColRight size={20} />}
              label="À droite"
              onClick={() => actions?.addColumnAfter()}
              disabled={inactive}
            />
            <ActionButton
              title="Supprimer la colonne du curseur"
              icon={<IconColDelete size={20} />}
              label="Supprimer"
              onClick={() => actions?.deleteColumn()}
              disabled={inactive}
            />
          </div>
        </section>

        <section className="tp-section">
          <h4 className="tp-section-title">Cellules</h4>
          <div className="tp-grid tp-grid-4">
            <ActionButton
              title="Fusionner les cellules sélectionnées"
              icon={<IconMergeCells size={20} />}
              label="Fusionner"
              onClick={() => actions?.mergeCells()}
              disabled={inactive}
            />
            <ActionButton
              title="Diviser la cellule fusionnée du curseur"
              icon={<IconSplitCells size={20} />}
              label="Diviser"
              onClick={() => actions?.splitCell()}
              disabled={inactive}
            />
            <ActionButton
              title="Vider le contenu de la cellule (ou des cellules sélectionnées)"
              icon={<IconClearCell size={20} />}
              label="Vider"
              onClick={() => actions?.clearCellContents()}
              disabled={inactive}
            />
            {/* Déclencheur du nuancier posé dans la grille : le ColorPicker
             * rend lui-même le <button>, on lui passe le rendu type A. */}
            <ColorPicker
              disabled={inactive}
              title="Couleur de fond de la cellule (Automatique = transparent)"
              triggerClassName="tp-action tp-action-picker"
              trigger={
                <>
                  <span className="tp-action-icon">
                    <span className="tp-swatch-fond" />
                  </span>
                  <span className="tp-action-label">Fond</span>
                </>
              }
              onAutomatic={() => actions?.setCellBackgroundColor(null)}
              automaticSwatch="#ffffff"
              onChange={(fondColor) => actions?.setCellBackgroundColor(fondColor)}
            />
          </div>
        </section>

        <section className="tp-section">
          <h4 className="tp-section-title">Alignement vertical</h4>
          <div className="tp-grid">
            <ActionButton
              title="Aligner le contenu en haut de la cellule"
              icon={<IconValignTop size={20} />}
              label="Haut"
              onClick={() => actions?.setCellVerticalAlign("top")}
              disabled={inactive}
            />
            <ActionButton
              title="Centrer le contenu verticalement dans la cellule"
              icon={<IconValignMiddle size={20} />}
              label="Milieu"
              onClick={() => actions?.setCellVerticalAlign("middle")}
              disabled={inactive}
            />
            <ActionButton
              title="Aligner le contenu en bas de la cellule"
              icon={<IconValignBottom size={20} />}
              label="Bas"
              onClick={() => actions?.setCellVerticalAlign("bottom")}
              disabled={inactive}
            />
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
                disabled={inactive}
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
            disabled={inactive}
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

          <p className="tp-hint">
            Cliquez directement les lignes du schéma : la bordure s'applique (ou se retire) immédiatement dans le
            tableau ; Style/Épaisseur/Couleur régissent le trait des lignes actives.
          </p>
          <p className="tp-hint">
            Bordures/fond/alignement : sans équivalent Markdown standard, le tableau est alors enregistré en HTML dans le
            fichier .md (toujours lisible ailleurs).
          </p>
        </section>

      </div>
    </div>
  );
}

/** Bouton d'action du panneau : icône SVG centrée (~20px) + libellé court
 * dessous (~10px), façon boutons type A du ruban. Tooltip obligatoire. */
function ActionButton({
  icon,
  label,
  title,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button type="button" className="tp-action" onClick={onClick} disabled={disabled} title={title}>
      <span className="tp-action-icon">{icon}</span>
      <span className="tp-action-label">{label}</span>
    </button>
  );
}

/** Schéma de bordure cliquable, façon "Bordures et trame" de Word — un
 * mini-tableau avec des lignes de texte décoratives (purement
 * illustratives), un pourtour pointillé repère visuel, et TOUTES les
 * lignes de la grille (extérieures ET internes, selon `shape`)
 * RÉELLEMENT cliquables : chacune rend directement le style de trait
 * (continu/tireté/pointillé/double), l'épaisseur et la couleur
 * actuellement réglés.
 *
 * Rendu en SVG plutôt qu'en CSS : `stroke-dasharray` donne un VRAI rendu de
 * tireté/pointillé fidèle au réglage choisi. Le style "double" se dessine
 * comme deux traits fins parallèles (SVG n'a pas de `border-style: double`
 * natif). */
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

  const inactiveColor = "#d0d3d4";

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
      <g
        key={lineKey(line)}
        className="tp-bd-edge-group"
        onMouseDown={keepEditorFocus}
        onClick={() => !disabled && onToggle(line)}
      >
        <title>{`${positionLabel} ${active ? "(bordure posée — cliquer pour la retirer du tableau)" : "(absente — cliquer pour la poser dans le tableau)"}`}</title>
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
    <rect key={keySuffix} x={cx - w / 2} y={cy - 1} width={w} height={2} rx={1} fill="#d0d3d4" />
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
