/**
 * Sérialisation Markdown des paragraphes VIDES (plusieurs Entrée pour espacer
 * deux paragraphes) — remplace le comportement par défaut de
 * `tiptap-markdown`/`prosemirror-markdown`
 * (`defaultMarkdownSerializer.nodes.paragraph`), qui n'écrit RIEN pour un
 * paragraphe vide : le séparateur de bloc Markdown standard (une ligne
 * blanche) est le même que le document ait 1 ou 5 paragraphes vides entre
 * deux blocs de texte — impossible de distinguer "juste un saut de
 * paragraphe normal" de "l'utilisateur a délibérément appuyé plusieurs fois
 * sur Entrée pour créer de l'espace" une fois repassé par le Markdown.
 *
 * Retour utilisateur exact ("il doit manquer une ligne de commentaire pour
 * que je les récupère") — même principe que `PageBreak.ts`/`TocMarker.ts` :
 * persister l'information dans un commentaire HTML invisible
 * (`<!-- empty-line -->`), lisible/ignoré sans casse par n'importe quel
 * autre outil Markdown, plutôt que d'inventer une syntaxe non standard.
 *
 * Ne change RIEN pour un paragraphe non vide (repli sur le comportement de
 * base) — seuls les paragraphes strictement vides sont concernés.
 *
 * ---
 * RETRAIT DE PARAGRAPHE (roadmap 2.1, 2026-10-21 — boutons « Tabulation
 * + / − » comme Word/Casual) : attribut `indent` (nombre de pas de 1,25 cm,
 * le retrait par défaut de Word ; 0 = aucun). PAS d'équivalent en Markdown
 * standard — et surtout PAS d'espaces en tête de ligne : 4 espaces ou une
 * tabulation en début de paragraphe = BLOC DE CODE en Markdown, qui
 * détruirait le paragraphe à la réouverture. Même repli assumé que
 * l'alignement : `<p style="margin-left:1.25cm">`, lisible partout
 * (`html: true` de tiptap-markdown), réversible. Raccourcis Word :
 * Ctrl+M / Ctrl+Shift+M.
 */
import { Paragraph as ParagraphBase } from "@tiptap/extension-paragraph";
import { DOMSerializer } from "@tiptap/pm/model";

const EMPTY_LINE_COMMENT = /^<!--\s*empty-line\s*-->$/i;

/**
 * Retrait de paragraphe : stocké en CENTIMÈTRES (gauche et droite).
 * Le pas des boutons Tabulation ± du ruban reste 1,25 cm (0,5"), comme
 * le retrait par défaut de Word — mais le modèle est libre (la fenêtre
 * « Paragraphe » saisit des cm arbitraires). Les anciens fichiers écrits
 * avec le modèle « nombre de pas » restent lisibles : leur HTML de repli
 * contenait déjà des cm (margin-left: 1.25cm), relus ici tels quels.
 */
export const INDENT_STEP_CM = 1.25;
/** Plafond : 12,5 cm — au-delà le texte sortirait de la page A4. */
export const INDENT_MAX_CM = 12.5;

const INDENT_LEFT_RE = /margin-left:\s*([\d.]+)cm/;
const INDENT_RIGHT_RE = /margin-right:\s*([\d.]+)cm/;

/** Retrait lu depuis le style inline du repli HTML (<p style=…>). */
function cmFromStyle(style: string | null, re: RegExp): number {
  const m = style ? re.exec(style) : null;
  if (!m) return 0;
  const cm = parseFloat(m[1]);
  if (!Number.isFinite(cm) || cm <= 0) return 0;
  return Math.min(INDENT_MAX_CM, Math.round(cm * 100) / 100);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    /** Retrait de paragraphe (roadmap 2.1) — les commandes sont NÉSTÉES
     * sous une clé objet : Tiptap v3 n'aplatit dans RawCommands que les
     * valeurs OBJET de Commands (UnionCommands, voir types @tiptap/core)
     * — au premier niveau elles seraient ignorées. */
    paragraphIndent: {
      /** Augmente le retrait du paragraphe courant d'un pas (bouton
       * « Tabulation + », Ctrl+M). */
      increaseParagraphIndent: () => ReturnType;
      /** Diminue le retrait du paragraphe courant d'un pas de 1,25 cm
       * (bouton « Tabulation − », Ctrl+Shift+M) ; sans effet à 0. */
      decreaseParagraphIndent: () => ReturnType;
      /** Pose les retraits gauche/droite EXACTS du paragraphe courant,
       * en cm (fenêtre « Paragraphe »). */
      setParagraphIndent: (leftCm: number, rightCm: number) => ReturnType;
    };
  }
}

