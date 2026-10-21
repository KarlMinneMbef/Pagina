/**
 * Attribut "hauteur" des lignes de tableau — aucun équivalent en Markdown/
 * GFM standard (voir `TableMarkdown.ts`, dont `isMarkdownSerializable`
 * bascule automatiquement en `<table>` HTML dès qu'une ligne a une hauteur
 * personnalisée, même principe que `TableCellStyle.ts` pour les attributs
 * de cellule). Étend `@tiptap/extension-table-row` (pas un nœud réécrit à
 * zéro) pour conserver tout le schéma/comportement natif, juste ajouter cet
 * attribut.
 */
import TableRowBase from "@tiptap/extension-table-row";

/** Ligne de tableau étendue : attribut hauteur — détail en tête de fichier. */
export const TableRowStyled = TableRowBase.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const value = element.style.height || element.getAttribute("height");
          return value ? parseFloat(value) : null;
        },
        renderHTML: (attributes: any) => {
          if (!attributes.height) return {};
          return { style: `height: ${attributes.height}px;` };
        },
      },
    };
  },
});
