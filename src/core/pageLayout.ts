/**
 * Réglages de mise en page (format papier, marges, en-tête/pied de page,
 * police de base). Ce sont des propriétés de PRÉSENTATION/RENDU du document,
 * jamais du contenu Markdown : elles ne doivent jamais se retrouver mêlées
 * au texte.
 *
 * Stockage : DEUX commentaires HTML invisibles en tout début de fichier :
 * - `<!-- pagina:config {...} -->` — la config de CE document (voir
 *   `serializeDocumentConfig` / `extractDocumentConfig`), celle qui compte
 *   pour le rendu.
 * - `<!-- pagina:generator {...} -->` — identité de l'outil qui a écrit le
 *   fichier (nom, version de Pagina, éditeur logiciel, licence — voir
 *   `appInfo.ts`), purement informatif, jamais relu pour piloter quoi que
 *   ce soit ; réécrit à chaque sauvegarde avec la version actuelle de
 *   l'app, un peu comme la balise `<meta name="generator">` d'une page web.
 *
 * Ces deux commentaires sont invisibles dans n'importe quel autre outil
 * Markdown (GitHub, VS Code, Obsidian…), à l'inverse d'un front-matter YAML
 * qui s'afficherait comme un bloc de texte brut dans un rendu qui ne le
 * comprend pas. Le comportement de repli est important : un fichier SANS
 * ces commentaires (ancien fichier, fichier créé par un autre outil) utilise
 * simplement `DEFAULT_PAGE_LAYOUT` — jamais d'erreur, jamais de dialogue de
 * migration forcé.
 *
 * Les commentaires vivent EN DEHORS du document ProseMirror : `tabsStore.ts`
 * les extrait du texte AVANT de le donner à l'éditeur (qui ne les voit donc
 * jamais et ne peut pas les perdre en les faisant passer par le HTML), et
 * réinjecte celui de config au moment de la sauvegarde (celui de generator
 * est reconstruit à neuf à chaque fois, jamais relu). Ne jamais faire
 * porter cette information par l'éditeur Tiptap lui-même : un HTML comment
 * n'a pas de nœud de schéma dédié, `tiptap-markdown` le fait simplement
 * disparaître au premier aller-retour (constaté en testant : un fichier
 * neuf rouvert perdait son commentaire dès la première sauvegarde).
 *
 * Fichier `.md` gardé "propre" (demande explicite de l'utilisateur) : deux
 * lignes de commentaire max en tête de fichier, jamais plus — toute
 * nouvelle information de configuration future doit rejoindre le JSON du
 * commentaire `pagina:config` existant, pas ajouter une troisième ligne.
 */
import { APP_NAME, APP_VERSION, PUBLISHER, PUBLISHER_WEBSITE, LICENSE_NOTE } from "./appInfo";

/** Réglages de la zone d'en-tête ou de pied de page d'un document
 *  (texte, hauteur, première page, distance au bord). */
export interface HeaderFooterSettings {
  /** Texte affiché, PEUT contenir des variables `{{page}}` (voir
   * `resolveHeaderFooterText`) — vide = pas d'en-tête/pied de page du tout. */
  text: string;
  /** Hauteur réservée, en millimètres (dans la zone de marge, comme Word). */
  heightMm: number;
  /** `false` = masqué sur la première page uniquement (page de garde), le
   * reste du document garde son en-tête/pied de page normalement. */
  showOnFirstPage: boolean;
  /** « À partir du bord » (onglet Mise en page, comme Word) : distance du
   * bord de la page au DÉBUT de la zone, en millimètres. */
  fromEdgeMm: number;
}

/** Bordure de page (cadre autour de la page, comme « Bordures de page » de
 *  Word) : un rectangle posé à `offsetMm` du bord PHYSIQUE de la page, sur
 *  toutes les pages, la première seulement, ou les pages de garde. */
export interface PageBorderSettings {
  enabled: boolean;
  style: "solid" | "dashed" | "dotted" | "double";
  /** Épaisseur en points. */
  widthPt: number;
  color: string;
  /** Distance entre le bord de la page et le cadre, en millimètres. */
  offsetMm: number;
  appliesTo: "all" | "first" | "cover";
}

