/**
 * Styles de document (2026-10-24) — toute la MISE EN FORME d'un document
 * (police et paragraphes, page et marges, en-tête/pied, bordure de page,
 * styles de titres, style du sommaire) regroupée en un « style » nommé que
 * l'on peut appliquer à un autre document, enregistrer, exporter vers un
 * fichier et importer sur un autre poste — comme la galerie de pages de
 * garde (voir coverTemplates.ts), dont il reprend le stockage.
 *
 * Un style ne contient JAMAIS ce qui appartient au document lui-même
 * (titre, auteur, version, propriétés, champs personnalisés) : seulement des
 * réglages de présentation, regroupés en « éléments » que l'on coche à
 * l'application comme à l'enregistrement.
 */
import { extractDocumentConfig, type PageLayoutSettings } from "./pageLayout";

/** Éléments d'un style : chacun regroupe des champs de `PageLayoutSettings`. */
export type StylePartId = "font" | "page" | "headerFooter" | "border" | "headings" | "toc";

export const STYLE_PARTS: { id: StylePartId; label: string; hint: string; keys: (keyof PageLayoutSettings)[] }[] = [
  {
    id: "font",
    label: "Police et paragraphes",
    hint: "police, taille, interligne, espacement",
    keys: ["fontFamily", "fontSize", "lineHeight", "paragraphSpacingPt", "spacingBeforePt", "justify"],
  },
  {
    id: "page",
    label: "Page et marges",
    hint: "format papier, orientation, marges",
    keys: ["paperSize", "orientation", "widthMm", "heightMm", "marginTopMm", "marginBottomMm", "marginLeftMm", "marginRightMm"],
  },
  { id: "headerFooter", label: "En-tête et pied de page", hint: "textes, hauteurs, première page", keys: ["header", "footer"] },
  { id: "border", label: "Bordure de page", hint: "cadre autour des pages", keys: ["pageBorder"] },
  { id: "headings", label: "Styles de titres", hint: "polices, couleurs, numérotation par niveau", keys: ["headingStyles"] },
  { id: "toc", label: "Sommaire", hint: "profondeur, puces, retrait, couleur", keys: ["toc"] },
];

export const ALL_STYLE_PARTS: StylePartId[] = STYLE_PARTS.map((p) => p.id);

/** Un style de document : nom, description et réglages (partiels). */
export interface DocumentStyle {
  name: string;
  description?: string;
  /** Intégré à l'application (non supprimable) — absent pour les styles utilisateur. */
  builtin?: boolean;
  layout: Partial<PageLayoutSettings>;
}

const clone = <T,>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

/** Extrait d'une mise en page les seuls champs des éléments demandés. */
export function extractStyleLayout(layout: PageLayoutSettings, parts: StylePartId[]): Partial<PageLayoutSettings> {
  const out: Record<string, unknown> = {};
  for (const part of STYLE_PARTS) {
    if (!parts.includes(part.id)) continue;
    for (const key of part.keys) {
      if (layout[key] !== undefined) out[key] = clone(layout[key]);
    }
  }
  return out as Partial<PageLayoutSettings>;
}

/** Applique un style à une mise en page : seuls les éléments cochés ET
 *  présents dans le style sont recopiés ; le reste (dont les propriétés du
 *  document) est conservé. Le format « personnalisé » (largeur/hauteur) du
 *  document est remplacé par celui du style quand l'élément Page est appliqué. */
export function applyStyleToLayout(layout: PageLayoutSettings, style: DocumentStyle, parts: StylePartId[]): PageLayoutSettings {
  const next: Record<string, unknown> = { ...layout };
  const source = style.layout as Record<string, unknown>;
  for (const part of STYLE_PARTS) {
    if (!parts.includes(part.id)) continue;
    const hasAny = part.keys.some((k) => source[k as string] !== undefined);
    if (!hasAny) continue;
    for (const key of part.keys) {
      const k = key as string;
      if (source[k] !== undefined) next[k] = clone(source[k]);
      else if (part.id === "page" && (k === "widthMm" || k === "heightMm")) delete next[k];
    }
  }
  return next as unknown as PageLayoutSettings;
}

/** Éléments réellement présents dans un style (pour griser les cases). */
export function stylePartsPresent(style: DocumentStyle): StylePartId[] {
  const source = style.layout as Record<string, unknown>;
  return STYLE_PARTS.filter((p) => p.keys.some((k) => source[k as string] !== undefined)).map((p) => p.id);
}

