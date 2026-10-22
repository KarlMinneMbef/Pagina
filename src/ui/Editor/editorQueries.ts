/**
 * Requêtes en LECTURE SEULE sur l'état de l'éditeur (style actif, marques,
 * alignement, listes, objets sélectionnés, recherche) — alimentent
 * `EditorStats` et les panneaux. Extraites de MarkdownEditor.tsx : aucune
 * dépendance à React, uniquement l'instance Tiptap passée en argument.
 */
import type { Editor } from "@tiptap/react";
import type { EditorStats, FindReplaceOptions } from "./MarkdownEditor";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { isInsideToc } from "./extensions/TocMarker";
import { findCoverZoneAround } from "./extensions/CoverZone";

/** Style de bloc sous le curseur (paragraphe normal ou Titre 1-6) — voir
 * `EditorStats.activeBlockStyle`. */
export function getActiveBlockStyle(editor: Editor): EditorStats["activeBlockStyle"] {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    if (editor.isActive("heading", { level })) return level;
  }
  return "paragraph";
}

/** Marques actives sous le curseur/la sélection — pilote la mise en
 * évidence des boutons correspondants du ruban (Gras, Italique...), comme
 * Word. */
export function getActiveMarks(editor: Editor): EditorStats["activeMarks"] {
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    code: editor.isActive("code"),
    subscript: editor.isActive("subscript"),
    superscript: editor.isActive("superscript"),
    highlight: editor.isActive("highlight"),
  };
}

/** Alignement de paragraphe actif sous le curseur, ou `null` si aucun
 * alignement explicite (défaut "left" du navigateur, pas marqué actif). */
export function getActiveAlign(editor: Editor): EditorStats["activeAlign"] {
  for (const align of ["left", "center", "right", "justify"] as const) {
    if (editor.isActive({ textAlign: align })) return align;
  }
  return null;
}

/** Type de liste/bloc actif sous le curseur — pilote la mise en évidence
 * des boutons Puces/Numérotée/Tâches/Citation. */
export function getActiveListType(editor: Editor): EditorStats["activeList"] {
  if (editor.isActive("bulletList")) return "bullet";
  if (editor.isActive("orderedList")) return "ordered";
  if (editor.isActive("taskList")) return "task";
  if (editor.isActive("blockquote")) return "blockquote";
  return null;
}

/** Police de la sélection (attribut `fontSize`/`fontFamily` de la marque
 * `textStyle`, voir `currentFontSizePt`) — `null` si aucune police
 * personnalisée n'est posée (police par défaut du document). */
/** Le curseur est-il dans un sommaire généré — voir `EditorStats.insideToc`. */
export function getInsideToc(editor: Editor): boolean {
  return isInsideToc(editor.state.doc, editor.state.selection.from);
}

/** Formule mathématique sélectionnée, pour le panneau latéral
 * « Équation » (voir `EditorStats.math`). Une formule est un nœud ATOME :
 * la sélection la désigne par NodeSelection (posée à l'insertion ou au
 * clic sur la formule peinte), jamais par un curseur « dedans ». */
/**
 * Toutes les occurrences de `query` dans le document, dans l'ordre —
 * moteur du panneau « Rechercher / Remplacer » (roadmap 2.4). Parcours
 * des nœuds TEXTE (les positions retournées sont des positions de
 * document directement sélectionnables), recherche non chevauchante.
 */
export function findMatchesInDoc(
  doc: ProseNode,
  query: string,
  options: FindReplaceOptions,
): { from: number; to: number }[] {
  const matches: { from: number; to: number }[] = [];
  if (!query) return matches;
  const needle = options.matchCase ? query : query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    const hay = options.matchCase ? node.text : node.text.toLowerCase();
    let idx = hay.indexOf(needle);
    while (idx !== -1) {
      // « Mots entiers » : l'occurrence doit être bordée de caractères
      // non "mot" de chaque côté (définition lettre/chiffre proche de
      // Word — les accents ne comptent pas comme bordure, comportement
      // mineur assumé).
      const wordBefore = idx > 0 && /[A-Za-z0-9_]/.test(hay[idx - 1]);
      const wordAfter = idx + needle.length < hay.length && /[A-Za-z0-9_]/.test(hay[idx + needle.length]);
      if (!(options.wholeWord && (wordBefore || wordAfter))) {
        matches.push({ from: pos + idx, to: pos + idx + needle.length });
      }
      idx = hay.indexOf(needle, idx + needle.length);
    }
    return true;
  });
  return matches;
}

/** Diagramme Mermaid sélectionné (NodeSelection posée au clic sur le
 * diagramme peint ou à l'insertion) — pilote le panneau latéral
 * « Diagramme » (roadmap Mermaid, 2026-10-21), même principe que
 * `getMathAtSelection` pour le panneau Équation. */
export function getMermaidAtSelection(editor: Editor): EditorStats["mermaid"] {
  const sel = editor.state.selection;
  const selNode = (sel as unknown as { node?: { type: { name: string }; attrs: { source?: string } } }).node;
  if (selNode && selNode.type.name === "mermaidDiagram") {
    return { pos: sel.from, source: String(selNode.attrs.source ?? "") };
  }
  return null;
}

/** Zone page de garde contenant le curseur (ou un marqueur sélectionné) —
 *  pilote le panneau latéral « Page de garde » (front montant dans
 *  App.tsx, comme le panneau Tableau avec insideTable). */
export function getCoverZoneAtSelection(editor: Editor): EditorStats["coverZone"] {
  return findCoverZoneAround(editor.state.doc, editor.state.selection.from);
}

export function getMathAtSelection(editor: Editor): EditorStats["math"] {
  const sel = editor.state.selection;
  const selNode = (sel as unknown as { node?: { type: { name: string }; attrs: { source?: string } } }).node;
  if (selNode && (selNode.type.name === "inlineMath" || selNode.type.name === "blockMath")) {
    return {
      kind: selNode.type.name === "inlineMath" ? "inline" : "block",
      source: String(selNode.attrs.source ?? ""),
      pos: sel.from,
    };
  }
  return null;
}

export function currentTextColor(editor: Editor): string | null {
  const color = editor.getAttributes("textStyle").color;
  return typeof color === "string" && color ? color : null;
}

export function currentFontFamily(editor: Editor): string | null {
  const family = editor.getAttributes("textStyle").fontFamily;
  return typeof family === "string" && family ? family : null;
}
