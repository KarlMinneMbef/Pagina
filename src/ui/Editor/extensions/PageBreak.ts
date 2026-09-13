/**
 * Nœud "Saut de page". Persisté dans le Markdown sous forme d'un commentaire
 * HTML standard `<!-- pagebreak -->` (invisible et sans casse dans tout autre
 * outil Markdown), mais rendu à l'écran comme une ligne "Saut de page".
 *
 * Pipeline de parsing (voir tiptap-markdown) : markdown-it transforme le texte
 * en HTML, puis ProseMirror parse ce HTML via parseHTML() ci-dessous. On
 * ajoute donc une règle de bloc markdown-it (repère la ligne) + une règle de
 * rendu (émet le HTML que parseHTML sait reconnaître).
 */
import { Node, mergeAttributes } from "@tiptap/core";

const PAGEBREAK_COMMENT = /^<!--\s*pagebreak\s*-->$/i;

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "page-break", class: "xmd-pagebreak" })];
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ chain }: any) =>
          chain().insertContent({ type: this.name }).run(),
    } as any;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("<!-- pagebreak -->");
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.block.ruler.before(
              "html_block",
              "pagebreak",
              (state: any, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max);
                if (!PAGEBREAK_COMMENT.test(line.trim())) return false;
                if (silent) return true;
                const token = state.push("pagebreak", "div", 0);
                token.map = [startLine, startLine + 1];
                token.attrSet("data-type", "page-break");
                token.attrSet("class", "xmd-pagebreak");
                state.line = startLine + 1;
                return true;
              }
            );
            markdownit.renderer.rules.pagebreak = (tokens: any, idx: number) => {
              const token = tokens[idx];
              return `<div data-type="page-break" class="xmd-pagebreak">${token.attrGet("hidden") ? "" : ""}</div>`;
            };
          },
        },
      },
    };
  },
});
