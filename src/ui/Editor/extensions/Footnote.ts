/**
 * Notes de bas de page — en réalité des notes de FIN DE DOCUMENT (choix
 * assumé, voir CLAUDE.md) : une vraie note « en bas de CHAQUE page » serait
 * bien plus complexe avec notre système de pagination (il faudrait savoir
 * sur quelle page atterrit chaque référence, potentiellement différent à
 * chaque frappe).
 *
 * Deux nœuds Tiptap, syntaxe Markdown standard (identique à ce que
 * produisent Pandoc/GFM-footnotes) :
 * - `FootnoteReference` (inline, atome) : `[^1]` dans le texte, rendu en
 *   exposant cliquable (saute à sa définition).
 * - `FootnoteDefinition` (bloc, contenu éditable normal) : `[^1]: Texte de
 *   la note.`, généralement en fin de document.
 *
 * Même principe de parsing/sérialisation que `PageBreak.ts`/`TocMarker.ts`
 * (règles markdown-it manuelles + parseHTML/renderHTML Tiptap), mais
 * `FootnoteDefinition` a un contenu RÉEL (`inline*`, pas juste un
 * commentaire opaque) : la règle de bloc doit donc pousser un token
 * "inline" séparé (comme le fait markdown-it pour un paragraphe normal),
 * pas produire un unique token auto-fermant.
 *
 * Numérotation : l'`id` (ex. "1") est celui choisi à la création
 * (`insertFootnote` dans MarkdownEditor.tsx, calculé comme "1 + le plus
 * grand id déjà utilisé"), PAS recalculé automatiquement à chaque frappe
 * comme la numérotation des titres — supprimer une note au milieu ne
 * renumérote pas les suivantes (comportement simple et prévisible, comme
 * la plupart des implémentations Markdown basiques).
 */
import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnoteReference: (id: string) => ReturnType;
      insertFootnoteDefinition: (id: string) => ReturnType;
    };
  }
}

export const FootnoteReference = Node.create({
  name: "footnoteReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { id: { default: "1" } };
  },

  parseHTML() {
    // PIÈGE : `Superscript` (@tiptap/extension-superscript) déclare aussi
    // une règle pour la balise `<sup>`, nue (sans condition d'attribut).
    // ProseMirror essaie les règles dans l'ordre d'enregistrement des
    // extensions par défaut — comme `Superscript` est déclaré AVANT cette
    // extension dans `MarkdownEditor.tsx`, sa règle "n'importe quel <sup>"
    // gagnait systématiquement, transformant notre nœud personnalisé en
    // simple marque exposant sans aucun de nos attributs (constaté : un
    // `<sup data-type="footnote-ref" data-id="1">` sorti tel quel de
    // markdown-it devenait un `<sup>1</sup>` nu une fois passé par
    // ProseMirror). `priority` (défaut 50, plus haut = essayé en premier)
    // fait gagner cette règle plus spécifique AVANT celle, générique, de
    // Superscript — peu importe l'ordre des extensions.
    return [
      {
        tag: 'sup[data-type="footnote-ref"]',
        priority: 100,
        getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute("data-id") }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "sup",
      mergeAttributes(HTMLAttributes, { "data-type": "footnote-ref", "data-id": node.attrs.id, class: "xmd-footnote-ref" }),
      node.attrs.id,
    ];
  },

  addCommands() {
    return {
      insertFootnoteReference:
        (id: string) =>
        ({ chain }: any) =>
          chain().insertContent({ type: this.name, attrs: { id } }).run(),
    } as any;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[^${node.attrs.id}]`);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.inline.ruler.before("link", "footnote-ref", (state: any, silent: boolean) => {
              const src = state.src;
              const start = state.pos;
              if (src[start] !== "[" || src[start + 1] !== "^") return false;
              const end = src.indexOf("]", start);
              if (end === -1) return false;
              const id = src.slice(start + 2, end);
              // Une référence n'a pas de ":" (sinon c'est une DÉFINITION en
              // début de ligne, gérée par la règle de bloc plus bas) ni
              // d'espace (identifiant simple, comme "1" ou "note-a").
              if (!id || /[\s:]/.test(id)) return false;
              if (!silent) {
                const token = state.push("footnote_ref", "", 0);
                token.meta = { id };
              }
              state.pos = end + 1;
              return true;
            });
            markdownit.renderer.rules.footnote_ref = (tokens: any, idx: number) => {
              const { id } = tokens[idx].meta;
              return `<sup data-type="footnote-ref" data-id="${id}" class="xmd-footnote-ref">${id}</sup>`;
            };
          },
        },
      },
    };
  },
});

const DEFINITION_RE = /^\[\^([^\]:\s]+)\]:\s?(.*)$/;

export const FootnoteDefinition = Node.create({
  name: "footnoteDefinition",
  group: "block",
  content: "inline*",

  addAttributes() {
    return { id: { default: "1" } };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="footnote-def"]', getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute("data-id") }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "footnote-def", "data-id": node.attrs.id, class: "xmd-footnote-def" }),
      0,
    ];
  },

  addCommands() {
    return {
      insertFootnoteDefinition:
        (id: string) =>
        ({ chain }: any) =>
          chain().insertContent({ type: this.name, attrs: { id }, content: [] }).run(),
    } as any;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`[^${node.attrs.id}]: `);
          state.renderInline(node);
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.block.ruler.before(
              "paragraph",
              "footnote-def",
              (state: any, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max);
                const match = line.match(DEFINITION_RE);
                if (!match) return false;
                if (silent) return true;

                const openToken = state.push("footnote_def_open", "div", 1);
                openToken.attrSet("data-type", "footnote-def");
                openToken.attrSet("data-id", match[1]);
                openToken.map = [startLine, startLine + 1];

                const inlineToken = state.push("inline", "", 0);
                inlineToken.content = match[2];
                inlineToken.map = [startLine, startLine + 1];
                inlineToken.children = [];

                state.push("footnote_def_close", "div", -1);
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
