/**
 * Couche de rendu/édition : encapsule Tiptap + sa sérialisation Markdown.
 * Ce composant ne connaît rien du filesystem ni du store d'onglets : il reçoit
 * un contenu Markdown initial et notifie les changements via onChange.
 * (Ce découplage permet d'ajouter plus tard un panneau IA qui lit/modifie une
 * sélection sans toucher à ce fichier.)
 *
 * Architecture de pagination (2026-09-12, réécriture) : voir CLAUDE.md pour
 * le contexte complet. En résumé — l'ancien système (un seul flux continu +
 * des "trous" calculés pour simuler des sauts de page) faisait des pages de
 * hauteur variable, recalculée à chaque frappe : pas acceptable, les feuilles
 * doivent être des boîtes de taille FIXE, comme dans Word. Solution retenue
 * (technique inspirée de CasualOffice/docs, réécrite pour nos besoins — voir
 * `pagination/paintPages.ts`) :
 * - Tiptap édite un document dans une zone invisible (`.xmd-live-editor-host`
 *   ci-dessous) — c'est la SEULE source de vérité éditable : curseur,
 *   sélection, undo/redo, IME... tout reste 100% natif à ProseMirror.
 * - À chaque modification, on répartit les blocs de premier niveau en pages
 *   de hauteur fixe et on peint des CLONES en lecture seule dans des boîtes
 *   `.xmd-page` (voir `paintPages.ts`) — jamais redimensionnées.
 * - Les clics sur ces clones sont traduits en position réelle dans l'éditeur
 *   invisible (`resolveClickPosition.ts`), qui reprend alors le focus.
 * - Un curseur dessiné à la main (`caretPosition.ts`) est repositionné à
 *   chaque changement de sélection, puisque la vraie sélection ProseMirror
 *   est invisible.
 */
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Editor as TiptapEditor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableMarkdown as Table } from "./extensions/TableMarkdown";
import TableRow from "@tiptap/extension-table-row";
import { TableCellStyled as TableCell, TableHeaderStyled as TableHeader, type BorderSide } from "./extensions/TableCellStyle";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyle } from "@tiptap/extension-text-style";
import FontFamily from "@tiptap/extension-font-family";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CharacterCount from "@tiptap/extension-character-count";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { createLowlight, common } from "lowlight";
import { FontSize } from "./extensions/FontSize";
import { Markdown } from "tiptap-markdown";
import { useEffect, useImperativeHandle, forwardRef, useRef, useMemo, useState, type CSSProperties } from "react";
import { PageBreak } from "./extensions/PageBreak";
import { Bookmark } from "./extensions/Bookmark";
import { ParagraphMarkdown } from "./extensions/ParagraphMarkdown";
import { TocMarker } from "./extensions/TocMarker";
import { FootnoteReference, FootnoteDefinition } from "./extensions/Footnote";
import { MermaidDiagram } from "./extensions/MermaidDiagram";
import { InlineMath, BlockMath } from "./extensions/Math";
import { applyHeadingNumbering } from "./extensions/HeadingAutoNumber";
import { paintPages, HEADER_TEMPLATE_ATTR, FOOTER_TEMPLATE_ATTR } from "./pagination/paintPages";
import { resolveClickPosition, findClonedBlock } from "./pagination/resolveClickPosition";
import { computeCaretScreenPosition } from "./pagination/caretPosition";
import { computeSelectionRects } from "./pagination/selectionHighlight";
import { resolvePageSizeMm, formatTodayForHeaderFooter, type PageLayoutSettings } from "../../core/pageLayout";
import "katex/dist/katex.min.css";
import "./MarkdownEditor.css";

export interface MarkdownEditorHandle {
  getMarkdown: () => string;
  getHTML: () => string;
  focus: () => void;
  undo: () => void;
  redo: () => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  toggleStrike: () => void;
  toggleHeading: (level: 1 | 2 | 3 | 4 | 5 | 6) => void;
  setParagraph: () => void;
  toggleBulletList: () => void;
  toggleOrderedList: () => void;
  toggleBlockquote: () => void;
  toggleCodeBlock: () => void;
  /** Code EN LIGNE (`` `code` ``) — distinct de `toggleCodeBlock` (un bloc
   * entier). */
  toggleCode: () => void;
  /** Langage de coloration syntaxique du bloc de code où se trouve le
   * curseur (aucun effet si le curseur n'est pas dans un bloc de code). */
  setCodeBlockLanguage: (language: string) => void;
  setLink: () => void;
  // --- Presse-papiers (boutons Coller/Couper/Copier du ruban) ---
  /** Copie la sélection en Markdown (texte brut) via l'API Clipboard. */
  copySelection: () => void;
  /** Copie la sélection puis la supprime. */
  cutSelection: () => void;
  /** Insère le texte du presse-papiers à la position du curseur — le texte
   * passe par le parseur Markdown de tiptap-markdown (override de
   * `insertContentAt`), donc coller du Markdown le convertit en nœuds
   * riches, pas en texte brut. */
  pasteClipboard: () => void;
  /** Agrandit/Réduit la police de la sélection d'un pas dans
   * `FONT_SIZE_STEPS` (voir juste dessous), façon Word. */
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  /** Fait cycler la casse de la sélection : minuscules/mixte →
   * MAJUSCULES → Casse de titre → minuscules. */
  changeCase: () => void;
  /** `rows`/`cols` : taille choisie via le sélecteur-grille du ruban (façon
   * Word) — voir `TableSizePicker` dans `Toolbar.tsx`. */
  insertTable: (rows: number, cols: number) => void;
  /** Commandes de tableau ci-dessous : toutes fournies nativement par
   * `@tiptap/extension-table`, juste exposées ici. Sans effet si le curseur
   * n'est pas dans un tableau (Tiptap ignore silencieusement). Rien
   * au-delà du Markdown standard (pas de fusion/scission de cellules,
   * pas de largeurs personnalisées) — voir la discussion avec
   * l'utilisateur dans CLAUDE.md. */
  addRowBefore: () => void;
  addRowAfter: () => void;
  deleteRow: () => void;
  addColumnBefore: () => void;
  addColumnAfter: () => void;
  deleteColumn: () => void;
  deleteTable: () => void;
  /** Fusion/scission de cellules + couleur de fond/bordures par côté —
   * onglet "Format avancé", groupe "Tableau" (voir `TableCellStyle.ts`).
   * Sans équivalent Markdown standard : un tableau qui utilise l'une de ces
   * fonctions bascule automatiquement en `<table>` HTML à la sauvegarde
   * (voir `TableMarkdown.ts`, `isMarkdownSerializable`) — les tableaux
   * simples restent en syntaxe GFM comme avant, rien ne change pour eux. */
  mergeCells: () => void;
  splitCell: () => void;
  /** Transforme la ligne courante en ligne d'en-tête (et inversement) —
   * commande native de `@tiptap/extension-table`. Sans effet hors tableau. */
  toggleHeaderRow: () => void;
  /** Vide le contenu de la cellule sous le curseur (ou de toutes les
   * cellules de la sélection) sans supprimer les cellules. */
  clearCellContents: () => void;
  setCellBackgroundColor: (color: string | null) => void;
  /** `sides` vide = tous les côtés. `css` = chaîne de bordure CSS complète
   * (ex. "2px solid #343334") ou `null` pour retirer la bordure sur ces
   * côtés. Appliqué à la cellule courante, ou à toutes les cellules
   * couvertes par une sélection multi-cellules (glisser-sélectionner). */
  setCellBorder: (sides: ("top" | "right" | "bottom" | "left")[], css: string | null) => void;
  /** Présets façon Word (voir groupe "Tableau", Format avancé) : "all"/"none"
   * touchent les 4 côtés de chaque cellule sélectionnée ; "outside"/"inside"
   * distinguent le pourtour de la sélection de ses arêtes internes (voir
   * `applyBorderPreset` dans ce fichier). */
  setCellBorderPreset: (preset: "all" | "outside" | "inside" | "none", css: string | null) => void;
  /** Applique/retire une bordure sur des lignes de grille PRÉCISES du
   * schéma interactif (voir `GridLine`/`setGridLineBorder` dans ce fichier)
   * — contrairement à `setCellBorderPreset`, permet de ne toucher QUE les
   * lignes explicitement cliquées (ex. une seule ligne interne parmi
   * plusieurs), pas "tout l'intérieur" d'un coup. */
  setGridLineBorder: (lines: GridLine[], css: string | null) => void;
  setCellVerticalAlign: (align: "top" | "middle" | "bottom") => void;
  insertHorizontalRule: () => void;
  insertPageBreak: () => void;
  setFontFamily: (family: string) => void;
  unsetFontFamily: () => void;
  setFontSize: (size: string) => void;
  unsetFontSize: () => void;
  setColor: (color: string) => void;
  unsetColor: () => void;
  toggleHighlight: () => void;
  setTextAlign: (align: "left" | "center" | "right" | "justify") => void;
  toggleSubscript: () => void;
  toggleSuperscript: () => void;
  toggleTaskList: () => void;
  clearFormatting: () => void;
  getStats: () => EditorStats;
  /** Ouvre l'éditeur en place de l'en-tête/du pied de page (sur la première
   * page peinte), comme un clic direct dessus — pour les rendre accessibles
   * depuis un bouton du ruban, pas seulement en cliquant sur la page (pas
   * évident à trouver au premier abord). */
  editHeader: () => void;
  editFooter: () => void;
  /** Insère une variable (`{{page}}`, `{{pages}}`, `{{date}}`...) dans le
   * champ d'en-tête/pied de page en cours d'édition (ou ouvre celui de
   * l'en-tête par défaut s'il n'y en a aucun d'ouvert). */
  insertHeaderFooterVariable: (token: string) => void;
  /** Termine l'édition du champ d'en-tête/pied de page en cours (valide
   * le texte saisi, comme un clic ailleurs) — bouton ✕ du panneau
   * « Variables » dans App.tsx. */
  closeHeaderFooterEdit: () => void;
  insertTocMarker: () => void;
  generateToc: () => void;
  /** Insère une référence `[^n]` au curseur ET la définition correspondante
   * en fin de document (n = 1 + le plus grand id de note déjà utilisé). */
  insertFootnote: () => void;
  insertMermaidDiagram: () => void;
  insertInlineMath: () => void;
  insertBlockMath: () => void;
  insertEmoji: (emoji: string) => void;
  /** Pose un signet (ancre invisible `<a id="…">`) à la position du
   * curseur — cible des renvois. Voir `Bookmark.ts`. */
  insertBookmark: () => void;
  /** Insère un renvoi vers un signet : lien Markdown `[texte](#id)`. */
  insertCrossReference: () => void;
}

