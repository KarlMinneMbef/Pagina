/**
 * Opérations de tableau PURES (aucun état React) : positions de cellules,
 * bordures, alignement vertical, largeurs de colonne, hauteurs de ligne.
 * Extraites de MarkdownEditor.tsx — chaque fonction ne dépend que de
 * l'instance Tiptap qu'on lui passe.
 */
import type { Editor } from "@tiptap/react";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import type { BorderSide } from "./extensions/TableCellStyle";

/** Position du nœud cellule (`tableCell`/`tableHeader`) qui contient `pos`,
 * ou `null` si `pos` n'est dans aucun tableau. Même principe que
 * `findCellPosFromPmPos` dans le projet CasualOffice/docs (qui nous a
 * inspiré l'architecture éditeur invisible + couche peinte) : on marche les
 * ancêtres de la position résolue plutôt que de chercher par coordonnées —
 * une fois qu'on a une position DOCUMENT valide (peu importe comment on l'a
 * obtenue), retrouver la cellule englobante est purement structurel, donc
 * fiable quel que soit le zoom/la résolution d'écran. */
export function findCellPos(doc: Editor["state"]["doc"], pos: number): number | null {
  try {
    const $pos = doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth--) {
      const node = $pos.node(depth);
      if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
        return $pos.before(depth);
      }
    }
  } catch {
    // position invalide
  }
  return null;
}

/** Applique un patch d'attributs à TOUTES les cellules concernées par la
 * sélection courante — soit une vraie sélection multi-cellules
 * (`CellSelection`, glisser-sélectionner un rectangle de cellules), soit,
 * à défaut, la seule cellule contenant le curseur. Nécessaire car
 * `editor.commands.updateAttributes` ne met à jour qu'un seul nœud (celui
 * de la position courante) — pas ce qu'il faut pour "appliquer une bordure
 * à toutes les cellules sélectionnées" façon Word. `addToHistory: false`
 * n'est PAS posé : contrairement à la renumérotation automatique des
 * titres, c'est ici une action explicite de l'utilisateur, qui doit rester
 * annulable par Ctrl+Z comme les autres actions du ruban. */
export function applyToSelectedCells(editor: Editor, patch: Record<string, unknown>) {
  const { state, view } = editor;
  const { selection } = state;
  const tr = state.tr;
  let touched = false;

  if (selection instanceof CellSelection) {
    selection.forEachCell((node, pos) => {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch });
      touched = true;
    });
  } else {
    const { $from } = selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
        tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, ...patch });
        touched = true;
        break;
      }
    }
  }

  if (touched) view.dispatch(tr);
}

/** Vide le CONTENU de la (ou des) cellule(s) ciblée(s) — sélection
 * multi-cellules ou cellule sous le curseur — sans supprimer les cellules
 * elles-mêmes (bouton « Vider » du panneau Tableau). Même énumération de
 * cellules que `applyToSelectedCells` ci-dessus. */
export function clearSelectedCellContents(editor: Editor) {
  const { state, view } = editor;
  const { selection } = state;
  const tr = state.tr;
  const emptyParagraph = state.schema.nodes.paragraph.create();
  let touched = false;

  if (selection instanceof CellSelection) {
    selection.forEachCell((node, pos) => {
      tr.replaceWith(pos + 1, pos + 1 + node.content.size, emptyParagraph);
      touched = true;
    });
  } else {
    const { $from } = selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
        const pos = $from.before(depth);
        tr.replaceWith(pos + 1, pos + 1 + node.content.size, emptyParagraph);
        touched = true;
        break;
      }
    }
  }

  if (touched) view.dispatch(tr);
}

/** Résout la sélection courante en une vraie `CellSelection` — construite à
 * partir de la cellule unique sous le curseur si ce n'est pas déjà le cas
 * (glisser-sélectionner plusieurs cellules en produit déjà une, voir le
 * correctif du 2026-10-10 dans `onMouseMove`). Nécessaire pour
 * `applyBorderPreset` ci-dessous : les présets "Extérieur"/"Intérieur" ont
 * besoin du RECTANGLE de la sélection (via `TableMap`), pas juste de la
 * liste de ses cellules. */
function resolveCellSelection(editor: Editor): CellSelection | null {
  const { state } = editor;
  if (state.selection instanceof CellSelection) return state.selection;
  const cellPos = findCellPos(state.doc, state.selection.from);
  if (cellPos === null) return null;
  try {
    return CellSelection.create(state.doc, cellPos, cellPos) as CellSelection;
  } catch {
    return null;
  }
}

/** Présets de bordures façon Word : "Tout"/"Aucune" touchent les 4 côtés de
 * chaque cellule sélectionnée sans condition ; "Extérieur"/"Intérieur"
 * comparent la position de chaque cellule (via `TableMap.findCell`, qui
 * donne son rectangle {left,top,right,bottom} dans la grille du tableau) au
 * rectangle de la SÉLECTION ENTIÈRE (`TableMap.rectBetween`) pour décider,
 * côté par côté, si c'est un bord extérieur (bord de la sélection) ou
 * intérieur (partagé avec une autre cellule sélectionnée). */
