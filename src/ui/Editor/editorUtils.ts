/**
 * Utilitaires de l'éditeur sans état React : tailles de police, changement
 * de casse, presse-papiers, normalisation de signets, mesures DOM.
 * Extraits de MarkdownEditor.tsx.
 */
import type { Editor } from "@tiptap/react";

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

/** Presse-papiers INTERNE : dernier texte copié/coupé DANS l'application. * Repli de `pasteClipboard` quand la lecture du presse-papiers système est
 * refusée — WebView2 peut afficher une demande de permission native pour
 * clipboard-read (ou la voir bloquée par la configuration) : Coller reste
 * ainsi fonctionnel pour tout ce qui a été copié/coupé via les boutons du
 * ruban, sans dépendre de cette permission. */
let internalClipboard: string | null = null;

/** Opérations presse-papiers partagées par le ruban (handle) ET le menu
 * contextuel clic-droit. Sérialisation Markdown de la sélection via
 * tiptap-markdown, puis API Clipboard (absente en contexte non sécurisé :
 * sans effet silencieux, le presse-papiers interne prend le relais). */
function serializeSelection(editor: Editor): string | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  // @ts-expect-error - storage.markdown ajouté par l'extension Markdown
  const md: string = editor.storage.markdown.serializer.serialize(editor.state.doc.slice(from, to).content);
  return md;
}

export function copyEditorSelection(editor: Editor): void {
  const md = serializeSelection(editor);
  if (md === null) return;
  internalClipboard = md;
  navigator.clipboard?.writeText(md).catch(() => {});
}

export function cutEditorSelection(editor: Editor): void {
  if (serializeSelection(editor) === null) return;
  copyEditorSelection(editor);
  editor.chain().focus(undefined, { scrollIntoView: false }).deleteSelection().run();
}

/** Colle le presse-papiers ; `plain` = texte brut (aucune mise en forme ni
 * syntaxe Markdown interprétée — chaque ligne devient un paragraphe). */
export function pasteIntoEditor(editor: Editor, plain: boolean): void {
  const insert = (text: string | null) => {
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
  navigator.clipboard
    ?.readText()
    .then((text) => insert(text || internalClipboard))
    // Permission refusée : repli sur le presse-papiers interne.
    .catch(() => insert(internalClipboard));
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
