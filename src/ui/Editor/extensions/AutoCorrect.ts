/**
 * Correction automatique à la frappe — applique les règles de `core/autocorrect.ts` à chaque
 * caractère saisi (guillemets français, majuscule en début de phrase). Réglages dans Paramétrage >
 * Édition (`settingsStore`), lus à chaque frappe : pas de rechargement de l'éditeur.
 *
 * Un caractère remplacé l'est dans la MÊME transaction que la frappe : Ctrl+Z annule le tout d'un coup.
 * Sans effet dans un bloc de code, dans un texte en `code`, ni pendant une composition (IME, touches mortes
 * multi-caractères : seul un caractère isolé est corrigé).
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { replaceStraightQuote, shouldCapitalize } from "../../../core/autocorrect";
import { useSettingsStore } from "../../../core/store/settingsStore";

export const AutoCorrect = Extension.create({
  name: "autoCorrect",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("autoCorrect"),
        props: {
          handleTextInput(view, from, to, text) {
            if (text.length !== 1) return false;
            const { autoCorrectQuotes, autoCorrectCapitals } = useSettingsStore.getState();
            if (!autoCorrectQuotes && !autoCorrectCapitals) return false;

            const { state } = view;
            const $from = state.doc.resolve(from);
            const parent = $from.parent;
            if (!parent.isTextblock || parent.type.spec.code) return false;
            // Texte en `code` : tel quel (le curseur peut porter la marque `code` sans qu'elle soit « stockée »).
            const marks = state.storedMarks ?? $from.marks();
            if (marks.some((m) => m.type.name === "code")) return false;

            // Texte du bloc avant le curseur (les atomes — champs, formules — comptent pour un caractère non blanc).
            const before = parent.textBetween(0, $from.parentOffset, undefined, String.fromCharCode(0xfffc));

            if (text === '"' && autoCorrectQuotes) {
              const { insert } = replaceStraightQuote(before);
              view.dispatch(state.tr.insertText(insert, from, to));
              return true;
            }

            if (autoCorrectCapitals) {
              // Début de cellule de tableau : pas de majuscule (unités, références : « kW », « m3/h »…).
              const grand = $from.depth >= 2 ? $from.node($from.depth - 1).type.name : "";
              const inTableCell = grand === "tableCell" || grand === "tableHeader";
              if (shouldCapitalize(before, text, { inTableCell })) {
                view.dispatch(state.tr.insertText(text.toLocaleUpperCase(), from, to));
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
