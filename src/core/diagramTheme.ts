/**
 * Thème de COULEURS des diagrammes Mermaid (2026-10-22) — la persistance
 * est volontairement isolée derrière cette petite API (getDiagramTheme /
 * setDiagramTheme) : la phase 2 (.xmd) pourra déplacer ces réglages dans
 * les métadonnées du conteneur en ne réécrivant QUE ce fichier.
 *
 * RÈGLE FONDAMENTALE : le fichier .md ne contient JAMAIS les couleurs —
 * uniquement la source Mermaid en texte brut. Les couleurs s'appliquent
 * au RENDU uniquement (mermaid.initialize themeVariables), pour TOUS
 * les diagrammes du document et des prochains.
 *
 * Stockage actuel (phase 1) : localStorage, clé `pagina.diagramTheme`,
 * même garde silencieuse que `pagina.settings` (settingsStore.ts).
 */
import { useSyncExternalStore } from "react";

/** Identifiants des thèmes proposés (libellés dans DIAGRAM_THEMES). */
export type DiagramThemeId = "pagina" | "clair" | "sombre" | "foret" | "neutre";

/** Couleurs personnalisées — chaîne vide = pas de surcharge. */
interface DiagramColors {
  /** Fond des nœuds principaux (primaryColor et alias par type). */
  primary: string;
  /** Fonds secondaires (notes, sections, boîtes de label…). */
  secondary: string;
  /** Bordures, flèches et textes de liens (lineColor et alias). */
  accent: string;
}

/** Réglages complets du thème de diagrammes. */
export interface DiagramThemeSettings {
  theme: DiagramThemeId;
  colors: DiagramColors;
}

/** Catalogue des thèmes proposés — id + libellé affiché. */
export const DIAGRAM_THEMES: { id: DiagramThemeId; label: string }[] = [
  { id: "pagina", label: "Pagina" },
  { id: "clair", label: "Clair" },
  { id: "sombre", label: "Sombre" },
  { id: "foret", label: "Forêt" },
  { id: "neutre", label: "Neutre" },
];

const STORAGE_KEY = "pagina.diagramTheme";

const DEFAULT_SETTINGS: DiagramThemeSettings = {
  theme: "pagina",
  colors: { primary: "", secondary: "", accent: "" },
};

let settings: DiagramThemeSettings = loadSettings();
/** Incrémenté à chaque changement — les rendus comparent cette valeur
 * pour savoir s'ils doivent ré-appliquer la config Mermaid. */
let version = 0;
const listeners = new Set<() => void>();

/** Charge les réglages persistés — silencieux si absents/corrompus. */
function loadSettings(): DiagramThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<DiagramThemeSettings>;
    const colors = (parsed.colors ?? {}) as Partial<DiagramColors>;
    const theme = DIAGRAM_THEMES.some((t) => t.id === parsed.theme)
      ? (parsed.theme as DiagramThemeId)
      : DEFAULT_SETTINGS.theme;
    const asColor = (v: unknown): string => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : "");
    return {
      theme,
      colors: {
        primary: asColor(colors.primary),
        secondary: asColor(colors.secondary),
        accent: asColor(colors.accent),
      },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persiste les réglages — silencieux si localStorage indisponible. */
function persistSettings(value: DiagramThemeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* localStorage indisponible : réglages vivants mais non persistés. */
  }
}

/** Lit le thème courant des diagrammes (API isolée pour la phase .xmd). */
function getDiagramTheme(): DiagramThemeSettings {
  return settings;
}

/** Modifie le thème et/ou les couleurs personnalisées (persisté). */
export function setDiagramTheme(patch: Partial<DiagramThemeSettings>): void {
  settings = {
    theme: patch.theme ?? settings.theme,
    colors: { ...settings.colors, ...(patch.colors ?? {}) },
  };
  version += 1;
  persistSettings(settings);
  listeners.forEach((l) => l());
}

