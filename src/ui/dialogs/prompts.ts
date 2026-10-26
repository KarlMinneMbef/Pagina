/**
 * Les dialogues de saisie PRÉCIS de l'application (lien, signet, renvoi, nouveau fichier) — libellés et validations
 * au même endroit, appelés par le ruban, la mini-barre et la barre de titre.
 */
import { askForm, askText } from "./promptStore";

/** Caractères interdits dans un nom de fichier Windows. */
const INVALID_FILE_CHARS = /[\\/:*?"<>|]/;

/** URL d'un lien : `null` = annulé, `""` = retirer le lien. */
export function askLinkUrl(previous?: string): Promise<string | null> {
  return askText({
    title: "Lien hypertexte",
    label: "Adresse du lien (laisser vide pour retirer le lien) :",
    initial: previous ?? "https://",
    placeholder: "https://…",
    okLabel: "Appliquer",
  });
}

/** Nom d'un signet à poser à la position du curseur : `null` = annulé. */
export function askBookmarkName(): Promise<string | null> {
  return askText({
    title: "Signet",
    label: "Nom du signet :",
    message: "Le signet est une ancre invisible posée à cette position ; un renvoi pourra y mener.",
    initial: "signet",
    okLabel: "Insérer",
    validate: (v) => (v.trim() ? null : "Le nom ne peut pas être vide."),
  });
}

/** Renvoi vers un signet : signet visé (liste des signets existants proposée) + texte affiché. */
export async function askCrossReference(bookmarks: string[]): Promise<{ target: string; label: string } | null> {
  const values = await askForm({
    title: "Renvoi",
    message: bookmarks.length > 0 ? undefined : "Aucun signet dans ce document : posez d'abord un signet (Insertion > Signet).",
    okLabel: "Insérer",
    fields: [
      { key: "target", label: "Signet visé :", initial: bookmarks[0] ?? "signet", suggestions: bookmarks },
      { key: "label", label: "Texte affiché pour le renvoi (vide = nom du signet) :", initial: "" },
    ],
    validate: (v) => (v.target.trim() ? null : "Indiquez le signet visé."),
  });
  return values ? { target: values.target.trim(), label: values.label.trim() } : null;
}

/** Nom d'un nouveau fichier (barre de titre) : `null` = annulé. */
export function askNewFileName(): Promise<string | null> {
  return askText({
    title: "Nouveau document",
    label: "Nom du fichier :",
    initial: "Nouveau document.md",
    okLabel: "Créer",
    validate: (v) => {
      const n = v.trim();
      if (!n) return "Le nom ne peut pas être vide.";
      if (INVALID_FILE_CHARS.test(n)) return 'Caractères interdits dans un nom de fichier : \\ / : * ? " < > |';
      return null;
    },
  });
}
