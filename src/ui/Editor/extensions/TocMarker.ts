/**
 * Marqueur de sommaire. Persisté dans le Markdown sous forme d'un
 * commentaire HTML standard `<!-- toc -->` (invisible et sans casse dans
 * tout autre outil Markdown), rendu à l'écran comme un encart "Sommaire —
 * cliquez sur Générer/Mettre à jour". Même principe que `PageBreak.ts`
 * (voir ce fichier pour le détail du pipeline de parsing markdown-it).
 *
 * Fonctionnement voulu (choisi explicitement, pas le seul possible) : le
 * marqueur est REMPLACÉ par une vraie liste Markdown (texte réel, pas un
 * calcul d'affichage) au clic sur "Générer" — donc lisible et navigable
 * dans n'importe quel autre outil Markdown, comme tout le reste du document.
 * Une fois généré, le marqueur a disparu (remplacé) — mais `isTocList`
 * (plus bas) reconnaît le sommaire généré par sa FORME (chaque item est un
 * simple lien `#slug`), sans avoir besoin d'un marqueur persisté : un
 * sommaire déjà en place reste donc régénérable (`updateTocAtCursor`) ou
 * supprimable (`deleteTocAtCursor`) en un clic, via le panneau latéral
 * « Sommaire » qui s'ouvre automatiquement quand le curseur y entre (voir
 * `EditorStats.insideToc` dans MarkdownEditor.tsx).
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { uniqueHeadingSlug } from "../pagination/slug";
import { sectionDisplayTitle } from "./SectionBreak";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tocMarker: {
      insertTocMarker: () => ReturnType;
      generateToc: () => ReturnType;
      updateTocAtCursor: () => ReturnType;
      deleteTocAtCursor: () => ReturnType;
    };
  }
}

const TOC_COMMENT = /^<!--\s*toc\s*-->$/i;

/** Une cible du sommaire : un titre OU (sommaire global) une section. */
interface TocTarget {
  level: number;
  text: string;
  slug: string;
}

/** Toutes les cibles du document dans l'ORDRE (titres ET sauts de
 *  section), chacune avec son slug DÉJÀ CALCULÉ sur la séquence
 *  complète — les slugs doivent être identiques à ceux posés sur les
 *  éléments peints (paintPages.ts parcourt le document dans le même
 *  ordre) ; un sommaire de SECTION ne listant qu'un sous-ensemble, ses
 *  liens doivent pourtant viser les ancères globales (un doublon de
 *  texte dans une section précédente décale les suffixes « -2 »). */
function collectAllTargets(doc: any): (TocTarget & { pos: number })[] {
  const targets: (TocTarget & { pos: number })[] = [];
  const usedSlugs = new Set<string>();
  let sectionIndex = 0;
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === "sectionBreak") {
      const text = sectionDisplayTitle(node.attrs.title ?? "", ++sectionIndex);
      targets.push({ level: 1, text, slug: uniqueHeadingSlug(text, usedSlugs), pos });
      return true;
    }
    if (node.type.name === "heading") {
      targets.push({ level: node.attrs.level, text: node.textContent, slug: uniqueHeadingSlug(node.textContent, usedSlugs), pos });
    }
    return true;
  });
  return targets;
}

/** Cibles d'un sommaire posé à `tocPos` (portée par section, 2026-10-22) :
 *  - AVANT la première section : les SECTIONS elles-mêmes (vue d'ensemble
 *    du document en parties, comme la table d'un recueil) — ou tous les
 *    titres s'il n'y a AUCUNE section (comportement historique) ;
 *  - DANS une section : uniquement les titres de cette section (entre le
 *    saut de section qui la commence et le suivant) — son « sommaire
 *    dédié », numérotation comprise (voir HeadingAutoNumber.ts). */
