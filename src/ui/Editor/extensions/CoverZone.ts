/**
 * Zone « Page de garde » (2026-10-22, refonte demandée par l'utilisateur :
 * « une page de garde est une PAGE NORMALE — traiter comme une zone code,
 * début et fin, transparente, panneau latéral pour les propriétés
 * différentes »). Deux marqueurs invisibles encadrent du CONTENU NORMAL :
 * le contenu entre eux est un document ordinaire (paragraphes, tableaux,
 * titres…) — aucune des limitations de l'ancien bloc spécial.
 *
 * RÔLE DU PANNEAU « Page de garde » (s'ouvre quand le curseur est dans la
 * zone, front montant comme le panneau Tableau) : propriétés SPÉCIFIQUES
 * de la zone (en-tête/pied masqués sur les pages couvertes), insertion de
 * champs `{{variable}}` (DocField.ts), enregistrement de la zone comme
 * « type » réutilisable, suppression.
 *
 * PERSISTANCE : deux commentaires HTML standard, invisibles et sans effet
 * de bord dans tout autre outil Markdown :
 *     <!-- coverzone-start -->
 *     …contenu normal de la page…
 *     <!-- coverzone-end -->
 * Le contenu entre les marqueurs est du Markdown PUR — GitHub/VS Code/
 * Obsidian affichent exactement le document, les commentaires sont
 * invisibles : la page de garde est une page « comme les autres » dans le
 * fichier aussi.
 */
import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** Propriétés portées par le marqueur de début d'une zone page de garde. Les
 *  marges sont en mm, ABSOLUES (distance au bord de la page) ; `null` = marge
 *  du document. */
export interface CoverZoneProps {
  headerFooter: boolean;
  /** Thème visuel de la zone (« chantier »…), « » = style libre. */
  theme: string;
  marginTopMm: number | null;
  marginLeftMm: number | null;
  marginRightMm: number | null;
  marginBottomMm: number | null;
}

/** Zone page de garde englobant une position : positions des marqueurs
 *  début/fin (le nœud `coverZoneEnd` commence à `end`) + propriétés du
 *  marqueur de début. */
export interface CoverZoneInfo extends CoverZoneProps {
  start: number;
  end: number;
}

/** Marqueur de DÉBUT : `<!-- coverzone-start[ header][ theme=nom][ margin-top=mm]
 *  [ margin-left=mm][ margin-right=mm][ margin-bottom=mm] -->` (jetons dans n'importe quel ordre). */
const COVER_START_RE = /^<!--\s*coverzone-start((?:\s+[\w-]+(?:=[\w.,-]*)?)*)\s*-->$/i;

const MARGIN_KEYS = {
  "margin-top": "marginTopMm",
  "margin-left": "marginLeftMm",
  "margin-right": "marginRightMm",
  "margin-bottom": "marginBottomMm",
} as const;

/** Lit un marqueur de début ; `null` si la ligne n'en est pas un. Exporté
 *  pour les tests (le parseur markdown-it l'utilise tel quel). Les jetons
 *  inconnus sont ignorés (compatibilité avec de futures propriétés). */
export function parseCoverZoneStartMarker(line: string): CoverZoneProps | null {
  const m = line.trim().match(COVER_START_RE);
  if (!m) return null;
  const props: CoverZoneProps = { headerFooter: false, theme: "", marginTopMm: null, marginLeftMm: null, marginRightMm: null, marginBottomMm: null };
  for (const token of m[1].trim().split(/\s+/).filter(Boolean)) {
    const [key, value = ""] = token.split("=");
    const k = key.toLowerCase();
    if (k === "header") props.headerFooter = true;
    else if (k === "theme") props.theme = value;
    else if (k in MARGIN_KEYS) {
      const mm = parseFloat(value);
      if (Number.isFinite(mm)) props[MARGIN_KEYS[k as keyof typeof MARGIN_KEYS]] = mm;
    }
  }
  return props;
}

/** Écrit un marqueur de début (inverse de `parseCoverZoneStartMarker`). */
export function formatCoverZoneStartMarker(props: Partial<CoverZoneProps>): string {
  const tokens: string[] = [];
  if (props.headerFooter) tokens.push("header");
  if (props.theme) tokens.push(`theme=${props.theme}`);
  for (const [key, attr] of Object.entries(MARGIN_KEYS)) {
    const v = props[attr];
    if (typeof v === "number" && Number.isFinite(v)) tokens.push(`${key}=${v}`);
  }
  return `<!-- coverzone-start${tokens.length ? " " + tokens.join(" ") : ""} -->`;
}

