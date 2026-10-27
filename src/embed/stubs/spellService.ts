/**
 * Remplaçant de `persistence/spellService.ts` pour la version LÉGÈRE de Pagina : le moteur Hunspell est côté Rust
 * (Tauri), absent ici. Aucune faute n'est affichée, aucune suggestion proposée.
 */

export function spellAvailable(): boolean {
  return false;
}

export async function checkWords(_lang: string, _words: string[]): Promise<string[]> {
  return [];
}

export async function suggestWord(_lang: string, _word: string, _limit = 5): Promise<string[]> {
  return [];
}