export const ParagraphMarkdown = ParagraphBase.extend({
  addAttributes() {
    return {
      /** Retrait GAUCHE en cm (boutons Tabulation ±, fenêtre Paragraphe). */
      indentCm: {
        default: 0,
        parseHTML: (element) => cmFromStyle(element.getAttribute("style"), INDENT_LEFT_RE),
        renderHTML: (attributes) =>
          attributes.indentCm > 0 ? { style: `margin-left: ${attributes.indentCm}cm` } : {},
      },
      /** Retrait DROIT en cm (fenêtre Paragraphe, comme Word). */
      indentRightCm: {
        default: 0,
        parseHTML: (element) => cmFromStyle(element.getAttribute("style"), INDENT_RIGHT_RE),
        renderHTML: (attributes) =>
          attributes.indentRightCm > 0 ? { style: `margin-right: ${attributes.indentRightCm}cm` } : {},
      },
    };
  },

  addCommands() {
    const cmAfter = (editor: { getAttributes: (t: string) => Record<string, unknown> }, delta: number) => {
      const attrs = editor.getAttributes("paragraph");
      const current = typeof attrs.indentCm === "number" ? (attrs.indentCm as number) : 0;
      // Arrondi au centième : les additions répétées de 1,25 ne
      // dérivent jamais (0,1 + 0,2 flottants).
      return Math.max(0, Math.min(INDENT_MAX_CM, Math.round((current + delta) * 100) / 100));
    };
    const clampCm = (v: number) =>
      Math.max(0, Math.min(INDENT_MAX_CM, Math.round((Number.isFinite(v) ? v : 0) * 100) / 100));
    return {
      increaseParagraphIndent:
        () =>
        ({ commands, editor }: { commands: any; editor: any }) =>
          commands.updateAttributes("paragraph", { indentCm: cmAfter(editor, INDENT_STEP_CM) }),
      decreaseParagraphIndent:
        () =>
        ({ commands, editor }: { commands: any; editor: any }) =>
          commands.updateAttributes("paragraph", { indentCm: cmAfter(editor, -INDENT_STEP_CM) }),
      setParagraphIndent:
        (leftCm: number, rightCm: number) =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes("paragraph", { indentCm: clampCm(leftCm), indentRightCm: clampCm(rightCm) }),
    };
  },

  addKeyboardShortcuts() {
    // Raccourcis de Word : Ctrl+M augmente le retrait, Ctrl+Shift+M le
    // diminue (Cmd/Ctrl selon la plateforme via « Mod »).
    return {
      "Mod-Shift-m": () => this.editor.commands.decreaseParagraphIndent(),
      "Mod-m": () => this.editor.commands.increaseParagraphIndent(),
    };
  },

  addStorage() {
    return {
      markdown: {
        // `this` est lié par tiptap-markdown à { editor, options } (voir
        // `serializeNode` dans tiptap-markdown.es.js) — typé ici à la main
        // pour rester en TypeScript strict sans dépendre des types internes.
        serialize(this: { editor: { schema: never } }, state: any, node: any) {
          if (node.content.size === 0) {
            state.write("<!-- empty-line -->");
            state.closeBlock(node);
            return;
          }
          // Paragraphe ALIGNÉ ou RETRAIT (text-align via le ruban, indent
          // via Tabulation ±) : pas d'équivalent en Markdown standard —
          // repli HTML <p style="…"> comme tous les réglages avancés (voir
          // Markdown.configure({ html: true })). SANS ce repli, le
          // sérialiseur ci-dessous écrivait le texte inline sans les
          // attributs : le réglage était silencieusement PERDU à la
          // sauvegarde (bug préexistant sur l'alignement, révélé par la
          // vérification systématique du ruban refait).
          if (node.attrs.textAlign || node.attrs.indentCm > 0 || node.attrs.indentRightCm > 0) {
            const div = document.createElement("div");
            div.appendChild(DOMSerializer.fromSchema(this.editor.schema).serializeNode(node));
            state.write(div.innerHTML);
            state.closeBlock(node);
            return;
          }
          state.renderInline(node);
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: any) {
            // Reconstruit un paragraphe VIDE (pas un texte "<!-- empty-line -->"
            // littéral) : on pousse les mêmes tokens qu'un paragraphe normal
            // sans contenu (paragraph_open/inline vide/paragraph_close), pris
            // en charge par le rendu par défaut de markdown-it (`<p></p>`),
            // que Tiptap sait déjà parser vers un nœud paragraphe vide — pas
            // besoin de règle de rendu personnalisée, contrairement à
            // `PageBreak.ts`/`TocMarker.ts` qui introduisent un type de nœud
            // entièrement nouveau.
            markdownit.block.ruler.before(
              "html_block",
              "empty_line",
              (state: any, startLine: number, _endLine: number, silent: boolean) => {
                const pos = state.bMarks[startLine] + state.tShift[startLine];
                const max = state.eMarks[startLine];
                const line = state.src.slice(pos, max);
                if (!EMPTY_LINE_COMMENT.test(line.trim())) return false;
                if (silent) return true;
                state.push("paragraph_open", "p", 1);
                const inlineToken = state.push("inline", "", 0);
                inlineToken.content = "";
                inlineToken.children = [];
                state.push("paragraph_close", "p", -1);
                state.line = startLine + 1;
                return true;
              },
            );
          },
        },
      },
    };
  },
});
