/**
 * Comparaison de deux textes MOT PAR MOT (2026-10-27, roadmap 5.3 —
 * « comparaison de deux versions »). Technique reprise de l'esprit du
 * `wordDiff` de CasualOffice (LCS classique sur des JETONS de mots) :
 * un diff caractère par caractère est trop bruité (il coupe les mots en
 * deux), un diff paragraphe par paragraphe trop grossier (toute édition
 * réécrit le paragraphe entier). Le mot est le bon grain — celui de
 * GitHub et de jsdiff.
 *
 * Pur (aucune dépendance) : utilisé par le panneau Historique
 * (statistiques de la restauration) et la fenêtre de comparaison.
 *
 * Garde-fou : LCS est O(n×m). Au-delà de MAX_TOKENS jetons d'un côté,
 * on retombe sur un diff LIGNE PAR LIGNE (le même algorithme, jetons =
 * lignes) — quelques milliers de jetons au plus, résultat plus grossier
 * mais instantané sur un très gros document.
 */

/** Opération d'un segment de diff. */
export type DiffOp = "keep" | "add" | "remove";

/** Un segment : une suite de jetons partageant la même opération. */
export interface DiffSegment {
  op: DiffOp;
  text: string;
}

/** Statistiques lisible : mots ajoutés / supprimés. */
export interface DiffStats {
  added: number;
  removed: number;
}

/** Au-delà, diff ligne par ligne (voir garde-fou ci-dessus). */
const MAX_TOKENS = 12000;

/** Découpe en jetons : mots (lettres/chiffres, accents compris), ponctuation, espaces. */
function tokeniseWords(text: string): string[] {
  return text.match(/[\p{L}\p{N}_]+|[^\s]|\s+/gu) ?? [];
}

/** Découpe en LIGNES (garde-fou des très gros documents). */
function tokeniseLines(text: string): string[] {
  return text.split(/(?=\n)/);
}

function isWhitespace(token: string): boolean {
  return /^\s+$/.test(token);
}

/** Table LCS (programmation dynamique) entre deux listes de jetons. */
function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/** Parcourt la table à l'envers et émet les segments (fusionnés par
 *  opération — le rendu fait UN span par suite, pas un par mot). */
function emit(a: string[], b: string[], dp: number[][]): DiffSegment[] {
  const out: DiffSegment[] = [];
  const push = (op: DiffOp, text: string): void => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = a.length;
  let j = b.length;
  const stack: DiffSegment[] = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      stack.push({ op: "keep", text: a[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      stack.push({ op: "remove", text: a[i - 1] });
      i--;
    } else {
      stack.push({ op: "add", text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    stack.push({ op: "remove", text: a[--i] });
  }
  while (j > 0) {
    stack.push({ op: "add", text: b[--j] });
  }
  for (let k = stack.length - 1; k >= 0; k--) {
    const s = stack[k];
    // Un jeton d'espacement seul se COLLE au segment précédent : les
    // espaces ne doivent pas hacher visuellement le diff.
    if ((s.op === "add" || s.op === "remove") && isWhitespace(s.text) && out.length > 0) {
      push(out[out.length - 1].op, s.text);
    } else {
      push(s.op, s.text);
    }
  }
  return out;
}

/** Diff mot par mot de `before` vers `after` — segments dans l'ordre de
 *  lecture ; `mode` vaut "words" ou "lines" (garde-fou gros document). */
export function diffWords(before: string, after: string): { segments: DiffSegment[]; mode: "words" | "lines" } {
  if (before === after) return { segments: before ? [{ op: "keep", text: before }] : [], mode: "words" };
  if (!before) return { segments: after ? [{ op: "add", text: after }] : [], mode: "words" };
  if (!after) return { segments: [{ op: "remove", text: before }], mode: "words" };
  const aWords = tokeniseWords(before);
  const bWords = tokeniseWords(after);
  if (aWords.length <= MAX_TOKENS && bWords.length <= MAX_TOKENS) {
    return { segments: emit(aWords, bWords, lcsTable(aWords, bWords)), mode: "words" };
  }
  // Très gros document : diff ligne par ligne (jetons = lignes).
  const aLines = tokeniseLines(before);
  const bLines = tokeniseLines(after);
  return { segments: emit(aLines, bLines, lcsTable(aLines, bLines)), mode: "lines" };
}

/** Résumé chiffré d'un diff : mots ajoutés / supprimés (la ponctuation et
 *  les espaces ne comptent pas — les chiffres suivent l'intuition). */
export function diffStats(segments: DiffSegment[]): DiffStats {
  const countWords = (text: string): number => (text.match(/[\p{L}\p{N}_]+/gu) ?? []).length;
  let added = 0;
  let removed = 0;
  for (const s of segments) {
    if (s.op === "add") added += countWords(s.text);
    else if (s.op === "remove") removed += countWords(s.text);
  }
  return { added, removed };
}

/** Phrase résumée pour une confirmation : « 3 mots ajoutés, 2 supprimés »,
 *  « contenu identique » si rien ne change. */
export function diffStatsLabel(stats: DiffStats): string {
  if (stats.added === 0 && stats.removed === 0) return "contenu identique au document actuel";
  const parts: string[] = [];
  if (stats.added > 0) parts.push(`${stats.added} mot${stats.added > 1 ? "s" : ""} ajouté${stats.added > 1 ? "s" : ""}`);
  if (stats.removed > 0) parts.push(`${stats.removed} mot${stats.removed > 1 ? "s" : ""} supprimé${stats.removed > 1 ? "s" : ""}`);
  return parts.join(", ");
}
