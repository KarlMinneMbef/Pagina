/**
 * Découpage d'un texte en MOTS À VÉRIFIER pour la correction orthographique
 * (2026-10-25). Logique pure, sans dépendance : le moteur (Hunspell, côté Rust —
 * `src-tauri/src/spell_commands.rs`) ne reçoit que les mots retenus ici.
 *
 * Principe, repris de CasualOffice (précision avant exhaustivité : une fausse
 * alerte est pire qu'une faute manquée) et adapté aux documents techniques du
 * BE : on ne signale PAS les sigles (CTA, DRV, PPSPS), les unités (mm, kW),
 * les références collées à un chiffre (R32, DN50), les variables `{{…}}`, les
 * adresses web et courriels.
 */

/** Un mot retenu pour vérification, avec sa position dans le texte. */
export interface WordToken {
  word: string;
  /** Décalage du premier caractère dans le texte analysé. */
  start: number;
  /** Décalage après le dernier caractère. */
  end: number;
}

/** Lettres (avec accents) ; apostrophes et traits d'union à l'INTÉRIEUR d'un mot
 *  (« l'entreprise », « peut-être »). */
const WORD_RE = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;

/** Segments à ne jamais analyser : remplacés par des espaces (les positions des
 *  mots suivants restent donc exactes). */
const IGNORED_SEGMENTS_RE = /\{\{[^}]*\}\}|https?:\/\/\S+|www\.\S+|[^\s@]+@[^\s@]+\.[^\s@]+/g;

/** Unités et abréviations courantes du BE, valides sans être au dictionnaire. */
const KNOWN_UNITS = new Set([
  "mm", "cm", "dm", "km", "kg", "mg", "ml", "cl", "dl", "kw", "kwh", "mw", "mwh", "hz", "khz",
  "pa", "kpa", "mpa", "bar", "db", "min", "tr", "ppm", "etc",
]);

/** Ce mot mérite-t-il d'être soumis au dictionnaire ? `before`/`after` sont les
 *  caractères qui le touchent dans le texte (vide en bord de texte). */
export function shouldCheckWord(word: string, before: string, after: string): boolean {
  // « a », « y », « l » seuls : presque toujours volontaires.
  if (word.length < 2) return false;
  // Collé à un chiffre : référence ou unité (5mm, DN50, R32, 2eme…).
  if (/\d/.test(before) || /\d/.test(after)) return false;
  // Sigles en majuscules (CTA, DRV, PPSPS) — au plus 5 lettres, comme CasualOffice.
  if (word === word.toUpperCase() && word.length <= 5) return false;
  // Majuscule au milieu du mot (kW, dBA, mmCE, iPhone) : unité ou nom de marque.
  if (/\p{Ll}\p{Lu}/u.test(word)) return false;
  if (KNOWN_UNITS.has(word.toLowerCase())) return false;
  return true;
}

/** Mots à vérifier dans un texte, dans l'ordre. */
export function extractWords(text: string): WordToken[] {
  const cleaned = text.replace(IGNORED_SEGMENTS_RE, (m) => " ".repeat(m.length));
  const out: WordToken[] = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(cleaned)) !== null) {
    const word = m[0];
    const start = m.index;
    const end = start + word.length;
    if (!shouldCheckWord(word, cleaned[start - 1] ?? "", cleaned[end] ?? "")) continue;
    out.push({ word, start, end });
  }
  return out;
}

/** Parties d'un mot composé (« rez-de-chaussée » → rez, de, chaussée) : un mot à
 *  trait d'union est signalé seulement si le mot entier ET l'une de ses parties
 *  sont inconnus. */
export function hyphenParts(word: string): string[] {
  return word.includes("-") ? word.split("-").filter((p) => p.length >= 2) : [];
}

/** Mot élidé (« l'entreprise », « qu'on », « jusqu'à ») : renvoie la partie APRÈS
 *  l'apostrophe et son décalage. Seule cette partie est soulignée (« l'entrepeneur »
 *  → « entrepeneur »), et le mot n'est signalé que si le mot entier ET cette partie
 *  sont inconnus (« aujourd'hui » reste correct). */
export function elisionRest(word: string): { rest: string; offset: number } | null {
  const i = word.search(/['’]/);
  if (i < 1 || i > 6) return null;
  const rest = word.slice(i + 1);
  return rest.length >= 2 ? { rest, offset: i + 1 } : null;
}
