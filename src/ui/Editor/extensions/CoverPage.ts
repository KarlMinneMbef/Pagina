/**
 * Nœud « Page de garde » (2026-10-22) — un bloc pleine page façon Word :
 * grand titre, sous-titre, date, auteur… + VARIABLES de document
 * (`{{title}}`, `{{author}}`, `{{date}}`, `{{version}}`, champs
 * personnalisés… — les mêmes que les en-têtes/pieds, voir
 * `resolveHeaderFooterText`). Le contenu est du Markdown NORMAL avec du
 * HTML inline pour la mise en forme (centrage, tailles), édité depuis le
 * panneau latéral « Page de garde » (ui/Cover/CoverPagePanel.tsx) et
 * inséré depuis la galerie de modèles (CoverGalleryDialog.tsx).
 *
 * PERSISTANCE : le Markdown de la page de garde vit en ATTRIBUT du nœud
 * (`node.attrs.source`), sérialisé dans un commentaire HTML standard
 * MULTI-LIGNES LISIBLE (2026-10-22, retour utilisateur : l'URI-encodage
 * monoligne `%3Cp%20style%3D…` était illisible et rendait les réglages
 * invisibles dans le .md) :
 *
 *     <!-- coverpage
 *     <p style="text-align: center">MON BE FLUIDES — ÉTUDES</p>
 *     {{title}}
 *     -->
 *
 * Invisible et sans effet de bord dans tout autre outil Markdown. Si le
 * contenu contient lui-même `-->` (rare), repli sur l'ancien format
 * URI-encodé monoligne — qui reste TOUJOURS accepté en lecture (les
 * documents existants se convertissent tout seuls au premier
 * enregistrement après édition).
 *
 * RENDU : NodeView (comme MermaidDiagram) qui affiche le contenu
 * RÉSOLU — les variables remplacées par leur valeur à l'affichage, le
 * fichier .md gardant la variable telle quelle. Le contexte (propriétés
 * du document) et le parseur Markdown appartiennent à l'éditeur : ce
 * module les reçoit par des fournisseurs posés par MarkdownEditor.tsx
 * (`setCoverRenderProviders`), et `refreshAllCoverPages` force le
 * re-rendu quand le contexte change (propriétés modifiées, ouverture
 * d'un autre document) — la couche peinte ne fait que CLONER le HTML
 * déjà résolu, elle n'a pas à connaître les variables.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import type { HeaderFooterContext } from "../../../core/pageLayout";
import { resolveHeaderFooterText } from "../../../core/pageLayout";

/** Ancien format monoligne URI-encodé — toujours accepté en lecture. */
const COVER_COMMENT_LEGACY = /^<!--\s*coverpage:\s*([A-Za-z0-9%.+_/=-]+)\s*-->$/i;
/** Nouveau format lisible : ouverture sur sa propre ligne. */
const COVER_OPEN = /^<!--\s*coverpage\s*$/i;
/** Ligne fermant le commentaire multi-lignes. */
const COVER_CLOSE = /^\s*-->\s*$/;

/** Fournisseurs posés par MarkdownEditor : parseur Markdown → HTML de
 *  l'éditeur courant + contexte de variables courant. `null` = aucun
 *  éditeur monté (rendu de repli : texte brut non résolu). */
let mdToHtmlProvider: ((md: string) => string) | null = null;
let coverContextProvider: (() => HeaderFooterContext) | null = null;
const liveCoverRenderers = new Set<() => void>();

/** Posé par MarkdownEditor à chaque montage : parseur + contexte. */
export function setCoverRenderProviders(opts: {
  mdToHtml: (md: string) => string;
  getContext: () => HeaderFooterContext;
}): void {
  mdToHtmlProvider = opts.mdToHtml;
  coverContextProvider = opts.getContext;
}

/** Re-rend TOUTES les pages de garde montées — appelé par MarkdownEditor
 *  quand le contexte change (propriétés du document, en-tête/pied…). */
export function refreshAllCoverPages(): void {
  liveCoverRenderers.forEach((render) => render());
}

/** Rend le Markdown de la page de garde en HTML RÉSOLU : variables
 *  substituées (comme les en-têtes/pieds) puis parseur Markdown de
 *  l'éditeur (supporte le HTML inline des modèles : centrage, tailles). */
