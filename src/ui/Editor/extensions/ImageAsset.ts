/**
 * Image du document (format .xmd, 2026-10-26) — l'extension Image de Tiptap, adaptée à Pagina :
 *
 * - le texte garde le lien RELATIF (`images/plan-3fa9c1d2.png`), seul le rendu utilise l'adresse `blob:` des octets
 *   (voir `assetUrls.ts`) ; l'attribut `data-asset-src` du DOM permet de relire le lien d'origine (copier-coller,
 *   clones peints) ;
 * - image EN LIGNE (dans un paragraphe, avec du texte autour comme dans Word) ;
 * - largeur facultative (`width`, en % de la largeur de la zone de texte) : sans largeur l'image est écrite en Markdown
 *   standard `![texte](chemin)` ; avec largeur en HTML `<img src alt width>`, que tout lecteur Markdown affiche ;
 * - TRANSFORMATIONS (2026-10-26, même modèle que CasualOffice — voir `ImageSelectionOverlay` / `handleImageTransform`
 *   dans le fork) : rotation par pas de 90° et miroirs, stockés comme une chaîne CSS (`rotate(90deg) scaleX(-1)`)
 *   dans l'attribut `transform`, appliquée telle quelle au rendu ;
 * - BORDURE (2026-10-26) : épaisseur en pixels + couleur, rendues `border: Npx solid couleur`.
 *
 * Sérialisation : dès QU'UNE mise en forme existe (largeur, transformation ou bordure), l'image est écrite en HTML
 * `<img src alt width style="…">` — lisible dans tout lecteur Markdown ; sans rien, elle reste du Markdown standard.
 */
import Image from "@tiptap/extension-image";
import { mergeAttributes } from "@tiptap/core";
import { resolveAssetUrl } from "../assetUrls";

/** Échappe une valeur d'attribut HTML. */
function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Épaisseur de bordure lue depuis le style inline (`border: 2px solid …` ou `border-width`). */
function parseBorderWidth(el: HTMLElement): number | null {
  const raw = el.style.borderTopWidth || el.style.borderWidth || "";
  const m = raw.match(/^(\d+(?:\.\d+)?)px$/);
  return m ? Number(m[1]) : null;
}

/** Couleur de bordure lue depuis le style inline — le navigateur
 *  normalise `#003f2b` en `rgb(0, 63, 43)` : on reconvertit en hexadécimal
 *  pour que le .md garde une couleur lisible et STABLE (round-trip
 *  identique d'une sauvegarde à l'autre). */
function normalizeColor(raw: string): string {
  const m = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return raw;
  const hex = (n: string) => Number(n).toString(16).padStart(2, "0");
  const base = `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
  const alpha = m[4] !== undefined && Number(m[4]) < 1 ? Math.round(Number(m[4]) * 255).toString(16).padStart(2, "0") : "";
  return base + alpha;
}

/** Couleur de bordure lue depuis le style inline. */
function parseBorderColor(el: HTMLElement): string | null {
  const raw = el.style.borderTopColor || el.style.borderColor || "";
  return raw.trim() ? normalizeColor(raw.trim()) : null;
}

/** Transformation lue depuis le style inline : ne garde que rotate/scaleX/scaleY (jamais translate). */
function parseTransform(el: HTMLElement): string | null {
  const raw = el.style.transform || "";
  const parts = raw.match(/rotate\(-?\d+(?:\.\d+)?deg\)|scaleX\(-1\)|scaleY\(-1\)/g);
  return parts && parts.length ? parts.join(" ") : null;
}

/** Style inline complet de l'image (largeur + transformation + bordure) — partagé par le rendu DOM et la sérialisation. */
export function imageStyle(attrs: { width?: string | null; transform?: string | null; borderWidth?: number | null; borderColor?: string | null }): string {
  const parts: string[] = [];
  const width = attrs.width ?? null;
  if (width) parts.push(`width: ${/^\d+(\.\d+)?$/.test(width) ? `${width}px` : width}; height: auto;`);
  const transform = attrs.transform ?? null;
  if (transform) parts.push(`transform: ${transform};`);
  const borderWidth = attrs.borderWidth ?? null;
  if (borderWidth && borderWidth > 0) parts.push(`border: ${borderWidth}px solid ${attrs.borderColor ?? "#000000"};`);
  return parts.join(" ");
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
      // Rotation (deg, multiples de 90) + miroirs — chaîne CSS, même convention que CasualOffice.
      transform: { default: null, parseHTML: (el: HTMLElement) => parseTransform(el), renderHTML: () => ({}) },
      // Bordure : épaisseur px + couleur.
      borderWidth: { default: null, parseHTML: (el: HTMLElement) => parseBorderWidth(el), renderHTML: () => ({}) },
      borderColor: { default: null, parseHTML: (el: HTMLElement) => parseBorderColor(el), renderHTML: () => ({}) },
    };
  },

  renderHTML({ node, HTMLAttributes }) {
    const src = (node.attrs.src as string | null) ?? "";
    const { width: _w, height: _h, transform: _t, borderWidth: _bw, borderColor: _bc, ...rest } = HTMLAttributes;
    const style = imageStyle(node.attrs);
    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, rest, {
        src: resolveAssetUrl(src),
        "data-asset-src": src,
        ...(style ? { style } : {}),
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const attrs = node.attrs as { width?: string | null; transform?: string | null; borderWidth?: number | null; borderColor?: string | null };
          // Le `.md` garde la largeur en ATTRIBUT `width` (lisible partout) et
          // le style inline ne porte QUE transformation et bordure.
          const styleParts: string[] = [];
          if (attrs.transform) styleParts.push(`transform: ${attrs.transform};`);
          if (attrs.borderWidth && attrs.borderWidth > 0) styleParts.push(`border: ${attrs.borderWidth}px solid ${attrs.borderColor ?? "#000000"};`);
          const style = styleParts.join(" ");
          const width = attrs.width ?? null;
          // Sans NI largeur NI transformation NI bordure : Markdown standard
          // (même écriture que le sérialiseur de prosemirror-markdown).
          if (!style && !width) {
            const src = String(node.attrs.src ?? "").replace(/[()]/g, (c) => `\\${c}`);
            const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : "";
            state.write(`![${state.esc(node.attrs.alt || "")}](${src}${title})`);
            return;
          }
          const alt = node.attrs.alt ? ` alt="${attr(String(node.attrs.alt))}"` : ' alt=""';
          const title = node.attrs.title ? ` title="${attr(String(node.attrs.title))}"` : "";
          const widthAttr = width ? ` width="${attr(width)}"` : "";
          const styleAttr = style ? ` style="${attr(style)}"` : "";
          // Ordre historique src→alt→title→width→style (les tests et les
          // fichiers existants attendent `src alt width`).
          state.write(`<img src="${attr(String(node.attrs.src ?? ""))}"${alt}${title}${widthAttr}${styleAttr}>`);
        },
        parse: {},
      },
    };
  },
});
