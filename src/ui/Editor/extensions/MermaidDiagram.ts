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
 * classique) — un `<div>` pour le SVG rendu par `mermaid.render()`
 * (asynchrone, re-rendu à chaque changement d'attribut `source`).
 *
 * ÉDITION (refonte 2026-10-21, demande utilisateur « trouver une
 * solution pour l'éditeur de diagramme Mermaid ») : le nœud n'affiche
 * PLUS DE TEXTAREA — la page ne montre QUE le diagramme rendu, comme
 * une image Word. L'édition passe par le PANNEAU LATÉRAL « Diagramme »
 * (ui/Mermaid/DiagramPanel.tsx) : clic sur le diagramme peint →
 * NodeSelection → panneau avec source + aperçu en direct + modèles.
 * La source reste stockée comme ATTRIBUT du nœud (`node.attrs.source`),
 * sérialisée en bloc ```mermaid standard.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import mermaid from "mermaid";
import { buildMermaidConfig, diagramThemeVersion } from "../../../core/diagramTheme";

/** Version de la config de thème déjà appliquée à mermaid.initialize —
 * on ne ré-initialise QUE si le thème/couleurs ont changé depuis le
 * dernier rendu (getDiagramTheme/setDiagramTheme, core/diagramTheme.ts).
 * Les couleurs ne JAMAIS dans la source : uniquement au rendu. */
let appliedThemeVersion = -1;
function ensureMermaidThemeApplied() {
  const v = diagramThemeVersion();
  if (v === appliedThemeVersion) return;
  mermaid.initialize({ startOnLoad: false, ...buildMermaidConfig() });
  appliedThemeVersion = v;
}

/** Rendus des NodeViews actuellement montées : au changement de thème
 * (thème/couleurs, via le panneau Diagramme), la page doit RE-RENDRE
 * ses diagrammes — le repaint de la couche peinte ne fait que CLONER le
 * SVG existant, il ne relance pas mermaid. */
const liveRenderers = new Set<() => void>();

/** Re-rend TOUTES les vues de diagrammes montées (page + aperçu du
 *  panneau) avec la config de thème courante. */
export function refreshAllMermaidDiagrams(): void {
  liveRenderers.forEach((render) => render());
}

/** Rappel « un diagramme vient d'être (re)rendu » — MarkdownEditor y
 *  branche un repaint (débouncé ici) : le SVG d'une vue est re-rendu de
 *  façon ASYNCHRONE (mermaid.render), or la couche peinte ne montre que
 *  des CLONES — sans ce rappel, la page garderait l'ancien SVG (couleurs
 *  périmées après un changement de thème) jusqu'à la prochaine frappe. */
let renderNotify: (() => void) | null = null;
let renderNotifyTimer: ReturnType<typeof setTimeout> | null = null;

export function setMermaidRenderedCallback(cb: (() => void) | null): void {
  renderNotify = cb;
}

function notifyRendered(): void {
  if (!renderNotify) return;
  if (renderNotifyTimer) clearTimeout(renderNotifyTimer);
  renderNotifyTimer = setTimeout(() => {
    renderNotifyTimer = null;
    renderNotify?.();
  }, 60);
}

let renderCounter = 0;

/** Bloc diagramme Mermaid : source + rendu SVG live dans la couche peinte,
 *  édité par le panneau Diagramme. */
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
    return ({ node }) => {
      ensureMermaidThemeApplied();

      const container = document.createElement("div");
      container.className = "xmd-mermaid";

      // SEUL le rendu apparaît (dans l'éditeur invisible ET dans les
      // clones peints) — plus jamais la source brute sur la page.
      const preview = document.createElement("div");
      preview.className = "xmd-mermaid-preview";

      container.append(preview);

      const renderPreview = async (source: string) => {
        // Le thème a pu changer depuis le dernier rendu de CETTE vue
        // (une autre vue a peut-être déjà ré-initialisé mermaid, mais
        // chacune re-vérifie — le garde interne rend le doublon gratuit).
        ensureMermaidThemeApplied();
        renderCounter += 1;
        try {
          const { svg } = await mermaid.render(`xmd-mermaid-${renderCounter}`, source);
          preview.innerHTML = svg;
          notifyRendered();
        } catch {
          preview.innerHTML = "";
          preview.textContent = "⚠ Erreur de syntaxe Mermaid — vérifiez le texte ci-dessus.";
          preview.classList.add("xmd-mermaid-error");
          return;
        }
        preview.classList.remove("xmd-mermaid-error");
      };
      renderPreview(node.attrs.source);

      // Enregistrer cette vue pour les rafraîchissements de thème —
      // le re-rendu relit la source COURANTE du nœud (suivie dans
      // currentSource, la closure `node` resterait sur la première
      // version) : rien ne change dans le .md, seules les couleurs du
      // rendu suivent le thème.
      let currentSource = node.attrs.source;
      const rerenderSelf = () => void renderPreview(currentSource);
      liveRenderers.add(rerenderSelf);

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "mermaidDiagram") return false;
          currentSource = updatedNode.attrs.source;
          renderPreview(currentSource);
          return true;
        },
        destroy: () => {
          liveRenderers.delete(rerenderSelf);
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
