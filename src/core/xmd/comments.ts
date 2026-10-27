/**
 * Commentaires de relecture du format `.xmd` (2026-10-27, roadmap 5.2 — modèle
 * adapté de CasualOffice : marque surlignée dans le document + liste de
 * commentaires avec réponses et résolution). Le CONTENU des commentaires vit
 * dans `comments.json` du conteneur — JAMAIS dans le Markdown ; seule
 * l'ANCRE vit dans le texte, comme repli HTML discret (voir CommentMark.ts),
 * pour que le surlignage survive aux éditions.
 *
 * Pur : aucun import de React/Tiptap — utilisé par le store d'onglets
 * (persistance), les panneaux (UI) et les tests.
 */

/** Une réponse dans un fil de commentaire. */
export interface CommentReply {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

/** Un commentaire de relecture, ancré sur un passage du texte. */
export interface DocComment {
  /** Identifiant (aussi porté par la marque dans le document). */
  id: string;
  /** Extrait cité au moment de la création (repère lisible si l'ancre disparaît). */
  quote: string;
  author: string;
  text: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt: string | null;
  replies: CommentReply[];
}

/** Contenu de `comments.json`. */
export interface CommentsFile {
  version: 1;
  comments: DocComment[];
}

/** Identifiant court et stable (pref + base 36 du temps + aléa). */
export function newCommentId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Relit `comments.json` — tolérant : fichier absent/corrompu = liste vide,
 *  champs manquants complétés (jamais d'erreur sur un fichier ancien). */
export function parseComments(raw: string): CommentsFile {
  const out: CommentsFile = { version: 1, comments: [] };
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as { comments?: unknown };
    if (!Array.isArray(parsed.comments)) return out;
    for (const c of parsed.comments) {
      if (!c || typeof c !== "object") continue;
      const e = c as Record<string, unknown>;
      const id = typeof e.id === "string" && e.id ? e.id : newCommentId();
      const replies: CommentReply[] = Array.isArray(e.replies)
        ? (e.replies as Record<string, unknown>[])
            .filter((r) => r && typeof r.text === "string")
            .map((r) => ({
              id: typeof r.id === "string" && r.id ? r.id : newCommentId(),
              author: typeof r.author === "string" ? r.author : "",
              text: String(r.text ?? ""),
              createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
            }))
        : [];
      out.comments.push({
        id,
        quote: typeof e.quote === "string" ? e.quote : "",
        author: typeof e.author === "string" ? e.author : "",
        text: typeof e.text === "string" ? e.text : "",
        createdAt: typeof e.createdAt === "string" ? e.createdAt : "",
        resolved: e.resolved === true,
        resolvedAt: typeof e.resolvedAt === "string" ? e.resolvedAt : null,
        replies,
      });
    }
  } catch {
    return out;
  }
  return out;
}

/** Écrit `comments.json` (stable : retrait des indentations superflues). */
export function serializeComments(file: CommentsFile): string {
  return JSON.stringify(file);
}
