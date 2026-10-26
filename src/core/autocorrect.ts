/**
 * Correction automatique à la frappe (2026-10-26, roadmap 4.3) — règles PURES, sans éditeur :
 * `extensions/AutoCorrect.ts` les applique à chaque caractère tapé.
 *
 * - Guillemets français : `"` devient « (ouvrant) ou » (fermant), avec une espace insécable à l'intérieur
 *   (« texte »), comme Word. Ouvrant = début de bloc ou après une espace, une parenthèse, un tiret, un
 *   guillemet ouvrant ; fermant = après tout autre caractère.
 * - Majuscule : la première lettre d'un bloc et la première lettre après « . », « ! » ou « ? » suivi d'une
 *   espace. Le point d'une abréviation (« ex. », « etc. », « cf. », « M. », « n° 3. ») n'ouvre PAS de phrase :
 *   mot de moins de trois lettres, mot de la liste ci-dessous, ou mot contenant un chiffre (« 1.2. »,
 *   « R32. »). Pas de majuscule dans un bloc de code, un texte en code, ni en début de CELLULE de tableau
 *   (« kW », « m3/h »…) — Word fait de même pour les cellules.
 *
 * Les espaces insécables sont construites par code (`String.fromCharCode`) : écrites en dur dans le
 * fichier elles seraient invisibles et se perdraient au moindre copier-coller.
 */

const NBSP = String.fromCharCode(0x00a0);
const NNBSP = String.fromCharCode(0x202f);
/** Toute espace, y compris insécables (classe de caractères, sans crochets). */
const SPACES = String.raw`\s` + NBSP + NNBSP;

/** Abréviations courantes (minuscules, sans le point) après lesquelles la phrase continue. */
const ABBREVIATIONS = new Set([
  "etc", "cf", "ex", "env", "approx", "fig", "art", "min", "max", "tél", "tel", "réf", "ref", "vol", "chap",
  "sect", "dim", "qté", "qte", "nb", "ibid", "cit", "dép", "dept", "mme", "mlle", "mmes", "mrs", "dr", "pr",
  "prof", "sté", "soc", "tvx", "trav", "obs", "doc", "paragr", "para", "ann", "suiv", "sup", "inf", "moy",
]);

/** Caractère qui, juste avant un guillemet tapé, indique qu'il OUVRE un passage. */
const OPENING_CONTEXT = new RegExp(String.raw`[${SPACES}(\[{«\-–—/]$`, "u");
/** « ! » ou « ? » + espace(s), avec éventuellement un signe fermant entre les deux. */
const AFTER_EXCLAMATION = new RegExp(String.raw`[!?](?:[${SPACES}]*[»”"')\]])?[${SPACES}]+$`, "u");
/** Mot + « . » + espace(s) : le mot qui précède le point est capturé. */
const AFTER_PERIOD = new RegExp(String.raw`([\p{L}][\p{L}\p{N}'’-]*)\.(?:[${SPACES}]*[»”"')\]])?[${SPACES}]+$`, "u");

/**
 * Remplacement d'un guillemet droit `"` tapé après `before` (texte du bloc situé avant le curseur) :
 * le texte à insérer, espace insécable comprise.
 */
export function replaceStraightQuote(before: string): { insert: string } {
  if (before === "" || OPENING_CONTEXT.test(before)) return { insert: `«${NBSP}` };
  return { insert: `${NBSP}»` };
}

/** Faut-il mettre `typed` (une lettre minuscule tapée) en majuscule ? */
export function shouldCapitalize(before: string, typed: string, opts: { inTableCell?: boolean } = {}): boolean {
  if (typed.length !== 1 || typed.toLocaleUpperCase() === typed || typed.toLocaleLowerCase() !== typed) return false;
  if (before === "") return !opts.inTableCell;
  if (AFTER_EXCLAMATION.test(before)) return true;
  const m = before.match(AFTER_PERIOD);
  if (!m) return false;
  const word = m[1];
  if (/\p{N}/u.test(word)) return false;
  // Dernier segment du mot (« l'étape » → « étape », « peut-être » → « être ») : un mot de moins de trois
  // lettres (« M. », « p. », « ex. ») n'est pas une fin de phrase.
  const last = word.split(/['’-]/).pop() ?? word;
  if (last.length < 3 && word.length < 3) return false;
  return !ABBREVIATIONS.has(word.toLowerCase());
}
