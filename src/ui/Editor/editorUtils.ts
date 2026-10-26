/**
 * Utilitaires de l'éditeur sans état React : tailles de police, changement
 * de casse, presse-papiers, normalisation de signets, mesures DOM.
 * Extraits de MarkdownEditor.tsx.
 */
import type { Editor } from "@tiptap/react";
import { DOMSerializer } from "@tiptap/pm/model";

/** Échelle de tailles de police (en pt) — partagée entre le menu "Taille"
 * du ruban et les boutons Agrandir/Réduire (un pas = la valeur suivante de
 * cette échelle, pas +1 pt : façon Word). Le 12pt sert de base de départ
 * quand la sélection n'a pas encore de taille explicite. */
export const FONT_SIZE_STEPS = [8, 9, 10, 11, 12, 14, 16, 18, 24, 36];
const DEFAULT_FONT_SIZE_PT = 12;

/** Extrait la taille de police (en pt) de la sélection, ou la valeur par
 * défaut si aucune marque `fontSize` n'est posée. */
export function currentFontSizePt(editor: Editor): number {
  const fontSize = editor.getAttributes("textStyle").fontSize;
  if (typeof fontSize === "string") {
    const pt = parseFloat(fontSize);
    if (!Number.isNaN(pt)) return pt;
  }
  return DEFAULT_FONT_SIZE_PT;
}

/** Casse suivante façon bouton "Aa" de Word : minuscules/mixte →
 * MAJUSCULES → Casse de titre (1re lettre de chaque mot) → minuscules.
 * La détection « casse de titre » doit venir AVANT celle « contient une
 * minuscule », sinon "Bonjour" (titre) serait renvoyé en MAJUSCULES et
 * la boucle ne repasserait jamais en minuscules. */
export function nextCase(text: string): string {
  const upper = text.toUpperCase();
  const lower = text.toLowerCase();
  const title = lower.replace(/(^|[\s\-"'(«\[\]])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  if (text === upper) return title; // tout en majuscules → casse de titre
  if (text === title && text !== lower) return lower; // casse de titre → minuscules
  return upper; // contient au moins une minuscule → MAJUSCULES
}

/** Presse-papiers INTERNE : dernier contenu copié/coupé DANS l'application (Markdown ET HTML).
 * Repli de `pasteIntoEditor` quand la lecture du presse-papiers système est refusée — WebView2
 * peut afficher une demande de permission native pour clipboard-read (ou la voir bloquée par la
 * configuration) : Coller reste ainsi fonctionnel pour tout ce qui a été copié/coupé via les
 * boutons du ruban, sans dépendre de cette permission. */
let internalClipboard: { md: string; html: string } | null = null;

/** Sélection sérialisée en Markdown ET en HTML (mise en forme complète : couleurs, tailles,
 * surlignage, alignements, tableaux…). Le HTML est ce que Word, les pages web et Pagina
 * elle-même relisent ; le Markdown sert aux éditeurs de texte. */
function serializeSelection(editor: Editor): { md: string; html: string } | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const slice = editor.state.doc.slice(from, to);
  // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
  const md: string = editor.storage.markdown.serializer.serialize(slice.content);
  const box = document.createElement("div");
  box.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content));
  return { md, html: box.innerHTML };
}

/** Copie : écrit text/html ET text/plain (Markdown) dans le presse-papiers système, sinon
 * seulement le texte. Avant (2026-10-26) seul le Markdown partait : Word recevait des `**` et
 * aucune mise en forme. */
export function copyEditorSelection(editor: Editor): void {
  const data = serializeSelection(editor);
  if (data === null) return;
  internalClipboard = data;
  const clipboard = navigator.clipboard;
  if (clipboard?.write && typeof ClipboardItem !== "undefined") {
    clipboard
      .write([
        new ClipboardItem({
          "text/html": new Blob([data.html], { type: "text/html" }),
          "text/plain": new Blob([data.md], { type: "text/plain" }),
        }),
      ])
      .catch(() => clipboard.writeText?.(data.md).catch(() => {}));
    return;
  }
  clipboard?.writeText?.(data.md).catch(() => {});
}

export function cutEditorSelection(editor: Editor): void {
  if (serializeSelection(editor) === null) return;
  copyEditorSelection(editor);
  editor.chain().focus(undefined, { scrollIntoView: false }).deleteSelection().run();
}