/** Propriétés de zone lues sur les attributs du nœud marqueur de début. */
export function coverPropsFromAttrs(attrs: Record<string, any>): CoverZoneProps {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    headerFooter: !!attrs.headerFooter,
    theme: String(attrs.theme ?? ""),
    marginTopMm: num(attrs.marginTopMm),
    marginLeftMm: num(attrs.marginLeftMm),
    marginRightMm: num(attrs.marginRightMm),
    marginBottomMm: num(attrs.marginBottomMm),
  };
}

/** Positions (blocs de premier niveau) du CONTENU des zones page de garde —
 *  marqueurs exclus. Sert à écarter les titres de page de garde du sommaire
 *  et de la numérotation (un titre de couverture n'est pas un chapitre). */
export function coverZoneContentOffsets(doc: ProseMirrorNode): Set<number> {
  const offsets = new Set<number>();
  let inside = false;
  doc.forEach((node, offset) => {
    if (node.type.name === "coverZoneStart") inside = true;
    else if (node.type.name === "coverZoneEnd") inside = false;
    else if (inside) offsets.add(offset);
  });
  return offsets;
}

/** Le nœud à `pos` (ou son ancêtre de premier niveau) est-il dans le contenu
 *  d'une zone page de garde ? `offsets` vient de `coverZoneContentOffsets`. */
export function isInCoverZoneContent(doc: ProseMirrorNode, pos: number, offsets: Set<number>): boolean {
  if (offsets.size === 0) return false;
  const $pos = doc.resolve(pos);
  return offsets.has($pos.depth === 0 ? pos : $pos.before(1));
}

/** Zone page de garde qui contient `pos` (curseur, ou marqueur
 *  lui-même) — parcourt les blocs de premier niveau en suivant
 *  l'appariement start/end ; `null` si `pos` est hors de toute zone.
 *  (Le boîtier mutable `open` évite le rétrécissement de type de TS sur
 *  les variables capturées-assignées dans un callback.) */
export function findCoverZoneAround(doc: ProseMirrorNode, pos: number): CoverZoneInfo | null {
  const open: { zone: CoverZoneInfo | null } = { zone: null };
  let found: CoverZoneInfo | null = null;
  doc.forEach((node, offset) => {
    if (node.type.name === "coverZoneStart") {
      open.zone = { start: offset, end: -1, ...coverPropsFromAttrs(node.attrs) };
    } else if (node.type.name === "coverZoneEnd") {
      const zone = open.zone;
      if (zone && zone.end < 0) {
        zone.end = offset;
        // La zone contient-elle pos ? (bornes incluses : cliquer/sélectionner
        // un marqueur compte, comme pour le panneau des autres nœuds.)
        if (zone.start <= pos && pos <= offset + node.nodeSize) {
          found = { ...zone };
        }
      }
      open.zone = null;
    }
  });
  // Zone jamais refermée (document tronqué) : garde le contenu jusqu'à
  // la fin — mieux vaut un panneau qui s'ouvre qu'un marqueur fantôme.
  const zone = open.zone;
  if (!found && zone && zone.end < 0 && zone.start <= pos) {
    found = { ...zone, end: doc.content.size };
  }
  return found;
}

/** Rang (0-based) de la zone qui contient `pos` parmi TOUTES les zones
 *  du document — sert à retrouver le même contenu dans le Markdown
 *  sérialisé (les marqueurs y apparaissent dans le même ordre). */
export function coverZoneIndexAt(doc: ProseMirrorNode, pos: number): number {
  let index = 0;
  let seen = 0;
  let inside = false;
  doc.forEach((node, offset) => {
    if (node.type.name === "coverZoneStart") {
      if (offset <= pos) inside = true;
    } else if (node.type.name === "coverZoneEnd") {
      if (inside && pos <= offset + node.nodeSize) index = seen;
      seen++;
      inside = false;
    }
  });
  if (inside) index = seen; // zone non refermée
  return index;
}

/** Extrait le CONTENU (entre marqueurs) de la énième zone dans un
 *  Markdown déjà sérialisé — c'est ce qui est enregistré comme « type »
 *  réutilisable depuis le panneau latéral. Retourne "" si introuvable. */
export function extractCoverZoneMarkdown(markdown: string, zoneIndex: number): string {
  const re = /<!--\s*coverzone-start[^>]*?-->[\s\S]*?<!--\s*coverzone-end\s*-->/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(markdown)) !== null) {
    if (i === zoneIndex) {
      const inner = m[0].replace(/<!--\s*coverzone-start[^>]*?-->/i, "").replace(/<!--\s*coverzone-end\s*-->/i, "");
      return inner.trim();
    }
    i++;
  }
  return "";
}

