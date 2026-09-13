/**
 * Taille de police : Tiptap ne fournit pas d'extension officielle stable pour
 * ça (seulement une version "next" instable), donc on ajoute un attribut
 * `fontSize` sur la marque `textStyle` — technique standard documentée par
 * Tiptap lui-même pour ce cas précis.
 *
 * Compatibilité Markdown : la taille de police n'a pas d'équivalent en
 * Markdown standard. Sérialisée en `<span style="font-size:…">` via le
 * fallback HTML de tiptap-markdown (Markdown.configure({ html: true })) :
 * lisible et correctement rendu par toute autre moteur Markdown→HTML
 * (GitHub, VS Code, Obsidian…), juste pas comme de la syntaxe Markdown pure.
 */
import { Extension } from "@tiptap/core";

export interface FontSizeOptions {
  types: string[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Extension.create<FontSizeOptions>({
  name: "fontSize",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).run(),
    };
  },
});
