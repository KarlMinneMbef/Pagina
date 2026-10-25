/**
 * Dictionnaire PERSONNEL de l'utilisateur (mots ajoutés par « Ajouter au
 * dictionnaire ») et mots ignorés pour la session (« Ignorer »).
 *
 * Stockage : localStorage (`pagina.userDictionary`), propre à ce poste — comme
 * les modèles de page de garde et les styles de document. Un dictionnaire PARTAGÉ
 * par tout le BE (fichier dans un dossier commun) viendra avec le stockage
 * partagé des modèles : il suffira de remplacer `load`/`save` ci-dessous.
 */
const STORAGE_KEY = "pagina.userDictionary";

/** Clé de comparaison : sans tenir compte de la casse ni de l'apostrophe. */
function key(word: string): string {
  return word.toLowerCase().replace(/’/g, "'");
}

function load(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((w): w is string => typeof w === "string" && w.length > 0) : [];
  } catch {
    return [];
  }
}

function save(words: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
  } catch {
    /* localStorage indisponible : l'ajout vaut pour la session seulement. */
  }
}

const personal = new Set(load().map(key));
const sessionIgnored = new Set<string>();
/** Incrémenté à chaque changement : les décorations se recalculent. */
let version = 0;

/** Le mot est-il connu de l'utilisateur (dictionnaire personnel ou ignoré) ? */
export function isUserWord(word: string): boolean {
  const k = key(word);
  return personal.has(k) || sessionIgnored.has(k);
}

/** « Ignorer » : ne plus signaler ce mot jusqu'à la fermeture de l'application. */
export function ignoreWord(word: string): void {
  sessionIgnored.add(key(word));
  version++;
}

/** « Ajouter au dictionnaire » : ne plus jamais signaler ce mot. */
export function addUserWord(word: string): void {
  const k = key(word);
  if (personal.has(k)) return;
  personal.add(k);
  version++;
  save(load().concat(word));
}

/** Mots du dictionnaire personnel (pour une future fenêtre de gestion). */
export function listUserWords(): string[] {
  return load();
}

export function userDictionaryVersion(): number {
  return version;
}
