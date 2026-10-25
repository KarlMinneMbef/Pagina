/**
 * Correction orthographique : appels au moteur Hunspell côté Rust
 * (`src-tauri/src/spell_commands.rs`). Comme `fileService.ts`, un des seuls
 * modules autorisés à appeler `invoke`.
 *
 * Dans la version légère (`build:embed`, sans Tauri) le moteur n'existe pas :
 * `spellAvailable()` est faux et l'éditeur n'affiche simplement aucune faute.
 */
import { invoke } from "@tauri-apps/api/core";

/** Le moteur est-il disponible (application Tauri) ? */
export function spellAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Parmi `words`, ceux que le dictionnaire de `lang` ne connaît pas. */
export async function checkWords(lang: string, words: string[]): Promise<string[]> {
  if (!spellAvailable() || words.length === 0) return [];
  return invoke<string[]>("spell_check", { lang, words });
}

/** Suggestions de correction pour un mot (au plus `limit`). */
export async function suggestWord(lang: string, word: string, limit = 5): Promise<string[]> {
  if (!spellAvailable()) return [];
  return invoke<string[]>("spell_suggest", { lang, word, limit });
}
