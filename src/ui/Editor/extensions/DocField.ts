/**
 * Champ de document `{{variable}}` en LIGNE (2026-10-22) — la pièce qui
 * remplace la résolution des variables de l'ancien bloc « page de garde »
 * spécial : désormais le contenu de page de garde est du contenu NORMAL,
 * et les variables y sont de vrais NŒUDS inline, comme les formules
 * MathLive (`inlineMath` — même modèle, même comportement clic).
 *
 * - Sérialisé `{{name}}` dans le .md : texte lisible et reconnu par les
 *   autres outils (et relisible tel quel à l'ouverture).
 * - Rendu : NodeView affichant la VALEUR RÉSOLUE (propriétés du document,
 *   même moteur que les en-têtes/pieds — resolveHeaderFooterText) sur la
 *   page ET dans l'éditeur invisible ; le fichier garde {{name}}.
 * - Le contexte de résolution appartient à l'éditeur : fourni par
 *   MarkdownEditor via setDocFieldContext (même principe que les
 *   fournisseurs de la page de garde).
 * - BONUS : utilisable dans TOUT le document (pas seulement les pages de
 *   garde) — un champ date dans une phrase se met à jour tout seul.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import type { HeaderFooterContext } from "../../../core/pageLayout";
import { resolveHeaderFooterText } from "../../../core/pageLayout";

/** Lecture d'un champ : {{nom}} — lettres (accents compris), chiffres,
 *  espaces, tirets/underscores (ex. {{NomDuChamp}}, {{date}}). */
export const DOC_FIELD_RE = /\{\{([A-Za-zÀ-ÖØ-öø-ÿ0-9 _-]+)\}\}/;
/** Même regex, recherche globale — pour le remplacement dans le DOM
 *  (updateDOM ci-dessous). */
const DOC_FIELD_GLOBAL_RE = /\{\{([A-Za-zÀ-ÖØ-öø-ÿ0-9 _-]+)\}\}/g;

/** Remplace CHAQUE `{{nom}}` d'un nœud texte par l'élément
 *  `<span data-type="doc-field">` — le contenu texte du span GARDE la
 *  variable brute : dans le document, ProseMirror ignore le contenu
 *  (nœud atomique) et le NodeView affiche la valeur résolue ; dans les
 *  gabarits d'en-tête/pied (qui passent par le MÊME parseur puis par
 *  `resolveHeaderFooterText` sur le HTML), la variable reste un TEXTE
 *  substituable — sans ça, `{{page}}` disparaissait des pieds de page. */
function wrapFieldsInDom(element: HTMLElement): void {
  const walker = document.createTreeWalker(element, window.NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = (n as Text).parentElement;
    // Jamais dans code/pre : une variable tapée dans un bloc de code est
    // du CODE, pas un champ. Jamais non plus dans un champ déjà posé.
    if (!parent || parent.closest("pre, code, .xmd-docfield")) continue;
    targets.push(n as Text);
  }
  for (const textNode of targets) {
    const text = textNode.textContent ?? "";
    DOC_FIELD_GLOBAL_RE.lastIndex = 0;
    if (!DOC_FIELD_GLOBAL_RE.test(text)) continue;
    DOC_FIELD_GLOBAL_RE.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = DOC_FIELD_GLOBAL_RE.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement("span");
      span.setAttribute("data-type", "doc-field");
      span.setAttribute("data-name", m[1].trim());
      // Le texte BRUT reste dans le span — voir le commentaire de
      // wrapFieldsInDom (en-têtes/pieds : substitution textuelle).
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode?.replaceChild(frag, textNode);
  }
}

let docFieldContextProvider: (() => HeaderFooterContext) | null = null;
const liveDocFieldRenders = new Set<() => void>();

/** Posé par MarkdownEditor : contexte de résolution courant. */
export function setDocFieldContext(getContext: () => HeaderFooterContext): void {
  docFieldContextProvider = getContext;
}

/** Re-rend tous les champs montés — appelé quand le contexte change
 *  (propriétés du document modifiées, autre document ouvert). */
export function refreshAllDocFields(): void {
  liveDocFieldRenders.forEach((render) => render());
}

/** Valeur résolue d'un champ : son nom passe par le MÊME moteur que les
 *  en-têtes/pieds ({{title}}, {{author}}, champs personnalisés…) ; une
 *  variable inconnue reste affichée telle quelle — repérable, comme dans
 *  les en-têtes/pieds. */
function renderFieldValue(name: string): string {
  const ctx = docFieldContextProvider?.() ?? null;
  if (!ctx) return `{{${name}}}`;
  return resolveHeaderFooterText(`{{${name}}}`, ctx);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docField: {
      /** Insère un champ de document au curseur (ex. {{title}}). */
      insertDocField: (name: string) => ReturnType;
    };
  }
}

/** Champ de document inline — {{name}} dans le .md, valeur résolue au
 *  rendu, comme une formule inline. */
export const DocField = Node.create({
  name: "docField",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: { default: "title" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="doc-field"]',
        getAttrs: (el) => ({ name: (el as HTMLElement).getAttribute("data-name") ?? "title" }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "doc-field", "data-name": node.attrs.name, class: "xmd-docfield" })];
  },

  addCommands() {
    return {
      insertDocField:
        (name: string) =>
        ({ chain }: any) =>
          chain().insertContent({ type: this.name, attrs: { name } }).run(),
    } as any;
  },

  addNodeView() {
    return ({ node }) => {
      const span = document.createElement("span");
      span.className = "xmd-docfield";
      span.setAttribute("data-type", "doc-field");

      // UNE closure stable par vue : le nom est suivi dans une variable
      // (les closures créées par update fuiraient du registre — chaque
      // `refresh` n'ajoute jamais deux fois la même vue).
      let currentName: string = node.attrs.name;
      const render = () => {
        span.textContent = renderFieldValue(currentName);
        span.setAttribute("data-name", currentName);
      };
      render();
      liveDocFieldRenders.add(render);

      return {
        dom: span,
        update: (updatedNode) => {
          if (updatedNode.type.name !== "docField") return false;
          currentName = updatedNode.attrs.name;
          render();
          return true;
        },
        destroy: () => {
          liveDocFieldRenders.delete(render);
        },
      };
    };
  },

  addStorage() {
    return {
      markdown: {
        // Inline : sérialisé {{name}} — le .md garde la variable lisible,
        // relisible telle quelle à l'ouverture (updateDOM ci-dessous).
        serialize(state: any, node: any) {
          state.write(`{{${node.attrs.name}}}`);
        },
        parse: {
          // PAS de règle markdown-it inline : les variables des pages de
          // garde vivent DANS des blocs HTML (<p style="…">{{title}}</p>)
          // et markdown-it ne tokenize PAS l'intérieur des blocs HTML —
          // la règle inline ne les voyait jamais (bug remonté au test).
          // On transforme le DOM RENDU à la place : updateDOM (hook
          // tiptap-markdown) remplace chaque {{nom}} par le span docField
          // — couvre le texte simple ET les blocs HTML.
          updateDOM(element: HTMLElement) {
            wrapFieldsInDom(element);
          },
        },
      },
    };
  },
});