/** Migration à l'ouverture : les documents écrits avec l'ANCIEN bloc
 *  atomique `coverPage` (source en attribut, commentaires `<!-- coverpage
 *  … -->`) deviennent des zones au contenu normal — le commentaire
 *  multi-lignes contient DÉJÀ du Markdown pur, il suffit d'encadrer le
 *  contenu des deux marqueurs. Idempotent (aucun marqueur si le document
 *  n'a pas de page de garde). */
export function migrateCoverMarkdown(md: string): string {
  if (!md || !md.includes("coverpage")) return md;
  // Format lisible multi-lignes : <!-- coverpage\n<source>\n--> — le contenu
  // est encadré de LIGNES VIDES : un bloc HTML qui le suit directement
  // (ex. <p style=…>) avalerait le marqueur de fin (règle html_block de
  // markdown-it, qui consomme jusqu'à une ligne vide).
  let out = md.replace(/<!--\s*coverpage\s*\n([\s\S]*?)\n?-->/gi, (_all, source: string) =>
    `<!-- coverzone-start -->\n\n${source}\n\n<!-- coverzone-end -->`,
  );
  // Ancien format monoligne URI-encodé : <!-- coverpage: %3Cp%20… -->
  out = out.replace(/<!--\s*coverpage:\s*([A-Za-z0-9%.+_/=-]+)\s*-->/gi, (_all, encoded: string) => {
    let decoded = "";
    try {
      decoded = decodeURIComponent(encoded);
    } catch {
      decoded = encoded;
    }
    return `<!-- coverzone-start -->\n\n${decoded}\n\n<!-- coverzone-end -->`;
  });
  return out;
}

/** Commentaire de fermeture de zone page de garde. */
const COVER_ZONE_END = /^<!--\s*coverzone-end\s*-->$/i;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    coverZone: {
      /** Insère une zone page de garde complète (début + fin) au curseur. */
      insertCoverZone: () => ReturnType;
    };
  }
}

/** Attribut numérique d'un élément (null si absent/illisible). */
function numAttr(el: HTMLElement, name: string): number | null {
  const raw = el.getAttribute(name);
  const n = raw === null ? NaN : parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Marqueur DÉBUT de zone page de garde — porte les propriétés de la zone
 *  (l'attribut headerFooter est posé par le panneau latéral). */
export const CoverZoneStart = Node.create({
  name: "coverZoneStart",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      /** false (défaut) = en-tête/pied MASQUÉS sur les pages couvertes. */
      headerFooter: { default: false },
      /** Thème visuel (CoverTheme.ts + coverThemes.css) ; « » = aucun. */
      theme: { default: "", renderHTML: () => ({}) },
      /** Marges ABSOLUES de la page de garde en mm (null = celles du document). */
      marginTopMm: { default: null, renderHTML: () => ({}) },
      marginLeftMm: { default: null, renderHTML: () => ({}) },
      marginRightMm: { default: null, renderHTML: () => ({}) },
      marginBottomMm: { default: null, renderHTML: () => ({}) },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="cover-zone-start"]',
        getAttrs: (el) => ({
          headerFooter: (el as HTMLElement).getAttribute("data-header-footer") === "true",
          theme: (el as HTMLElement).getAttribute("data-theme") ?? "",
          marginTopMm: numAttr(el as HTMLElement, "data-margin-top"),
          marginLeftMm: numAttr(el as HTMLElement, "data-margin-left"),
          marginRightMm: numAttr(el as HTMLElement, "data-margin-right"),
          marginBottomMm: numAttr(el as HTMLElement, "data-margin-bottom"),
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "cover-zone-start",
        "data-header-footer": node.attrs.headerFooter ? "true" : "false",
        "data-theme": node.attrs.theme || null,
        "data-margin-top": node.attrs.marginTopMm ?? null,
        "data-margin-left": node.attrs.marginLeftMm ?? null,
        "data-margin-right": node.attrs.marginRightMm ?? null,
        "data-margin-bottom": node.attrs.marginBottomMm ?? null,
        class: "xmd-coverzone xmd-coverzone-start",
      }),
    ];
  },

  addCommands() {
    return {
      insertCoverZone:
        () =>
        ({ chain }: any) =>
          chain().insertContent([{ type: "coverZoneStart" }, { type: "coverZoneEnd" }]).run(),
    } as any;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(formatCoverZoneStartMarker(coverPropsFromAttrs(node.attrs)));
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.block.ruler.before(
              "html_block",
              "coverzonestart",
              (state: any, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const line = state.src.slice(pos, state.eMarks[startLine]).trim();
                const m = parseCoverZoneStartMarker(line);
                if (!m) return false;
                if (silent) return true;
                const token = state.push("coverzonestart", "div", 0);
                token.map = [startLine, startLine + 1];
                token.attrSet("data-type", "cover-zone-start");
                token.attrSet("data-header-footer", m.headerFooter ? "true" : "false");
                token.attrSet("data-theme", m.theme);
                if (m.marginTopMm !== null) token.attrSet("data-margin-top", String(m.marginTopMm));
                if (m.marginLeftMm !== null) token.attrSet("data-margin-left", String(m.marginLeftMm));
                if (m.marginRightMm !== null) token.attrSet("data-margin-right", String(m.marginRightMm));
                if (m.marginBottomMm !== null) token.attrSet("data-margin-bottom", String(m.marginBottomMm));
                token.attrSet("class", "xmd-coverzone xmd-coverzone-start");
                state.line = startLine + 1;
                return true;
              },
            );
            markdownit.renderer.rules.coverzonestart = (tokens: any, idx: number) => {
              const token = tokens[idx];
              const theme = token.attrGet("data-theme") ?? "";
              const margin = (name: string) => (token.attrGet(name) != null ? ` ${name}="${token.attrGet(name)}"` : "");
              return `<div data-type="cover-zone-start" data-header-footer="${token.attrGet("data-header-footer") ?? "false"}"${theme ? ` data-theme="${theme}"` : ""}${margin("data-margin-top")}${margin("data-margin-left")}${margin("data-margin-right")}${margin("data-margin-bottom")} class="xmd-coverzone xmd-coverzone-start"></div>`;
            };
          },
        },
      },
    };
  },
});

