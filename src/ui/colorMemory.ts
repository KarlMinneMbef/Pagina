/**
 * Dernières couleurs choisies (texte et surlignage), PARTAGÉES entre le ruban et la
 * mini-barre de sélection (roadmap 2.3, comme Word : le bouton APPLIQUE la dernière
 * couleur, le chevron en choisit une autre). Persistées en localStorage, mêmes clés
 * qu'avant le partage — les couleurs déjà mémorisées sont donc conservées.
 */
import { create } from "zustand";

const TEXT_KEY = "pagina.derniereCouleurTexte";
const HIGHLIGHT_KEY = "pagina.derniereCouleurSurlignage";
const DEFAULT_HIGHLIGHT = "#FFFF00";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* localStorage indisponible : mémoire de session seulement */
  }
}

interface ColorMemoryState {
  /** Dernière couleur de texte choisie (null tant qu'aucune : le bouton ouvre alors le nuancier). */
  lastTextColor: string | null;
  lastHighlightColor: string;
  rememberTextColor: (color: string) => void;
  rememberHighlightColor: (color: string) => void;
}

export const useColorMemory = create<ColorMemoryState>((set) => ({
  lastTextColor: read(TEXT_KEY),
  lastHighlightColor: read(HIGHLIGHT_KEY) ?? DEFAULT_HIGHLIGHT,
  rememberTextColor: (color) => {
    write(TEXT_KEY, color);
    set({ lastTextColor: color });
  },
  rememberHighlightColor: (color) => {
    write(HIGHLIGHT_KEY, color);
    set({ lastHighlightColor: color });
  },
}));
