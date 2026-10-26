/**
 * Dialogues de saisie PROMESSES (remplacent `window.prompt`, 2026-10-26) : `askText` / `askForm` s'appellent de
 * n'importe où (éditeur, mini-barre, barre de titre) sans faire passer de props ; `PromptHost`, monté une fois à la
 * racine (App, PaginaLight), affiche la demande courante. `window.prompt` marche dans WebView2 mais bloque toute la
 * fenêtre, ne se met pas à la charte, ne valide rien et échoue en silence dans certains contextes.
 */
import { create } from "zustand";

export interface PromptField {
  key: string;
  label: string;
  initial?: string;
  placeholder?: string;
  /** Valeurs proposées (liste déroulante de suggestions, saisie libre possible). */
  suggestions?: string[];
}

export interface PromptRequest {
  title: string;
  message?: string;
  fields: PromptField[];
  okLabel: string;
  /** Retourne un message d'erreur (le dialogue reste ouvert) ou null si les valeurs sont valides. */
  validate?: (values: Record<string, string>) => string | null;
  resolve: (values: Record<string, string> | null) => void;
}

interface PromptState {
  request: PromptRequest | null;
  open: (request: PromptRequest) => void;
  close: () => void;
}

export const usePromptStore = create<PromptState>((set, get) => ({
  request: null,
  open: (request) => {
    // Une demande encore ouverte est annulée plutôt que laissée en suspens.
    get().request?.resolve(null);
    set({ request });
  },
  close: () => set({ request: null }),
}));

/** Ouvre un dialogue à plusieurs champs ; `null` si l'utilisateur annule. */
export function askForm(options: Omit<PromptRequest, "resolve">): Promise<Record<string, string> | null> {
  return new Promise((resolve) => usePromptStore.getState().open({ ...options, resolve }));
}

/** Ouvre un dialogue à UN champ ; `null` si l'utilisateur annule, sinon le texte saisi (éventuellement vide). */
export async function askText(options: {
  title: string;
  label: string;
  initial?: string;
  placeholder?: string;
  message?: string;
  okLabel?: string;
  validate?: (value: string) => string | null;
}): Promise<string | null> {
  const values = await askForm({
    title: options.title,
    message: options.message,
    okLabel: options.okLabel ?? "OK",
    fields: [{ key: "value", label: options.label, initial: options.initial, placeholder: options.placeholder }],
    validate: options.validate ? (v) => options.validate!(v.value) : undefined,
  });
  return values ? values.value : null;
}
