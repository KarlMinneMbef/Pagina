/**
 * Nœud « Saut de section » (2026-10-22) — une section est une partie du
 * document qui se comporte comme un sous-document : numérotation des
 * titres repartant à zéro et sommaire dédié (voir TocMarker.ts). Le
 * marqueur TERMINE la section précédente et COMMENCE la suivante (comme
 * le saut de section de Word : un seul point, pas une paire début/fin).
 *
 * Persisté dans le Markdown sous forme d'un commentaire HTML standard
 * `<!-- section: {"title":"CCTP","restart":true} -->` (invisible et sans
 * effet de bord dans tout autre outil Markdown), rendu à l'écran comme
 * un séparateur discret « Section — Titre ». Même pipeline de parsing
 * markdown-it que `PageBreak.ts` (voir ce fichier pour le détail).
 *
 * OPTIONS du nœud :
 * - `title` : titre affiché du séparateur ET entrée du sommaire GLOBAL
 *   (qui liste les sections — voir TocMarker.ts, `collectTocTargets`).
 *   Vide = libellé de repli « Section n » calculé à l'identique au
 *   rendu (paintPages.ts) et au sommaire, pour que les ancres coïncident.
 * - `restart` : remet les compteurs de numérotation des titres à zéro
 *   (HeadingAutoNumber.ts) — vrai par défaut, comme Word.
 */
import { Node, mergeAttributes } from "@tiptap/core";

/** Commentaire de saut de section : `<!-- section: <payload> -->` — le
 *  payload est le JSON URI-ENCODÉ (mêmes règles que CoverPage.ts /
 *  MermaidDiagram.ts : aucun contenu ne peut casser le commentaire) ;
 *  un JSON littéral (fichier écrit à la main) reste accepté. */
const SECTION_COMMENT = /^<!--\s*section(?:\s*:\s*(.+?))?\s*-->$/i;

/** Options sérialisées d'un saut de section (dans le commentaire HTML). */
interface SectionAttrs {
  title: string;
  restart: boolean;
}

/** Échappe un texte pour l'embarquer en JSON dans le commentaire —
 *  JSON.stringify gère déjà tout, le commentaire HTML exige seulement
 *  de ne jamais produire `-->` : encodage URI du JSON entier. */
function encodeSectionAttrs(attrs: SectionAttrs): string {
  return encodeURIComponent(JSON.stringify(attrs));
}

/** Décode les options d'un commentaire de section — accepte le JSON
 *  URI-ENCODÉ (ce que produit la sérialisation) OU le JSON littéral
 *  (écrit à la main dans le .md) ; silencieux (sans titre, sans
 *  reprise) si absent/corrompu. */
function decodeSectionAttrs(raw: string | null): SectionAttrs {
  if (!raw) return { title: "", restart: true };
  try {
    const json = raw.trim().startsWith("%") ? decodeURIComponent(raw.trim()) : raw;
    const parsed = JSON.parse(json) as Partial<SectionAttrs>;
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      restart: typeof parsed.restart === "boolean" ? parsed.restart : true,
    };
  } catch {
    return { title: "", restart: true };
  }
}

/** Libellé AFFICHÉ d'une section : son titre, ou « Section n » (n =
 *  1-based dans l'ordre du document) si le titre est vide. DOIT être
 *  calculé à l'identique au rendu (paintPages.ts) et dans le sommaire
 *  global (TocMarker.ts) — c'est le texte qui détermine l'ancre `#slug`
 *  partagée entre les deux. */
export function sectionDisplayTitle(rawTitle: string, sectionIndex: number): string {
  const t = rawTitle.trim();
  return t.length > 0 ? t : `Section ${sectionIndex}`;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sectionBreak: {
      /** Insère un saut de section (titre + reprise de numérotation). */
      insertSectionBreak: (attrs: { title: string; restart: boolean }) => ReturnType;
    };
  }
}

/** Saut de section — sérialisé en commentaire HTML `<!-- section: … -->`,
 *  compatible avec n'importe quel outil Markdown. */
export const SectionBreak = Node.create({
  name: "sectionBreak",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      title: { default: "" },
      restart: { default: true },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="section-break"]',
        getAttrs: (el) => ({
          title: (el as HTMLElement).getAttribute("data-title") ?? "",
          restart: (el as HTMLElement).getAttribute("data-restart") !== "false",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "section-break",
        "data-title": node.attrs.title,
        "data-restart": node.attrs.restart ? "true" : "false",
        class: "xmd-sectionbreak",
      }),
    ];
  },

  addCommands() {
    return {
      insertSectionBreak:
        (attrs: { title: string; restart: boolean }) =>
        ({ chain }: any) =>
          chain().insertContent({ type: this.name, attrs }).run(),
    } as any;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write(`<!-- section: ${encodeSectionAttrs({ title: node.attrs.title, restart: node.attrs.restart })} -->`);
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.block.ruler.before(
              "html_block",
              "sectionbreak",
              (state: any, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max);
                const match = line.trim().match(SECTION_COMMENT);
                if (!match) return false;
                if (silent) return true;
                const attrs = decodeSectionAttrs(match[1] ?? null);
                const token = state.push("sectionbreak", "div", 0);
                token.map = [startLine, startLine + 1];
                token.attrSet("data-type", "section-break");
                token.attrSet("data-title", attrs.title);
                token.attrSet("data-restart", String(attrs.restart));
                token.attrSet("class", "xmd-sectionbreak");
                state.line = startLine + 1;
                return true;
              }
            );
            markdownit.renderer.rules.sectionbreak = (tokens: any, idx: number) => {
              const token = tokens[idx];
              return `<div data-type="section-break" data-title="${token.attrGet("data-title") ?? ""}" data-restart="${token.attrGet("data-restart") ?? "true"}" class="xmd-sectionbreak"></div>`;
            };
          },
        },
      },
    };
  },
});
