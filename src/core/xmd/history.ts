/**
 * Historique des révisions du format `.xmd` (2026-10-27, roadmap 5.3/5.4 —
 * modèle adapté de CasualOffice `VersionHistoryPanel` : une liste
 * d'INSTANTANÉS du document, la plus récente en premier). La liste vit dans
 * `history.json` du conteneur — JAMAIS dans le Markdown.
 *
 * - Chaque ENREGISTREMENT d'un `.xmd` ajoute une révision AUTOMATIQUE si le
 *  contenu a changé depuis la précédente (comme les instantanés de Casual,
 *  capturés à la sauvegarde).
 * - « Enregistrer une version nommée » ajoute un instantané étiqueté (le
 *  bouton ne fait que NOMMER, modèle Google Docs).
 * - Chaque révision embarque le `document.md` COMPLET (config comprise) :
 *  restaurer = remplacer le contenu de l'onglet par cet instantané. La liste
 *  est plafonnée (MAX_REVISIONS) : les plus vieilles révisions AUTOMATIQUES
 *  sautent en premier, les versions NOMMÉES sont conservées plus longtemps.
 *
 * Pur : aucun import de React/Tiptap.
 */

/** Une révision = un instantané complet du document à un instant donné. */
export interface Revision {
  id: string;
  /** `null` = révision automatique (enregistrée à la sauvegarde). */
  label: string | null;
  author: string;
  savedAt: string;
  /** `document.md` complet (commentaire de config compris). */
  markdown: string;
}

/** Contenu de `history.json`. */
export interface HistoryFile {
  version: 1;
  revisions: Revision[];
}

/** Plafond : au-delà, les plus vieilles révisions AUTOMATIQUES sautent
 *  d'abord (une liste nommée ne compte que si tout est nommé). */
export const MAX_REVISIONS = 25;

function newRevisionId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Relit `history.json` — tolérant : absent/corrompu = liste vide. */
export function parseHistory(raw: string): HistoryFile {
  const out: HistoryFile = { version: 1, revisions: [] };
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as { revisions?: unknown };
    if (!Array.isArray(parsed.revisions)) return out;
    for (const r of parsed.revisions) {
      if (!r || typeof r !== "object") continue;
      const e = r as Record<string, unknown>;
      if (typeof e.markdown !== "string") continue;
      out.revisions.push({
        id: typeof e.id === "string" && e.id ? e.id : newRevisionId(),
        label: typeof e.label === "string" && e.label ? e.label : null,
        author: typeof e.author === "string" ? e.author : "",
        savedAt: typeof e.savedAt === "string" ? e.savedAt : "",
        markdown: e.markdown,
      });
    }
  } catch {
    return out;
  }
  return out;
}

/** Écrit `history.json`. */
export function serializeHistory(file: HistoryFile): string {
  return JSON.stringify(file);
}

/** Applique le plafond : retire d'abord les plus vieilles révisions sans
 *  étiquette ; ne touche jamais les 3 plus récentes. */
function cap(revisions: Revision[]): Revision[] {
  if (revisions.length <= MAX_REVISIONS) return revisions;
  const excess = revisions.length - MAX_REVISIONS;
  const out: Revision[] = [];
  let toDrop = excess;
  // `revisions` est ANCienne→récente : on parcourt du plus vieux en laissant
  // les 3 dernières intouchables.
  for (let i = 0; i < revisions.length; i++) {
    const r = revisions[i];
    const isProtectedRecent = i >= revisions.length - 3;
    if (!isProtectedRecent && toDrop > 0 && r.label === null) {
      toDrop--;
      continue;
    }
    out.push(r);
  }
  return out;
}

/** Ajoute une révision (la plus récente en FIN de liste). Ne fait RIEN si le
 *  contenu est identique à la dernière révision — sauf si `label` est donné
 *  (nommer crée toujours une entrée, même sans changement). */
export function appendRevision(file: HistoryFile, markdown: string, author: string, label: string | null): HistoryFile {
  const last = file.revisions[file.revisions.length - 1];
  if (label === null && last && last.markdown === markdown) return file;
  const revisions = cap([
    ...file.revisions,
    { id: newRevisionId(), label, author, savedAt: new Date().toISOString(), markdown },
  ]);
  return { version: 1, revisions };
}

/** Version AFFICHABLE d'une révision (« Enregistrée automatiquement » si sans nom). */
export function revisionLabel(r: Revision): string {
  return r.label ?? "Enregistrée automatiquement";
}

/** Taille affichable (ko). */
export function revisionSize(r: Revision): string {
  const ko = r.markdown.length / 1024;
  return ko >= 1024 ? `${(ko / 1024).toFixed(1)} Mo` : `${ko.toFixed(1)} ko`;
}