/** Style du SOMMAIRE (apparence et profondeur) — appliqué à tout sommaire
 *  généré du document (voir TocStyle.ts et `generateToc`). */
export interface TocStyleSettings {
  /** Niveau de titre le plus profond listé (1 à 6). */
  maxLevel: number;
  /** Puces devant les entrées. */
  bullets: boolean;
  /** Retrait de chaque niveau imbriqué, en millimètres. */
  indentMm: number;
  /** Couleur des entrées (« » = couleur des liens du document). */
  color: string;
  underline: boolean;
  /** Entrées de premier niveau en gras. */
  boldFirstLevel: boolean;
  /** Numéro de page à droite de chaque entrée, avec points de conduite
   * (calculé à la peinture, voir paintPages.ts). */
  pageNumbers: boolean;
}

/** MISE EN PAGE complète d'un document : marges, papier, police de base,
 *  en-tête/pied, styles de titres, interligne/espacement, propriétés et champs
 *  personnalisés. Sérialisée dans le commentaire `pagina:config` en tête du
 *  .md (voir serializeDocumentConfig / extractDocumentConfig). */
export interface PageLayoutSettings {
  /** Police de base du corps de texte (hors mise en forme "avancée" appliquée à la main). */
  fontFamily: string;
  /** Taille de base du corps de texte. */
  fontSize: string;
  /** Interligne (sans unité, comme CSS line-height). Word utilise ~1.08-1.15
   * par défaut selon les modèles, très loin du 1.5 "aéré" du web — trop
   * d'espace donne une densité de texte très différente d'un rendu Word. */
  lineHeight: number;
  /** Espace après chaque paragraphe, en points — équivalent du "Espacement
   * après paragraphe" de Word (~8pt par défaut), pas une marge symétrique
   * haut+bas comme un <p> HTML classique. */
  paragraphSpacingPt: number;
  /** Espace AVANT chaque paragraphe, en points (roadmap 2.2, 2026-10-21 —
   * « Espacement avant » de Word, 0 par défaut comme Word). */
  spacingBeforePt: number;
  /** Texte des paragraphes JUSTIFIÉ (comme un CCTP Word) — absent/faux = aligné à
   * gauche ; un paragraphe aligné à la main garde son alignement. */
  justify?: boolean;
  /** Marges de page, en millimètres. */
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  /** Format papier et orientation. */
  paperSize: "A3" | "A4" | "A5" | "Letter" | "Legal";
  orientation: "portrait" | "landscape";
  /** Dimensions PERSONNALISÉES en millimètres (Largeur/Hauteur de l'onglet
   * Papier, comme Word) : définies = elles priment sur `paperSize` (le
   * libellé du format reste affiché mais les dimensions appliquées sont
   * celles-ci). Absentes = dimensions du format choisi. */
  widthMm?: number;
  heightMm?: number;
  header: HeaderFooterSettings;
  footer: HeaderFooterSettings;
  /** Champs libres saisis à la main, disponibles comme variables `{{version}}`
   * / `{{author}}` dans l'en-tête/pied de page — pas de suivi automatique,
   * l'utilisateur les met à jour lui-même quand il le juge utile. */
  documentVersion: string;
  author: string;
  /** Propriétés du document (roadmap 1.3) — voir DocumentProperties. */
  documentProperties: DocumentProperties;
  /** Style visuel + numérotation automatique par niveau de titre (1 à 6) —
   * voir `HeadingLevelStyle`. Réglable par document (pas un thème partagé
   * entre documents pour l'instant — l'utilisateur a mentionné vouloir un
   * import/export de cette config plus tard, pas encore développé). */
  headingStyles: Record<HeadingLevel, HeadingLevelStyle>;
  /** Cadre autour des pages — voir `PageBorderSettings`. */
  pageBorder: PageBorderSettings;
  /** Style du sommaire — voir `TocStyleSettings`. */
  toc: TocStyleSettings;
}

/** Champ personnalisé des propriétés du document (roadmap 1.3, fenêtre
 * « Propriétés du document ») — nom libre, valeur libre. Base des futures
 * variables `{{nom}}` d'en-tête/pied (roadmap 1.6, pas encore branchées). */
