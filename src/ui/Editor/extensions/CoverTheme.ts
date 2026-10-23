/**
 * Thème visuel d'une page de garde (2026-10-22). Le .md reste du Markdown PUR
 * dans la zone (titre `#`, sous-titre `##`, lignes de texte) ; l'apparence
 * (bandeau, centrage, couleurs…) ne vit PAS dans le fichier mais dans une
 * feuille de style par thème (`ui/Cover/coverThemes.css`), repérée par
 * l'attribut `theme` du marqueur de début :
 *     <!-- coverzone-start theme=chantier -->
 *
 * Ce plugin pose `data-cover-theme="chantier"` sur CHAQUE bloc de la zone, en
 * DÉCORATION de nœud : l'attribut existe donc aussi dans l'éditeur invisible
 * (la pagination mesure les vraies hauteurs, marges et paddings du thème) et
 * se retrouve dans les clones peints (`cloneNode`) — sans jamais entrer dans
 * le document ni dans le fichier.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { coverPropsFromAttrs, type CoverZoneProps } from "./CoverZone";

export const COVER_THEME_ATTR = "data-cover-theme";

const key = new PluginKey("coverTheme");

/** Style en ligne des MARGES de la zone. Les marges de page sont ABSOLUES
 *  (distance au bord de la page) ; la zone vit dans la zone de texte du
 *  document, donc on retranche la marge du document (variables CSS de page) :
 *  `margin-left: calc(5mm - 20mm)` = -15mm tire le bloc jusqu'à 5 mm du bord
 *  (un bandeau peut ainsi aller jusqu'au bord de la page). Tout reste en
 *  marges de bloc : la pagination mesure donc les vraies hauteurs. */
function marginStyle(props: CoverZoneProps, first: boolean): string {
  const parts: string[] = [];
  if (props.marginLeftMm !== null) parts.push(`margin-left: calc(${props.marginLeftMm}mm - var(--xmd-margin-left, 20mm))`);
  if (props.marginRightMm !== null) parts.push(`margin-right: calc(${props.marginRightMm}mm - var(--xmd-margin-right, 20mm))`);
  if (first && props.marginTopMm !== null) parts.push(`margin-top: calc(${props.marginTopMm}mm - var(--xmd-margin-top, 25mm))`);
  return parts.join("; ");
}

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  let props: CoverZoneProps | null = null;
  let first = false;
  doc.forEach((node, offset) => {
    if (node.type.name === "coverZoneStart") {
      props = coverPropsFromAttrs(node.attrs);
      // La marge HAUTE n'a de sens que pour une page de garde qui OUVRE le
      // document (sinon elle tirerait le contenu sur le bloc précédent).
      first = offset === 0;
    } else if (node.type.name === "coverZoneEnd") {
      props = null;
    } else if (props) {
      const attrs: Record<string, string> = {};
      if (props.theme) attrs[COVER_THEME_ATTR] = props.theme;
      const style = marginStyle(props, first);
      if (style) attrs.style = style;
      first = false;
      if (Object.keys(attrs).length) decorations.push(Decoration.node(offset, offset + node.nodeSize, attrs));
    }
  });
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

export const CoverTheme = Extension.create({
  name: "coverTheme",
  addProseMirrorPlugins() {
    // Recalcul seulement quand le document change (pas à chaque transaction
    // de sélection).
    let lastDoc: ProseMirrorNode | null = null;
    let lastSet = DecorationSet.empty;
    return [
      new Plugin({
        key,
        props: {
          decorations(state) {
            if (state.doc !== lastDoc) {
              lastDoc = state.doc;
              lastSet = buildDecorations(state.doc);
            }
            return lastSet;
          },
        },
      }),
    ];
  },
});
