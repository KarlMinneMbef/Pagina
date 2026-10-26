/**
 * Vérifications du fichier (« Vérifier le document », 2026-10-26).
 *
 * Chaque vérification travaille sur le TEXTE BRUT du fichier tel qu'il est sur le
 * disque (commentaire de config compris) : pas besoin de l'éditeur, donc pures et
 * testables. Une vérification SIGNALE (`inspect`) puis, à la demande, RÉPARE
 * (`repair`, qui traite tous ses problèmes d'un coup et ne touche à rien d'autre).
 *
 * Ajouter une vérification = un objet `DocumentCheck` de plus dans `CHECKS` (et ses
 * tests) ; le dialogue, la copie de sauvegarde et le badge de la barre d'état
 * suivent sans autre changement.
 */

import { repairTruncatedConfig } from "../pageLayout";

export type Severity = "warning" | "error";

export interface Problem {
  /** Identifiant de la vérification qui l'a trouvé. */
  check: string;
  severity: Severity;
  /** Phrase lisible par l'utilisateur. */
  message: string;
  /** Numéro de ligne (1-based) quand il a un sens. */
  line?: number;
}

export interface DocumentCheck {
  id: string;
  /** Intitulé court, affiché devant le résultat de la réparation. */
  label: string;
  inspect(raw: string): Problem[];
  /** Texte réparé (identique à `raw` s'il n'y a rien à faire). */
  repair(raw: string): string;
}

/* ---------- Utilitaires de lecture ligne à ligne ---------- */

/** Lignes du fichier avec un drapeau « dans un bloc de code » : un marqueur
 *  écrit dans un exemple de code n'est pas un vrai marqueur. */
function scanLines(raw: string): { text: string; inCode: boolean }[] {
  let fence: string | null = null;
  return raw.split("\n").map((text) => {
    const m = text.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      const mark = m[1][0].repeat(3);
      if (fence === null) {
        fence = mark;
        return { text, inCode: true };
      }
      if (fence === mark) {
        fence = null;
        return { text, inCode: true };
      }
    }
    return { text, inCode: fence !== null };
  });
}

const COVER_START_RE = /^\s*<!--\s*coverzone-start\b[^>]*-->\s*$/i;
const COVER_END_RE = /^\s*<!--\s*coverzone-end\s*-->\s*$/i;
const PAGEBREAK_RE = /^\s*<!--\s*pagebreak\s*-->\s*$/i;
const COVER_END_LINE = "<!-- coverzone-end -->";

/* ---------- 1. Zone « page de garde » non refermée / marqueur de fin orphelin ---------- */

interface CoverZoneAnalysis {
  /** Indices de ligne AVANT lesquels il faut insérer un marqueur de fin. */
  insertBefore: number[];
  /** Indices des marqueurs de fin sans début. */
  orphanEnds: number[];
}

/** Même règle que `unclosedCoverZoneEnds` (extension CoverZone) : une zone
 *  s'arrête au premier saut de page qui suit, à défaut à l'ouverture d'une autre
 *  zone, à défaut en fin de fichier. */
function analyseCoverZones(raw: string): CoverZoneAnalysis {
  const lines = scanLines(raw);
  const insertBefore: number[] = [];
  const orphanEnds: number[] = [];
  let open = false;
  lines.forEach(({ text, inCode }, i) => {
    if (inCode) return;
    if (COVER_START_RE.test(text)) {
      if (open) insertBefore.push(i);
      open = true;
    } else if (COVER_END_RE.test(text)) {
      if (!open) orphanEnds.push(i);
      open = false;
    } else if (open && PAGEBREAK_RE.test(text)) {
      insertBefore.push(i);
      open = false;
    }
  });
  if (open) insertBefore.push(lines.length);
  return { insertBefore, orphanEnds };
}

const coverZoneCheck: DocumentCheck = {
  id: "cover-zone",
  label: "Page de garde",
  inspect(raw) {
    const { insertBefore, orphanEnds } = analyseCoverZones(raw);
    const problems: Problem[] = insertBefore.map((i) => ({
      check: "cover-zone",
      severity: "error" as const,
      message:
        "Une zone « page de garde » n'est pas refermée : toutes les pages qui suivent sont traitées comme des pages de garde (sans en-tête ni pied de page).",
      line: i < raw.split("\n").length ? i + 1 : undefined,
    }));
    for (const i of orphanEnds) {
      problems.push({
        check: "cover-zone",
        severity: "warning",
        message: "Un marqueur de fin de page de garde n'a pas de début : il est sans effet.",
        line: i + 1,
      });
    }
    return problems;
  },
  repair(raw) {
    const { insertBefore, orphanEnds } = analyseCoverZones(raw);
    if (insertBefore.length === 0 && orphanEnds.length === 0) return raw;
    const lines = raw.split("\n");
    const orphans = new Set(orphanEnds);
    const inserts = new Set(insertBefore);
    const out: string[] = [];
    for (let i = 0; i <= lines.length; i++) {
      if (inserts.has(i)) out.push(COVER_END_LINE);
      if (i < lines.length && !orphans.has(i)) out.push(lines[i]);
    }
    return out.join("\n");
  },
};

/* ---------- 2. Commentaire de configuration (pagina:config) ---------- */

const CONFIG_ANY_RE = /<!--\s*pagina:config\s+[\s\S]*?-->/g;

function parseConfigPayload(comment: string): boolean {
  const payload = comment.replace(/^<!--\s*pagina:config\s+/, "").replace(/\s*-->$/, "");
  try {
    JSON.parse(payload);
    return true;
  } catch {
    return false;
  }
}