function collectTocTargets(doc: any, tocPos: number): TocTarget[] {
  const all = collectAllTargets(doc);
  const sections = all.filter((t) => {
    const node = doc.nodeAt(t.pos);
    return node?.type.name === "sectionBreak";
  });
  // Le saut de section qui contient ce sommaire = le DERNIER avant tocPos.
  let containing: (TocTarget & { pos: number }) | null = null;
  for (const s of sections) {
    if (s.pos < tocPos) containing = s;
    else break;
  }
  if (!containing) {
    // Sommaire GLOBAL : les sections (ou tous les titres sans sections).
    if (sections.length > 0) return sections.map(({ level, text, slug }) => ({ level, text, slug }));
    return all
      .filter((t) => doc.nodeAt(t.pos)?.type.name === "heading")
      .map(({ level, text, slug }) => ({ level, text, slug }));
  }
  const next = sections.find((s) => s.pos > containing!.pos);
  return all
    .filter((t) => t.pos > containing!.pos && (!next || t.pos < next.pos))
    .filter((t) => doc.nodeAt(t.pos)?.type.name === "heading")
    .map(({ level, text, slug }) => ({ level, text, slug }));
}

/** Construit une liste à puces IMBRIQUÉE (JSON de nœuds ProseMirror) à
 * partir d'une liste plate de cibles avec leur niveau — chaque cible
 * devient l'enfant de la précédente la plus proche de niveau strictement
 * inférieur. Chaque entrée est un vrai LIEN (`#slug`) — cliquable dans
 * l'éditeur ET dans n'importe quel rendu Markdown→HTML classique (ancre
 * standard). Les slugs sont PRÉ-CALCULÉS sur la séquence complète du
 * document (`collectAllTargets`) : ils doivent rester identiques à ceux
 * posés sur les éléments peints (paintPages.ts), même pour le
 * sous-ensemble d'un sommaire de section. */
function buildTocContent(targets: TocTarget[]): any {
  if (targets.length === 0) {
    return { type: "paragraph", content: [{ type: "text", text: "(Aucun titre dans cette partie)" }] };
  }

  interface Frame {
    level: number;
    ownerListItem: any | null;
    items: any[];
  }
  const root: Frame = { level: 0, ownerListItem: null, items: [] };
  const stack: Frame[] = [root];

  const closeFrame = () => {
    const finished = stack.pop()!;
    if (finished.ownerListItem && finished.items.length > 0) {
      finished.ownerListItem.content.push({ type: "bulletList", content: finished.items });
    }
  };

  for (const h of targets) {
    while (stack.length > 1 && h.level <= stack[stack.length - 1].level) {
      closeFrame();
    }
    const listItem = {
      type: "listItem",
      content: [
        {
          type: "paragraph",
          content: h.text
            ? [{ type: "text", text: h.text, marks: [{ type: "link", attrs: { href: `#${h.slug}` } }] }]
            : [],
        },
      ],
    };
    stack[stack.length - 1].items.push(listItem);
    stack.push({ level: h.level, ownerListItem: listItem, items: [] });
  }
  while (stack.length > 1) closeFrame();

  return { type: "bulletList", content: root.items };
}

/** Un paragraphe "entrée de sommaire" : un seul nœud texte, entièrement
 * couvert par une marque de lien dont la cible est une ancre interne
 * (`#slug`) — exactement ce que `buildTocContent` génère pour chaque titre.
 * Aucune autre forme de paragraphe ne correspond (texte libre, plusieurs
 * marques, lien externe…), ce qui rend la détection fiable même sur un
 * document rechargé depuis le disque (pas besoin d'un attribut dédié —
 * voir `isTocList` juste en dessous, qui s'appuie uniquement là-dessus). */
function isTocLinkParagraph(node: any): boolean {
  if (!node || node.type.name !== "paragraph") return false;
  if (node.content.childCount !== 1) return false;
  const child = node.content.firstChild;
  if (!child || !child.isText) return false;
  const linkMark = child.marks.find((m: any) => m.type.name === "link");
  if (!linkMark) return false;
  return typeof linkMark.attrs.href === "string" && linkMark.attrs.href.startsWith("#");
}

/** Reconnaît une liste GÉNÉRÉE par `generateToc` : chaque item commence par
 * une "entrée de sommaire" (voir ci-dessus), suivie éventuellement d'une
 * sous-liste imbriquée (les titres de niveau inférieur) — exactement la
 * structure que `buildTocContent` construit. Permet de retrouver/supprimer/
 * régénérer un sommaire déjà en place SANS marqueur ni attribut persisté
 * (qui ne survivrait pas à un aller-retour Markdown) — voir
 * `updateTocAtCursor`/`deleteTocAtCursor`, et `getInsideToc` dans
 * MarkdownEditor.tsx pour la détection "curseur dans un sommaire" qui pilote
 * le panneau latéral. Une liste normale de simples liens internes (cas
 * rarissime, jamais généré par l'app) matcherait aussi — limite acceptée,
 * bien moins grave qu'exiger un attribut non persistant. */
