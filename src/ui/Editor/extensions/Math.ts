/**
 * Formules mathématiques LaTeX — `$formule$` en ligne, `$$formule$$` en
 * bloc (convention Pandoc/GFM la plus répandue). Rendu STATIQUE via KaTeX
 * (`katex.renderToString`, synchrone — pas besoin de NodeView asynchrone
 * comme pour Mermaid). Édition : clic sur une formule déjà rendue → invite
 * (`window.prompt`, même schéma que `setLink`/`insertImage` ailleurs dans
 * ce projet) pré-remplie avec la source LaTeX actuelle — voir le
 * gestionnaire de clic dans `MarkdownEditor.tsx`.
 *
 * Une formule dont le LaTeX est invalide se rend quand même (KaTeX a un
 * mode `throwOnError:false`, produit un message d'erreur en rouge à la
 * place) — jamais de blocage de l'ouverture du fichier pour une formule
 * mal formée.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import katex from "katex";

function renderKatex(source: string, displayMode: boolean): string {
  try {
    return katex.renderToString(source, { throwOnError: false, displayMode });
  } catch {
    return `<span class="xmd-math-error">Formule invalide</span>`;
  }
}

export const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { source: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="inline-math"]',
        priority: 100, // voir Footnote.ts : toujours prioriser une balise custom sur une règle générique d'une autre extension
        getAttrs: (el) => ({ source: decodeURIComponent((el as HTMLElement).getAttribute("data-source") ?? "") }),
      },
    ];
  },

  // Structure MINIMALE (pas le HTML rendu par KaTeX — voir `addNodeView`
  // ci-dessous pour l'affichage réel) : nécessaire quand même pour que
  // `editor.getHTML()`/le copier-coller aient une sérialisation de secours,
  // Tiptap l'exige même quand `addNodeView` fournit le rendu de l'éditeur.
  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-type": "inline-math",
        "data-source": encodeURIComponent(node.attrs.source),
        class: "xmd-math xmd-math-inline",
      }),
    ];
  },

  // `renderHTML` (le spec déclaratif de Tiptap) ne permet pas d'injecter du
  // HTML déjà construit (celui que produit KaTeX) comme enfant — seulement
  // du texte brut ou d'autres specs de nœud. Un NodeView (DOM impératif,
  // comme pour MermaidDiagram) prend le relais pour l'affichage réel dans
  // l'éditeur.
  addNodeView() {
    return ({ node }) => {
      const span = document.createElement("span");
      span.className = "xmd-math xmd-math-inline";
      span.setAttribute("data-type", "inline-math");
      span.setAttribute("data-source", encodeURIComponent(node.attrs.source));
      span.innerHTML = renderKatex(node.attrs.source, false);
      return {
        dom: span,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "inlineMath") return false;
          span.setAttribute("data-source", encodeURIComponent(updatedNode.attrs.source));
          span.innerHTML = renderKatex(updatedNode.attrs.source, false);
          return true;
        },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`$${node.attrs.source}$`);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.inline.ruler.before("emphasis", "inline-math", (state: any, silent: boolean) => {
              const src = state.src;
              const start = state.pos;
              if (src[start] !== "$" || src[start + 1] === "$") return false;
              const rest = src.slice(start + 1);
              const match = rest.match(/^([^\s$][^$\n]*?)\$/);
              if (!match) return false;
              if (!silent) {
                const token = state.push("inline_math", "", 0);
                token.meta = { source: match[1] };
              }
              state.pos = start + 1 + match[0].length;
              return true;
            });
            markdownit.renderer.rules.inline_math = (tokens: any, idx: number) =>
              `<span data-type="inline-math" data-source="${encodeURIComponent(tokens[idx].meta.source)}"></span>`;
          },
          updateDOM(element: HTMLElement) {
            element.querySelectorAll('span[data-type="inline-math"]').forEach((el) => {
              const source = decodeURIComponent(el.getAttribute("data-source") ?? "");
              el.innerHTML = renderKatex(source, false);
            });
          },
        },
      },
    };
  },
});

export const BlockMath = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return { source: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="block-math"]',
        getAttrs: (el) => ({ source: decodeURIComponent((el as HTMLElement).getAttribute("data-source") ?? "") }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "block-math",
        "data-source": encodeURIComponent(node.attrs.source),
        class: "xmd-math xmd-math-block",
      }),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const div = document.createElement("div");
      div.className = "xmd-math xmd-math-block";
      div.setAttribute("data-type", "block-math");
      div.setAttribute("data-source", encodeURIComponent(node.attrs.source));
      div.innerHTML = renderKatex(node.attrs.source, true);
      return {
        dom: div,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "blockMath") return false;
          div.setAttribute("data-source", encodeURIComponent(updatedNode.attrs.source));
          div.innerHTML = renderKatex(updatedNode.attrs.source, true);
          return true;
        },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`$$\n${node.attrs.source}\n$$`);
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.block.ruler.before(
              "fence",
              "block-math",
              (state: any, startLine: number, endLine: number, silent: boolean) => {
                const startPos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                if (state.src.slice(startPos, startPos + 2) !== "$$") return false;

                const firstLineRest = state.src.slice(startPos + 2, max);
                let content: string;
                let nextLine: number;

                if (firstLineRest.trim().endsWith("$$") && firstLineRest.trim().length > 2) {
                  // formule sur une seule ligne : $$formule$$
                  content = firstLineRest.trim().slice(0, -2);
                  nextLine = startLine + 1;
                } else {
                  let found = false;
                  content = firstLineRest.trim() ? `${firstLineRest.trim()}\n` : "";
                  nextLine = startLine + 1;
                  while (nextLine < endLine) {
                    const lPos = state.bMarks[nextLine] + state.tShift[nextLine];
                    const lMax = state.eMarks[nextLine];
                    const line = state.src.slice(lPos, lMax);
                    if (line.trim() === "$$") {
                      found = true;
                      nextLine += 1;
                      break;
                    }
                    content += `${line}\n`;
                    nextLine += 1;
                  }
                  if (!found) return false;
                }

                if (silent) return true;
                const token = state.push("block_math", "div", 0);
                token.meta = { source: content.trim() };
                token.map = [startLine, nextLine];
                state.line = nextLine;
                return true;
              },
            );
            markdownit.renderer.rules.block_math = (tokens: any, idx: number) =>
              `<div data-type="block-math" data-source="${encodeURIComponent(tokens[idx].meta.source)}"></div>`;
          },
          updateDOM(element: HTMLElement) {
            element.querySelectorAll('div[data-type="block-math"]').forEach((el) => {
              const source = decodeURIComponent(el.getAttribute("data-source") ?? "");
              el.innerHTML = renderKatex(source, true);
            });
          },
        },
      },
    };
  },
});
