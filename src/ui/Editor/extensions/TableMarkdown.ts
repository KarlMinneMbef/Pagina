/**
 * Sérialisation Markdown des tableaux AVEC alignement de colonne
 * (`:---`/`:---:`/`---:` dans la ligne de séparation GFM), remplace celle de
 * `tiptap-markdown` par défaut (`node_modules/tiptap-markdown/src/
 * extensions/nodes/table.js`) qui écrit toujours `---` pour toutes les
 * colonnes, quel que soit l'alignement réellement appliqué (constaté en
 * lisant leur code source : aucune trace du mot "align" dans tout le
 * paquet). Reprend leur logique presque à l'identique — seule la ligne de
 * séparation change — pour rester cohérent avec leur comportement de repli
 * HTML pour les tableaux trop complexes pour du Markdown pur (fusion de
 * cellules, cellules multi-paragraphes...).
 *
 * L'alignement lu ici (`cell.attrs.textAlign`) est celui posé par
 * l'extension `@tiptap/extension-text-align` (voir `MarkdownEditor.tsx`,
 * `TextAlign.configure({ types: [...,"tableCell","tableHeader"] })`) — pas
 * un attribut spécifique à cette extension. Une colonne "mixte" (cellules
 * de la même colonne avec des alignements différents) retombe sur
 * l'alignement de la cellule de la PREMIÈRE ligne pour cette colonne — GFM
 * n'autorise qu'un seul alignement par colonne, il faut trancher.
 */
import { getHTMLFromFragment } from "@tiptap/core";
import { Table as TableBase } from "@tiptap/extension-table";
import { Fragment } from "@tiptap/pm/model";

function hasSpan(node: any): boolean {
  return node.attrs.colspan > 1 || node.attrs.rowspan > 1;
}

/** Couleur de fond / bordures par côté (voir `TableCellStyle.ts`, onglet
 * "Format avancé") : sans équivalent GFM, forcent le même repli HTML que la
 * fusion de cellules. `colwidth` (largeur de colonne redimensionnée à la
 * souris, voir `applyColumnWidth` dans `MarkdownEditor.tsx`) de même : GFM
 * n'a aucune notion de largeur de colonne personnalisée, une largeur non
 * nulle quelque part serait SILENCIEUSEMENT perdue à l'enregistrement sans
 * ce repli. */
function hasAdvancedStyle(node: any): boolean {
  return !!(
    node.attrs.backgroundColor ||
    node.attrs.borderTop ||
    node.attrs.borderRight ||
    node.attrs.borderBottom ||
    node.attrs.borderLeft ||
    node.attrs.verticalAlign ||
    (Array.isArray(node.attrs.colwidth) && node.attrs.colwidth.some((w: number | null) => w))
  );
}

/** Hauteur de ligne personnalisée (voir `TableRowStyle.ts`) : même absence
 * d'équivalent GFM, même repli HTML nécessaire. */
function hasRowHeight(row: any): boolean {
  return !!row.attrs.height;
}

function childNodes(node: any): any[] {
  const nodes: any[] = [];
  node.forEach((child: any) => nodes.push(child));
  return nodes;
}

function isMarkdownSerializable(node: any): boolean {
  const rows = childNodes(node);
  const firstRow = rows[0];
  const bodyRows = rows.slice(1);

  if (rows.some(hasRowHeight)) {
    return false;
  }
  if (
    childNodes(firstRow).some(
      (cell) => cell.type.name !== "tableHeader" || hasSpan(cell) || hasAdvancedStyle(cell) || cell.childCount > 1,
    )
  ) {
    return false;
  }
  if (
    bodyRows.some((row) =>
      childNodes(row).some(
        (cell) => cell.type.name === "tableHeader" || hasSpan(cell) || hasAdvancedStyle(cell) || cell.childCount > 1,
      ),
    )
  ) {
    return false;
  }
  return true;
}

function alignMarker(align: string | null | undefined): string {
  switch (align) {
    case "center":
      return ":---:";
    case "right":
      return "---:";
    case "left":
      return ":---";
    default:
      return "---";
  }
}

function formatHtmlBlock(html: string): string {
  const dom = new DOMParser().parseFromString(html, "text/html");
  const element = dom.body.firstElementChild;
  if (!element) return html;
  element.innerHTML = element.innerHTML.trim() ? `\n${element.innerHTML}\n` : "\n";
  return element.outerHTML;
}

/** Tableau étendu : bascule automatique en `<table>` HTML dès qu'un
 *  réglage sort du GFM (fusion, bordures, hauteurs de ligne). */
export const TableMarkdown = TableBase.extend({
  addStorage() {
    return {
      markdown: {
        serialize(this: any, state: any, node: any, parent: any) {
          if (!isMarkdownSerializable(node)) {
            // Repli HTML brut, identique au comportement par défaut de
            // tiptap-markdown pour un tableau trop complexe (fusions de
            // cellules...) — nécessite `Markdown.configure({ html: true })`.
            if (this.editor.storage.markdown.options.html) {
              const html = getHTMLFromFragment(Fragment.from(node), node.type.schema);
              const isTopLevel = parent instanceof Fragment || parent.type.name === node.type.schema.topNodeType.name;
              state.write(isTopLevel ? formatHtmlBlock(html) : html);
            } else {
              state.write("[table]");
            }
            state.closeBlock(node);
            return;
          }

          state.inTable = true;
          const rows = childNodes(node);
          let columnAligns: string[] = [];

          node.forEach((row: any, _p: any, i: number) => {
            state.write("| ");
            row.forEach((col: any, _cp: any, j: number) => {
              if (j) state.write(" | ");
              if (i === 0) columnAligns[j] = col.attrs.textAlign;
              const cellContent = col.firstChild;
              if (cellContent && cellContent.textContent.trim()) {
                state.renderInline(cellContent);
              }
            });
            state.write(" |");
            state.ensureNewLine();
            if (!i) {
              const delimiterRow = columnAligns.map((align) => alignMarker(align)).join(" | ");
              state.write(`| ${delimiterRow} |`);
              state.ensureNewLine();
            }
          });
          void rows;
          state.closeBlock(node);
          state.inTable = false;
        },
        parse: {
          // Pris en charge par markdown-it (voir tiptap-markdown) — cette
          // extension ne fait que remplacer la SÉRIALISATION (Markdown en
          // sortie), pas le parsing (Markdown en entrée), qui gère déjà
          // correctement `:---:` etc. pour restituer `textAlign` à la
          // relecture (comportement standard de markdown-it-gfm-table).
        },
      },
    };
  },
});
