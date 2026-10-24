/**
 * Style du sommaire (apparence) : marque chaque sommaire GÉNÉRÉ (liste reconnue
 * par `isTocList`) avec `data-toc="true"`, en DÉCORATION — l'attribut vit dans
 * l'éditeur invisible (mesures de pagination) et se retrouve dans les clones
 * peints, sans jamais entrer dans le document ni dans le fichier. Les règles
 * CSS (`ul[data-toc]` dans MarkdownEditor.css) lisent les variables
 * `--xmd-toc-*` posées d'après `layout.toc`.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { isTocList } from "./TocMarker";

const key = new PluginKey("tocStyle");

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.forEach((node, offset) => {
    if (isTocList(node)) decorations.push(Decoration.node(offset, offset + node.nodeSize, { "data-toc": "true" }));
  });
  return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

export const TocStyle = Extension.create({
  name: "tocStyle",
  addProseMirrorPlugins() {
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
