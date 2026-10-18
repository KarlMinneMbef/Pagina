/**
 * Signet (marque-page) : ancre nommée posée à une position du document,
 * cible des « Renvois » (`insertCrossReference` dans MarkdownEditor.tsx —
 * un simple lien Markdown `[texte](#id)`).
 *
 * Sérialisation compatible .md : une ancre HTML `<a id="…"></a>` —
 * invisible dans tout autre outil Markdown (HTML inline valide en
 * CommonMark/GFM), et suffisante pour qu'un lien `#id` fonctionne dans
 * tout moteur de rendu. Aucun rendu visible dans Pagina (l'élément est
 * vide — c'est une cible, pas un contenu).
 */
import { Node } from "@tiptap/core";

export const Bookmark = Node.create({
  name: "bookmark",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      id: { default: "" },
    };
  },
  parseHTML() {
    // Une ancre AVEC href est la marque Link — ne capturer que les ancres
    // nues (posées par ce nœud).
    return [{ tag: "a[id]:not([href])" }];
  },
  renderHTML({ node }) {
    return ["a", { id: node.attrs.id, class: "xmd-bookmark" }];
  },
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`<a id="${node.attrs.id}"></a>`);
        },
        parse: {
          // Rien à faire : `<a id="…">` est du HTML inline standard, déjà
          // rendu tel quel par markdown-it (`html: true`) puis capté par
          // `parseHTML` ci-dessus au moment où Tiptap parse le DOM.
        },
      },
    };
  },
});
