/**
 * Marqueur de sommaire. Persisté dans le Markdown sous forme d'un
 * commentaire HTML standard `<!-- toc -->` (invisible et sans casse dans
 * tout autre outil Markdown), rendu à l'écran comme un encart "Sommaire —
 * cliquez sur Générer/Mettre à jour". Même principe que `PageBreak.ts`
 * (voir ce fichier pour le détail du pipeline de parsing markdown-it).
 *
 * Fonctionnement voulu (choisi explicitement, pas le seul possible) : le
 * marqueur est REMPLACÉ par une vraie liste Markdown (texte réel, pas un
 * calcul d'affichage) au clic sur "Générer" — donc lisible et navigable
 * dans n'importe quel autre outil Markdown, comme tout le reste du document.
 * Limite acceptée : une fois généré, le marqueur a disparu (remplacé) ; pour
 * régénérer un sommaire à jour après avoir ajouté des titres, il faut
 * supprimer l'ancienne liste et insérer un nouveau `<!-- toc -->` — pas de
 * marqueur de fin caché pour retrouver automatiquement les bornes d'un
 * sommaire déjà généré (aurait ajouté une complexité et un risque de
 * corruption pas demandés).
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { uniqueHeadingSlug } from "../pagination/slug";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tocMarker: {
      insertTocMarker: () => ReturnType;
      generateToc: () => ReturnType;
    };
  }
}

const TOC_COMMENT = /^<!--\s*toc\s*-->$/i;

interface TocHeading {
  level: number;
  text: string;
}

function collectHeadings(doc: any): TocHeading[] {
  const headings: TocHeading[] = [];
  doc.descendants((node: any) => {
    if (node.type.name === "heading") {
      headings.push({ level: node.attrs.level, text: node.textContent });
    }
    return true;
  });
  return headings;
}

/** Construit une liste à puces IMBRIQUÉE (JSON de nœuds ProseMirror) à
 * partir d'une liste plate de titres avec leur niveau — chaque titre devient
 * l'enfant du titre précédent le plus proche de niveau strictement inférieur.
 * Chaque entrée est un vrai LIEN (`#slug`, voir `pagination/slug.ts`) —
 * cliquable dans l'éditeur pour sauter au titre correspondant (voir le
 * gestionnaire de clic dans `MarkdownEditor.tsx`) ET dans n'importe quel
 * rendu Markdown→HTML classique (ancre standard). L'ordre de parcours ET
 * l'algorithme de slug DOIVENT rester identiques à `paintPages.ts`, sinon
 * le lien généré ici ne correspondrait à aucun `id` réellement posé sur les
 * titres peints. */
function buildTocContent(headings: TocHeading[]): any {
  if (headings.length === 0) {
    return { type: "paragraph", content: [{ type: "text", text: "(Aucun titre dans le document)" }] };
  }

  const usedSlugs = new Set<string>();
  const withSlugs = headings.map((h) => ({ ...h, slug: uniqueHeadingSlug(h.text, usedSlugs) }));

  interface Frame {
    level: number;
    ownerListItem: any | null;
    items: any[];
  }
  const root: Frame = { level: 0, ownerListItem: null, items: [] };
  const stack: Frame[] = [root];

  const closeFrame = () => {
    const finished = stack.pop()!;
    if (finished.ownerListItem && finished.items.length > 0) {
      finished.ownerListItem.content.push({ type: "bulletList", content: finished.items });
    }
  };

  for (const h of withSlugs) {
    while (stack.length > 1 && h.level <= stack[stack.length - 1].level) {
      closeFrame();
    }
    const listItem = {
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: h.text
            ? [{ type: "text", text: h.text, marks: [{ type: "link", attrs: { href: `#${h.slug}` } }] }]
            : [],
        },
      ],
    };
    stack[stack.length - 1].items.push(listItem);
    stack.push({ level: h.level, ownerListItem: listItem, items: [] });
  }
  while (stack.length > 1) closeFrame();

  return { type: "bulletList", content: root.items };
}

export const TocMarker = Node.create({
  name: "tocMarker",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="toc-marker"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toc-marker", class: "xmd-toc-marker" })];
  },

  addCommands() {
    return {
      insertTocMarker:
        () =>
        ({ chain }: any) =>
          chain().insertContent({ type: this.name }).run(),

      // Remplace TOUS les marqueurs présents par le sommaire généré ; s'il
      // n'y en a aucun, insère directement le sommaire à la position du
      // curseur (confort — évite un aller-retour "insérer le marqueur PUIS
      // générer" quand on veut juste un sommaire tout de suite).
      generateToc:
        () =>
        ({ tr, state, dispatch, chain }: any) => {
          const headings = collectHeadings(state.doc).filter(
            // Le sommaire ne doit jamais se citer lui-même : sans intérêt
            // ici puisque le marqueur n'est pas un titre, mais on protège
            // quand même contre un futur changement de schéma.
            (h: TocHeading) => h.level >= 1,
          );
          const content = buildTocContent(headings);

          let foundMarker = false;
          const positions: number[] = [];
          state.doc.descendants((node: any, pos: number) => {
            if (node.type.name === "tocMarker") {
              foundMarker = true;
              positions.push(pos);
            }
            return true;
          });

          if (!foundMarker) {
            return chain().insertContent(content).run();
          }

          if (dispatch) {
            // En partant de la fin : remplacer un marqueur ne doit pas
            // décaler la position des marqueurs suivants qu'on n'a pas
            // encore traités.
            for (let i = positions.length - 1; i >= 0; i--) {
              const pos = positions[i];
              const node = state.doc.nodeAt(pos);
              if (!node) continue;
              const contentNode = state.schema.nodeFromJSON(content);
              tr.replaceWith(pos, pos + node.nodeSize, contentNode);
            }
            dispatch(tr);
          }
          return true;
        },
    } as any;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("<!-- toc -->");
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.block.ruler.before(
              "html_block",
              "tocmarker",
              (state: any, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max);
                if (!TOC_COMMENT.test(line.trim())) return false;
                if (silent) return true;
                const token = state.push("tocmarker", "div", 0);
                token.map = [startLine, startLine + 1];
                token.attrSet("data-type", "toc-marker");
                token.attrSet("class", "xmd-toc-marker");
                state.line = startLine + 1;
                return true;
              }
            );
            markdownit.renderer.rules.tocmarker = () => {
              return `<div data-type="toc-marker" class="xmd-toc-marker"></div>`;
            };
          },
        },
      },
    };
  },
});
