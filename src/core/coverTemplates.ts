/**
 * Modèles de pages de garde (2026-10-22) — les modèles INTÉGRÉS (code,
 * charte MBEF, sans image tant que le pipeline images n'existe pas —
 * réservé à la phase .xmd) et les modèles UTILISATEUR persistés
 * (localStorage `pagina.coverTemplates`), plus export/import de fichiers
 * `.mdcover.json` pour les réutiliser sur un autre poste.
 *
 * Le contenu d'un modèle est du Markdown normal avec du HTML inline pour
 * la mise en forme (centrage, tailles — rendu par le parseur de l'éditeur,
 * `html: true`) et les VARIABLES de document (`{{title}}`, `{{author}}`,
 * `{{date}}`… substituées à l'affichage comme les en-têtes/pieds, voir
 * CoverPage.ts). VOLONTAIREMENT PAS D'IMAGES pour l'instant (décision
 * utilisateur 2026-10-22 : avec le format .xmd).
 */

/** Un modèle de page de garde : nom affiché + source Markdown. */
export interface CoverTemplate {
  name: string;
  source: string;
}

/** Modèles intégrés, disponibles pour tous les documents. */
export const BUILTIN_COVER_TEMPLATES: CoverTemplate[] = [
  {
    name: "Classique",
    source: [
      '<p style="text-align: center; margin-top: 60px; font-size: 26pt; font-weight: bold; color: #003f2b;">{{title}}</p>',
      '<p style="text-align: center; font-size: 13pt; color: #343334;">{{subject}}</p>',
      '<p style="text-align: center; margin-top: 100px; font-size: 11pt;">{{author}}</p>',
      '<p style="text-align: center; font-size: 11pt;">Le {{date}}</p>',
      '<p style="text-align: center; font-size: 10pt; color: #75766f;">{{version}}</p>',
    ].join("\n\n"),
  },
  {
    name: "Moderne",
    source: [
      '<p style="margin-top: 70px; border-bottom: 3px solid #24ac6e; padding-bottom: 14px; font-size: 28pt; font-weight: bold; color: #003f2b;">{{title}}</p>',
      "",
      '<p style="font-size: 12pt; color: #24ac6e;">{{subject}}</p>',
      "",
      '<p style="text-align: right; margin-top: 90px; font-size: 11pt; font-weight: bold;">{{author}}</p>',
      "",
      '<p style="text-align: right; font-size: 11pt; color: #75766f;">{{date}}</p>',
    ].join("\n"),
  },
  {
    name: "Technique",
    source: [
      '<p style="text-align: center; margin-top: 40px; font-size: 10pt; color: #75766f;">MON BE FLUIDES — ÉTUDES</p>',
      "",
      '<p style="text-align: center; border-top: 2px solid #003f2b; border-bottom: 2px solid #003f2b; padding: 18px 0; font-size: 22pt; font-weight: bold; color: #003f2b;">{{title}}</p>',
      "",
      '<p style="text-align: center; font-size: 12pt;">{{subject}}</p>',
      "",
      '<p style="text-align: center; margin-top: 80px; font-size: 11pt;">Affaire : {{title}}</p>',
      "",
      '<p style="text-align: center; font-size: 11pt;">Indice : {{version}}</p>',
      "",
      '<p style="text-align: center; margin-top: 60px; font-size: 11pt;">{{author}} — {{date}}</p>',
    ].join("\n"),
  },
  {
    name: "Minimal",
    source: [
      '<p style="text-align: center; margin-top: 120px; font-size: 20pt; color: #343334;">{{title}}</p>',
      '<p style="text-align: center; margin-top: 130px; font-size: 10pt; color: #75766f;">{{author}} · {{date}}</p>',
    ].join("\n\n"),
  },
  {
    name: "Chantier",
    source: [
      '<p style="background: #003f2b; color: #ffffff; padding: 18px 24px; font-size: 24pt; font-weight: bold;">{{title}}</p>',
      "",
      '<p style="background: #f0f0ee; color: #343334; padding: 10px 24px; font-size: 12pt;">{{subject}}</p>',
      "",
      '<p style="margin-top: 70px; font-size: 11pt;">Rédigé par : {{author}}</p>',
      "",
      '<p style="font-size: 11pt;">Émis le : {{date}}</p>',
      "",
      '<p style="font-size: 11pt;">Révision : {{version}}</p>',
    ].join("\n"),
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
      .map((t) => ({ name: t.name, source: t.source }));
  } catch {
    return [];
  }
}

/** Remplace toute la liste des modèles utilisateur (persisté). */
export function saveUserCoverTemplates(templates: CoverTemplate[]): void {
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
    return { name: parsed.name, source: parsed.source };
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
