/**
 * Attributs "Format avancé" des cellules de tableau — couleur de fond et
 * bordures par côté (haut/droite/bas/gauche), façon Word. Aucun équivalent
 * en Markdown/GFM standard (voir `TableMarkdown.ts`, dont `isMarkdownSerializable`
 * bascule automatiquement en `<table>` HTML dès qu'une cellule utilise l'un
 * de ces attributs — même principe que pour la fusion de cellules, déjà géré
 * là-bas) : ces deux fichiers doivent rester synchronisés.
 *
 * Étend `@tiptap/extension-table-cell`/`-table-header` (pas des nœuds
 * réécrits à zéro comme `PageBreak`/`TocMarker` — il faut conserver tout le
 * schéma/comportement des vraies cellules de tableau, juste ajouter des
 * attributs). Chaque attribut a son propre `renderHTML` retournant
 * `{ style: "…" }` — `mergeAttributes` de `@tiptap/core` fusionne
 * correctement plusieurs `style` (vérifié dans son code source), donc pas
 * besoin d'un seul renderHTML combiné à la main.
 */
import TableCellBase from "@tiptap/extension-table-cell";
import TableHeaderBase from "@tiptap/extension-table-header";

/** Côté d'une bordure de cellule (schéma de bordures du panneau Tableau). */
export type BorderSide = "borderTop" | "borderRight" | "borderBottom" | "borderLeft";

const BORDER_SIDES: BorderSide[] = ["borderTop", "borderRight", "borderBottom", "borderLeft"];

const CSS_BORDER_PROPERTY: Record<BorderSide, string> = {
  borderTop: "border-top",
  borderRight: "border-right",
  borderBottom: "border-bottom",
  borderLeft: "border-left",
};

/** Bordure d'un côté, lue sur le style en ligne d'une cellule. On lit les propriétés DÉTAILLÉES
 *  (style, épaisseur, couleur) : le raccourci `style.borderTop` est VIDE dans Chrome pour
 *  `border-top: none` et pour `border: none` (bordure en raccourci d'un modèle ou écrite à la
 *  main) — la bordure était alors perdue et l'éditeur affichait des bordures par défaut là où la
 *  page n'en avait aucune. */
export function parseSideBorder(element: HTMLElement, side: BorderSide): string | null {
  const st = element.style as unknown as Record<string, string>;
  const short = st[side];
  if (short && !/^medium\b/.test(short)) return short;
  const style = st[`${side}Style`];
  if (!style) return null;
  if (style === "none" || style === "hidden") return "none";
  return [st[`${side}Width`], style, st[`${side}Color`]].filter(Boolean).join(" ");
}

function cellStyleAttributes() {
  const attrs: Record<string, any> = {
    backgroundColor: {
      default: null,
      parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
      renderHTML: (attributes: any) => {
        if (!attributes.backgroundColor) return {};
        return { style: `background-color: ${attributes.backgroundColor};` };
      },
    },
    /** Haut/milieu/bas — sans équivalent Markdown standard, comme le reste
     * de ce fichier (voir `isMarkdownSerializable` dans `TableMarkdown.ts`,
     * étendu en même temps que cet attribut pour forcer le repli HTML). */
    verticalAlign: {
      default: null,
      parseHTML: (element: HTMLElement) => element.style.verticalAlign || null,
      renderHTML: (attributes: any) => {
        if (!attributes.verticalAlign) return {};
        return { style: `vertical-align: ${attributes.verticalAlign};` };
      },
    },
  };
  for (const side of BORDER_SIDES) {
    attrs[side] = {
      default: null,
      parseHTML: (element: HTMLElement) => parseSideBorder(element, side),
      renderHTML: (attributes: any) => {
        const value = attributes[side];
        if (!value) return {};
        return { style: `${CSS_BORDER_PROPERTY[side]}: ${value};` };
      },
    };
  }
  return attrs;
}

/** Cellule de tableau stylée : bordures par côté, fond, alignement
 *  vertical — repli HTML dès qu'on sort du GFM. */
export const TableCellStyled = TableCellBase.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...cellStyleAttributes(),
    };
  },
});

/** Cellule d'en-tête de tableau — mêmes réglages que TableCellStyled. */
export const TableHeaderStyled = TableHeaderBase.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...cellStyleAttributes(),
    };
  },
});