export interface DocumentCustomProperty {
  name: string;
  value: string;
}

/** Propriétés du document (roadmap 1.3) — mêmes propriétés que l'onglet
 * « Fichier > Informations » de Word. Stockées dans le même commentaire
 * `pagina:config` que la mise en page (invisibles et sans effet dans tout
 * autre outil Markdown). L'AUTEUR et la VERSION restent dans
 * `layout.author`/`layout.documentVersion` (variables {{author}}/
 * {{version}} des en-têtes/pieds) — la fenêtre les édite au même endroit. */
interface DocumentProperties {
  title: string;
  subject: string;
  /** Date de création (AAAA-MM-JJ) — établie au premier enregistrement
   * Pagina du fichier, jamais recalculée ensuite. */
  createdDate: string;
  /** Date de modification — remise à aujourd'hui à CHAQUE sauvegarde
   * (comme Word), voir `withDocumentConfig`. */
  modifiedDate: string;
  /** Mots-clés séparés par des points-virgules, comme Word. */
  keywords: string;
  comments: string;
  custom: DocumentCustomProperty[];
}

/** Niveau de titre : 1 (h1) à 6 (h6). */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Comment un niveau de titre numérote ses occurrences successives.
 * "none" = pas de numéro du tout pour ce niveau (mais son compteur continue
 * d'exister en interne pour que les niveaux enfants puissent quand même
 * numéroter "1.1", "1.2"... par rapport à lui). */
export type NumberingScheme = "none" | "decimal" | "upperRoman" | "lowerRoman" | "upperAlpha" | "lowerAlpha";

/** Format d'un niveau de titre (police, taille, couleur, gras/italique,
 *  numérotation) — édité par le dialogue « Régler les styles de titres ». */
export interface HeadingLevelStyle {
  fontFamily: string;
  fontSize: string;
  color: string;
  bold: boolean;
  italic: boolean;
  numbering: NumberingScheme;
  /** Interligne PROPRE au niveau (roadmap 2.2, 2026-10-21) — `undefined`
   * = suivre l'interligne du document (`layout.lineHeight`). */
  lineHeight?: number;
  /** Espacement APRÈS chaque titre de ce niveau, en points (roadmap 2.2) —
   * `undefined` = suivre l'espacement des paragraphes du document
   * (`layout.paragraphSpacingPt`). */
  spacingAfterPt?: number;
  /** Mise en forme « Word » supplémentaire (2026-10-24, reproduction d'un CCTP) —
   * tout est optionnel : absent = comportement historique. */
  underline?: boolean;
  /** Affichage en MAJUSCULES (CSS `text-transform` : le texte du fichier garde
   * sa casse, le sommaire aussi — comme les styles de titre de Word). */
  uppercase?: boolean;
  /** Retrait gauche du titre, en millimètres. */
  indentMm?: number;
  /** Espacement des lettres, en points (« PARTIE 1 : GENERALITES »). */
  letterSpacingPt?: number;
  /** Titre centré. */
  centered?: boolean;
  /** Bandeau de fond derrière le titre (couleur CSS, vide = aucun). */
  background?: string;
  /** Bandeau PLEINE LARGEUR de page (déborde des marges jusqu'aux bords) ; sans
   * effet si `background` est vide. */
  fullWidth?: boolean;
  /** Espacement AVANT chaque titre de ce niveau, en points (absent = celui du document). */
  spacingBeforePt?: number;
}

const HEADING_LEVEL_DEFAULT_SIZES: Record<HeadingLevel, string> = {
  1: "20pt",
  2: "16pt",
  3: "13pt",
  4: "11pt",
  5: "10pt",
  6: "10pt",
};

function defaultHeadingStyle(level: HeadingLevel): HeadingLevelStyle {
  return {
    fontFamily: "Arial, sans-serif",
    fontSize: HEADING_LEVEL_DEFAULT_SIZES[level],
    color: "#2f52a0",
    bold: true,
    italic: false,
    // Désactivée par défaut (comportement inchangé tant que l'utilisateur
    // ne l'active pas explicitement dans le dialogue "Styles de titres") —
    // écrire des numéros dans le texte des titres est une transformation
    // du contenu bien trop visible pour être un comportement par défaut.
    numbering: "none",
  };
}