/** Résumé lisible d'un style (puces de l'aperçu). */
export function describeStyle(style: DocumentStyle): string[] {
  const l = style.layout;
  const lines: string[] = [];
  if (l.fontFamily || l.fontSize) lines.push(`Police : ${(l.fontFamily ?? "").split(",")[0] || "—"} ${l.fontSize ?? ""}`.trim());
  if (l.paperSize) lines.push(`Page : ${l.paperSize} ${l.orientation === "landscape" ? "paysage" : "portrait"}`);
  if (l.marginTopMm !== undefined) lines.push(`Marges : ${l.marginTopMm} / ${l.marginRightMm} / ${l.marginBottomMm} / ${l.marginLeftMm} mm`);
  if (l.header || l.footer) {
    const bits = [l.header?.text ? "en-tête" : "", l.footer?.text ? "pied de page" : ""].filter(Boolean);
    lines.push(bits.length ? `Texte en ${bits.join(" et ")}` : "Sans en-tête ni pied de page");
  }
  if (l.pageBorder) lines.push(l.pageBorder.enabled ? `Cadre de page ${l.pageBorder.style} (${l.pageBorder.appliesTo === "all" ? "toutes les pages" : l.pageBorder.appliesTo === "first" ? "première page" : "pages de garde"})` : "Sans cadre de page");
  if (l.headingStyles) {
    const numbered = Object.values(l.headingStyles).filter((h) => h.numbering !== "none").length;
    lines.push(numbered ? `Titres numérotés (${numbered} niveau${numbered > 1 ? "x" : ""})` : "Titres sans numérotation");
  }
  if (l.toc) lines.push(`Sommaire : ${l.toc.maxLevel} niveau${l.toc.maxLevel > 1 ? "x" : ""}${l.toc.bullets ? "" : ", sans puces"}`);
  return lines;
}

// ---------------------------------------------------------------------------
// Styles intégrés (charte MBEF — voir CLAUDE.md pour le nuancier)
// ---------------------------------------------------------------------------

/** Base : les réglages USINE (jamais les défauts de l'utilisateur), pour que
 *  les styles intégrés soient les mêmes sur tous les postes. */
function base(): PageLayoutSettings {
  return extractDocumentConfig("").layout;
}

function headings(
  colors: Record<number, string>,
  numbering: "none" | "decimal",
  sizes: Record<number, string> = { 1: "20pt", 2: "16pt", 3: "13pt", 4: "11pt", 5: "10pt", 6: "10pt" },
): PageLayoutSettings["headingStyles"] {
  const font = "Arial, sans-serif";
  const out: Record<string, unknown> = {};
  for (let level = 1; level <= 6; level++) {
    out[String(level)] = {
      fontFamily: font,
      fontSize: sizes[level],
      color: colors[level],
      bold: true,
      italic: false,
      numbering: level <= 3 ? numbering : "none",
    };
  }
  return out as PageLayoutSettings["headingStyles"];
}