export function applyBorderPreset(editor: Editor, preset: "all" | "outside" | "inside" | "none", css: string | null) {
  const cellSel = resolveCellSelection(editor);
  if (!cellSel) return;
  const table = cellSel.$anchorCell.node(-1);
  const tableStart = cellSel.$anchorCell.start(-1);
  const map = TableMap.get(table);
  const rect = map.rectBetween(cellSel.$anchorCell.pos - tableStart, cellSel.$headCell.pos - tableStart);
  const offsets: number[] = map.cellsInRect(rect);
  if (!offsets.length) return;

  const tr = editor.state.tr;
  for (const offset of offsets) {
    const node = table.nodeAt(offset);
    if (!node) continue;
    const cellRect = map.findCell(offset);
    const sides: BorderSide[] = [];
    if (preset === "all" || preset === "none") {
      sides.push("borderTop", "borderRight", "borderBottom", "borderLeft");
    } else if (preset === "outside") {
      if (cellRect.top === rect.top) sides.push("borderTop");
      if (cellRect.bottom === rect.bottom) sides.push("borderBottom");
      if (cellRect.left === rect.left) sides.push("borderLeft");
      if (cellRect.right === rect.right) sides.push("borderRight");
    } else {
      // "inside" : bords partagés avec une autre cellule DE LA SÉLECTION.
      if (cellRect.top > rect.top) sides.push("borderTop");
      if (cellRect.bottom < rect.bottom) sides.push("borderBottom");
      if (cellRect.left > rect.left) sides.push("borderLeft");
      if (cellRect.right < rect.right) sides.push("borderRight");
    }
    if (!sides.length) continue;
    const patch: Record<string, unknown> = { ...node.attrs };
    // « Aucune » écrit explicitement `none` (et non `null`) : `null` RETIRE le réglage de la cellule et la
    // bordure grise par défaut du tableau réapparaît — la bordure n'était alors jamais supprimée
    // (ni à l'écran, ni à l'impression).
    for (const side of sides) patch[side] = preset === "none" ? "none" : css;
    tr.setNodeMarkup(tableStart + offset, undefined, patch);
  }
  editor.view.dispatch(tr);
}

/** Dimensions (en cellules) du rectangle actuellement sélectionné dans un
 * tableau — `{rows:1, cols:1}` pour un simple curseur dans une cellule
 * (toujours au moins 1×1), `null` hors tableau. Pilote le schéma de
 * bordures interactif (`TablePropertiesPanel`/`BorderDiagram`) : un
 * rectangle plus grand qu'une cellule fait apparaître des lignes
 * INTERNES cliquables en plus des 4 côtés extérieurs. */
export function getSelectionShape(editor: Editor): { rows: number; cols: number } | null {
  const cellSel = resolveCellSelection(editor);
  if (!cellSel) return null;
  const table = cellSel.$anchorCell.node(-1);
  const tableStart = cellSel.$anchorCell.start(-1);
  const map = TableMap.get(table);
  const rect = map.rectBetween(cellSel.$anchorCell.pos - tableStart, cellSel.$headCell.pos - tableStart);
  return { rows: rect.bottom - rect.top, cols: rect.right - rect.left };
}

/** Une "ligne de grille" du schéma de bordures : `axis: "row"` désigne une
 * ligne HORIZONTALE (sépare deux rangées, ou borde le haut/bas de la
 * sélection), `axis: "col"` une ligne VERTICALE. `index` va de 0 (bord
 * extérieur haut/gauche) à `rows`/`cols` (bord extérieur bas/droite) —
 * toute valeur intermédiaire désigne une ligne INTERNE, partagée entre
 * deux cellules adjacentes de la sélection. */
export interface GridLine {
  axis: "row" | "col";
  index: number;
}

/** Applique (ou retire, si `css` est `null`) une bordure à une ou
 * plusieurs lignes de grille de la sélection courante — généralise
 * `applyBorderPreset` (qui ne gère que les 4 côtés extérieurs/tous les
 * bords internes d'un coup) en laissant choisir EXACTEMENT quelles lignes
 * individuelles toucher, pour le schéma interactif du panneau Tableau.
 * Une ligne extérieure ne touche que les cellules dont le bord
 * correspondant coïncide avec le pourtour de la sélection ; une ligne
 * INTERNE pose la même valeur sur les DEUX côtés de la cellule concernée
 * (ex. `borderBottom` de la cellule du dessus ET `borderTop` de celle du
 * dessous) — nécessaire pour un rendu cohérent avec `border-collapse`. */