// Coloration syntaxique des blocs de code : "common" couvre les langages les
// plus courants (JS/TS, Python, C/C++/C#, Java, HTML/CSS, JSON, Bash, SQL,
// YAML...) sans alourdir le bundle avec les ~190 langages disponibles.
const lowlight = createLowlight(common);
export const CODE_BLOCK_LANGUAGES = Object.keys(common).sort();

/** Échelle de tailles de police (en pt) — partagée entre le menu "Taille"
 * du ruban et les boutons Agrandir/Réduire (un pas = la valeur suivante de
 * cette échelle, pas +1 pt : façon Word). Le 12pt sert de base de départ
 * quand la sélection n'a pas encore de taille explicite. */
export const FONT_SIZE_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 24, 36];
const DEFAULT_FONT_SIZE_PT = 12;

/** Extrait la taille de police (en pt) de la sélection, ou la valeur par
 * défaut si aucune marque `fontSize` n'est posée. */
function currentFontSizePt(editor: Editor): number {
  const fontSize = editor.getAttributes("textStyle").fontSize;
  if (typeof fontSize === "string") {
    const pt = parseFloat(fontSize);
    if (!Number.isNaN(pt)) return pt;
  }
  return DEFAULT_FONT_SIZE_PT;
}

/** Casse suivante façon bouton "Aa" de Word : minuscules/mixte →
 * MAJUSCULES → Casse de titre (1re lettre de chaque mot) → minuscules.
 * La détection « casse de titre » doit venir AVANT celle « contient une
 * minuscule », sinon "Bonjour" (titre) serait renvoyé en MAJUSCULES et
 * la boucle ne repasserait jamais en minuscules. */