/** Version courante — change à chaque setDiagramTheme. */
export function diagramThemeVersion(): number {
  return version;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/** Hook React : réglages de thème réactifs (re-render au changement). */
export function useDiagramTheme(): DiagramThemeSettings {
  return useSyncExternalStore(subscribe, getDiagramTheme, getDiagramTheme);
}

/* ------------------------------------------------------------------ */
/* Traduction vers la config Mermaid                                   */
/* ------------------------------------------------------------------ */

/** Palette « Pagina » (charte MBEF — voir ui/theme/tokens.ts) pour les
 * 12 parts de camembert : tons MOYEN-FONCÉS uniquement — le texte des
 * parts est blanc (pieSectionText), chaque part doit donc rester
 * lisible dessous (contraste vérifié sur les 7 types en tests). */
const PAGINA_PIE_PALETTE = [
  "#003f2b", "#1d6b4d", "#24698e", "#eb5b1f",
  "#b9450f", "#2f52a0", "#00503a", "#8a5a00",
  "#8a3d2a", "#4d6b57", "#6b4d8a", "#3d6b8a",
];

/** Mélange une couleur hexadécimale vers le blanc (amount > 0) ou le
 * noir (amount < 0), sans dépendance — utilisé pour décliner les
 * couleurs personnalisées en 12 parts de camembert lisibles. */
function shade(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => {
    const target = amount >= 0 ? 255 : 0;
    const k = Math.abs(amount);
    return Math.round(c + (target - c) * k);
  };
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Luminance relative approximative d'une couleur hex (0 = noir,
 * 1 = blanc) — base du choix automatique de la couleur de texte. */
function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Couleur de texte lisible SUR une couleur de fond (charbon si le fond
 *  est clair, blanc s'il est foncé) — même comportement que Word qui
 *  garde le texte lisible quand on change la couleur de remplissage. */
function contrastText(hex: string): string {
  return luminance(hex) > 0.55 ? "#343334" : "#ffffff";
}

/** Couleurs de surcharge du thème « Pagina » — sur le socle « neutral »
 * (le plus lisible sur les 7 types de diagramme), teinté charte MBEF. */
const PAGINA_THEME_VARIABLES: Record<string, string> = {
  fontFamily: "Arial, sans-serif",
  primaryColor: "#e8f4ee",
  primaryBorderColor: "#003f2b",
  primaryTextColor: "#343334",
  secondaryColor: "#fdf3dc",
  secondaryBorderColor: "#c99b3f",
  secondaryTextColor: "#343334",
  tertiaryColor: "#dfeff8",
  tertiaryBorderColor: "#2f52a0",
  tertiaryTextColor: "#343334",
  lineColor: "#24ac6e",
  textColor: "#343334",
  /* Gantt : barres, sections, jalons, ligne « aujourd'hui ». */
  taskBkgColor: "#d9ece2",
  taskBorderColor: "#003f2b",
  taskTextColor: "#343334",
  activeTaskBkgColor: "#c3e6d3",
  activeTaskBorderColor: "#24ac6e",
  doneTaskBkgColor: "#e4e4e2",
  doneTaskBorderColor: "#8a8a8a",
  critBkgColor: "#fdf3dc",
  critBorderColor: "#eb5b1f",
  todayLineColor: "#eb5b1f",
  sectionBkgColor: "#f0f0ee",
  altSectionBkgColor: "#e8e8e6",
  /* Séquence : acteurs, notes, boîtes de label. */
  actorBkg: "#e8f4ee",
  actorBorder: "#003f2b",
  noteBkgColor: "#fdf3dc",
  noteBorderColor: "#c99b3f",
  labelBoxBkgColor: "#dfeff8",
  labelBoxBorderColor: "#2f52a0",
  /* Camembert : les 12 parts, titre et libellés. */
  ...Object.fromEntries(PAGINA_PIE_PALETTE.map((c, i) => [`pie${i + 1}`, c])),
  pieTitleText: "#343334",
  pieSectionText: "#ffffff",
  pieOuterStrokeColor: "#ffffff",
};

/** Thèmes internes Mermaid utilisés (union du type officiel MermaidConfig,
 *  sans importer la bibliothèque dans ce module — le rendu consomme la
 *  config via mermaid.initialize). */
export type MermaidBuiltInTheme = "default" | "neutral" | "dark" | "forest";

/** Construit la config Mermaid (thème + variables) pour le rendu courant :
 *  thème choisi + surcharges « Pagina » si sélectionné + surcharges des
 *  couleurs personnalisées par-dessus, quel que soit le thème. À passer
 *  à mermaid.initialize() avant chaque rendu (voir la version collée
 *  par diagramThemeVersion pour ne ré-initialiser qu'au changement). */
export function buildMermaidConfig(): { theme: MermaidBuiltInTheme; themeVariables: Record<string, string> } {
  const { theme, colors } = settings;
  let config: { theme: MermaidBuiltInTheme; themeVariables: Record<string, string> };
  switch (theme) {
    case "pagina":
      /* « neutral » en socle (lisibilité éprouvée sur les 7 types),
       * teinté MBEF par-dessus. */
      config = { theme: "neutral", themeVariables: { ...PAGINA_THEME_VARIABLES } };
      break;
    case "clair":
      config = { theme: "default", themeVariables: { fontFamily: "Arial, sans-serif" } };
      break;
    case "sombre":
      config = { theme: "dark", themeVariables: { fontFamily: "Arial, sans-serif" } };
      break;
    case "foret":
      config = { theme: "forest", themeVariables: { fontFamily: "Arial, sans-serif" } };
      break;
    case "neutre":
    default:
      config = { theme: "neutral", themeVariables: { fontFamily: "Arial, sans-serif" } };
      break;
  }
  /* Surcharges personnalisées — par-dessus TOUT thème, variables par
   * type de diagramme pour que la couleur se voie sur les 7 types.
   * Le TEXTE sur fond personnalisé est choisi par luminance (comme
   * Word) : charbon sur fond clair, blanc sur fond foncé. */
  const custom: Record<string, string> = {};
  if (colors.primary) {
    const onPrimary = contrastText(colors.primary);
    custom.primaryColor = colors.primary;
    custom.primaryTextColor = onPrimary;
    custom.mainBkg = colors.primary; // organigramme / état
    custom.nodeBkg = colors.primary; // classes / état
    custom.actorBkg = colors.primary; // séquence
    custom.taskBkgColor = colors.primary; // Gantt
    custom.taskTextColor = onPrimary;
    custom.actorTextColor = onPrimary;
    custom.pieSectionText = onPrimary;
  }
  if (colors.secondary) {
    custom.secondaryColor = colors.secondary;
    /* Le moteur ignore attributeBackgroundColorOdd/Even en v11 : la
     * surface secondaire des ENTITÉS-RELATIONS passe par le DÉGRADÉ
     * des boîtes (gradientStop = secondaryBorderColor), et les
     * sous-graphes d'organigramne par clusterBkg. */
    custom.secondaryBorderColor = colors.secondary;
    custom.clusterBkg = colors.secondary;
    custom.noteBkgColor = colors.secondary; // notes de séquence
    custom.labelBoxBkgColor = colors.secondary; // boîtes alt/opt
    custom.sectionBkgColor = colors.secondary; // sections Gantt
    custom.altSectionBkgColor = shade(colors.secondary, 0.25);
    custom.doneTaskBkgColor = colors.secondary;
  }
  if (colors.accent) {
    custom.lineColor = colors.accent; // flèches de tout le monde
    custom.primaryBorderColor = colors.accent; // bordures des nœuds
    custom.actorBorder = colors.accent;
    custom.taskBorderColor = colors.accent;
    custom.signalColor = colors.accent; // flèches + texte de séquence
    custom.signalTextColor = colors.accent;
    custom.edgeLabelBackground = "#ffffff";
    custom.pieOuterStrokeColor = "#ffffff";
  }
  /* Camembert personnalisé : 12 parts déclinées des couleurs choisies
   * (cycle primaire/secondaire/accent, éclaircies par paliers bornés
   * pour garder le texte lisible). Sans couleur perso, la palette du
   * thème (Pagina ou interne Mermaid) reste utilisée. */
  if (colors.primary || colors.secondary || colors.accent) {
    const bases = [
      colors.primary || PAGINA_PIE_PALETTE[0],
      colors.secondary || PAGINA_PIE_PALETTE[1],
      colors.accent || PAGINA_PIE_PALETTE[2],
    ];
    for (let i = 0; i < 12; i++) {
      const lightening = Math.floor(i / 3) * 0.12;
      custom[`pie${i + 1}`] = shade(bases[i % 3], lightening);
    }
  }
  return { theme: config.theme, themeVariables: { ...config.themeVariables, ...custom } };
}
