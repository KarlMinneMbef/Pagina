/**
 * Panneau « Historique » (format .xmd, roadmap 5.3/5.4 — modèle adapté de
 * CasualOffice `VersionHistoryPanel` : une liste d'instantanés, la plus
 * récente en premier, « Enregistrer une version nommée » pour étiqueter) :
 * chaque enregistrement d'un `.xmd` ajoute une révision automatique quand
 * le contenu a changé (voir core/xmd/history.ts) ; une version se
 * RESTAURE (le contenu de l'onglet est remplacé, l'onglet passe « modifié »
 * — rien n'est perdu avant enregistrement), se renomme ou se supprime.
 */
import { PanelHeader } from "../ContextualPanels/PanelHeader";
import { revisionLabel, revisionSize, type Revision } from "../../core/xmd/history";
import "./HistoryPanel.css";

/** Date affichée : « 27/10/2026 14:05 ». */
function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function HistoryPanel({
  revisions,
  onSaveNamed,
  onRestore,
  onCompare,
  onRename,
  onDelete,
  onClose,
}: {
  /** Révisions, les plus récentes EN PREMIER. */
  revisions: Revision[];
  /** « Enregistrer une version nommée » (instantané du contenu courant). */
  onSaveNamed: () => void;
  /** Restaure une révision (demande confirmation dans l'appelant). */
  onRestore: (id: string) => void;
  /** Ouvre la fenêtre « Comparaison de versions » (révision ↔ contenu actuel). */
  onCompare: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="hi-panel">
      <PanelHeader
        title="Historique"
        chip={revisions.length > 0 ? `${revisions.length}` : "—"}
        onClose={onClose}
        closeTitle="Fermer le panneau"
      />
      <div className="hi-body">
        <button type="button" className="hi-named" title="Ajoute un instantané du document ACTUEL à l'historique" onClick={onSaveNamed}>
          ＋ Enregistrer une version nommée…
        </button>

        {revisions.length === 0 && (
          <p className="hi-empty">
            Aucune version pour l'instant. Chaque enregistrement du fichier ajoute automatiquement une révision.
          </p>
        )}

        {revisions.map((r, index) => (
          <article key={r.id} className={`hi-card${index === 0 ? " hi-card-current" : ""}`}>
            <div className="hi-head">
              <span className="hi-label">{revisionLabel(r)}</span>
              <span className="hi-size">{revisionSize(r)}</span>
            </div>
            <div className="hi-meta">
              {r.author && <span className="hi-author">{r.author}</span>}
              <span className="hi-date">{formatDate(r.savedAt)}</span>
              {index === 0 && <span className="hi-current-tag">la plus récente</span>}
            </div>
            <div className="hi-actions">
              <button type="button" className="hi-action" onClick={() => onCompare(r.id)} title="Ce qui a changé entre cette version et le document actuel">
                Comparer
              </button>
              <button type="button" className="hi-action hi-restore" onClick={() => onRestore(r.id)}>
                Restaurer
              </button>
              <button type="button" className="hi-action" onClick={() => onRename(r.id)}>
                Renommer
              </button>
              <button type="button" className="hi-action hi-danger" onClick={() => onDelete(r.id)}>
                Supprimer
              </button>
            </div>
          </article>
        ))}

        <p className="hi-hint">
          <strong>Comparer</strong> montre, mot par mot, ce qui sépare une version du document actuel.
          <strong> Restaurer</strong> remplace le contenu de l'onglet par l'instantané (la confirmation chiffre la
          différence) ; l'onglet passe « modifié » — enregistrez pour l'appliquer au fichier. La version remplacée
          reste dans l'historique : rien n'est perdu.
        </p>
      </div>
    </div>
  );
}