/** Marqueur FIN de zone page de garde. */
export const CoverZoneEnd = Node.create({
  name: "coverZoneEnd",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="cover-zone-end"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "cover-zone-end", class: "xmd-coverzone xmd-coverzone-end" })];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("<!-- coverzone-end -->");
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.block.ruler.before(
              "html_block",
              "coverzoneend",
              (state: any, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const line = state.src.slice(pos, state.eMarks[startLine]).trim();
                if (!COVER_ZONE_END.test(line)) return false;
                if (silent) return true;
                const token = state.push("coverzoneend", "div", 0);
                token.map = [startLine, startLine + 1];
                token.attrSet("data-type", "cover-zone-end");
                token.attrSet("class", "xmd-coverzone xmd-coverzone-end");
                state.line = startLine + 1;
                return true;
              },
            );
            markdownit.renderer.rules.coverzoneend = () => {
              return `<div data-type="cover-zone-end" class="xmd-coverzone xmd-coverzone-end"></div>`;
            };
          },
        },
      },
    };
  },
});

/** Positions (dans le document) où insérer un marqueur de FIN pour refermer les zones page de garde
 *  restées OUVERTES : une zone s'arrête au premier saut de page qui suit (une page de garde = une page),
 *  à défaut à l'ouverture d'une autre zone, à défaut en fin de document. */
export function unclosedCoverZoneEnds(doc: ProseMirrorNode): number[] {
  const inserts: number[] = [];
  let open = false;
  doc.forEach((node, offset) => {
    const type = node.type.name;
    if (type === "coverZoneStart") {
      if (open) inserts.push(offset); // la zone précédente n'a jamais été refermée
      open = true;
    } else if (type === "coverZoneEnd") {
      open = false;
    } else if (open && type === "pageBreak") {
      inserts.push(offset);
      open = false;
    }
  });
  if (open) inserts.push(doc.content.size);
  return inserts;
}

function coverZoneRepair(state: EditorState): Transaction | null {
  const inserts = unclosedCoverZoneEnds(state.doc);
  const endType = state.schema.nodes.coverZoneEnd;
  if (inserts.length === 0 || !endType) return null;
  const tr = state.tr;
  // Du dernier au premier : les positions déjà calculées restent valides.
  for (const pos of [...inserts].reverse()) tr.insert(pos, endType.create());
  return tr.setMeta("addToHistory", false);
}

/** Garde-fou : un marqueur de début SANS marqueur de fin fait de TOUTES les pages suivantes des pages de garde
 *  (en-tête/pied masqués, cadre « pages de garde » étendu au document entier — bug du 2026-10-26 : le marqueur
 *  de fin, invisible et collé au texte, avait été supprimé par une simple touche Suppr). Les repères étant
 *  invisibles, on ne peut pas compter sur l'utilisateur : la zone est refermée automatiquement, à l'ouverture
 *  d'un fichier déjà abîmé comme pendant l'édition. */
export const CoverZoneRepair = Extension.create({
  name: "coverZoneRepair",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("coverZoneRepair"),
        appendTransaction: (_transactions, _oldState, newState) => coverZoneRepair(newState),
        view: (view) => {
          // À la création : répare un document déjà chargé avec une zone non refermée.
          queueMicrotask(() => {
            const tr = coverZoneRepair(view.state);
            if (tr && (view as unknown as { docView: unknown }).docView) view.dispatch(tr);
          });
          return {};
        },
      }),
    ];
  },
});
