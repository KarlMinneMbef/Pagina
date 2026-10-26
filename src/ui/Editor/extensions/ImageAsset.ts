/**
 * Image du document (format .xmd, 2026-10-26) — l'extension Image de Tiptap, adaptée à Pagina :
 *
 * - le texte garde le lien RELATIF (`images/plan-3fa9c1d2.png`), seul le rendu utilise l'adresse `blob:` des octets
 *   (voir `assetUrls.ts`) ; l'attribut `data-asset-src` du DOM permet de relire le lien d'origine (copier-coller,
 *   clones peints) ;
 * - image EN LIGNE (dans un paragraphe, avec du texte autour comme dans Word) ;
 * - largeur facultative (`width`, en % de la largeur de la zone de texte) : sans largeur l'image est écrite en Markdown
 *   standard `![texte](chemin)` ; avec largeur en HTML `<img src alt width>`, que tout lecteur Markdown affiche.
 */
import Image from "@tiptap/extension-image";
import { mergeAttributes } from "@tiptap/core";
import { resolveAssetUrl } from "../assetUrls";

/** Échappe une valeur d'attribut HTML. */
function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export const ImageAsset = Image.extend({
  addOptions() {
    return { inline: true, allowBase64: false, HTMLAttributes: {}, resize: false as const };
  },

  // ATTENTION : Tiptap applique le `parseHTML` d'un ATTRIBUT après le `getAttrs` de la règle et le remplace — la lecture du lien
  // d'origine / de la largeur se fait donc ici, par attribut.
  addAttributes() {
    return {
      ...this.parent?.(),
      // Le lien d'origine d'abord (image déjà rendue par cet éditeur : `src` est alors une adresse blob).
      src: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute("data-asset-src") ?? el.getAttribute("src") },
      width: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute("width") || el.style.width || null, renderHTML: () => ({}) },
      height: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const src = (node.attrs.src as string | null) ?? "";
    const { width: _w, height: _h, ...rest } = HTMLAttributes;
    const width = node.attrs.width as string | null;
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, rest, {
        src: resolveAssetUrl(src),
        "data-asset-src": src,
        ...(width ? { style: `width: ${/^\d+(\.\d+)?$/.test(width) ? `${width}px` : width}; height: auto;` } : {}),
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const width = node.attrs.width as string | null;
          if (!width) {
            // Image Markdown standard (même écriture que le sérialiseur de prosemirror-markdown).
            const src = String(node.attrs.src ?? "").replace(/[()]/g, (c) => `\\${c}`);
            const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : "";
            state.write(`![${state.esc(node.attrs.alt || "")}](${src}${title})`);
            return;
          }
          const alt = node.attrs.alt ? ` alt="${attr(String(node.attrs.alt))}"` : ' alt=""';
          const title = node.attrs.title ? ` title="${attr(String(node.attrs.title))}"` : "";
          state.write(`<img src="${attr(String(node.attrs.src ?? ""))}"${alt}${title} width="${attr(width)}">`);
        },
        parse: {},
      },
    };
  },
});
