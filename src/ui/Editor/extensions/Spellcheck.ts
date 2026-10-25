/**
 * Correction orthographique (2026-10-25) — soulignement rouge ondulé des mots
 * inconnus du dictionnaire. Même principe que `SpellcheckExtension` de
 * CasualOffice (décorations inline reconstruites APRÈS une pause de frappe, et
 * seulement décalées pendant la frappe), avec trois différences :
 *
 * - le moteur est Hunspell côté Rust (`spell_commands.rs`, appelé en lot par
 *   `persistence/spellService.ts`) : la vérification est ASYNCHRONE, les
 *   décorations se construisent donc de façon synchrone à partir d'un CACHE de
 *   verdicts (mot → faux/juste) que le balayage asynchrone remplit ;
 * - le texte est analysé PAR BLOC (et non par fragment de texte), sinon
 *   « ventil<b>ation</b> » serait coupé en deux mots ;
 * - les décorations vivent dans l'éditeur invisible ; la couche peinte les reçoit
 *   par `cloneNode`, mais une décoration seule ne change pas le document : on
 *   demande donc un repaint (`options.onChanged`) après chaque reconstruction.
 *
 * Jamais écrit dans le document ni dans le fichier. Le correcteur NATIF du
 * navigateur reste désactivé sur l'éditeur invisible (voir CLAUDE.md).
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { elisionRest, extractWords, hyphenParts } from "../../../core/spellcheck/words";
import { isUserWord } from "../../../core/spellcheck/userDictionary";
import { useSettingsStore } from "../../../core/store/settingsStore";
import { checkWords, spellAvailable } from "../../../persistence/spellService";

export const SPELL_ERROR_CLASS = "xmd-spell-error";
const DEBOUNCE_MS = 350;
const CHUNK = 400;

/** Blocs dont le texte n'est jamais corrigé (code, formules, diagrammes). */
const SKIP_BLOCKS = new Set(["codeBlock", "mermaidDiagram", "blockMath", "coverPage"]);
/** Marques dont le texte n'est jamais corrigé (code en ligne ; liens = sommaire, URL). */
const SKIP_MARKS = new Set(["code", "link"]);

const key = new PluginKey<{ decos: DecorationSet; active: { from: number; to: number } | null }>("xmdSpellcheck");

/** Verdicts connus : langue → (mot → « inconnu du dictionnaire »). */
const verdicts = new Map<string, Map<string, boolean>>();
function verdictsFor(lang: string): Map<string, boolean> {
  let m = verdicts.get(lang);
  if (!m) verdicts.set(lang, (m = new Map()));
  return m;
}

function currentLang(): string | null {
  const s = useSettingsStore.getState();
  return s.spellcheck && spellAvailable() ? s.spellLanguage : null;
}

/** Le mot est-il à souligner d'après les verdicts connus et le dictionnaire personnel ? */
function isMisspelled(lang: string, word: string): boolean {
  const known = verdictsFor(lang);
  if (known.get(word) !== true) return false;
  if (isUserWord(word)) return false;
  const elided = elisionRest(word);
  if (elided) return known.get(elided.rest) === true && !isUserWord(elided.rest) && isMisspelled(lang, elided.rest);
  const parts = hyphenParts(word);
  if (parts.length > 0) return parts.some((p) => known.get(p) === true && !isUserWord(p));
  return true;
}

interface Found {
  word: string;
  from: number;
  to: number;
}

/** Texte d'un bloc avec correspondance 1 pour 1 vers les positions du document :
 *  texte à ignorer et objets en ligne deviennent des espaces de même longueur. */
function blockText(block: ProseMirrorNode): string {
  let text = "";
  block.forEach((child) => {
    if (child.isText) {
      const skipped = child.marks.some((m) => SKIP_MARKS.has(m.type.name));
      text += skipped ? " ".repeat(child.nodeSize) : child.text ?? "";
    } else {
      text += " ".repeat(child.nodeSize);
    }
  });
  return text;
}

/** Tous les mots à vérifier du document (hors blocs ignorés), avec leur position. */
function collectWords(doc: ProseMirrorNode): Found[] {
  const found: Found[] = [];
  doc.descendants((node, pos) => {
    if (SKIP_BLOCKS.has(node.type.name)) return false;
    if (!node.isTextblock) return true;
    for (const t of extractWords(blockText(node))) {
      found.push({ word: t.word, from: pos + 1 + t.start, to: pos + 1 + t.end });
    }
    return false;
  });
  return found;
}