/** Colle le presse-papiers ; `plain` = texte brut (aucune mise en forme ni syntaxe Markdown
 * interprétée — chaque ligne devient un paragraphe). Sinon : le HTML du presse-papiers (Word,
 * page web, autre document Pagina) est collé AVEC sa mise en forme, par le même chemin que
 * Ctrl+V ; à défaut de HTML, le texte est lu comme du Markdown. */
export function pasteIntoEditor(editor: Editor, plain: boolean): void {
  const insertText = (text: string | null) => {
    if (!text) return;
    const chain = editor.chain().focus(undefined, { scrollIntoView: false });
    if (!plain) {
      // insertContent(string) passe par le parseur Markdown de
      // tiptap-markdown : le Markdown collé devient des vrais nœuds.
      chain.insertContent(text).run();
      return;
    }
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    if (lines.length === 1) {
      chain.insertContent({ type: "text", text: lines[0] }).run();
    } else {
      chain
        .insertContent(lines.map((l) => ({ type: "paragraph", content: l ? [{ type: "text", text: l }] : [] })))
        .run();
    }
  };
  const insertHtml = (html: string) => {
    editor.chain().focus(undefined, { scrollIntoView: false }).run();
    editor.view.pasteHTML(html);
  };
  const fromInternal = () => {
    if (!internalClipboard) return;
    if (!plain && internalClipboard.html) insertHtml(internalClipboard.html);
    else insertText(internalClipboard.md);
  };
  const clipboard = navigator.clipboard;
  if (!plain && clipboard?.read) {
    clipboard
      .read()
      .then(async (items) => {
        for (const item of items) {
          if (item.types.includes("text/html")) {
            const html = await (await item.getType("text/html")).text();
            if (html.trim()) return insertHtml(html);
          }
        }
        for (const item of items) {
          if (item.types.includes("text/plain")) {
            const text = await (await item.getType("text/plain")).text();
            if (text) return insertText(text);
          }
        }
        fromInternal();
      })
      // Permission refusée : repli sur le presse-papiers interne.
      .catch(fromInternal);
    return;
  }
  clipboard
    ?.readText()
    .then((text) => (text ? insertText(text) : fromInternal()))
    .catch(fromInternal);
}

/** Normalise un nom de signet saisi en identifiant d'ancre sûr : minuscules,
 * sans accents, espaces → tirets, seuls [a-z0-9-_] survivent (voir
 * `insertBookmark`/`insertCrossReference`). */
export function slugifyBookmark(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Échappe un texte saisi avant de l'injecter dans un HTML construit à la
 * main pour `insertContent` (renvois — le libellé vient d'un prompt). */
export function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Élément d'en-tête/pied de page le plus PROCHE DU VIEWPORT — les boutons
 * du ruban ne doivent pas systématiquement viser la zone de la PREMIÈRE
 * page (repiqué par `querySelector`) : si l'utilisateur lit une page
 * ultérieure, le champ flottant s'ouvrait hors de son champ de vision et
 * le bouton semblait « ne rien faire ». On choisit la zone visible la
 * plus proche du centre du viewport, à défaut la première. */
export function headerFooterTargetNearViewport(canvas: HTMLElement | null, selector: string): HTMLElement | null {
  if (!canvas) return null;
  const els = Array.from(canvas.querySelectorAll<HTMLElement>(selector));
  if (els.length === 0) return null;
  const vh = window.innerHeight;
  const visible = els.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < vh;
  });
  if (visible.length === 0) return els[0];
  const mid = vh / 2;
  let best = visible[0];
  let bestDist = Infinity;
  for (const el of visible) {
    const r = el.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - mid);
    if (d < bestDist) {
      bestDist = d;
      best = el;
    }
  }
  return best;
}

/** Amène `el` au centre de la zone visible s'il en sort (instantané). Le
 * champ d'en-tête/pied de page s'ouvre à la position de l'élément : sans ça,
 * « Pied de page » depuis le haut de la page 1 ouvrait un champ hors écran
 * et le bouton semblait ne rien faire. */
export function revealInViewport(el: HTMLElement): void {
  const r = el.getBoundingClientRect();
  if (r.bottom > 0 && r.top < window.innerHeight) return;
  el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
}

export function mmToPx(mm: number): number {
  const probe = document.createElement("div");
  probe.style.height = `${mm}mm`;
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return px;
}