function renderCoverHtml(source: string): string {
  if (!source) return "";
  const ctx = coverContextProvider?.() ?? null;
  const resolved = ctx ? resolveHeaderFooterText(source, ctx) : source;
  return mdToHtmlProvider ? mdToHtmlProvider(resolved) : "";
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    coverPage: {
      /** Insère une page de garde (source Markdown + variables). */
      insertCoverPage: (source: string) => ReturnType;
    };
  }
}

/** Bloc « Page de garde » — source Markdown en attribut, rendu résolu
 *  (variables substituées comme les en-têtes/pieds de page). */
export const CoverPage = Node.create({
  name: "coverPage",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      source: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="cover-page"]',
        getAttrs: (el) => ({ source: decodeURIComponent((el as HTMLElement).getAttribute("data-source") ?? "") }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "cover-page",
        "data-source": encodeURIComponent(node.attrs.source),
        class: "xmd-coverpage",
      }),
    ];
  },

  addCommands() {
    return {
      insertCoverPage:
        (source: string) =>
        ({ chain }: any) =>
          chain().insertContent({ type: this.name, attrs: { source } }).run(),
    } as any;
  },

  addNodeView() {
    return ({ node }) => {
      const container = document.createElement("div");
      container.className = "xmd-coverpage";

      const preview = document.createElement("div");
      preview.className = "xmd-coverpage-content";
      container.append(preview);

      const renderPreview = (source: string) => {
        preview.innerHTML = renderCoverHtml(source);
      };

      let currentSource = node.attrs.source;
      const rerenderSelf = () => renderPreview(currentSource);
      renderPreview(currentSource);
      liveCoverRenderers.add(rerenderSelf);

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "coverPage") return false;
          currentSource = updatedNode.attrs.source;
          renderPreview(currentSource);
          return true;
        },
        destroy: () => {
          liveCoverRenderers.delete(rerenderSelf);
        },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const source: string = String(node.attrs.source ?? "");
          if (source.includes("-->")) {
            // Contenu qui fermerait le commentaire : repli monoligne
            // URI-encodé (ancien format, relisible par cette même app).
            state.write(`<!-- coverpage: ${encodeURIComponent(source)} -->`);
          } else {
            // Format LISIBLE multi-lignes (retour utilisateur 2026-10-22 :
            // l'URI-encodage était illisible et masquait les réglages).
            state.write(`<!-- coverpage
${source}
-->`);
          }
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.block.ruler.before(
              "html_block",
              "coverpage",
              (state: any, startLine: number, endLine: number, silent: boolean) => {
                const lineText = (n: number) => {
                  const pos = state.bMarks[n] + state.tShift[n];
                  return state.src.slice(pos, state.eMarks[n]);
                };
                const line = lineText(startLine);
                // Format LISIBLE multi-lignes : ouverture seule sur la
                // première ligne, contenu brut jusqu'à la ligne `-->`.
                if (COVER_OPEN.test(line.trim())) {
                  let closeLine = -1;
                  for (let n = startLine + 1; n < endLine; n++) {
                    if (COVER_CLOSE.test(lineText(n))) {
                      closeLine = n;
                      break;
                    }
                  }
                  if (closeLine < 0) return false;
                  const inner: string[] = [];
                  for (let n = startLine + 1; n < closeLine; n++) inner.push(lineText(n));
                  if (silent) return true;
                  const token = state.push("coverpage", "div", 0);
                  token.map = [startLine, closeLine + 1];
                  token.attrSet("data-type", "cover-page");
                  token.attrSet("data-source", encodeURIComponent(inner.join("\n")));
                  token.attrSet("class", "xmd-coverpage");
                  state.line = closeLine + 1;
                  return true;
                }
                // Ancien format monoligne URI-encodé.
                const match = line.trim().match(COVER_COMMENT_LEGACY);
                if (!match) return false;
                if (silent) return true;
                const token = state.push("coverpage", "div", 0);
                token.map = [startLine, startLine + 1];
                token.attrSet("data-type", "cover-page");
                token.attrSet("data-source", match[1]);
                token.attrSet("class", "xmd-coverpage");
                state.line = startLine + 1;
                return true;
              }
            );
            markdownit.renderer.rules.coverpage = (tokens: any, idx: number) => {
              const token = tokens[idx];
              return `<div data-type="cover-page" data-source="${token.attrGet("data-source") ?? ""}" class="xmd-coverpage"></div>`;
            };
          },
        },
      },
    };
  },
});
