/**
 * Marque « commentaire de relecture » (2026-10-27, roadmap 5.2 — même modèle
 * que la `CommentExtension` de CasualOffice : une MARQUE sur le texte
 * souligné, l'identifiant reliant la marque au commentaire). Le CONTENU du
 * commentaire vit dans `comments.json` du conteneur `.xmd` (voir
 * core/xmd/comments.ts) ; l'ancre vit dans le texte comme repli HTML
 * discret `<span data-comment="c…">texte</span>` — invisible dans tout autre
 * lecteur Markdown, surlignée dans Pagina (et jamais imprimée : le style
 * d'édition est retiré à l'impression, voir MarkdownEditor.css).
 */
import { Mark, mergeAttributes } from "@tiptap/core";

export const CommentMark = Mark.create({
  name: "comment",

  addAttributes() {
    return {
      id: { default: "" },
    };
  },

  // Non inclusive : taper à côté du surlignage n'étend pas le commentaire.
  inclusive: false,

  parseHTML() {
    return [
      {
        tag: "span[data-comment]",
        getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute("data-comment") ?? "" }),
      },
    ];
  },

  renderHTML({ mark, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-comment": mark.attrs.id,
        class: "xmd-comment",
      }),
      0,
    ];
  },

  addStorage() {
    return {
      markdown: {
        // Repli HTML : `<span data-comment="c…">texte</span>` — lisible
        // partout, relu tel quel à l'ouverture (parseHTML ci-dessus).
        serialize: {
          open(_state: any, mark: any, _parent: any, _index: any) {
            return `<span data-comment="${mark.attrs.id}">`;
          },
          close(_state: any, _mark: any, _parent: any, _index: any) {
            return "</span>";
          },
        },
        parse: {},
      },
    };
  },
});