/** Styles de titres par défaut des nouveaux documents. */
const DEFAULT_HEADING_STYLES: Record<HeadingLevel, HeadingLevelStyle> = {
  1: defaultHeadingStyle(1),
  2: defaultHeadingStyle(2),
  3: defaultHeadingStyle(3),
  4: defaultHeadingStyle(4),
  5: defaultHeadingStyle(5),
  6: defaultHeadingStyle(6),
};

const ROMAN_VALUES: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/** Chiffres romains (I, II, III, IV...) — pas de zéro, `n` doit être >= 1. */
function toRoman(n: number): string {
  let remaining = n;
  let result = "";
  for (const [value, symbol] of ROMAN_VALUES) {
    while (remaining >= value) {
      result += symbol;
      remaining -= value;
    }
  }
  return result;
}

/** Numérotation alphabétique (A, B, ..., Z, AA, AB...) — comme les colonnes
 * d'un tableur, jamais de retour à vide même après 26. */
function toAlpha(n: number): string {
  let remaining = n;
  let result = "";
  while (remaining > 0) {
    const rem = (remaining - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return result;
}

/** Formate un compteur (>= 1) selon le schéma choisi. `numbering: "none"`
 * ne devrait normalement jamais atteindre cette fonction (filtré avant),
 * mais renvoie une chaîne vide par sécurité plutôt que de planter. */
export function formatCounter(n: number, scheme: NumberingScheme): string {
  switch (scheme) {
    case "decimal":
      return String(n);
    case "upperRoman":
      return toRoman(n);
    case "lowerRoman":
      return toRoman(n).toLowerCase();
    case "upperAlpha":
      return toAlpha(n);
    case "lowerAlpha":
      return toAlpha(n).toLowerCase();
    case "none":
    default:
      return "";
  }
}

/** Mise en page par défaut des nouveaux documents — base du « Définir par
 *  défaut » des dialogues Mise en page et Paragraphe. */
const DEFAULT_PAGE_LAYOUT: PageLayoutSettings = {
  fontFamily: "Arial, sans-serif",
  fontSize: "10pt",
  lineHeight: 1.15,
  paragraphSpacingPt: 8,
  spacingBeforePt: 0,
  marginTopMm: 25,
  marginBottomMm: 25,
  marginLeftMm: 20,
  marginRightMm: 20,
  paperSize: "A4",
  orientation: "portrait",
  header: { text: "", heightMm: 12, showOnFirstPage: true, fromEdgeMm: 12.5 },
  footer: { text: "", heightMm: 12, showOnFirstPage: true, fromEdgeMm: 12.5 },
  documentVersion: "",
  author: "",
  documentProperties: { title: "", subject: "", createdDate: "", modifiedDate: "", keywords: "", comments: "", custom: [] },
  headingStyles: DEFAULT_HEADING_STYLES,
  pageBorder: { enabled: false, style: "solid", widthPt: 1, color: "#000000", offsetMm: 10, appliesTo: "all" },
  toc: { maxLevel: 6, bullets: true, indentMm: 8, color: "", underline: true, boldFirstLevel: false, pageNumbers: false },
};

/** Dimensions "portrait" des formats papier supportés, en millimètres. */
export const PAPER_SIZES_MM: Record<PageLayoutSettings["paperSize"], { width: number; height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

/** Libellés français des formats, pour les listes déroulantes. */
export const PAPER_SIZE_LABELS: Record<PageLayoutSettings["paperSize"], string> = {
  A3: "A3 (297 x 420 mm)",
  A4: "A4 (210 x 297 mm)",
  A5: "A5 (148 x 210 mm)",
  Letter: "Letter (21,59 x 27,94 cm)",
  Legal: "Legal (21,59 x 35,56 cm)",
};

/** Largeur/hauteur réelles de la page en mm, une fois l'orientation — et
 * les dimensions PERSONNALISÉES si présentes — appliquées. */
export function resolvePageSizeMm(settings: PageLayoutSettings): { widthMm: number; heightMm: number } {
  const custom =
    typeof settings.widthMm === "number" && settings.widthMm > 0 && typeof settings.heightMm === "number" && settings.heightMm > 0;
  if (custom) {
    return settings.orientation === "landscape"
      ? { widthMm: settings.heightMm!, heightMm: settings.widthMm! }
      : { widthMm: settings.widthMm!, heightMm: settings.heightMm! };
  }
  const base = PAPER_SIZES_MM[settings.paperSize];
  return settings.orientation === "landscape"
    ? { widthMm: base.height, heightMm: base.width }
    : { widthMm: base.width, heightMm: base.height };
}

/* « Définir par défaut » du dialogue Mise en page (comme Word) : les
 * réglages courants deviennent ceux des NOUVEAUX documents créés via
 * « Nouveau fichier ». Persistés dans localStorage, PAR application
 * (pas par document). Un document déjà ouvert n'est jamais touché. */
const DEFAULT_LAYOUT_STORAGE_KEY = "pagina.defaultPageLayout";

/** Enregistre les réglages donnés comme valeurs par défaut des nouveaux
 * documents (bouton « Définir par défaut »). */
export function saveDefaultPageLayout(layout: PageLayoutSettings): void {
  try {
    localStorage.setItem(DEFAULT_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* localStorage indisponible ( WebView corrompue, quota ) : sans effet,
     * le défaut reste DEFAULT_PAGE_LAYOUT. */
  }
}

/** Réglages par défaut des nouveaux documents : ceux posés par
 * « Définir par défaut », sinon les défauts usine. Tolérant à un JSON
 * invalide/corrompu (retour aux défauts usine). */
export function loadDefaultPageLayout(): PageLayoutSettings {
  try {
    const raw = localStorage.getItem(DEFAULT_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_PAGE_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<PageLayoutSettings>;
    return {
      ...DEFAULT_PAGE_LAYOUT,
      ...parsed,
      header: { ...DEFAULT_PAGE_LAYOUT.header, ...parsed.header },
      footer: { ...DEFAULT_PAGE_LAYOUT.footer, ...parsed.footer },
      pageBorder: { ...DEFAULT_PAGE_LAYOUT.pageBorder, ...parsed.pageBorder },
      toc: { ...DEFAULT_PAGE_LAYOUT.toc, ...parsed.toc },
    };
  } catch {
    return DEFAULT_PAGE_LAYOUT;
  }
}

/** Contexte de substitution des variables d'en-tête/pied de page (voir
 * `resolveHeaderFooterText`) — une valeur par variable disponible.
 *
 * Depuis la roadmap 1.6 (2026-10-21) : les PROPRIÉTÉS DU DOCUMENT
 * (fenêtre « Propriétés du document ») sont disponibles comme variables
 * — {{title}}, {{subject}}, {{keywords}}, {{created}}, {{modified}} —
 * ainsi que CHAQUE CHAMP PERSONNALISÉ par son propre nom ({{Chantier}},
 * {{Affaire}}… : le nom saisi dans la fenêtre est le nom de la variable). */
export interface HeaderFooterContext {
  page: number;
  pages: number;
  date: string;
  filename: string;
  version: string;
  author: string;
  /** Propriétés du document (roadmap 1.6) — voir DocumentProperties. */
  title: string;
  subject: string;
  keywords: string;
  created: string;
  modified: string;
  /** Champs personnalisés (roadmap 1.6) : chaque {name} devient la
   * variable {{name}} dans les en-têtes/pieds. */
  custom: DocumentCustomProperty[];
}

const HEADER_FOOTER_TOKENS: Record<keyof Omit<HeaderFooterContext, "custom">, string> = {
  page: "{{page}}",
  pages: "{{pages}}",
  date: "{{date}}",
  filename: "{{filename}}",
  version: "{{version}}",
  author: "{{author}}",
  title: "{{title}}",
  subject: "{{subject}}",
  keywords: "{{keywords}}",
  created: "{{created}}",
  modified: "{{modified}}",
};

/** Remplace les variables `{{page}}`, `{{pages}}`, `{{date}}`, `{{filename}}`,
 * `{{version}}`, `{{author}}`, les propriétés du document (`{{title}}`,
 * `{{subject}}`, `{{keywords}}`, `{{created}}`, `{{modified}}`) et chaque
 * champ personnalisé (`{{NomDuChamp}}`) dans un modèle d'en-tête/pied de
 * page par leur valeur réelle pour UNE page donnée. Une variable inconnue/
 * mal orthographiée (`{{pgae}}`) est laissée telle quelle plutôt que
 * silencieusement effacée — plus facile à repérer et corriger.
 */
export function resolveHeaderFooterText(template: string, ctx: HeaderFooterContext): string {
  let result = template;
  for (const key of Object.keys(HEADER_FOOTER_TOKENS) as (keyof typeof HEADER_FOOTER_TOKENS)[]) {
    result = result.split(HEADER_FOOTER_TOKENS[key]).join(String(ctx[key]));
  }
  // Champs personnalisés : le NOM du champ est le nom de la variable.
  // Substitués APRÈS les variables fixes — un champ nommé « date »
  // n'écrasera donc pas {{date}} (numérotation) mais resterait
  // {{...}} non résolu s'il porte exactement un nom réservé.
  for (const c of ctx.custom ?? []) {
    const name = (c.name ?? "").trim();
    if (!name) continue;
    result = result.split(`{{${name}}}`).join(c.value ?? "");
  }
  return result;
}

/** Libellé lisible d'un champ de document, affiché à sa place tant qu'il est
 *  vide (sinon le champ est invisible et on ne sait pas où cliquer). */
export function docFieldLabel(name: string): string {
  const labels: Record<string, string> = {
    title: "Titre",
    subject: "Sujet",
    author: "Auteur",
    version: "Version",
    keywords: "Mots-clés",
    date: "Date",
    created: "Date de création",
    modified: "Date de modification",
    filename: "Nom du fichier",
  };
  return labels[name] ?? name;
}

/** Valeur ÉDITABLE d'un champ de document ({{title}}, {{author}}…), ou `null`
 *  si le champ est calculé (date, nom de fichier…) et ne se saisit pas. Sert à
 *  l'édition directe d'un champ en cliquant dessus sur la page. */
export function getEditableDocField(layout: PageLayoutSettings, name: string): string | null {
  const props = layout.documentProperties;
  switch (name) {
    case "title":
      return props?.title ?? "";
    case "subject":
      return props?.subject ?? "";
    case "keywords":
      return props?.keywords ?? "";
    case "author":
      return layout.author ?? "";
    case "version":
      return layout.documentVersion ?? "";
    default: {
      const custom = props?.custom?.find((c) => (c.name ?? "").trim() === name);
      return custom ? custom.value ?? "" : null;
    }
  }
}

/** Nouveau layout avec la valeur d'un champ modifiée, ou `null` si le champ
 *  n'est pas éditable (voir `getEditableDocField`). */
export function setEditableDocField(layout: PageLayoutSettings, name: string, value: string): PageLayoutSettings | null {
  if (getEditableDocField(layout, name) === null) return null;
  const props = layout.documentProperties;
  switch (name) {
    case "title":
    case "subject":
    case "keywords":
      return { ...layout, documentProperties: { ...props, [name]: value } };
    case "author":
      return { ...layout, author: value };
    case "version":
      return { ...layout, documentVersion: value };
    default:
      return {
        ...layout,
        documentProperties: {
          ...props,
          custom: props.custom.map((c) => ((c.name ?? "").trim() === name ? { ...c, value } : c)),
        },
      };
  }
}

/** Date du jour au format JJ/MM/AAAA (pas de dépendance à une locale précise
 * du navigateur : format fixe, prévisible dans tout document imprimé). */
export function formatTodayForHeaderFooter(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${now.getFullYear()}`;
}

const CONFIG_COMMENT_PREFIX = "<!-- pagina:config ";
const CONFIG_COMMENT_SUFFIX = " -->";
const GENERATOR_COMMENT_PREFIX = "<!-- pagina:generator ";
const GENERATOR_COMMENT_SUFFIX = " -->";
// Un commentaire mal formé (JSON invalide, futur format incompatible) ne
// doit jamais empêcher d'ouvrir le fichier — seulement faire retomber sur
// les valeurs par défaut, silencieusement. Reconnaît indifféremment l'ordre
// config/generator : les deux sont dépouillés en boucle par
// `extractDocumentConfig`, jamais seulement le premier.
const LEADING_PAGINA_COMMENT_RE = /^<!--\s*pagina:(config|generator)\s+([\s\S]*?)\s*-->\s*\n?/;

/** Version du SCHÉMA du commentaire de config (pas du document) — permet de
 * distinguer plus tard un ancien format à migrer d'un format inconnu à
 * ignorer. Pas de système d'historique de versions du document lui-même
 * pour l'instant (idée notée pour plus tard par l'utilisateur, pas encore
 * spécifiée ni développée — voir CLAUDE.md). */
const CONFIG_SCHEMA_VERSION = 1;

interface StoredDocumentConfig {
  configVersion: number;
  layout: Partial<PageLayoutSettings>;
}

/**
 * Sépare le(s) commentaire(s) `pagina:*` (config, generator) en tête de
 * fichier du reste du contenu. Retourne toujours un `layout` complet
 * (fusionné avec les valeurs par défaut pour les champs manquants/invalides)
 * et le contenu SANS ces commentaires, prêt à être donné à l'éditeur.
 */
export function extractDocumentConfig(markdown: string): { layout: PageLayoutSettings; content: string } {
  let content = markdown;
  let layout = DEFAULT_PAGE_LAYOUT;

  // Boucle plutôt qu'un seul match : les deux commentaires (config +
  // generator) sont tous les deux en tête de fichier, dans un ordre non
  // garanti — il faut les dépouiller tous les deux, sinon celui qui reste
  // se retrouve dans `content`, visible dans la vue Markdown brute et
  // dupliqué à la prochaine sauvegarde (`withDocumentConfig` en réécrit
  // toujours un neuf en tête).
  for (let i = 0; i < 2; i++) {
    const match = content.match(LEADING_PAGINA_COMMENT_RE);
    if (!match) break;
    let [full, kind, payload] = match;
    if (kind === "config") {
      const repaired = repairTruncatedConfig(content, payload);
      if (repaired) {
        full = repaired.full;
        payload = repaired.payload;
      }
    }
    content = content.slice(full.length);
    if (kind !== "config") continue; // "generator" est purement informatif, jamais reparsé
    try {
      const parsed = JSON.parse(payload) as StoredDocumentConfig;
      const parsedHeadingStyles = parsed.layout?.headingStyles;
      layout = {
        ...DEFAULT_PAGE_LAYOUT,
        ...parsed.layout,
        header: { ...DEFAULT_PAGE_LAYOUT.header, ...parsed.layout?.header },
        footer: { ...DEFAULT_PAGE_LAYOUT.footer, ...parsed.layout?.footer },
        pageBorder: { ...DEFAULT_PAGE_LAYOUT.pageBorder, ...parsed.layout?.pageBorder },
        toc: { ...DEFAULT_PAGE_LAYOUT.toc, ...parsed.layout?.toc },
        // Fusion NIVEAU PAR NIVEAU : un ancien fichier (ou un fichier édité
        // à la main) peut n'avoir que certains niveaux définis — les
        // niveaux manquants retombent sur leur défaut individuellement,
        // jamais sur DEFAULT_HEADING_STYLES en bloc (qui écraserait les
        // niveaux déjà personnalisés présents ailleurs dans le JSON).
        headingStyles: {
          1: { ...DEFAULT_HEADING_STYLES[1], ...parsedHeadingStyles?.[1] },
          2: { ...DEFAULT_HEADING_STYLES[2], ...parsedHeadingStyles?.[2] },
          3: { ...DEFAULT_HEADING_STYLES[3], ...parsedHeadingStyles?.[3] },
          4: { ...DEFAULT_HEADING_STYLES[4], ...parsedHeadingStyles?.[4] },
          5: { ...DEFAULT_HEADING_STYLES[5], ...parsedHeadingStyles?.[5] },
          6: { ...DEFAULT_HEADING_STYLES[6], ...parsedHeadingStyles?.[6] },
        },
        // Propriétés du document (roadmap 1.3) : fusion champ à champ — un
        // ancien fichier n'a pas de bloc, il prend les défauts. La date de
        // création absente (fichier jamais passé par la fenêtre) est établie
        // au premier enregistrement Pagina — jamais recalculée ensuite.
        documentProperties: {
          ...DEFAULT_PAGE_LAYOUT.documentProperties,
          ...parsed.layout?.documentProperties,
          custom: parsed.layout?.documentProperties?.custom ?? [],
          createdDate: parsed.layout?.documentProperties?.createdDate ?? dateDuJourISO(),
        },
      };
    } catch {
      // JSON corrompu/format inconnu : on retombe sur les valeurs par défaut
      // plutôt que de bloquer l'ouverture du fichier.
    }
  }

  return { layout, content };
}

/**
 * Répare un commentaire de config COUPÉ trop tôt : d'anciennes versions
 * écrivaient le JSON tel quel, or un texte d'en-tête/pied de page contenant
 * `-->` (typiquement `<!-- empty-line -->` après avoir vidé le champ) fermait
 * le commentaire HTML au milieu du JSON — le reste fuyait dans le document
 * comme du texte visible. On cherche le premier `-->` suivant qui donne un
 * JSON valide. Retourne `null` si le JSON lu tel quel est déjà valide.
 */
function repairTruncatedConfig(content: string, firstPayload: string): { full: string; payload: string } | null {
  try {
    JSON.parse(firstPayload);
    return null;
  } catch {
    // coupé ou corrompu : on tente d'étendre ci-dessous
  }
  const prefix = content.match(/^<!--\s*pagina:config\s+/);
  if (!prefix) return null;
  let from = prefix[0].length;
  for (let attempt = 0; attempt < 6; attempt++) {
    const end = content.indexOf("-->", from);
    if (end < 0) return null;
    const payload = content.slice(prefix[0].length, end).trim();
    try {
      JSON.parse(payload);
      const trailing = content.slice(end + 3).match(/^\s*\n?/)?.[0] ?? "";
      return { full: content.slice(0, end + 3) + trailing, payload };
    } catch {
      from = end + 3;
    }
  }
  return null;
}

/** Rend un JSON sûr dans un commentaire HTML : `-->` à l'intérieur d'une
 * chaîne fermerait le commentaire. L'échappement JSON de `>` (u003e) est
 * valide et `JSON.parse` le restitue tel quel à la lecture. */
function escapeForHtmlComment(json: string): string {
  return json.replace(/-->/g, "--\\u003e");
}

/** Date du jour au format AAAA-MM-JJ (propriétés du document). */
function dateDuJourISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Construit le commentaire de config à écrire en tête de fichier. */
function serializeDocumentConfig(layout: PageLayoutSettings): string {
  const stored: StoredDocumentConfig = { configVersion: CONFIG_SCHEMA_VERSION, layout };
  return `${CONFIG_COMMENT_PREFIX}${escapeForHtmlComment(JSON.stringify(stored))}${CONFIG_COMMENT_SUFFIX}`;
}

/** Construit le commentaire d'identité de l'outil (voir `appInfo.ts`),
 * réécrit à neuf à chaque sauvegarde avec la version actuelle de l'app. */
function serializeGeneratorComment(): string {
  const info = {
    app: APP_NAME,
    appVersion: APP_VERSION,
    publisher: PUBLISHER,
    website: PUBLISHER_WEBSITE,
    license: LICENSE_NOTE,
  };
  return `${GENERATOR_COMMENT_PREFIX}${escapeForHtmlComment(JSON.stringify(info))}${GENERATOR_COMMENT_SUFFIX}`;
}

/** Réassemble le contenu complet du fichier (generator + config + corps)
 * pour la sauvegarde — toujours ces deux lignes, jamais plus (fichier `.md`
 * gardé propre). */
export function withDocumentConfig(layout: PageLayoutSettings, content: string): string {
  // « Date de modification » = date du jour à CHAQUE sauvegarde, comme
  // Word — posée sur la copie écrite, l'état mémoire n'est pas altéré.
  const layoutEcrit = {
    ...layout,
    documentProperties: { ...layout.documentProperties, modifiedDate: dateDuJourISO() },
  };
  return `${serializeGeneratorComment()}\n${serializeDocumentConfig(layoutEcrit)}\n${content}`;
}
