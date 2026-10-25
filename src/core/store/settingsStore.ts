/**
 * Réglages GLOBAUX de l'application (roadmap 1.4) et profil UTILISATEUR
 * (roadmap 1.5, V1) — tout ce qui ne dépend PAS d'un document en
 * particulier, contrairement à la mise en page (`pagina:config` dans le
 * .md). Persistés dans localStorage (clés `pagina.settings` /
 * `pagina.user`), même mécanisme silencieux que `pagina.defaultPageLayout`
 * (voir core/pageLayout.ts) : localStorage indisponible = réglages par
 * défaut, sans crash.
 *
 * Ce fichier ne contient AUCUNE logique applicative : les composants
 * lisent/écrivent ces stores, l'effet d'auto-sauvegarde vit dans App.tsx.
 */
import { create } from "zustand";

/** Réglages proposés pour l'intervalle d'auto-sauvegarde, en secondes. */
export const AUTO_SAVE_INTERVALS_SEC = [30, 60, 120, 300] as const;

/** État des réglages globaux de l'application (fenêtre Paramétrage). */
interface SettingsState {
  /** Afficher les règles graduées horizontale/verticale (roadmap 1.2 —
   * dépendait de cette fenêtre pour exister). */
  showRulers: boolean;
  /** Auto-sauvegarde de l'onglet actif (seulement s'il est modifié). */
  autoSave: boolean;
  /** Intervalle d'auto-sauvegarde, en secondes (voir AUTO_SAVE_INTERVALS_SEC). */
  autoSaveIntervalSec: number;
  /** Correction orthographique (soulignement rouge + suggestions au clic droit). */
  spellcheck: boolean;
  /** Langue du dictionnaire (code de `spell_languages` côté Rust) — « fr » pour l'instant. */
  spellLanguage: string;
  setShowRulers: (value: boolean) => void;
  setSpellcheck: (value: boolean) => void;
  setAutoSave: (value: boolean) => void;
  setAutoSaveIntervalSec: (value: number) => void;
}

const SETTINGS_STORAGE_KEY = "pagina.settings";

const DEFAULT_SETTINGS = {
  showRulers: true,
  autoSave: false,
  autoSaveIntervalSec: 60,
  spellcheck: true,
  spellLanguage: "fr",
};

/** Charge les réglages persistés — silencieux si absents/corrompus. */
function loadSettings(): typeof DEFAULT_SETTINGS {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<typeof DEFAULT_SETTINGS>;
    return {
      showRulers: typeof parsed.showRulers === "boolean" ? parsed.showRulers : DEFAULT_SETTINGS.showRulers,
      autoSave: typeof parsed.autoSave === "boolean" ? parsed.autoSave : DEFAULT_SETTINGS.autoSave,
      autoSaveIntervalSec:
        typeof parsed.autoSaveIntervalSec === "number" && AUTO_SAVE_INTERVALS_SEC.includes(parsed.autoSaveIntervalSec as never)
          ? parsed.autoSaveIntervalSec
          : DEFAULT_SETTINGS.autoSaveIntervalSec,
      spellcheck: typeof parsed.spellcheck === "boolean" ? parsed.spellcheck : DEFAULT_SETTINGS.spellcheck,
      spellLanguage: typeof parsed.spellLanguage === "string" && parsed.spellLanguage ? parsed.spellLanguage : DEFAULT_SETTINGS.spellLanguage,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persiste les réglages — silencieux si localStorage indisponible. */
function persistSettings(settings: SettingsState): void {
  try {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        showRulers: settings.showRulers,
        autoSave: settings.autoSave,
        autoSaveIntervalSec: settings.autoSaveIntervalSec,
        spellcheck: settings.spellcheck,
        spellLanguage: settings.spellLanguage,
      })
    );
  } catch {
    /* localStorage indisponible : réglages vivants mais non persistés. */
  }
}

/** Store Zustand des réglages globaux (fenêtre Paramétrage, roadmap 1.4). */
export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...loadSettings(),
  setShowRulers: (value) => {
    set({ showRulers: value });
    persistSettings(get());
  },
  setAutoSave: (value) => {
    set({ autoSave: value });
    persistSettings(get());
  },
  setSpellcheck: (value) => {
    set({ spellcheck: value });
    persistSettings(get());
  },
  setAutoSaveIntervalSec: (value) => {
    set({ autoSaveIntervalSec: value });
    persistSettings(get());
  },
}));

/** Profil utilisateur V1 (roadmap 1.5) : prénom + nom uniquement.
 * V2 (connexion serveur MBEF/Ingenerix) : à venir, jamais branchée ici. */
interface UserState {
  firstName: string;
  lastName: string;
  /** Enregistre le profil complet (chaîne vide = effacé). */
  setName: (firstName: string, lastName: string) => void;
}

const USER_STORAGE_KEY = "pagina.user";

/** Charge le profil persisté — silencieux si absent/corrompu. */
function loadUser(): { firstName: string; lastName: string } {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return { firstName: "", lastName: "" };
    const parsed = JSON.parse(raw) as { firstName?: unknown; lastName?: unknown };
    return {
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
      lastName: typeof parsed.lastName === "string" ? parsed.lastName : "",
    };
  } catch {
    return { firstName: "", lastName: "" };
  }
}

/** Initiales affichées dans l'avatar de la barre de titre (« KM ») —
 * première lettre du prénom + première lettre du nom, « ? » si vide. */
export function userInitials(firstName: string, lastName: string): string {
  const i = (firstName.trim()[0] ?? "") + (lastName.trim()[0] ?? "");
  return i ? i.toUpperCase() : "?";
}

/** Store Zustand du profil utilisateur (fenêtre Utilisateur, roadmap 1.5). */
export const useUserStore = create<UserState>((set) => ({
  ...loadUser(),
  setName: (firstName, lastName) => {
    set({ firstName: firstName.trim(), lastName: lastName.trim() });
    try {
      localStorage.setItem(
        USER_STORAGE_KEY,
        JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() })
      );
    } catch {
      /* localStorage indisponible : profil vivant mais non persisté. */
    }
  },
}));