export function builtinDocumentStyles(): DocumentStyle[] {
  const b = base();
  const header = (text: string) => ({ ...b.header, text, showOnFirstPage: false });
  const footer = (text: string) => ({ ...b.footer, text, showOnFirstPage: false });
  return [
    {
      name: "MBEF — Rapport standard",
      builtin: true,
      description: "Rapport courant aux couleurs MBEF : titres sapin et océan, pied de page numéroté.",
      layout: {
        fontFamily: "Arial, sans-serif",
        fontSize: "10pt",
        lineHeight: 1.15,
        paragraphSpacingPt: 8,
        spacingBeforePt: 0,
        paperSize: "A4",
        orientation: "portrait",
        marginTopMm: 25,
        marginBottomMm: 25,
        marginLeftMm: 20,
        marginRightMm: 20,
        header: header("{{title}}"),
        footer: footer("{{filename}} — Page {{page}} / {{pages}}"),
        pageBorder: { ...b.pageBorder, enabled: false },
        headingStyles: headings({ 1: "#003f2b", 2: "#2f52a0", 3: "#2f52a0", 4: "#343334", 5: "#343334", 6: "#343334" }, "none"),
        toc: { maxLevel: 3, bullets: false, indentMm: 8, color: "#2f52a0", underline: false, boldFirstLevel: true, pageNumbers: false },
      },
    },
    {
      name: "MBEF — CCTP numéroté",
      builtin: true,
      description: "Cahier des clauses techniques : titres numérotés 1., 1.1., cadre noir sur la page de garde, en-tête et pied avec indice.",
      layout: {
        fontFamily: "Arial, sans-serif",
        fontSize: "10pt",
        lineHeight: 1.15,
        paragraphSpacingPt: 6,
        spacingBeforePt: 0,
        paperSize: "A4",
        orientation: "portrait",
        marginTopMm: 22,
        marginBottomMm: 22,
        marginLeftMm: 20,
        marginRightMm: 20,
        header: header("{{title}} — {{subject}}"),
        footer: footer("{{filename}} — Indice {{version}} — Page {{page}} / {{pages}}"),
        pageBorder: { enabled: true, style: "solid", widthPt: 1, color: "#000000", offsetMm: 8, appliesTo: "cover" },
        headingStyles: headings({ 1: "#003f2b", 2: "#003f2b", 3: "#2f52a0", 4: "#343334", 5: "#343334", 6: "#343334" }, "decimal", {
          1: "16pt",
          2: "13pt",
          3: "11pt",
          4: "10pt",
          5: "10pt",
          6: "10pt",
        }),
        toc: { maxLevel: 3, bullets: false, indentMm: 8, color: "#343334", underline: false, boldFirstLevel: true, pageNumbers: false },
      },
    },
    {
      name: "CCTP — parties à bandeau (modèle Word)",
      builtin: true,
      description:
        "Cahier des charges façon Word : en-tête société + projet/référence, pied de page à 4 lignes avec « n / N », parties sur page à bandeau gris pleine largeur, titres numérotés soulignés en majuscules, sommaire à 4 niveaux avec numéros de page, texte justifié. Champs à créer dans Propriétés du document : Societe, Adresse, Contact, Mentions, Projet, Reference.",
      layout: {
        fontFamily: "Arial, sans-serif",
        fontSize: "10pt",
        lineHeight: 1.05,
        paragraphSpacingPt: 6,
        spacingBeforePt: 0,
        justify: true,
        paperSize: "A4",
        orientation: "portrait",
        marginTopMm: 26,
        marginBottomMm: 30,
        marginLeftMm: 15,
        marginRightMm: 15,
        header: {
          ...b.header,
          heightMm: 14,
          fromEdgeMm: 8,
          showOnFirstPage: false,
          text:
            '<table><colgroup><col style="width: 440px;"><col style="width: 240px;"></colgroup><tbody><tr><td colwidth="440" style="border-top:none;border-right:none;border-bottom:none;border-left:none"><p><span style="font-size:18pt;color:#003f2b"><strong>{{Societe}}</strong></span></p></td><td colwidth="240" style="border-top:none;border-right:none;border-bottom:none;border-left:none"><p><span style="font-size:8pt;color:#4f6228">Projet : {{Projet}}<br>Référence : <strong>{{Reference}}</strong></span></p></td></tr></tbody></table>',
        },
        footer: {
          ...b.footer,
          heightMm: 22,
          fromEdgeMm: 5,
          showOnFirstPage: false,
          text:
            '<div style="font-size:8pt;color:#343334"><p style="text-align:center;margin:0"><b>{{Societe}}</b><br>{{Adresse}}<br>{{Contact}}<br>{{Mentions}}</p><p style="text-align:right;margin:0"><b>{{page}} / {{pages}}</b></p></div>',
        },
        pageBorder: { enabled: true, style: "solid", widthPt: 1, color: "#000000", offsetMm: 8, appliesTo: "cover" },
        headingStyles: {
          // Titre 1 = « PARTIE n : … » (page de bandeau gris, non numéroté).
          1: {
            fontFamily: "Georgia, serif",
            fontSize: "20pt",
            color: "#595959",
            bold: true,
            italic: false,
            numbering: "none",
            uppercase: true,
            centered: true,
            letterSpacingPt: 4,
            background: "#d9d9d9",
            fullWidth: true,
            spacingBeforePt: 230,
            spacingAfterPt: 0,
          },
          // Titre 2 = « 1. PRESENTATION DU PROJET » : gras, souligné, majuscules.
          2: { fontFamily: "Arial, sans-serif", fontSize: "10pt", color: "#000000", bold: true, italic: false, numbering: "decimal", underline: true, uppercase: true, spacingBeforePt: 10, spacingAfterPt: 6 },
          // Titre 3 = « 1.1. Objet » : gras, souligné, légèrement en retrait.
          3: { fontFamily: "Arial, sans-serif", fontSize: "10pt", color: "#000000", bold: true, italic: false, numbering: "decimal", underline: true, indentMm: 6, spacingBeforePt: 10, spacingAfterPt: 6 },
          // Titre 4 = « 12.3.1. Tuyauterie » : gras, non souligné, plus en retrait.
          4: { fontFamily: "Arial, sans-serif", fontSize: "10pt", color: "#000000", bold: true, italic: false, numbering: "decimal", indentMm: 10, spacingBeforePt: 8, spacingAfterPt: 6 },
          5: { fontFamily: "Arial, sans-serif", fontSize: "10pt", color: "#000000", bold: true, italic: false, numbering: "none", indentMm: 10 },
          6: { fontFamily: "Arial, sans-serif", fontSize: "10pt", color: "#000000", bold: false, italic: true, numbering: "none", indentMm: 10 },
        },
        toc: { maxLevel: 4, bullets: false, indentMm: 6, color: "#000000", underline: false, boldFirstLevel: true, pageNumbers: true },
      },
    },
    {
      name: "Note courte",
      builtin: true,
      description: "Note ou compte rendu : mise en page légère, sans en-tête ni pied, titres sobres non numérotés.",
      layout: {
        fontFamily: "Arial, sans-serif",
        fontSize: "11pt",
        lineHeight: 1.15,
        paragraphSpacingPt: 8,
        spacingBeforePt: 0,
        paperSize: "A4",
        orientation: "portrait",
        marginTopMm: 20,
        marginBottomMm: 20,
        marginLeftMm: 20,
        marginRightMm: 20,
        header: { ...b.header, text: "", showOnFirstPage: true },
        footer: { ...b.footer, text: "", showOnFirstPage: true },
        pageBorder: { ...b.pageBorder, enabled: false },
        headingStyles: headings({ 1: "#343334", 2: "#343334", 3: "#343334", 4: "#343334", 5: "#343334", 6: "#343334" }, "none", {
          1: "16pt",
          2: "13pt",
          3: "11pt",
          4: "11pt",
          5: "11pt",
          6: "11pt",
        }),
        toc: { maxLevel: 2, bullets: true, indentMm: 6, color: "", underline: true, boldFirstLevel: false, pageNumbers: false },
      },
    },
    {
      name: "Noir et blanc (impression économique)",
      builtin: true,
      description: "Aucune couleur : titres et sommaire en noir, pour imprimer sans consommer d'encre.",
      layout: {
        fontFamily: "Arial, sans-serif",
        fontSize: "10pt",
        lineHeight: 1.15,
        paragraphSpacingPt: 8,
        spacingBeforePt: 0,
        header: { ...b.header, text: "{{title}}", showOnFirstPage: false },
        footer: { ...b.footer, text: "Page {{page}} / {{pages}}", showOnFirstPage: false },
        pageBorder: { ...b.pageBorder, enabled: false },
        headingStyles: headings({ 1: "#000000", 2: "#000000", 3: "#000000", 4: "#000000", 5: "#000000", 6: "#000000" }, "none"),
        toc: { maxLevel: 3, bullets: false, indentMm: 8, color: "#000000", underline: false, boldFirstLevel: true, pageNumbers: false },
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Styles utilisateur (localStorage) + fichiers exportables
// ---------------------------------------------------------------------------

const STORAGE_KEY = "pagina.documentStyles";

/** Styles de l'utilisateur — silencieux si absents/corrompus. */
export function loadUserDocumentStyles(): DocumentStyle[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is DocumentStyle => !!s && typeof (s as DocumentStyle).name === "string" && typeof (s as DocumentStyle).layout === "object")
      .map((s) => ({ name: s.name, description: s.description, layout: s.layout }));
  } catch {
    return [];
  }
}

function saveUserDocumentStyles(styles: DocumentStyle[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles));
  } catch {
    /* localStorage indisponible : liste vivante mais non persistée. */
  }
}