export function isTocList(node: any): boolean {
  if (!node || node.type.name !== "bulletList" || node.childCount === 0) return false;
  let allMatch = true;
  node.forEach((item: any) => {
    if (!isTocLinkParagraph(item.content.firstChild)) allMatch = false;
  });
  return allMatch;
}

/** Position + nœud de la liste de sommaire englobant `pos`, ou `null` si le
 * curseur n'est dans aucune. Remonte TOUS les ancêtres (pas d'arrêt au
 * premier trouvé) et garde le PLUS ENGLOBANT des matches — un sommaire
 * généré est imbriqué (chaque niveau de titre est une sous-liste de son
 * parent), donc un item de PREMIER niveau (ex. "Titre racine") contient
 * lui-même sa propre sous-liste, qui satisfait AUSSI `isTocList` : s'arrêter
 * au premier match trouvé en remontant renvoie alors la sous-liste imbriquée
 * plutôt que le sommaire ENTIER — `updateTocAtCursor`/`deleteTocAtCursor`
 * doivent toujours cibler le sommaire dans son ensemble, quel que soit le
 * niveau de titre sur lequel l'utilisateur a cliqué pour y entrer. */
function findTocListAt(doc: any, pos: number): { pos: number; node: any } | null {
  const resolved = doc.resolve(pos);
  let result: { pos: number; node: any } | null = null;
  for (let d = resolved.depth; d >= 1; d--) {
    const node = resolved.node(d);
    if (isTocList(node)) {
      result = { pos: resolved.before(d), node };
    }
  }
  return result;
}

/** Le curseur/la sélection est-il actuellement dans un sommaire généré —
 * pilote l'ouverture automatique du panneau latéral « Sommaire » (voir
 * `EditorStats.insideToc` dans MarkdownEditor.tsx). */
export function isInsideToc(doc: any, pos: number): boolean {
  return findTocListAt(doc, pos) !== null;
}

/** Marqueur d'emplacement de sommaire — le panneau Sommaire y génère la
 *  liste des titres réels avec liens cliquables. */
