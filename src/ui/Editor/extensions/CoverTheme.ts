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

export const COVER_THEME_ATTR = "data-cover-theme";

const key = new PluginKey("coverTheme");

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  let theme = "";
  doc.forEach((node, offset) => {
    if (node.type.name === "coverZoneStart") {
      theme = String(node.attrs.theme ?? "");
    } else if (node.type.name === "coverZoneEnd") {
      theme = "";
    } else if (theme) {
      decorations.push(Decoration.node(offset, offset + node.nodeSize, { [COVER_THEME_ATTR]: theme }));
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