const LEADING_GENERATOR_RE = /^<!--\s*pagina:generator[\s\S]*?-->[ \t]*\n/;

/** Ancien format : le JSON de la config contenait `-->` (champ d'en-tête vidé) et fermait le
 *  commentaire HTML au milieu — le reste fuyait dans le texte. L'application relit ce fichier
 *  correctement (`repairTruncatedConfig`) ; ici on réécrit le commentaire proprement. */
function normalizeTruncatedConfig(raw: string): string {
  const lead = raw.match(LEADING_GENERATOR_RE)?.[0] ?? "";
  const rest = raw.slice(lead.length);
  const m = rest.match(/^<!--\s*pagina:config\s+([\s\S]*?)\s*-->/);
  if (!m) return raw;
  const fixed = repairTruncatedConfig(rest, m[1]);
  if (!fixed) return raw;
  const json = JSON.stringify(JSON.parse(fixed.payload)).replace(/-->/g, "--\\u003e");
  return `${lead}<!-- pagina:config ${json} -->\n${rest.slice(fixed.full.length)}`;
}

/** Commentaires de config en excluant les blocs de code. */
function configComments(raw: string): { index: number; text: string; valid: boolean }[] {
  const out: { index: number; text: string; valid: boolean }[] = [];
  // Début (en caractères) de chaque ligne située dans un bloc de code.
  const codeStarts: [number, number][] = [];
  let offset = 0;
  for (const { text, inCode } of scanLines(raw)) {
    if (inCode) codeStarts.push([offset, offset + text.length]);
    offset += text.length + 1;
  }
  for (const m of raw.matchAll(CONFIG_ANY_RE)) {
    const index = m.index ?? 0;
    if (codeStarts.some(([a, b]) => index >= a && index <= b)) continue;
    out.push({ index, text: m[0], valid: parseConfigPayload(m[0]) });
  }
  return out;
}

const configCheck: DocumentCheck = {
  id: "config",
  label: "Réglages de mise en page",
  inspect(raw) {
    const problems: Problem[] = [];
    const normalized = normalizeTruncatedConfig(raw);
    if (normalized !== raw) {
      problems.push({
        check: "config",
        severity: "warning",
        message:
          "Les réglages de mise en page sont écrits dans un ancien format abîmé (commentaire coupé) : ils sont relus correctement mais le fichier doit être réécrit.",
        line: 1,
      });
      raw = normalized;
    }
    const comments = configComments(raw);
    const lineOf = (index: number) => raw.slice(0, index).split("\n").length;
    if (comments.length > 1) {
      problems.push({
        check: "config",
        severity: "warning",
        message: `Les réglages de mise en page sont présents ${comments.length} fois dans le fichier (une seule copie est utilisée).`,
        line: lineOf(comments[1].index),
      });
    }
    comments.forEach((c, i) => {
      if (!c.valid) {
        problems.push({
          check: "config",
          severity: "error",
          message:
            i === 0
              ? "Les réglages de mise en page sont illisibles : le document s'ouvre avec les réglages par défaut."
              : "Un reste de réglages de mise en page illisible traîne dans le texte du document.",
          line: lineOf(c.index),
        });
      }
    });
    // Reste d'un ancien commentaire coupé en deux (le JSON a fui dans le texte).
    if (/^\s*"?configVersion"?\s*:/m.test(raw) && comments.every((c) => c.valid)) {
      problems.push({
        check: "config",
        severity: "error",
        message: "Des fragments de réglages (« configVersion… ») apparaissent dans le texte du document.",
      });
    }
    return problems;
  },
  repair(raw) {
    raw = normalizeTruncatedConfig(raw);
    const comments = configComments(raw);
    if (comments.length === 0) return raw;
    // On garde le premier commentaire LISIBLE ; tous les autres disparaissent.
    const keep = comments.find((c) => c.valid) ?? null;
    let out = "";
    let pos = 0;
    for (const c of comments) {
      out += raw.slice(pos, c.index);
      if (c === keep) out += c.text;
      pos = c.index + c.text.length;
      // Avale le saut de ligne laissé par un commentaire supprimé.
      if (c !== keep && raw[pos] === "\n") pos += 1;
    }
    out += raw.slice(pos);
    return out;
  },
};

/* ---------- 3. Saut de section au contenu illisible ---------- */

const SECTION_RE = /^(\s*)<!--\s*section\s*:\s*(.+?)\s*-->\s*$/i;

function sectionPayloadReadable(payload: string): boolean {
  try {
    const json = payload.trim().startsWith("%") ? decodeURIComponent(payload.trim()) : payload;
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

const sectionCheck: DocumentCheck = {
  id: "section",
  label: "Sauts de section",
  inspect(raw) {
    const problems: Problem[] = [];
    scanLines(raw).forEach(({ text, inCode }, i) => {
      if (inCode) return;
      const m = text.match(SECTION_RE);
      if (m && !sectionPayloadReadable(m[2])) {
        problems.push({
          check: "section",
          severity: "warning",
          message: "Un saut de section a des options illisibles : son titre est perdu (il reprend « Section n »).",
          line: i + 1,
        });
      }
    });
    return problems;
  },
  repair(raw) {
    return scanLines(raw)
      .map(({ text, inCode }) => {
        if (inCode) return text;
        const m = text.match(SECTION_RE);
        return m && !sectionPayloadReadable(m[2]) ? `${m[1]}<!-- section -->` : text;
      })
      .join("\n");
  },
};

/** Toutes les vérifications, dans l'ordre d'affichage. */
export const CHECKS: DocumentCheck[] = [coverZoneCheck, configCheck, sectionCheck];