function nextCase(text: string): string {
  const upper = text.toUpperCase();
  const lower = text.toLowerCase();
  const title = lower.replace(/(^|[\s\-"'(«\[\]])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  if (text === upper) return title; // tout en majuscules → casse de titre
  if (text === title && text !== lower) return lower; // casse de titre → minuscules
  return upper; // contient au moins une minuscule → MAJUSCULES
}

/** Presse-papiers INTERNE : dernier texte copié/coupé DANS l'application. * Repli de `pasteClipboard` quand la lecture du presse-papiers système est
 * refusée — WebView2 peut afficher une demande de permission native pour
 * clipboard-read (ou la voir bloquée par la configuration) : Coller reste
 * ainsi fonctionnel pour tout ce qui a été copié/coupé via les boutons du
 * ruban, sans dépendre de cette permission. */
let internalClipboard: string | null = null;

/** Normalise un nom de signet saisi en identifiant d'ancre sûr : minuscules,
 * sans accents, espaces → tirets, seuls [a-z0-9-_] survivent (voir
 * `insertBookmark`/`insertCrossReference`). */
function slugifyBookmark(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Échappe un texte saisi avant de l'injecter dans un HTML construit à la
 * main pour `insertContent` (renvois — le libellé vient d'un prompt). */
function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Élément d'en-tête/pied de page le plus PROCHE DU VIEWPORT — les boutons
 * du ruban ne doivent pas systématiquement viser la zone de la PREMIÈRE
 * page (repiqué par `querySelector`) : si l'utilisateur lit une page
 * ultérieure, le champ flottant s'ouvrait hors de son champ de vision et
 * le bouton semblait « ne rien faire ». On choisit la zone visible la
 * plus proche du centre du viewport, à défaut la première. */
function headerFooterTargetNearViewport(canvas: HTMLElement | null, selector: string): HTMLElement | null {
  if (!canvas) return null;
  const els = Array.from(canvas.querySelectorAll<HTMLElement>(selector));
  if (els.length === 0) return null;
  const vh = window.innerHeight;
  const visible = els.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh;
  });
  if (visible.length === 0) return els[0];
  const mid = vh / 2;
  let best = visible[0];
  let bestDist = Infinity;
  for (const el of visible) {
    const r = el.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - mid);
    if (d < bestDist) {
      bestDist = d;
      best = el;
    }
  }
  return best;
}

function mmToPx(mm: number): number {
  const probe = document.createElement("div");
  probe.style.height = `${mm}mm`;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return px;
}

/** Style de bloc sous le curseur (paragraphe normal ou Titre 1-6) — voir
 * `EditorStats.activeBlockStyle`. */
function getActiveBlockStyle(editor: Editor): EditorStats["activeBlockStyle"] {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    if (editor.isActive("heading", { level })) return level;
  }
  return "paragraph";
}

/** Position du nœud cellule (`tableCell`/`tableHeader`) qui contient `pos`,
 * ou `null` si `pos` n'est dans aucun tableau. Même principe que
 * `findCellPosFromPmPos` dans le projet CasualOffice/docs (qui nous a
 * inspiré l'architecture éditeur invisible + couche peinte) : on marche les
 * ancêtres de la position résolue plutôt que de chercher par coordonnées —
 * une fois qu'on a une position DOCUMENT valide (peu importe comment on l'a
 * obtenue), retrouver la cellule englobante est purement structurel, donc
 * fiable quel que soit le zoom/la résolution d'écran. */
function findCellPos(doc: Editor["state"]["doc"], pos: number): number | null {
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
function applyToSelectedCells(editor: Editor, patch: Record<string, unknown>) {
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
function clearSelectedCellContents(editor: Editor) {
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
function applyBorderPreset(editor: Editor, preset: "all" | "outside" | "inside" | "none", css: string | null) {
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
    for (const side of sides) patch[side] = preset === "none" ? null : css;
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
function getSelectionShape(editor: Editor): { rows: number; cols: number } | null {
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
function setGridLineBorder(editor: Editor, lines: GridLine[], css: string | null) {
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

export interface EditorStats {
  words: number;
  characters: number;
  pageCount: number;
  currentPage: number;
  /** Style de bloc sous le curseur — pour surligner le bon bouton dans la
   * galerie de styles du ruban (voir RibbonGroup "Styles" dans Toolbar.tsx). */
  activeBlockStyle: "paragraph" | 1 | 2 | 3 | 4 | 5 | 6;
  /** Le curseur est-il actuellement dans un tableau — pilote l'apparition/
   * bascule automatique de l'onglet contextuel "Tableau" du ruban (voir
   * `Toolbar.tsx`), façon "Outils de tableau" de Word. */
  insideTable: boolean;
  /** Dimensions de la sélection de cellules courante — voir
   * `getSelectionShape` ; `null` hors tableau. */
  tableSelectionShape: { rows: number; cols: number } | null;
  /** Champ flottant d'en-tête/pied de page actuellement en cours d'édition
   * — pilote le panneau latéral « Variables » (voir `HeaderFooterPanel`
   * dans App.tsx) ; `null` quand aucun champ n'est ouvert. */
  headerFooterEditMode: "header" | "footer" | null;
}

interface MarkdownEditorProps {
  initialContent: string;
  onChange: (markdown: string) => void;
  onSaveRequest: () => void;
  onStats?: (stats: EditorStats) => void;
  /** Format papier, marges, en-tête/pied de page — voir pageLayout.ts. */
  layout: PageLayoutSettings;
  /** Nom de fichier affiché, disponible comme variable `{{filename}}` dans
   * l'en-tête/pied de page. */
  documentTitle: string;
  /** Édition en place de l'en-tête/pied de page (clic direct sur la page,
   * voir l'effet plus bas) — répercutée par l'appelant (App.tsx) sur le
   * store, comme pour PageSetupDialog. */
  onLayoutChange: (layout: PageLayoutSettings) => void;
  /** Niveau de zoom (1 = 100%), purement visuel. */
  zoom?: number;
  /** Ctrl+molette : proposition d'un nouveau niveau de zoom (paliers gérés par l'appelant). */
  onZoomChange?: (zoom: number) => void;
  /** Lecture seule (document figé) : aucune saisie possible, mais mise en page et défilement inchangés. */
  readOnly?: boolean;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  ({ initialContent, onChange, onSaveRequest, onStats, layout, documentTitle, onLayoutChange, zoom = 1, onZoomChange, readOnly = false }, ref) => {
    const loadedContentRef = useRef(initialContent);
    // Menu contextuel clic-droit sur une cellule de tableau (voir
    // `onContextMenu` plus bas) — seule pièce d'UI de ce composant gérée en
    // état React classique plutôt qu'en impératif/DOM direct : c'est un
    // simple overlay ponctuel, sans lien avec la mécanique de repaint, donc
    // sans risque pour l'architecture "tout en refs" du reste du fichier.
    const [tableContextMenu, setTableContextMenu] = useState<{ x: number; y: number } | null>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLDivElement>(null);
    const caretRef = useRef<HTMLDivElement>(null);
    const selectionLayerRef = useRef<HTMLDivElement>(null);
    const liveHostRef = useRef<HTMLDivElement>(null);
    const pageCountRef = useRef(1);
    const currentPageRef = useRef(1);
    const onStatsRef = useRef(onStats);
    onStatsRef.current = onStats;
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const layoutRef = useRef(layout);
    layoutRef.current = layout;
    const documentTitleRef = useRef(documentTitle);
    documentTitleRef.current = documentTitle;
    const onLayoutChangeRef = useRef(onLayoutChange);
    onLayoutChangeRef.current = onLayoutChange;
    // Peuplée plus bas (`startHeaderFooterEdit`) — permet à
    // `useImperativeHandle` (défini avant, plus haut dans le fichier) et au
    // gestionnaire de clic de partager la même fonction sans réordonner tout
    // le fichier, comme `repaintRef`/`repaintCaretRef` juste au-dessus.
    const startHeaderFooterEditRef = useRef<(target: HTMLElement) => void>(() => {});
    const insertHeaderFooterVariableRef = useRef<(token: string) => void>(() => {});
    // Champ flottant actuellement ouvert (voir startHeaderFooterEdit) — permet
    // aux boutons "insérer une variable" du ruban de taper dans le bon champ
    // sans que l'utilisateur ait à re-cliquer dedans.
    // Mini-éditeur RICHE en-tête/pied de page (Tiptap, voir
    // `startHeaderFooterEdit`) : tant que le champ est ouvert, le routage
    // `cmd()` ci-dessous y redirige TOUTES les commandes du ruban.
    const headerMiniEditorRef = useRef<Editor | null>(null);
    // Fonction « refermer le champ » de l'édition en cours (commit) — pour
    // le bouton ✕ du panneau latéral (`closeHeaderFooterEdit`).
    const headerFooterCommitRef = useRef<(() => void) | null>(null);
    // Éditeur ciblé par les commandes du RUBAN : tant qu'un champ
    // d'en-tête/pied de page est ouvert, c'est LUI (l'en-tête/le pied est
    // du contenu Markdown ordinaire, simplement dupliqué sur chaque page —
    // le ruban s'y applique donc tel quel, AUCUNE commande dédiée) ; sinon
    // l'éditeur principal. Évalué à chaque appel, pas à la définition.
    const cmd = () => headerMiniEditorRef.current ?? editor;
    // Mode en-tête/pied de page en cours d'édition (voir startHeaderFooterEdit)
    // — remonte dans `EditorStats.headerFooterEditMode` pour piloter le
    // panneau latéral « Variables » de App.tsx.
    const headerFooterModeRef = useRef<"header" | "footer" | null>(null);
    // Peuplée après le montage de l'éditeur (voir plus bas) — permet aux
    // callbacks `onUpdate`/`onSelectionUpdate`, créés une seule fois par
    // Tiptap, d'appeler la version toujours à jour de `repaint`.
    const repaintRef = useRef<() => void>(() => {});
    const repaintCaretRef = useRef<() => void>(() => {});

    // Constantes physiques (mm → px) : indépendantes du zoom, recalculées
    // seulement quand la mise en page change (format papier, orientation,
    // marges), pas à chaque frappe.
    const geometry = useMemo(() => {
      const { widthMm, heightMm } = resolvePageSizeMm(layout);
      const pageHeightPx = mmToPx(heightMm);
      const marginTopPx = mmToPx(layout.marginTopMm);
      const marginBottomPx = mmToPx(layout.marginBottomMm);
      const contentWidthPx = mmToPx(widthMm - layout.marginLeftMm - layout.marginRightMm);
      return { pageHeightPx, marginTopPx, marginBottomPx, contentWidthPx };
    }, [layout]);

    const editor = useEditor({
      editable: !readOnly,
      extensions: [
        StarterKit.configure({
          link: { openOnClick: false },
          // Remplacé par CodeBlockLowlight (coloration syntaxique) juste
          // en dessous — désactiver ici, sinon Tiptap se plaint de deux
          // extensions enregistrant le même nom de nœud ("codeBlock").
          codeBlock: false,
          // Remplacé par ParagraphMarkdown juste en dessous (préserve les
          // paragraphes vides — plusieurs Entrée pour espacer visuellement
          // deux paragraphes — à la sauvegarde, voir ce fichier).
          paragraph: false,
        }),
        CodeBlockLowlight.configure({ lowlight }),
        ParagraphMarkdown,
        Image,
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        Placeholder.configure({ placeholder: "Commencez à rédiger…" }),
        TextStyle,
        FontFamily,
        FontSize,
        Color,
        Highlight.configure({ multicolor: false }),
        TextAlign.configure({ types: ["heading", "paragraph", "tableCell", "tableHeader"] }),
        Subscript,
        Superscript,
        TaskList,
        TaskItem.configure({ nested: true }),
        CharacterCount,
        PageBreak,
        Bookmark,
        TocMarker,
        FootnoteReference,
        FootnoteDefinition,
        MermaidDiagram,
        InlineMath,
        BlockMath,
        Markdown.configure({
          // Nécessaire pour que police/taille/couleur/surlignage/alignement
          // (qui n'ont pas d'équivalent en Markdown standard) survivent à la
          // sauvegarde : ils sont sérialisés en <span style="…"> — toujours
          // lisible et correctement rendu par tout moteur Markdown→HTML
          // (GitHub, VS Code, Obsidian…), juste pas en syntaxe Markdown pure.
          html: true,
          transformPastedText: true,
        }),
      ],
      content: initialContent,
      editorProps: {
        attributes: {
          class: "xmd-prosemirror",
          // Désactive vérification orthographique/correction automatique/
          // majuscule automatique du NAVIGATEUR sur cette zone — elle est
          // INVISIBLE (`opacity:0`, voir MarkdownEditor.css), donc
          // l'utilisateur ne peut jamais voir un soulignement rouge ni un
          // menu de suggestion de correction avant qu'il n'agisse. Piste
          // sérieuse pour un bug remonté par l'utilisateur (texte réel
          // corrompu par des insertions d'espaces en plein milieu de mots,
          // ex. "d'ouvrage" devenu "d'o uvra ge" dans un vrai document,
          // trouvé en tentant de reproduire un décalage de curseur) : le
          // correcteur du système/WebView2 a pu proposer/appliquer une
          // correction sur ce champ sans que l'utilisateur la voie venir.
          // Non confirmé formellement (non reproduit par un test ciblé de
          // positionnement de clic, qui s'est révélé correct dans tous les
          // scénarios essayés), mais une désactivation standard et sans
          // risque pour un éditeur qui dessine lui-même tout son rendu.
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "off",
        },
        // Empêche TOUT défilement automatique natif de ProseMirror vers la
        // sélection (`tr.scrollIntoView()`, appelé en interne par de
        // nombreuses commandes — Entrée/`splitBlock`, flèches, jusqu'aux
        // actions du ruban comme `toggleBold`) : `view.dom` est
        // `.xmd-live-editor-host`, l'éditeur INVISIBLE décalé hors écran
        // (voir MarkdownEditor.css) — un défilement natif essaierait de
        // ramener cette position hors-écran dans le viewport, ce qui fait
        // sauter/défiler la couche peinte visible (signalé par
        // l'utilisateur : "saut de feuille quand je fais un Entrée"). Ce
        // hook (`handleScrollToSelection`, point d'extension officiel de
        // prosemirror-view) intercepte le défilement à sa toute source,
        // pour TOUTES les commandes d'un coup — plus robuste que rajouter
        // `{ scrollIntoView: false }` commande par commande (déjà fait sur
        // les actions du ruban, mais Entrée/les flèches passent par des
        // commandes internes de @tiptap/core impossibles à patcher une par
        // une). Le curseur/la sélection affichés restent corrects : gérés
        // entièrement par notre propre dessin sur la couche peinte
        // (`caretPosition.ts`/`selectionHighlight.ts`), jamais par le
        // scroll natif de l'éditeur invisible.
        handleScrollToSelection: () => true,
        handleKeyDown: (_view, event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            onSaveRequest();
            return true;
          }
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            editor?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "pageBreak" }).run();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        const markdown: string = editor.storage.markdown.getMarkdown();
        // Le markdown remonté ici revient ensuite en prop `initialContent`
        // (via le store puis App.tsx). Sans synchroniser la référence tout de
        // suite, l'effet plus bas voit `initialContent` différer de l'ancien
        // `loadedContentRef` et rappelle `setContent()` sur CHAQUE frappe —
        // ce qui réinitialise tout le document et renvoie le curseur en fin
        // de texte à chaque caractère tapé.
        loadedContentRef.current = markdown;
        onChange(markdown);
        repaintRef.current();
      },
      onSelectionUpdate: ({ editor }) => {
        // Le curseur/la sélection réels vivent dans l'éditeur invisible :
        // sans ça, une navigation au clavier (flèches, clic) ne bougerait
        // jamais le curseur DESSINÉ dans la couche peinte.
        repaintCaretRef.current();
        // Remonte le style de bloc courant (juste ce champ, pas de repaint
        // complet) pour surligner le bon bouton dans la galerie "Styles" du
        // ruban même quand on déplace le curseur sans taper.
        const words: number = editor.storage.characterCount.words();
        const characters: number = editor.storage.characterCount.characters();
        onStatsRef.current?.({
          words,
          characters,
          pageCount: pageCountRef.current,
          currentPage: currentPageRef.current,
          activeBlockStyle: getActiveBlockStyle(editor),
          insideTable: editor.isActive("table"),
          tableSelectionShape: getSelectionShape(editor),
          headerFooterEditMode: headerFooterModeRef.current,
        });
      },
    });

    // Bascule lecture seule / édition après le montage (ex. un document qui vient d'être figé).
    useEffect(() => {
      editor?.setEditable(!readOnly, false); // false = sans événement `update` (ce n'est pas une modification du contenu)
    }, [editor, readOnly]);

    useImperativeHandle(ref, () => ({
      getMarkdown: () => {
        if (!editor) return loadedContentRef.current;
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        return editor.storage.markdown.getMarkdown();
      },
      getHTML: () => editor?.getHTML() ?? "",
      focus: () => editor?.commands.focus(),
      undo: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).undo().run(),
      redo: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).redo().run(),
      toggleBold: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleBold().run(),
      toggleItalic: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleItalic().run(),
      toggleUnderline: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleUnderline().run(),
      toggleStrike: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleStrike().run(),
      toggleHeading: (level) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level }).run(),
      setParagraph: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setParagraph().run(),
      toggleBulletList: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleBulletList().run(),
      toggleOrderedList: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleOrderedList().run(),
      toggleBlockquote: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleBlockquote().run(),
      toggleCodeBlock: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleCodeBlock().run(),
      toggleCode: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleCode().run(),
      setCodeBlockLanguage: (language) =>
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).updateAttributes("codeBlock", { language }).run(),
      setLink: () => {
        if (!editor) return;
        const previous = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("URL du lien :", previous ?? "https://");
        if (url === null) return;
        if (url === "") {
          editor.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange("link").unsetLink().run();
          return;
        }
        editor.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange("link").setLink({ href: url }).run();
      },
      // --- Presse-papiers : sérialisation Markdown de la sélection via
      // tiptap-markdown (storage.markdown.serializer), puis API Clipboard
      // du navigateur. `navigator.clipboard` peut être absent (contexte
      // non sécurisé, ex. intégration PaginaLight en file://) : dans ce
      // cas les boutons restent sans effet silencieux.
      copySelection: () => {
        if (!editor) return;
        const { from, to, empty } = editor.state.selection;
        if (empty) return;
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        const md: string = editor.storage.markdown.serializer.serialize(
          editor.state.doc.slice(from, to).content
        );
        internalClipboard = md;
        navigator.clipboard?.writeText(md).catch(() => {});
      },
      cutSelection: () => {
        if (!editor) return;
        const { from, to, empty } = editor.state.selection;
        if (empty) return;
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        const md: string = editor.storage.markdown.serializer.serialize(
          editor.state.doc.slice(from, to).content
        );
        internalClipboard = md;
        navigator.clipboard?.writeText(md).catch(() => {});
        editor.chain().focus(undefined, { scrollIntoView: false }).deleteSelection().run();
      },
      pasteClipboard: () => {
        if (!editor) return;
        const insert = (text: string | null) => {
          if (!text) return;
          // insertContent(string) passe par le parseur Markdown de
          // tiptap-markdown (override de insertContentAt) : le Markdown
          // collé devient des vrais nœuds (gras, listes...).
          editor.chain().focus(undefined, { scrollIntoView: false }).insertContent(text).run();
        };
        navigator.clipboard
          ?.readText()
          .then((text) => {
            insert(text || internalClipboard);
          })
          .catch(() => {
            // Permission refusée : repli sur le presse-papiers interne.
            insert(internalClipboard);
          });
      },
      increaseFontSize: () => {
        if (!editor) return;
        const pt = currentFontSizePt(editor);
        const next = FONT_SIZE_STEPS.find((s) => s > pt + 0.01);
        if (next !== undefined) {
          editor.chain().focus(undefined, { scrollIntoView: false }).setFontSize(`${next}pt`).run();
        }
      },
      decreaseFontSize: () => {
        if (!editor) return;
        const pt = currentFontSizePt(editor);
        const prev = [...FONT_SIZE_STEPS].reverse().find((s) => s < pt - 0.01);
        if (prev !== undefined) {
          editor.chain().focus(undefined, { scrollIntoView: false }).setFontSize(`${prev}pt`).run();
        } else {
          // Plus petit que 8pt : retour à la taille par défaut du document.
          editor.chain().focus(undefined, { scrollIntoView: false }).unsetFontSize().run();
        }
      },
      changeCase: () => {
        if (!editor) return;
        const { from, to, empty } = editor.state.selection;
        if (empty) return;
        const text = editor.state.doc.textBetween(from, to, "\n");
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .command(({ tr }) => {
            tr.insertText(nextCase(text), from, to);
            return true;
          })
          .run();
      },
      insertTable: (rows, cols) =>
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertTable({ rows, cols, withHeaderRow: true }).run(),
      addRowBefore: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).addRowBefore().run(),
      addRowAfter: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).addRowAfter().run(),
      deleteRow: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).deleteRow().run(),
      addColumnBefore: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).addColumnBefore().run(),
      addColumnAfter: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).addColumnAfter().run(),
      deleteColumn: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).deleteColumn().run(),
      deleteTable: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).deleteTable().run(),
      mergeCells: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).mergeCells().run(),
      splitCell: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).splitCell().run(),
      toggleHeaderRow: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleHeaderRow().run(),
      clearCellContents: () => {
        const ed = cmd();
        if (!ed) return;
        clearSelectedCellContents(ed);
      },
      setCellBackgroundColor: (color) => {
        const ed = cmd();
        if (!ed) return;
        applyToSelectedCells(ed, { backgroundColor: color });
      },
      setCellBorder: (sides, css) => {
        const ed = cmd();
        if (!ed) return;
        const targetSides = sides.length ? sides : (["top", "right", "bottom", "left"] as const);
        const patch: Record<string, unknown> = {};
        for (const side of targetSides) {
          patch[`border${side[0].toUpperCase()}${side.slice(1)}`] = css;
        }
        applyToSelectedCells(ed, patch);
      },
      setCellVerticalAlign: (align) => {
        const ed = cmd();
        if (!ed) return;
        applyToSelectedCells(ed, { verticalAlign: align === "middle" ? "middle" : align });
      },
      setCellBorderPreset: (preset, css) => {
        const ed = cmd();
        if (!ed) return;
        applyBorderPreset(ed, preset, css);
      },
      setGridLineBorder: (lines, css) => {
        const ed = cmd();
        if (!ed) return;
        setGridLineBorder(editor, lines, css);
      },
      insertHorizontalRule: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setHorizontalRule().run(),
      insertPageBreak: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "pageBreak" }).run(),
      setFontFamily: (family) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setFontFamily(family).run(),
      unsetFontFamily: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).unsetFontFamily().run(),
      setFontSize: (size) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setFontSize(size).run(),
      unsetFontSize: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).unsetFontSize().run(),
      setColor: (color) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setColor(color).run(),
      unsetColor: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).unsetColor().run(),
      toggleHighlight: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleHighlight().run(),
      setTextAlign: (align) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).setTextAlign(align).run(),
      toggleSubscript: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleSubscript().run(),
      toggleSuperscript: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleSuperscript().run(),
      toggleTaskList: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).toggleTaskList().run(),
      clearFormatting: () =>
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).unsetAllMarks().unsetFontFamily().unsetFontSize().unsetColor().run(),
      getStats: () => ({
        words: editor?.storage.characterCount.words() ?? 0,
        characters: editor?.storage.characterCount.characters() ?? 0,
        activeBlockStyle: editor ? getActiveBlockStyle(editor) : "paragraph",
        insideTable: editor?.isActive("table") ?? false,
        tableSelectionShape: editor ? getSelectionShape(editor) : null,
        pageCount: pageCountRef.current,
        currentPage: currentPageRef.current,
        headerFooterEditMode: headerFooterModeRef.current,
      }),
      editHeader: () => {
        const el = headerFooterTargetNearViewport(canvasRef.current, ".xmd-page-header");
        if (el) startHeaderFooterEditRef.current(el);
      },
      editFooter: () => {
        const el = headerFooterTargetNearViewport(canvasRef.current, ".xmd-page-footer");
        if (el) startHeaderFooterEditRef.current(el);
      },
      insertHeaderFooterVariable: (token) => insertHeaderFooterVariableRef.current(token),
      closeHeaderFooterEdit: () => {
        // Referme le champ riche en validant (les modifications sont déjà
        // appliquées en direct — il ne reste qu'à refermer).
        headerFooterCommitRef.current?.();
      },
      insertTocMarker: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertTocMarker().run(),
      generateToc: () => cmd()?.chain().focus(undefined, { scrollIntoView: false }).generateToc().run(),
      insertFootnote: () => {
        if (!editor) return;
        let maxId = 0;
        editor.state.doc.descendants((node) => {
          if (node.type.name === "footnoteReference" || node.type.name === "footnoteDefinition") {
            const n = parseInt(node.attrs.id, 10);
            if (!Number.isNaN(n)) maxId = Math.max(maxId, n);
          }
        });
        const newId = String(maxId + 1);
        editor.chain().focus(undefined, { scrollIntoView: false }).insertFootnoteReference(newId).run();
        // La définition va TOUJOURS en fin de document, jamais à la
        // position du curseur (qui vient de bouger juste après la
        // référence qu'on a insérée) — déplacer explicitement la sélection
        // à la toute fin avant d'insérer.
        const endPos = editor.state.doc.content.size;
        editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(endPos).insertFootnoteDefinition(newId).run();
        // La position exacte après insertion dépend de ce qu'il y avait
        // juste avant la fin du document (un saut de ligne implicite ?) —
        // on la retrouve en reparcourant le document plutôt que de la
        // calculer à la main.
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "footnoteDefinition" && node.attrs.id === newId) {
            editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection(pos + 1).run();
          }
        });
      },
      insertMermaidDiagram: () =>
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "mermaidDiagram" }).run(),
      insertInlineMath: () => {
        const source = window.prompt("Formule LaTeX (en ligne) :", "E = mc^2");
        if (!source) return;
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "inlineMath", attrs: { source } }).run();
      },
      insertBlockMath: () => {
        const source = window.prompt("Formule LaTeX (bloc) :", "\\int_0^\\infty e^{-x} dx = 1");
        if (!source) return;
        cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "blockMath", attrs: { source } }).run();
      },
      insertEmoji: (emoji) => cmd()?.chain().focus(undefined, { scrollIntoView: false }).insertContent(emoji).run(),
      // --- Signet / Renvoi (groupe « Liens » du ruban, façon Word) ---
      insertBookmark: () => {
        if (!editor) return;
        const name = window.prompt("Nom du signet (ancre invisible à cette position du document) :", "signet");
        if (!name) return;
        const id = slugifyBookmark(name);
        if (!id) return;
        editor.chain().focus(undefined, { scrollIntoView: false }).insertContent({ type: "bookmark", attrs: { id } }).run();
      },
      insertCrossReference: () => {
        if (!editor) return;
        const name = window.prompt("Nom du signet visé (celui donné à la création du signet) :", "signet");
        if (!name) return;
        const id = slugifyBookmark(name);
        if (!id) return;
        const label = window.prompt("Texte affiché pour le renvoi :", name) ?? name;
        // Lien Markdown standard vers l'ancre : [texte](#id) — cliquable
        // dans tout moteur de rendu, et le saut vers l'ancre <a id> posée
        // par « Signet » fonctionne à l'écran comme à l'impression.
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .insertContent(`<a href="#${id}">${escapeHtmlText(label || id)}</a>`)
          .run();
      },
    }));

    // Si le contenu initial change (changement d'onglet actif), recharger l'éditeur.
    useEffect(() => {
      if (editor && initialContent !== loadedContentRef.current) {
        editor.commands.setContent(initialContent);
        loadedContentRef.current = initialContent;
      }
    }, [initialContent, editor]);

    // repaint() reconstruit entièrement la couche peinte (répartition en
    // pages + clones, voir paintPages.ts) et replace le curseur dessiné à la
    // main. Appelée à chaque modification du document (onUpdate ci-dessus),
    // au montage, et si le zoom change (les mesures dépendent du zoom).
    useEffect(() => {
      if (!editor) return;

      const repaintCaretOnly = () => {
        const canvas = canvasRef.current;
        const caret = caretRef.current;
        const selectionLayer = selectionLayerRef.current;
        if (!canvas || !caret) return;

        const { from, to } = editor.state.selection;
        const isCollapsed = from === to;

        // Sélection étendue : on dessine des rectangles de surbrillance et on
        // masque le curseur clignotant (comme dans n'importe quel éditeur —
        // pas de curseur ET de surbrillance affichés en même temps).
        if (selectionLayer) {
          if (isCollapsed) {
            selectionLayer.replaceChildren();
          } else {
            const rects = computeSelectionRects(editor.view, canvas, editor.state.selection, zoomRef.current);
            selectionLayer.replaceChildren(
              ...rects.map((r) => {
                const div = document.createElement("div");
                div.className = "xmd-selection-rect";
                div.style.left = `${r.left}px`;
                div.style.top = `${r.top}px`;
                div.style.width = `${r.width}px`;
                div.style.height = `${r.height}px`;
                return div;
              }),
            );
          }
        }

        if (!isCollapsed) {
          caret.style.display = "none";
          return;
        }

        const pos = computeCaretScreenPosition(editor.view, canvas, editor.state.selection.head, zoomRef.current);
        if (pos) {
          caret.style.display = "block";
          caret.style.left = `${pos.left}px`;
          caret.style.top = `${pos.top}px`;
          caret.style.height = `${pos.height}px`;
        } else {
          caret.style.display = "none";
        }
      };
      repaintCaretRef.current = repaintCaretOnly;

      // En-tête/pied de page : le template est stocké en MARKDOWN dans
      // `layout.header/footer.text` (sérialisé par le mini-éditeur) mais
      // le peintre (paintPages.ts) rend du HTML — conversion via le
      // parseur Markdown de tiptap-markdown, qui traverse aussi le HTML
      // historique grâce à `html: true`. Retourne une chaîne HTML
      // (innerHTML) ; vide si template vide.
      const mdToHtml = (md: string): string => {
        if (!md) return "";
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        return editor.storage.markdown.parser.parse(md) as string;
      };

      const repaint = () => {
        const canvas = canvasRef.current;
        const liveHost = liveHostRef.current;
        if (!canvas) return;

        // Réécrit la numérotation des titres si besoin (voir
        // HeadingAutoNumber.ts) — placé ici plutôt que seulement dans
        // `onUpdate` pour couvrir AUSSI le cas d'un changement de schéma de
        // numérotation depuis le dialogue "Styles de titres", qui ne
        // modifie pas le document lui-même (juste `layout`) : `repaint()`
        // est déjà appelée à chaque changement de `layout` (effet
        // dépendant, plus bas), donc c'est le seul endroit qui couvre tous
        // les déclencheurs (frappe, zoom, changement de mise en page) en un
        // seul appel.
        applyHeadingNumbering(editor.view, layoutRef.current.headingStyles);

        // La zone invisible doit avoir EXACTEMENT la même largeur que la
        // vraie zone de contenu d'une page — pas juste "à peu près", au
        // dixième de pixel près. `geometry.contentWidthPx` (calculé une
        // fois en JS via mmToPx) et la largeur réellement rendue en CSS
        // pour `.xmd-page-content` peuvent différer de quelques millièmes
        // de pixel (deux chemins de calcul distincts, arrondis différents) —
        // un écart invisible à l'œil, mais qui peut suffire à faire
        // retomber un mot de fin de ligne différemment, décalant TOUT le
        // reste du retour à la ligne. Ça désynchronise alors la traduction
        // clic → position (`resolveClickPosition.ts`) : un clic en fin de
        // ligne peut atterrir des dizaines de caractères plus loin dans le
        // document réel. On corrige donc la largeur pour qu'elle
        // corresponde exactement à ce qui est déjà rendu, dès qu'une page
        // existe pour le mesurer.
        if (liveHost) {
          const renderedContent = canvas.querySelector<HTMLElement>(".xmd-page-content");
          if (renderedContent) {
            // `.getBoundingClientRect().width` donne la largeur de BORDURE
            // (padding inclus, ~793px = la page entière) puisque
            // `.xmd-page-content` est en `box-sizing: border-box` — ce
            // n'est PAS ce qui contraint la mise en ligne du texte à
            // l'intérieur (ça, c'est la largeur de CONTENU, une fois le
            // padding retranché). S'y être trompé une fois déjà coûté un
            // bug sur la hauteur du curseur (voir CLAUDE.md) ; même piège
            // ici, sur la largeur cette fois — recommencé deux fois avant
            // de s'en souvenir.
            const style = getComputedStyle(renderedContent);
            const realWidth =
              renderedContent.getBoundingClientRect().width -
              (parseFloat(style.paddingLeft) || 0) -
              (parseFloat(style.paddingRight) || 0);
            if (Math.abs(realWidth - liveHost.getBoundingClientRect().width) > 0.01) {
              liveHost.style.width = `${realWidth}px`;
              // Le changement de largeur va faire reflow le texte dans la
              // zone invisible ; le ResizeObserver plus bas rappellera
              // repaint() automatiquement avec les bonnes mesures — pas la
              // peine de continuer cette passe-ci avec des mesures déjà
              // périmées.
              return;
            }
          }
        }

        const result = paintPages(editor.view, canvas, {
          pageHeightPx: geometry.pageHeightPx,
          marginTopPx: geometry.marginTopPx,
          marginBottomPx: geometry.marginBottomPx,
          header: { ...layout.header, html: mdToHtml(layout.header.text) },
          footer: { ...layout.footer, html: mdToHtml(layout.footer.text) },
          context: {
            date: formatTodayForHeaderFooter(),
            filename: documentTitleRef.current,
            version: layout.documentVersion,
            author: layout.author,
          },
        });
        pageCountRef.current = result.pageCount;
        repaintCaretOnly();
        const words: number = editor.storage.characterCount.words();
        const characters: number = editor.storage.characterCount.characters();
        onStatsRef.current?.({
          words,
          characters,
          pageCount: pageCountRef.current,
          currentPage: currentPageRef.current,
          activeBlockStyle: getActiveBlockStyle(editor),
          insideTable: editor.isActive("table"),
          tableSelectionShape: getSelectionShape(editor),
          headerFooterEditMode: headerFooterModeRef.current,
        });
      };
      repaintRef.current = repaint;

      repaint();
      // Un changement de fenêtre (redimensionnement) peut changer la mise en
      // ligne du texte dans l'éditeur invisible (largeur inchangée en
      // pratique — fixe en mm — mais on reste robuste si ça change un jour).
      const ro = new ResizeObserver(repaint);
      const dom = editor.view.dom as HTMLElement;
      ro.observe(dom);
      return () => ro.disconnect();
    }, [editor, geometry, layout]);

    // Le zoom change les mesures géométriques (transform: scale()) : on
    // repeint pour que la pagination et la position du curseur restent
    // cohérentes avec le nouveau niveau de zoom.
    useEffect(() => {
      repaintRef.current();
    }, [zoom]);

    // Édition en place de l'en-tête/pied de page : un clic sur l'un ou
    // l'autre (sur N'IMPORTE QUELLE page — le texte est le même partout,
    // sauf substitution des variables) ouvre un petit champ texte flottant
    // par-dessus, pré-rempli avec le MODÈLE brut (variables `{{page}}` non
    // résolues, lues depuis `HEADER_TEMPLATE_ATTR`/`FOOTER_TEMPLATE_ATTR`
    // posés par paintPages.ts) plutôt que le texte déjà substitué affiché.
    const startHeaderFooterEdit = (target: HTMLElement) => {
      const isHeader = target.classList.contains("xmd-page-header");
      const template = target.getAttribute(isHeader ? HEADER_TEMPLATE_ATTR : FOOTER_TEMPLATE_ATTR) ?? "";
      const rect = target.getBoundingClientRect();

      // Remonte le mode d'édition (panneau latéral « En-tête/Pied de page »
      // de App.tsx) à chaque ouverture/fermeture du champ.
      const emitMode = (mode: "header" | "footer" | null) => {
        headerFooterModeRef.current = mode;
        if (!editor) return;
        onStatsRef.current?.({
          words: editor.storage.characterCount.words(),
          characters: editor.storage.characterCount.characters(),
          pageCount: pageCountRef.current,
          currentPage: currentPageRef.current,
          activeBlockStyle: getActiveBlockStyle(editor),
          insideTable: editor.isActive("table"),
          tableSelectionShape: getSelectionShape(editor),
          headerFooterEditMode: mode,
        });
      };

      // Champ RICHE : l'en-tête/pied de page est du contenu MARKDOWN
      // ordinaire, simplement dupliqué sur chaque page — le mini-éditeur
      // embarque l'extension `Markdown` de tiptap-markdown : le template
      // (stocké en Markdown dans `layout.header/footer.text`) est parsé
      // tel quel à l'ouverture (le HTML historique passe aussi grâce à
      // `html: true`), et la frappe est re-sérialisée en Markdown à chaque
      // mise à jour. Le RUBAN principal s'applique au champ via le routage
      // `cmd()` — aucune commande dédiée.
      const initialContent = template;

      const host = document.createElement("div");
      host.className = "xmd-header-footer-edit xmd-header-footer-rich";
      host.style.left = `${rect.left}px`;
      host.style.top = `${rect.top}px`;
      host.style.width = `${rect.width}px`;
      host.style.minHeight = `${rect.height}px`;
      document.body.appendChild(host);

      let mini: Editor;
      try {
        mini = new TiptapEditor({
          element: host,
          extensions: [
            StarterKit.configure({ link: { openOnClick: false } }),
            TextStyle,
            FontFamily,
            FontSize,
            Color,
            TextAlign.configure({ types: ["paragraph", "tableCell", "tableHeader"] }),
            Table,
            TableRow,
            TableCell,
            TableHeader,
            Markdown.configure({ html: true }),
          ],
          content: initialContent,
          editorProps: { attributes: { class: "xmd-hf-prosemirror" } },
        });
      } catch (e) {
        host.remove();
        return;
      }
      headerMiniEditorRef.current = mini;
      emitMode(isHeader ? "header" : "footer");
      mini.commands.focus("end");

      // Mise à jour EN DIRECT : le contenu est partagé par toutes les
      // pages et le document peint suit la frappe au fur et à mesure
      // (comme le corps du document). Le « commit » ne fait plus rien
      // d'autre que refermer : tout est déjà appliqué.
      const field = isHeader ? "header" : "footer";
      mini.on("update", () => {
        const current = layoutRef.current;
        // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
        const md: string = mini.storage.markdown.getMarkdown();
        onLayoutChangeRef.current({ ...current, [field]: { ...current[field], text: md } });
      });

      // Recalage du champ sur la zone peinte : l'ouverture du panneau
      // latéral (ou une fermeture d'explorateur, un redimensionnement)
      // déplace les pages APRÈS l'ouverture — sans recalage le champ
      // restait décalé (bug du 2026-10-17). Sur l'élément d'origine s'il
      // survit à un repaint, sinon la zone visible la plus proche.
      const selector = isHeader ? ".xmd-page-header" : ".xmd-page-footer";
      const reposition = () => {
        const el = target.isConnected ? target : headerFooterTargetNearViewport(canvasRef.current, selector);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        host.style.left = `${r.left}px`;
        host.style.top = `${r.top}px`;
        host.style.width = `${r.width}px`;
        host.style.minHeight = `${r.height}px`;
      };
      const canvasEl = canvasRef.current;
      const resizeObserver = canvasEl ? new ResizeObserver(() => reposition()) : null;
      if (canvasEl && resizeObserver) resizeObserver.observe(canvasEl);
      window.addEventListener("resize", reposition);

      // Referme quand on clique ailleurs que dans le champ ou dans le
      // panneau latéral (les boutons du panneau neutralisent déjà leur
      // `mousedown` pour ne pas voler le focus au mini-éditeur).
      // Le RUBAN (.tb-ribbon-stack) et la barre de titre (.tbar) sont
      // AUSSI exclus : tant que le champ est ouvert, les commandes du
      // ruban s'y appliquent via le routage `cmd()` — laisser le clic
      // fermer le champ TUAIT la mise en forme de la sélection (bug
      // remonté par l'utilisateur : « quand je veux mettre du texte en
      // gras dans l'en-tête, il est automatiquement désélectionné »).
      // Les commandes re-donnent le focus au mini-éditeur via leur
      // `.focus()`, la sélection ProseMirror étant conservée même sans
      // focus.
      const onDocMouseDown = (e: MouseEvent) => {
        const t = e.target as Node;
        if (host.contains(t)) return;
        if (t instanceof Element && t.closest(".ctx-host")) return;
        if (t instanceof Element && t.closest(".tb-ribbon-stack, .tbar")) return;
        commit();
      };
      document.addEventListener("mousedown", onDocMouseDown, true);

      let closed = false;
      const detach = () => {
        if (closed) return;
        closed = true;
        document.removeEventListener("mousedown", onDocMouseDown, true);
        resizeObserver?.disconnect();
        window.removeEventListener("resize", reposition);
        headerFooterCommitRef.current = null;
        headerMiniEditorRef.current = null;
        emitMode(null);
        mini.destroy();
        host.remove();
      };
      const commit = () => detach();
      const cancel = () => detach();
      headerFooterCommitRef.current = commit;

      host.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      });
    };
    startHeaderFooterEditRef.current = startHeaderFooterEdit;

    /** Insère une variable (`{{page}}`, etc.) dans le champ riche
     * d'en-tête/pied de page actuellement ouvert ; s'il n'y en a aucun,
     * ouvre celui de l'en-tête (choix par défaut) et insère à la fin. */
    insertHeaderFooterVariableRef.current = (token: string) => {
      const mini = headerMiniEditorRef.current;
      if (mini) {
        mini.chain().focus().insertContent(token).run();
        return;
      }
      const el = headerFooterTargetNearViewport(canvasRef.current, ".xmd-page-header");
      if (!el) return;
      startHeaderFooterEditRef.current(el);
      headerMiniEditorRef.current?.chain().focus("end").insertContent(token).run();
    };

    // Clics sur la couche peinte : traduits en position réelle dans
    // l'éditeur invisible (voir resolveClickPosition.ts), qui reprend le
    // focus. Glisser (mousedown puis mousemove) étend la sélection.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !editor) return;

      let dragging = false;
      let anchorPos: number | null = null;
      // Position de la CELLULE (pas du texte) où le glisser a commencé — voir
      // `findCellPos` plus haut. `null` si le glisser n'a pas démarré dans un
      // tableau, auquel cas on reste sur une sélection de texte normale.
      let cellAnchorPos: number | null = null;

      const posFromEvent = (e: MouseEvent): number | null => {
        const block = findClonedBlock(e.target);
        if (!block) return null;
        return resolveClickPosition(editor.view, e.clientX, e.clientY, block, zoomRef.current);
      };

      const onMouseDown = (e: MouseEvent) => {
        const headerFooterTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-page-header, .xmd-page-footer");
        if (headerFooterTarget) {
          e.preventDefault();
          startHeaderFooterEdit(headerFooterTarget);
          return;
        }
        // Ancre de sommaire (voir TocMarker.ts, generateToc) : un lien
        // `#slug` ne peut pas être laissé au navigateur (la couche peinte
        // n'est pas un document normal, et le clic serait de toute façon
        // intercepté juste en dessous pour la résolution de position) — on
        // le gère nous-mêmes en faisant défiler jusqu'à l'élément portant
        // cet `id` (posé sur chaque titre peint par paintPages.ts).
        const anchorLink = (e.target as HTMLElement)?.closest<HTMLAnchorElement>('a[href^="#"]');
        if (anchorLink) {
          e.preventDefault();
          const targetId = decodeURIComponent(anchorLink.getAttribute("href")!.slice(1));
          const targetEl = canvas.querySelector(`#${CSS.escape(targetId)}`);
          targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        // Référence de note de bas de page (voir Footnote.ts) : saute à sa
        // définition (en fin de document) plutôt que de positionner le
        // curseur dedans — c'est un atome en lecture seule dans la couche
        // peinte, pas du texte à éditer directement.
        const footnoteRef = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-footnote-ref");
        if (footnoteRef) {
          e.preventDefault();
          const id = footnoteRef.getAttribute("data-id");
          const targetEl = canvas.querySelector(`.xmd-footnote-def[data-id="${CSS.escape(id ?? "")}"]`);
          targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        // Formule mathématique (voir Math.ts) : clic → invite avec la
        // source LaTeX actuelle, plutôt que d'éditer le rendu KaTeX
        // directement (un atome, comme les notes de bas de page). Réutilise
        // `posFromEvent` (déjà fiable sur du contenu en ligne, voir
        // resolveClickPosition.ts) pour retrouver la position réelle du
        // clic, puis cherche l'atome pile à cette position (ou juste avant,
        // selon de quel côté `posFromEvent` est tombé).
        const mathTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-math");
        if (mathTarget) {
          e.preventDefault();
          const clickPos = posFromEvent(e);
          if (clickPos === null) return;
          const isMathNode = (n: any) => n && (n.type.name === "inlineMath" || n.type.name === "blockMath");
          let mathPos = clickPos;
          let node = editor.state.doc.nodeAt(mathPos);
          if (!isMathNode(node)) {
            mathPos = clickPos - 1;
            node = editor.state.doc.nodeAt(mathPos);
          }
          if (!isMathNode(node)) return;
          const next = window.prompt("Formule LaTeX :", node!.attrs.source);
          if (next === null) return;
          editor.view.dispatch(editor.view.state.tr.setNodeAttribute(mathPos, "source", next));
          return;
        }
        const pos = posFromEvent(e);
        if (pos === null) return;
        e.preventDefault();
        dragging = true;
        anchorPos = pos;
        cellAnchorPos = findCellPos(editor.state.doc, pos);
        editor.commands.focus(undefined, { scrollIntoView: false });
        editor.commands.setTextSelection(pos);
      };
      const onMouseMove = (e: MouseEvent) => {
        if (!dragging || anchorPos === null) return;
        const pos = posFromEvent(e);
        if (pos === null) return;
        // Glisser à travers plusieurs cellules d'un tableau DOIT produire une
        // vraie `CellSelection` (nécessaire pour `mergeCells`/`setCellBorder`
        // etc., voir `applyToSelectedCells` plus haut) — un simple
        // `setTextSelection({from, to})` ne la construit JAMAIS, même si la
        // plage traverse des cellules : ProseMirror la normalise en
        // sélection de texte ordinaire, ce qui rendait la fusion de cellules
        // glissées-sélectionnées peu fiable (jamais une vraie sélection
        // multi-cellules, quel que soit le zoom/la résolution d'écran —
        // cette étape-ci n'a d'ailleurs rien de géométrique, donc n'est en
        // fait pas sensible à ça, contrairement à `posFromEvent` ci-dessus).
        const cellPos = findCellPos(editor.state.doc, pos);
        if (cellAnchorPos !== null && cellPos !== null && cellPos !== cellAnchorPos) {
          try {
            const sel = CellSelection.create(editor.state.doc, cellAnchorPos, cellPos);
            editor.view.dispatch(editor.state.tr.setSelection(sel));
            return;
          } catch {
            // Les deux cellules ne sont pas dans le même tableau (ou autre
            // position invalide) — repli sur la sélection de texte normale.
          }
        }
        editor.commands.setTextSelection({ from: anchorPos, to: pos });
      };
      const onMouseUp = () => {
        dragging = false;
        anchorPos = null;
        cellAnchorPos = null;
      };

      // Filet de sécurité : un lien réel (`<a href="https://…">`) cliqué
      // dans la couche peinte a fait naviguer le NAVIGATEUR SYSTÈME (Chrome
      // ouvert par-dessus l'appli — `tauri-plugin-opener` redirige toute
      // navigation externe hors de la WebView vers le navigateur par
      // défaut, comportement de sécurité voulu par Tauri) au lieu de se
      // contenter de positionner le curseur, comme n'importe quel autre
      // clic sur cette couche en lecture seule. `preventDefault()` sur
      // `mousedown` (dans `onMouseDown` ci-dessus) ne suffit PAS à annuler
      // la navigation déclenchée par l'événement `click` natif du lien qui
      // suit — il faut l'empêcher explicitement, lui aussi.
      const onClick = (e: MouseEvent) => {
        if ((e.target as HTMLElement)?.closest("a")) {
          e.preventDefault();
        }
      };

      // Menu contextuel clic-droit (voir `tableContextMenu`/`TableContextMenu`
      // plus bas) — uniquement si le clic tombe dans un tableau, façon Word :
      // le menu natif du navigateur reste disponible partout ailleurs (texte
      // normal), on n'intercepte QUE ce cas précis.
      const onContextMenu = (e: MouseEvent) => {
        const pos = posFromEvent(e);
        if (pos === null) return;
        const cellPos = findCellPos(editor.state.doc, pos);
        if (cellPos === null) return;
        e.preventDefault();
        // Préserve une sélection multi-cellules déjà en place (pour que
        // "Fusionner" dans le menu agisse dessus) ; sinon positionne le
        // curseur dans la cellule cliquée, comme un clic normal.
        if (!(editor.state.selection instanceof CellSelection)) {
          editor.commands.focus(undefined, { scrollIntoView: false });
          editor.commands.setTextSelection(pos);
        }
        setTableContextMenu({ x: e.clientX, y: e.clientY });
      };

      canvas.addEventListener("mousedown", onMouseDown);
      canvas.addEventListener("click", onClick);
      canvas.addEventListener("contextmenu", onContextMenu);
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return () => {
        canvas.removeEventListener("mousedown", onMouseDown);
        canvas.removeEventListener("click", onClick);
        canvas.removeEventListener("contextmenu", onContextMenu);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    }, [editor]);

    // Page courante (comme "Page 8 sur 27" dans Word) : la page dont la
    // boîte a défilé sous le haut de la zone visible.
    useEffect(() => {
      const wrap = wrapRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas || !editor) return;

      let scheduled = false;
      const recomputeCurrentPage = () => {
        scheduled = false;
        const pages = Array.from(canvas.querySelectorAll<HTMLElement>(".xmd-page"));
        const wrapTop = wrap.getBoundingClientRect().top;
        const thresholdY = wrapTop + 40;
        let page = 1;
        for (let i = 0; i < pages.length; i++) {
          if (pages[i].getBoundingClientRect().top < thresholdY) page = i + 1;
        }
        if (page !== currentPageRef.current) {
          currentPageRef.current = page;
          const words: number = editor.storage.characterCount.words();
          const characters: number = editor.storage.characterCount.characters();
          onStatsRef.current?.({
            words,
            characters,
            pageCount: pageCountRef.current,
            currentPage: page,
            activeBlockStyle: getActiveBlockStyle(editor),
            insideTable: editor.isActive("table"),
            tableSelectionShape: getSelectionShape(editor),
            headerFooterEditMode: headerFooterModeRef.current,
          });
        }
      };

      const onScroll = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(recomputeCurrentPage);
      };

      wrap.addEventListener("scroll", onScroll, { passive: true });
      recomputeCurrentPage();
      return () => wrap.removeEventListener("scroll", onScroll);
    }, [editor]);

    // Ctrl+molette : zoom façon Word/Google Docs. Purement visuel
    // (`transform: scale()` sur `.xmd-page-canvas`, voir le rendu plus bas).
    useEffect(() => {
      const wrap = wrapRef.current;
      if (!wrap || !onZoomChange) return;
      const onWheel = (event: WheelEvent) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.1 : 0.1;
        onZoomChange(zoom + delta);
      };
      wrap.addEventListener("wheel", onWheel, { passive: false });
      return () => wrap.removeEventListener("wheel", onWheel);
    }, [zoom, onZoomChange]);

    const { widthMm: pageWidthMm, heightMm: pageHeightMm } = resolvePageSizeMm(layout);
    const pageVars = {
      "--xmd-font-family": layout.fontFamily,
      "--xmd-font-size": layout.fontSize,
      "--xmd-line-height": layout.lineHeight,
      "--xmd-paragraph-spacing": `${layout.paragraphSpacingPt}pt`,
      "--xmd-zoom": zoom,
      "--xmd-page-height": `${pageHeightMm}mm`,
      "--xmd-page-width": `${pageWidthMm}mm`,
      "--xmd-margin-top": `${layout.marginTopMm}mm`,
      "--xmd-margin-right": `${layout.marginRightMm}mm`,
      "--xmd-margin-bottom": `${layout.marginBottomMm}mm`,
      "--xmd-margin-left": `${layout.marginLeftMm}mm`,
      "--xmd-header-height": `${layout.header.heightMm}mm`,
      "--xmd-footer-height": `${layout.footer.heightMm}mm`,
      // Style par niveau de titre (voir pageLayout.ts) — une variable par
      // propriété et par niveau, consommées par les règles `.xmd-prosemirror
      // h1`...`h6` dans MarkdownEditor.css. La numérotation elle-même n'a
      // pas de variable ici : elle est écrite en dur dans le texte du titre
      // par HeadingAutoNumber.ts, pas affichée en CSS.
      ...Object.fromEntries(
        ([1, 2, 3, 4, 5, 6] as const).flatMap((level) => {
          const style = layout.headingStyles[level];
          return [
            [`--xmd-h${level}-font`, style.fontFamily],
            [`--xmd-h${level}-size`, style.fontSize],
            [`--xmd-h${level}-color`, style.color],
            [`--xmd-h${level}-weight`, style.bold ? "bold" : "normal"],
            [`--xmd-h${level}-style`, style.italic ? "italic" : "normal"],
          ];
        }),
      ),
    } as CSSProperties;

    return (
      <div className="xmd-page-wrap" ref={wrapRef} style={pageVars}>
        {/* Zone RÉELLEMENT éditable — jamais visible. Curseur, sélection,
         * undo/redo, IME : tout ProseMirror natif. Largeur initialisée à une
         * estimation (mm → px) puis corrigée au pixel près dès qu'une page
         * existe pour la mesurer (voir repaint() plus bas) — la mise en
         * ligne du texte doit être IDENTIQUE à celle des boîtes peintes,
         * au risque de décaler la traduction clic → position. */}
        <div
          className="xmd-live-editor-host"
          ref={liveHostRef}
          style={{ width: geometry.contentWidthPx }}
          aria-hidden="true"
        >
          <EditorContent editor={editor} />
        </div>

        {/* Couche peinte : boîtes de page à taille FIXE contenant des clones
         * en lecture seule (voir paintPages.ts). C'est la seule chose que
         * l'utilisateur voit et avec laquelle il clique/glisse.
         * Le curseur dessiné à la main (.xmd-fake-caret) doit être un frère
         * de .xmd-page-canvas SANS aucun autre ancêtre positionné entre les
         * deux : caretPosition.ts calcule ses coordonnées relativement au
         * coin haut-gauche de .xmd-page-canvas — s'il était positionné par
         * rapport à .xmd-page-wrap (qui a du padding), le curseur affiché
         * dériverait de cette différence à chaque frappe. */}
        <div className="xmd-canvas-frame">
          <div className="xmd-page-canvas" ref={canvasRef} />
          <div className="xmd-selection-layer" ref={selectionLayerRef} />
          <div className="xmd-fake-caret" ref={caretRef} />
        </div>

        {tableContextMenu && editor && (
          <TableContextMenu
            x={tableContextMenu.x}
            y={tableContextMenu.y}
            onClose={() => setTableContextMenu(null)}
            onAction={(run) => {
              run(editor);
              setTableContextMenu(null);
            }}
          />
        )}
      </div>
    );
  }
);
MarkdownEditor.displayName = "MarkdownEditor";