export const TocMarker = Node.create({
  name: "tocMarker",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="toc-marker"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toc-marker", class: "xmd-toc-marker" })];
  },

  addCommands() {
    return {
      insertTocMarker:
        () =>
        ({ chain }: any) =>
          chain().insertContent({ type: this.name }).run(),

      // Remplace TOUS les marqueurs présents par le sommaire généré ; s'il
      // n'y en a aucun, insère directement le sommaire à la position du
      // curseur (confort — évite un aller-retour "insérer le marqueur PUIS
      // générer" quand on veut juste un sommaire tout de suite). Depuis le
      // 2026-10-22, chaque marqueur reçoit le sommaire de SA portée : les
      // marqueurs AVANT la première section listent les sections (ou tous
      // les titres sans sections), ceux DANS une section ne listent que
      // les titres de cette section (sommaire dédié).
      generateToc:
        () =>
        ({ tr, state, dispatch, chain }: any) => {
          let foundMarker = false;
          const positions: number[] = [];
          state.doc.descendants((node: any, pos: number) => {
            if (node.type.name === "tocMarker") {
              foundMarker = true;
              positions.push(pos);
            }
            return true;
          });

          if (!foundMarker) {
            const content = buildTocContent(collectTocTargets(state.doc, state.selection.from));
            return chain().insertContent(content).run();
          }

          if (dispatch) {
            // En partant de la fin : remplacer un marqueur ne doit pas
            // décaler la position des marqueurs suivants qu'on n'a pas
            // encore traités — et chaque remplacement relit le document
            // COURANT (`state.doc`, jamais `tr.doc` : les remplacements
            // précédents ne changent pas la portée d'un marqueur, les
            // sauts de section sont avant/après, pas dedans).
            for (let i = positions.length - 1; i >= 0; i--) {
              const pos = positions[i];
              const node = state.doc.nodeAt(pos);
              if (!node) continue;
              const contentNode = state.schema.nodeFromJSON(buildTocContent(collectTocTargets(state.doc, pos)));
              tr.replaceWith(pos, pos + node.nodeSize, contentNode);
            }
            // Replace le curseur DANS le sommaire fraîchement généré (le
            // premier marqueur remplacé, `positions[0]` — toujours valide
            // sans passer par `tr.mapping`, puisque aucun remplacement
            // PRÉCÉDENT ne modifie les positions qui le précèdent dans le
            // document) : sans ça, `insideToc` resterait `false` et le
            // panneau latéral « Sommaire » ne s'ouvrirait pas tout de suite
            // après avoir cliqué sur le marqueur — remonté par
            // l'utilisateur ("le marqueur de sommaire n'ouvre pas le
            // panneau").
            if (positions.length > 0) {
              tr.setSelection(TextSelection.near(tr.doc.resolve(positions[0] + 1)));
            }
            dispatch(tr);
          }
          return true;
        },

      // Régénère EN PLACE le sommaire qui contient le curseur (pas besoin
      // d'un marqueur — voir `isTocList`) : utilisé par le bouton « Mettre
      // à jour » du panneau latéral « Sommaire », pour un sommaire déjà
      // généré (le bouton du ruban `generateToc` reste, lui, pour le tout
      // premier marqueur ou l'insertion directe). Retourne `false` (donc
      // `cmd?.()` sans effet) si le curseur n'est pas dans un sommaire.
      updateTocAtCursor:
        () =>
        ({ state, tr, dispatch }: any) => {
          const found = findTocListAt(state.doc, state.selection.from);
          if (!found) return false;
          if (dispatch) {
            // Portée par section (2026-10-22) : la position du sommaire
            // détermine ce qu'il liste — sections avant la première, ou
            // titres de la section qui le contient.
            const targets = collectTocTargets(state.doc, found.pos);
            const content = buildTocContent(targets);
            const contentNode = state.schema.nodeFromJSON(content);
            tr.replaceWith(found.pos, found.pos + found.node.nodeSize, contentNode);
            // Sans ceci, ProseMirror replace la sélection à un endroit
            // valide le plus proche après coup — souvent juste APRÈS le
            // nouveau sommaire plutôt que dedans, ce qui fait `insideToc`
            // retomber à `false` et referme le panneau latéral tout de
            // suite après avoir cliqué « Mettre à jour » (remonté en test).
            // On replace explicitement le curseur DANS le nouveau sommaire.
            tr.setSelection(TextSelection.near(tr.doc.resolve(found.pos + 1)));
            dispatch(tr);
          }
          return true;
        },

      // Supprime ENTIÈREMENT le sommaire qui contient le curseur — jusqu'ici
      // la seule façon de s'en débarrasser était de sélectionner "à la main"
      // toute la liste (potentiellement imbriquée sur plusieurs niveaux et
      // désormais répartie sur plusieurs pages, voir `paintPages.ts`), ce qui
      // n'était ni évident ni fiable à viser avec la souris.
      deleteTocAtCursor:
        () =>
        ({ state, tr, dispatch }: any) => {
          const found = findTocListAt(state.doc, state.selection.from);
          if (!found) return false;
          if (dispatch) {
            tr.delete(found.pos, found.pos + found.node.nodeSize);
            dispatch(tr);
          }
          return true;
        },
    } as any;
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          state.write("<!-- toc -->");
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            markdownit.block.ruler.before(
              "html_block",
              "tocmarker",
              (state: any, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max);
                if (!TOC_COMMENT.test(line.trim())) return false;
                if (silent) return true;
                const token = state.push("tocmarker", "div", 0);
                token.map = [startLine, startLine + 1];
                token.attrSet("data-type", "toc-marker");
                token.attrSet("class", "xmd-toc-marker");
                state.line = startLine + 1;
                return true;
              }
            );
            markdownit.renderer.rules.tocmarker = () => {
              return `<div data-type="toc-marker" class="xmd-toc-marker"></div>`;
            };
          },
        },
      },
    };
  },
});
