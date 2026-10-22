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
import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/** Zone page de garde englobant une position : positions des marqueurs
 *  début/fin (le nœud `coverZoneEnd` commence à `end`), et propriété
 *  en-tête/pied du marqueur de début. */
export interface CoverZoneInfo {
  start: number;
  end: number;
  headerFooter: boolean;
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
      open.zone = { start: offset, end: -1, headerFooter: !!node.attrs.headerFooter };
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
  const re = /<!--\s*coverzone-start( header)?\s*-->[\s\S]*?<!--\s*coverzone-end\s*-->/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(markdown)) !== null) {
    if (i === zoneIndex) {
      const inner = m[0].replace(/<!--\s*coverzone-start( header)?\s*-->/i, "").replace(/<!--\s*coverzone-end\s*-->/i, "");
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

/** Commentaire d'ouverture de zone page de garde. */
export const COVER_ZONE_START = /^<!--\s*coverzone-start\s*-->$/i;
/** Commentaire de fermeture de zone page de garde. */
export const COVER_ZONE_END = /^<!--\s*coverzone-end\s*-->$/i;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    coverZone: {
      /** Insère une zone page de garde complète (début + fin) au curseur. */
      insertCoverZone: () => ReturnType;
    };
  }
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
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="cover-zone-start"]',
        getAttrs: (el) => ({ headerFooter: (el as HTMLElement).getAttribute("data-header-footer") === "true" }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "cover-zone-start",
        "data-header-footer": node.attrs.headerFooter ? "true" : "false",
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
          const hf = node.attrs.headerFooter ? " header" : "";
          state.write(`<!-- coverzone-start${hf} -->`);
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
                const m = line.match(/^<!--\s*coverzone-start( header)?\s*-->$/i);
                if (!m) return false;
                if (silent) return true;
                const token = state.push("coverzonestart", "div", 0);
                token.map = [startLine, startLine + 1];
                token.attrSet("data-type", "cover-zone-start");
                token.attrSet("data-header-footer", m[1] ? "true" : "false");
                token.attrSet("class", "xmd-coverzone xmd-coverzone-start");
                state.line = startLine + 1;
                return true;
              },
            );
            markdownit.renderer.rules.coverzonestart = (tokens: any, idx: number) => {
              const token = tokens[idx];
              return `<div data-type="cover-zone-start" data-header-footer="${token.attrGet("data-header-footer") ?? "false"}" class="xmd-coverzone xmd-coverzone-start"></div>`;
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
