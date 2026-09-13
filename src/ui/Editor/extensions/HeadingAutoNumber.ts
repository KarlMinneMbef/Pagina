/**
 * Numérotation automatique des titres, ÉCRITE EN DUR dans le texte du titre
 * (demande explicite de l'utilisateur, plutôt qu'un simple affichage calculé
 * comme les variables d'en-tête/pied de page) — un titre numéroté doit
 * rester lisible/correct tel quel dans n'importe quel autre outil Markdown,
 * pas seulement dans Pagina.
 *
 * PAS un plugin ProseMirror `appendTransaction` (première implémentation,
 * abandonnée) : un `appendTransaction` ne se déclenche que sur une
 * transaction qui modifie le DOCUMENT — mais changer le schéma de
 * numérotation depuis le dialogue "Styles de titres" ne touche PAS le
 * document (seulement le `layout` React), donc le plugin ne se
 * redéclenchait jamais dans ce cas (bug constaté : la numérotation
 * n'apparaissait qu'après la frappe suivante, jamais immédiatement après
 * avoir activé l'option). **Fix** : une fonction simple, appelée
 * explicitement par `MarkdownEditor.tsx` à CHAQUE occasion pertinente —
 * après une frappe (`onUpdate`) ET après un changement de `layout` (effet
 * dépendant de `layout`) — plutôt que de dépendre d'un hook interne à
 * ProseMirror qui ne couvre pas tous les cas de déclenchement voulus.
 *
 * Fonctionnement : parcourt tous les titres du document dans l'ordre, tient
 * un compteur par niveau (1 à 6, remis à zéro dès qu'un titre de niveau égal
 * ou supérieur apparaît — numérotation d'un plan classique), calcule le
 * préfixe attendu ("1.2. ", "A. ", "IV. "...) selon le schéma choisi pour
 * chaque niveau (`HeadingLevelStyle.numbering`, voir `pageLayout.ts`), et le
 * réécrit en tête du titre SI besoin seulement.
 *
 * Piège à connaître : pour reconnaître "l'ancien préfixe auto-généré" à
 * remplacer (et ne jamais toucher au reste du titre, ni à sa mise en forme),
 * on utilise une expression régulière STATELESS (`PREFIX_RE`) plutôt qu'un
 * attribut de nœud — un attribut ne survivrait pas à une sauvegarde/
 * réouverture (le Markdown ne connaît que le texte, pas les attributs
 * ProseMirror). Conséquence acceptée : un titre dont le VRAI texte
 * commencerait par hasard par quelque chose comme "1.5. " serait à tort
 * traité comme un ancien préfixe auto-généré et remplacé. Comportement
 * strictement opt-in (numérotation désactivée par défaut sur tous les
 * niveaux), donc ce risque n'existe que pour un utilisateur qui a
 * explicitement activé la fonctionnalité.
 *
 * Implémentation : seule la portion de texte correspondant au préfixe
 * (ancien ou à insérer) est modifiée via `tr.insertText` — jamais le reste
 * du titre — pour ne jamais perdre de mise en forme (gras, lien...)
 * appliquée dans le titre par l'utilisateur. Dispatché directement sur
 * `view` (pas via les commandes Tiptap) : c'est un ajustement interne, pas
 * une action utilisateur à faire apparaître dans l'historique undo/redo
 * comme une étape séparée — `addToHistory: false` sur la transaction (le
 * plugin d'historique de ProseMirror respecte ce meta).
 */
import type { EditorView } from "@tiptap/pm/view";
import { formatCounter, type HeadingLevel, type HeadingLevelStyle } from "../../../core/pageLayout";

const PREFIX_RE = /^(?:[0-9]+|[A-Za-z]+)(?:\.(?:[0-9]+|[A-Za-z]+))*\.\s+/;

function computePrefix(
  level: HeadingLevel,
  counters: number[],
  headingStyles: Record<HeadingLevel, HeadingLevelStyle>,
): string {
  const style = headingStyles[level];
  if (!style || style.numbering === "none") return "";
  const segments: string[] = [];
  for (let l = 1; l <= level; l++) {
    const lvlStyle = headingStyles[l as HeadingLevel];
    if (lvlStyle && lvlStyle.numbering !== "none") {
      segments.push(formatCounter(counters[l - 1], lvlStyle.numbering));
    }
  }
  return segments.length > 0 ? `${segments.join(".")}. ` : "";
}

/** Recalcule et réécrit si besoin la numérotation de tous les titres du
 * document. Ne fait RIEN (pas de transaction dispatchée) si tout est déjà à
 * jour — appelé très souvent (à chaque frappe), doit rester un no-op bon
 * marché dans le cas courant où aucun niveau n'a de numérotation activée. */
export function applyHeadingNumbering(view: EditorView, headingStyles: Record<HeadingLevel, HeadingLevelStyle>): void {
  const anyNumbered = Object.values(headingStyles).some((s) => s.numbering !== "none");
  if (!anyNumbered) return;

  const { state } = view;
  const counters = [0, 0, 0, 0, 0, 0];
  const tr = state.tr;
  let modified = false;

  state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return true;
    const level = (node.attrs.level as HeadingLevel) ?? 1;
    counters[level - 1] += 1;
    for (let i = level; i < 6; i++) counters[i] = 0;

    const expectedPrefix = computePrefix(level, counters, headingStyles);
    const text = node.textContent;
    const match = text.match(PREFIX_RE);
    const currentPrefix = match ? match[0] : "";
    if (currentPrefix === expectedPrefix) return false;

    const from = tr.mapping.map(pos + 1);
    const to = tr.mapping.map(pos + 1 + currentPrefix.length);
    tr.insertText(expectedPrefix, from, to);
    modified = true;
    return false;
  });

  if (modified) {
    tr.setMeta("addToHistory", false);
    view.dispatch(tr);
  }
}