/** Ajoute (ou remplace, à nom égal) un style utilisateur. */
export function addUserDocumentStyle(style: DocumentStyle): void {
  const rest = loadUserDocumentStyles().filter((s) => s.name !== style.name);
  saveUserDocumentStyles([...rest, { name: style.name, description: style.description, layout: style.layout }]);
}

export function removeUserDocumentStyle(name: string): void {
  saveUserDocumentStyles(loadUserDocumentStyles().filter((s) => s.name !== name));
}

/** Fichier exportable (JSON lisible). */
export function serializeDocumentStyle(style: DocumentStyle): string {
  return JSON.stringify({ kind: "pagina-document-style", version: 1, name: style.name, description: style.description, layout: style.layout }, null, 2);
}

/** Lit un fichier de style ; `null` s'il n'est pas un style Pagina valide. */
export function parseDocumentStyleFile(raw: string): DocumentStyle | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.kind !== "pagina-document-style") return null;
    if (typeof parsed.name !== "string" || !parsed.name.trim()) return null;
    if (!parsed.layout || typeof parsed.layout !== "object" || Array.isArray(parsed.layout)) return null;
    return { name: parsed.name, description: typeof parsed.description === "string" ? parsed.description : undefined, layout: parsed.layout as Partial<PageLayoutSettings> };
  } catch {
    return null;
  }
}