/** Menu contextuel clic-droit sur une cellule de tableau (voir `onContextMenu`
 * dans le composant principal) — reprend les mêmes commandes natives de
 * `@tiptap/extension-table` déjà exposées dans le ruban (voir `CLAUDE.md`,
 * inspiré du menu équivalent de CasualOffice/docs, `TextContextMenu.tsx` :
 * right-click dans un tableau y ajoute les mêmes actions que la barre
 * d'outils dédiée, en plus de couper/copier/coller). Les commandes agissent
 * ici directement sur l'instance `editor` (pas besoin de repasser par
 * `MarkdownEditorHandle`/`ToolbarActions` : ce composant a déjà un accès
 * direct, plus simple que de dupliquer l'indirection). */
function TableContextMenu({
  x,
  y,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  onAction: (run: (editor: Editor) => void) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // `setTimeout` : le `contextmenu` natif qui a ouvert ce menu déclenche
    // aussi, juste après, un `mousedown`/`click` fantôme sur certains
    // navigateurs — sans ce délai, le menu se refermerait instantanément
    // lui-même dès son ouverture (même piège que les menus du ruban, voir
    // `Toolbar.tsx`, mais ici sur l'évènement d'OUVERTURE plutôt que sur un
    // clic d'option).
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onMouseDown);
      document.addEventListener("keydown", onKeyDown);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const item = (label: string, run: (editor: Editor) => void, danger?: boolean) => (
    <button
      key={label}
      type="button"
      className={`xmd-table-ctx-item${danger ? " xmd-table-ctx-item-danger" : ""}`}
      onClick={() => onAction(run)}
    >
      {label}
    </button>
  );

  const chain = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => (editor: Editor) =>
    fn(editor.chain().focus(undefined, { scrollIntoView: false })).run();

  return (
    <div
      ref={rootRef}
      className="xmd-table-ctx-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      {item("Insérer une ligne au-dessus", chain((c) => c.addRowBefore()))}
      {item("Insérer une ligne en dessous", chain((c) => c.addRowAfter()))}
      {item("Supprimer la ligne", chain((c) => c.deleteRow()), true)}
      <div className="xmd-table-ctx-sep" />
      {item("Insérer une colonne à gauche", chain((c) => c.addColumnBefore()))}
      {item("Insérer une colonne à droite", chain((c) => c.addColumnAfter()))}
      {item("Supprimer la colonne", chain((c) => c.deleteColumn()), true)}
      <div className="xmd-table-ctx-sep" />
      {item("Fusionner les cellules", chain((c) => c.mergeCells()))}
      {item("Scinder la cellule", chain((c) => c.splitCell()))}
      <div className="xmd-table-ctx-sep" />
      {item("Supprimer le tableau", chain((c) => c.deleteTable()), true)}
    </div>
  );
}