function buildDecorations(state: EditorState): { decos: DecorationSet; active: { from: number; to: number } | null } {
  const lang = currentLang();
  if (!lang) return { decos: DecorationSet.empty, active: null };
  const sel = state.selection;
  let active: { from: number; to: number } | null = null;
  const decos: Decoration[] = [];
  for (const f of collectWords(state.doc)) {
    if (!isMisspelled(lang, f.word)) continue;
    // Le mot en cours de frappe n'est pas souligné tant que le curseur y est.
    if (sel.empty && sel.from >= f.from && sel.from <= f.to) {
      active = { from: f.from, to: f.to };
      continue;
    }
    // Mot élidé : seule la partie après l'apostrophe est soulignée.
    const e = elisionRest(f.word);
    decos.push(Decoration.inline(f.from + (e?.offset ?? 0), f.to, { class: SPELL_ERROR_CLASS }, { word: e?.rest ?? f.word }));
  }
  return { decos: decos.length ? DecorationSet.create(state.doc, decos) : DecorationSet.empty, active };
}

/** Mot mal orthographié sous la position donnée (clic droit), s'il y en a un. */
export function spellErrorAt(state: EditorState, pos: number): { from: number; to: number; word: string } | null {
  const hits = key.getState(state)?.decos.find(pos, pos) ?? [];
  const d = hits[0];
  if (!d) return null;
  return { from: d.from, to: d.to, word: state.doc.textBetween(d.from, d.to, "", "") };
}

/** Demande une reconstruction des décorations (après « Ignorer », « Ajouter »…). */
export function refreshSpellcheck(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(key, "refresh").setMeta("addToHistory", false));
}

export const Spellcheck = Extension.create<{ onChanged: () => void }>({
  name: "spellcheck",
  addOptions() {
    return { onChanged: () => {} };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => buildDecorations(state),
          apply(tr, prev, _old, state) {
            if (tr.getMeta(key) === "refresh") return buildDecorations(state);
            // Pendant la frappe : on décale seulement les soulignements existants.
            if (tr.docChanged) return { decos: prev.decos.map(tr.mapping, tr.doc), active: null };
            return prev;
          },
        },
        view(initialView) {
          let timer: ReturnType<typeof setTimeout> | null = null;
          let running = false;
          let again = false;
          let destroyed = false;

          /** Interroge le moteur pour les mots encore inconnus, puis reconstruit. */
          const scan = async (view: EditorView) => {
            if (destroyed) return;
            if (running) {
              again = true;
              return;
            }
            running = true;
            try {
              const lang = currentLang();
              if (lang) {
                const known = verdictsFor(lang);
                const unknown = new Set<string>();
                for (const f of collectWords(view.state.doc)) {
                  if (!known.has(f.word)) unknown.add(f.word);
                  for (const p of hyphenParts(f.word)) if (!known.has(p)) unknown.add(p);
                  const e = elisionRest(f.word);
                  if (e && !known.has(e.rest)) unknown.add(e.rest);
                }
                const list = [...unknown];
                for (let i = 0; i < list.length; i += CHUNK) {
                  const chunk = list.slice(i, i + CHUNK);
                  const bad = new Set(await checkWords(lang, chunk));
                  for (const w of chunk) known.set(w, bad.has(w));
                }
              }
            } catch {
              /* moteur indisponible : aucune faute affichée, on réessaiera à la prochaine pause */
            }
            running = false;
            if (destroyed) return;
            if ((view as unknown as { docView: unknown }).docView == null) return;
            refreshSpellcheck(view);
            if (again) {
              again = false;
              schedule(view, DEBOUNCE_MS);
            }
          };

          const schedule = (view: EditorView, delay: number) => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
              timer = null;
              void scan(view);
            }, delay);
          };

          // Activation / changement de langue dans le Paramétrage.
          const unsubscribe = useSettingsStore.subscribe((s, prev) => {
            if (s.spellcheck !== prev.spellcheck || s.spellLanguage !== prev.spellLanguage) schedule(initialView, 0);
          });
          schedule(initialView, 200);

          return {
            update(view, prevState) {
              if (view.state.doc !== prevState.doc) {
                schedule(view, DEBOUNCE_MS);
                return;
              }
              // Soulignements reconstruits sans changement du document (fin de balayage,
              // « Ignorer », « Ajouter au dictionnaire ») : la couche peinte doit être redessinée.
              if (key.getState(view.state)?.decos !== key.getState(prevState)?.decos) options.onChanged();
              // Le curseur a quitté le mot en cours de frappe : on peut le souligner.
              const active = key.getState(prevState)?.active;
              const sel = view.state.selection;
              if (active && !(sel.from >= active.from && sel.from <= active.to)) schedule(view, 150);
            },
            destroy() {
              destroyed = true;
              if (timer) clearTimeout(timer);
              unsubscribe();
            },
          };
        },
        props: {
          decorations: (state) => key.getState(state)?.decos ?? DecorationSet.empty,
        },
      }),
    ];
  },
});