export function setGridLineBorder(editor: Editor, lines: GridLine[], css: string | null) {
  const cellSel = resolveCellSelection(editor);
  if (!cellSel) return;
  const table = cellSel.$anchorCell.node(-1);
  const tableStart = cellSel.$anchorCell.start(-1);
  const map = TableMap.get(table);
  const rect = map.rectBetween(cellSel.$anchorCell.pos - tableStart, cellSel.$headCell.pos - tableStart);
  const offsets = map.cellsInRect(rect);
  if (!offsets.length) return;

  const patches = new Map<number, Record<string, unknown>>();
  const getPatch = (offset: number) => {
    let p = patches.get(offset);
    if (!p) {
      const node = table.nodeAt(offset);
      p = node ? { ...node.attrs } : {};
      patches.set(offset, p);
    }
    return p;
  };

  for (const offset of offsets) {
    const cellRect = map.findCell(offset);
    for (const line of lines) {
      if (line.axis === "row") {
        const rows = rect.bottom - rect.top;
        if (line.index === 0 && cellRect.top === rect.top) getPatch(offset).borderTop = css;
        else if (line.index === rows && cellRect.bottom === rect.bottom) getPatch(offset).borderBottom = css;
        else if (line.index > 0 && line.index < rows) {
          if (cellRect.bottom === rect.top + line.index) getPatch(offset).borderBottom = css;
          if (cellRect.top === rect.top + line.index) getPatch(offset).borderTop = css;
        }
      } else {
        const cols = rect.right - rect.left;
        if (line.index === 0 && cellRect.left === rect.left) getPatch(offset).borderLeft = css;
        else if (line.index === cols && cellRect.right === rect.right) getPatch(offset).borderRight = css;
        else if (line.index > 0 && line.index < cols) {
          if (cellRect.right === rect.left + line.index) getPatch(offset).borderRight = css;
          if (cellRect.left === rect.left + line.index) getPatch(offset).borderLeft = css;
        }
      }
    }
  }

  if (patches.size === 0) return;
  const tr = editor.state.tr;
  for (const [offset, patch] of patches) {
    tr.setNodeMarkup(tableStart + offset, undefined, patch);
  }
  editor.view.dispatch(tr);
}

/** Pose la largeur `widthPx` (en pixels) sur TOUTES les cellules qui
 * touchent la colonne `colIndex` d'un tableau (position `tablePos`) —
 * potentiellement plusieurs si des lignes ont des cellules fusionnées
 * (`rowspan`) ou si la colonne visée fait partie d'une fusion horizontale
 * (`colspan`, auquel cas seule l'entrée correspondante de son tableau
 * `colwidth` est modifiée, les autres entrées de la même cellule restant
 * inchangées — attribut standard de `@tiptap/extension-table-cell`, déjà
 * utilisé par le plugin natif `ColumnResizing` que ce mécanisme remplace
 * ici par un vrai glisser sur la couche peinte, voir `MarkdownEditor.css`/
 * `paintPages.ts`). */
export function applyColumnWidth(editor: Editor, tablePos: number, colIndex: number, widthPx: number) {
  const tableNode = editor.state.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== "table") return;
  const map = TableMap.get(tableNode);
  if (colIndex < 0 || colIndex >= map.width) return;

  const tr = editor.state.tr;
  const seen = new Set<number>();
  for (let row = 0; row < map.height; row++) {
    const cellOffset = map.map[row * map.width + colIndex];
    if (seen.has(cellOffset)) continue; // même cellule revue via un rowspan
    seen.add(cellOffset);
    const cellNode = tableNode.nodeAt(cellOffset);
    if (!cellNode) continue;
    const cellRect = map.findCell(cellOffset);
    const colspan = (cellNode.attrs.colspan as number | undefined) ?? 1;
    const localIndex = colIndex - cellRect.left;
    if (localIndex < 0 || localIndex >= colspan) continue;
    const existing: (number | null)[] = Array.isArray(cellNode.attrs.colwidth)
      ? [...(cellNode.attrs.colwidth as (number | null)[])]
      : new Array(colspan).fill(null);
    while (existing.length < colspan) existing.push(null);
    existing[localIndex] = widthPx;
    tr.setNodeMarkup(tablePos + 1 + cellOffset, undefined, { ...cellNode.attrs, colwidth: existing });
  }
  if (tr.steps.length === 0) return;
  editor.view.dispatch(tr);
}

/** Pose la hauteur `heightPx` sur la ligne `rowIndex` d'un tableau (position
 * `tablePos`) — même principe que `applyColumnWidth`, plus simple côté
 * document : une ligne n'est jamais partagée entre colonnes (pas de notion
 * de "colspan" à son échelle), une seule cellule... une seule ligne à
 * modifier. */
export function applyRowHeight(editor: Editor, tablePos: number, rowIndex: number, heightPx: number) {
  const tableNode = editor.state.doc.nodeAt(tablePos);
  if (!tableNode || tableNode.type.name !== "table") return;

  let rowOffset = 0;
  let idx = 0;
  let targetRowPos: number | null = null;
  let targetRowNode: any = null;
  tableNode.forEach((row) => {
    if (idx === rowIndex) {
      targetRowPos = tablePos + 1 + rowOffset;
      targetRowNode = row;
    }
    rowOffset += row.nodeSize;
    idx++;
  });
  if (targetRowPos === null || !targetRowNode) return;

  const tr = editor.state.tr.setNodeMarkup(targetRowPos, undefined, { ...targetRowNode.attrs, height: heightPx });
  editor.view.dispatch(tr);
}
