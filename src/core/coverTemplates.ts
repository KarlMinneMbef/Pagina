/**
 * Modèles de pages de garde (2026-10-22) — les modèles INTÉGRÉS (code,
 * charte MBEF, sans image tant que le pipeline images n'existe pas —
 * réservé à la phase .xmd) et les modèles UTILISATEUR persistés
 * (localStorage `pagina.coverTemplates`), plus export/import de fichiers
 * `.mdcover.json` pour les réutiliser sur un autre poste.
 *
 * Le contenu d'un modèle est du Markdown PUR (les modèles intégrés) ou, pour
 * les anciens modèles utilisateur, du HTML inline ; l'apparence vient d'un
 * THÈME (`theme`, voir CoverTheme.ts) et les VARIABLES de document (`{{title}}`, `{{author}}`,
 * `{{date}}`… insérées comme CHAMPS résolus — voir DocField.ts ; la
 * galerie insère le contenu dans une ZONE page de garde, voir
 * CoverZone.ts). VOLONTAIREMENT PAS D'IMAGES pour l'instant (décision
 * utilisateur 2026-10-22 : avec le format .xmd).
 */

/** Un modèle de page de garde : nom affiché + source Markdown + thème visuel
 *  (« » = style libre, anciens modèles à HTML inline). */
export interface CoverTemplate {
  name: string;
  source: string;
  theme?: string;
}

/** Thèmes visuels disponibles (feuille `ui/Cover/coverThemes.css`). */
export const COVER_THEMES: { id: string; label: string }[] = [
  { id: "", label: "Aucun (style libre)" },
  { id: "classique", label: "Classique" },
  { id: "moderne", label: "Moderne" },
  { id: "technique", label: "Technique" },
  { id: "minimal", label: "Minimal" },
  { id: "chantier", label: "Chantier" },
];

/** Modèles intégrés, disponibles pour tous les documents. Le contenu est du
 *  Markdown PUR (titre `#`, sous-titre `##`, lignes de texte, variables
 *  `{{…}}`) : l'apparence vient du THÈME, pas de HTML dans le fichier. */
export const BUILTIN_COVER_TEMPLATES: CoverTemplate[] = [
  {
    name: "Classique",
    theme: "classique",
    source: ["# {{title}}", "## {{subject}}", "{{author}}", "Le {{date}}", "{{version}}"].join("\n\n"),
  },
  {
    name: "Moderne",
    theme: "moderne",
    source: ["# {{title}}", "## {{subject}}", "{{author}}", "{{date}}"].join("\n\n"),
  },
  {
    name: "Technique",
    theme: "technique",
    source: [
      "### MON BE FLUIDES — ÉTUDES",
      "# {{title}}",
      "## {{subject}}",
      "Affaire : {{title}}",
      "Indice : {{version}}",
      "{{author}} — {{date}}",
    ].join("\n\n"),
  },
  {
    name: "Minimal",
    theme: "minimal",
    source: ["# {{title}}", "{{author}} · {{date}}"].join("\n\n"),
  },
  {
    name: "Chantier",
    theme: "chantier",
    source: ["# {{title}}", "## {{subject}}", "Rédigé par : {{author}}", "Émis le : {{date}}", "Révision : {{version}}"].join("\n\n"),
  },
];

const STORAGE_KEY = "pagina.coverTemplates";

/** Modèles utilisateur persistés — silencieux si absents/corrompus. */
export function loadUserCoverTemplates(): CoverTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is CoverTemplate => !!t && typeof (t as CoverTemplate).name === "string" && typeof (t as CoverTemplate).source === "string")
      .map((t) => ({ name: t.name, source: t.source, theme: typeof t.theme === "string" ? t.theme : "" }));
  } catch {
    return [];
  }
}

/** Remplace toute la liste des modèles utilisateur (persisté). */
function saveUserCoverTemplates(templates: CoverTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    /* localStorage indisponible : liste vivante mais non persistée. */
  }
}

/** Ajoute un modèle utilisateur (nom unique : un homonyme est remplacé,
 *  comme un « Enregistrer sous » d'un modèle existant). */
export function addUserCoverTemplate(template: CoverTemplate): void {
  const rest = loadUserCoverTemplates().filter((t) => t.name !== template.name);
  saveUserCoverTemplates([...rest, template]);
}

/** Supprime un modèle utilisateur par son nom. */
export function removeUserCoverTemplate(name: string): void {
  saveUserCoverTemplates(loadUserCoverTemplates().filter((t) => t.name !== name));
}

/** Sérialise un modèle vers un fichier exportable (JSON lisible). */
export function serializeCoverTemplate(template: CoverTemplate): string {
  return JSON.stringify({ kind: "pagina-cover-template", version: 1, ...template }, null, 2);
}

/** Lit un modèle depuis un fichier exporté — null si le JSON est
 *  corrompu ou n'est pas un modèle de page de garde Pagina. */
export function parseCoverTemplateFile(raw: string): CoverTemplate | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.kind !== "pagina-cover-template") return null;
    if (typeof parsed.name !== "string" || typeof parsed.source !== "string") return null;
    return { name: parsed.name, source: parsed.source, theme: typeof parsed.theme === "string" ? parsed.theme : "" };
  } catch {
    return null;
  }
}

/** Variables de document disponibles dans une page de garde — même
 *  liste que le panneau En-tête/Pied (HeaderFooterPanel.tsx). */
export const COVER_VARIABLES = [
  { token: "{{title}}", label: "Titre du document" },
  { token: "{{subject}}", label: "Sujet" },
  { token: "{{author}}", label: "Auteur" },
  { token: "{{date}}", label: "Date du jour" },
  { token: "{{version}}", label: "Version" },
  { token: "{{created}}", label: "Date de création" },
  { token: "{{modified}}", label: "Date de modification" },
  { token: "{{filename}}", label: "Nom du fichier" },
];
