/**
 * Sérialisation Markdown des paragraphes VIDES (plusieurs Entrée pour espacer
 * deux paragraphes) — remplace le comportement par défaut de
 * `tiptap-markdown`/`prosemirror-markdown`
 * (`defaultMarkdownSerializer.nodes.paragraph`), qui n'écrit RIEN pour un
 * paragraphe vide : le séparateur de bloc Markdown standard (une ligne
 * blanche) est le même que le document ait 1 ou 5 paragraphes vides entre
 * deux blocs de texte — impossible de distinguer "juste un saut de
 * paragraphe normal" de "l'utilisateur a délibérément appuyé plusieurs fois
 * sur Entrée pour créer de l'espace" une fois repassé par le Markdown.
 *
 * Retour utilisateur exact ("il doit manquer une ligne de commentaire pour
 * que je les récupère") — même principe que `PageBreak.ts`/`TocMarker.ts` :
 * persister l'information dans un commentaire HTML invisible
 * (`<!-- empty-line -->`), lisible/ignoré sans casse par n'importe quel
 * autre outil Markdown, plutôt que d'inventer une syntaxe non standard.
 *
 * Ne change RIEN pour un paragraphe non vide (repli sur le comportement de
 * base) — seuls les paragraphes strictement vides sont concernés.
 */
import { Paragraph as ParagraphBase } from "@tiptap/extension-paragraph";

const EMPTY_LINE_COMMENT = /^<!--\s*empty-line\s*-->$/i;

export const ParagraphMarkdown = ParagraphBase.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          if (node.content.size === 0) {
            state.write("<!-- empty-line -->");
            state.closeBlock(node);
            return;
          }
          state.renderInline(node);
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            // Reconstruit un paragraphe VIDE (pas un texte "<!-- empty-line -->"
            // littéral) : on pousse les mêmes tokens qu'un paragraphe normal
            // sans contenu (paragraph_open/inline vide/paragraph_close), pris
            // en charge par le rendu par défaut de markdown-it (`<p></p>`),
            // que Tiptap sait déjà parser vers un nœud paragraphe vide — pas
            // besoin de règle de rendu personnalisée, contrairement à
            // `PageBreak.ts`/`TocMarker.ts` qui introduisent un type de nœud
            // entièrement nouveau.
            markdownit.block.ruler.before(
              "html_block",
              "empty_line",
              (state: any, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max);
                if (!EMPTY_LINE_COMMENT.test(line.trim())) return false;
                if (silent) return true;
                state.push("paragraph_open", "p", 1);
                const inlineToken = state.push("inline", "", 0);
                inlineToken.content = "";
                inlineToken.children = [];
                state.push("paragraph_close", "p", -1);
                state.line = startLine + 1;
                return true;
              },
            );
          },
        },
      },
    };
  },
});
