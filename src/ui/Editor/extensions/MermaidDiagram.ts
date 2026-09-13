/**
 * Diagrammes Mermaid — persistés en bloc de code fenced Markdown standard
 * (```mermaid ... ```, la convention GitHub/GitLab/Obsidian), rendus comme
 * un vrai diagramme SVG dans l'éditeur (via la bibliothèque `mermaid`),
 * avec la source éditable juste au-dessus.
 *
 * PARSING (Markdown → document) : PAS de règle markdown-it dédiée — un
 * bloc ```mermaid est syntaxiquement un bloc de code fence tout à fait
 * normal, déjà entièrement pris en charge par `CodeBlockLowlight`
 * (`MarkdownEditor.tsx`). On laisse le pipeline standard produire
 * `<pre><code class="language-mermaid">…</code></pre>`, puis on le
 * TRANSFORME en `<div data-type="mermaid">` via le hook `updateDOM` de
 * tiptap-markdown (appelé sur le HTML complet, APRÈS le rendu markdown-it
 * mais AVANT la conversion HTML→ProseMirror) — measure documentée par
 * l'extension `codeBlock` de tiptap-markdown elle-même
 * (`node_modules/tiptap-markdown/src/extensions/nodes/code-block.js`,
 * `updateDOM` y nettoie déjà le HTML du bloc de code), donc un point
 * d'extension prévu pour exactement ce genre de post-traitement.
 *
 * Rendu : NodeView Tiptap manuel (pas de contenu ProseMirror éditable
 * classique) — un `<textarea>` pour la source, un `<div>` pour le SVG
 * rendu par `mermaid.render()` (asynchrone, ré-appelé à chaque frappe dans
 * le textarea). La source est stockée comme ATTRIBUT du nœud
 * (`node.attrs.source`), pas comme contenu ProseMirror : plus simple à
 * synchroniser avec un `<textarea>` HTML natif qu'un vrai schéma de texte
 * édité au clavier caractère par caractère.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import mermaid from "mermaid";

let mermaidInitialized = false;
function ensureMermaidInitialized() {
  if (mermaidInitialized) return;
  mermaid.initialize({ startOnLoad: false, theme: "neutral" });
  mermaidInitialized = true;
}

let renderCounter = 0;

export const MermaidDiagram = Node.create({
  name: "mermaidDiagram",
  group: "block",
  atom: true,
  selectable: true,
  isolating: true,

  addAttributes() {
    return {
      source: { default: "graph TD\n    A[Début] --> B[Fin]" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid"]',
        getAttrs: (el) => ({ source: decodeURIComponent((el as HTMLElement).getAttribute("data-source") ?? "") }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "mermaid", "data-source": encodeURIComponent(node.attrs.source) }),
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      ensureMermaidInitialized();

      const container = document.createElement("div");
      container.className = "xmd-mermaid";

      const textarea = document.createElement("textarea");
      textarea.className = "xmd-mermaid-source";
      textarea.spellcheck = false;
      textarea.value = node.attrs.source;

      const preview = document.createElement("div");
      preview.className = "xmd-mermaid-preview";

      container.append(textarea, preview);

      const renderPreview = async (source: string) => {
        renderCounter += 1;
        try {
          const { svg } = await mermaid.render(`xmd-mermaid-${renderCounter}`, source);
          preview.innerHTML = svg;
        } catch {
          preview.innerHTML = "";
          preview.textContent = "⚠ Erreur de syntaxe Mermaid — vérifiez le texte ci-dessus.";
          preview.classList.add("xmd-mermaid-error");
          return;
        }
        preview.classList.remove("xmd-mermaid-error");
      };
      renderPreview(node.attrs.source);

      textarea.addEventListener("input", () => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        editor.view.dispatch(editor.view.state.tr.setNodeAttribute(pos, "source", textarea.value));
        renderPreview(textarea.value);
      });
      // Empêche le clic dans le textarea de remonter jusqu'au gestionnaire
      // de clic de la couche peinte (résolution de position ailleurs dans
      // le document) — ce nœud gère lui-même sa propre édition.
      textarea.addEventListener("mousedown", (e) => e.stopPropagation());

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "mermaidDiagram") return false;
          if (updatedNode.attrs.source !== textarea.value) {
            textarea.value = updatedNode.attrs.source;
            renderPreview(updatedNode.attrs.source);
          }
          return true;
        },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("```mermaid\n");
          state.text(node.attrs.source, false);
          state.ensureNewLine();
          state.write("```");
          state.closeBlock(node);
        },
        parse: {
          updateDOM(element: HTMLElement) {
            element.querySelectorAll("pre > code.language-mermaid").forEach((code) => {
              const pre = code.parentElement;
              const div = document.createElement("div");
              div.setAttribute("data-type", "mermaid");
              div.setAttribute("data-source", encodeURIComponent(code.textContent ?? ""));
              pre?.replaceWith(div);
            });
          },
        },
      },
    };
  },
});
