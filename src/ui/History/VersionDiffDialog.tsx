/**
 * Fenêtre « Comparaison de versions » (2026-10-27, roadmap 5.3) — montre,
 * MOT PAR MOT (voir core/xmd/diff.ts), ce qui sépare une révision de
 * l'historique du CONTENU ACTUEL de l'onglet : ajouts en vert,
 * suppressions barrées en rouge — façon GitHub. Le bouton « Restaurer »
 * refait le même parcours confirmé que le panneau Historique.
 */
import { diffStats, diffStatsLabel, type DiffSegment } from "../../core/xmd/diff";
import "./VersionDiffDialog.css";

export function VersionDiffDialog({
  versionLabel,
  versionDate,
  currentLabel,
  segments,
  mode,
  onRestore,
  onClose,
}: {
  /** Nom de la révision comparée (« Version client », « Enregistrée automatiquement »…). */
  versionLabel: string;
  versionDate: string;
  /** Comment nommer le contenu actuel (« Document actuel »). */
  currentLabel: string;
  segments: DiffSegment[];
  /** `lines` = très gros document, comparaison ligne par ligne. */
  mode: "words" | "lines";
  /** Restaure la version comparée (l'appelant confirme d'abord). */
  onRestore: () => void;
  onClose: () => void;
}) {
  const stats = diffStats(segments);
  const identical = stats.added === 0 && stats.removed === 0;

  return (
    <div className="vdd-overlay" onMouseDown={onClose}>
      <div className="vdd-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="vdd-header">
          <span>Comparaison de versions</span>
          <button className="vdd-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>
        <div className="vdd-body">
          <div className="vdd-versus">
            <div className="vdd-side">
              <span className="vdd-side-name">{versionLabel}</span>
              <span className="vdd-side-date">{versionDate}</span>
            </div>
            <span className="vdd-vs">→</span>
            <div className="vdd-side">
              <span className="vdd-side-name">{currentLabel}</span>
              <span className="vdd-side-date">non enregistré compris</span>
            </div>
          </div>

          <p className={`vdd-stats${identical ? " vdd-stats-ok" : ""}`}>
            {identical ? "Contenu identique." : (
              <>
                <span className="vdd-added">+{stats.added} ajouté{stats.added > 1 ? "s" : ""}</span>
                <span className="vdd-removed">−{stats.removed} supprimé{stats.removed > 1 ? "s" : ""}</span>
                <span className="vdd-stats-words">({diffStatsLabel(stats)})</span>
              </>
            )}
            {mode === "lines" && <span className="vdd-mode">document très volumineux : comparaison ligne par ligne</span>}
          </p>

          <div className="vdd-diff">
            {segments.map((s, i) => {
              if (s.op === "keep") return <span key={i}>{s.text}</span>;
              if (s.op === "remove") return <del key={i}>{s.text}</del>;
              return <ins key={i}>{s.text}</ins>;
            })}
          </div>
        </div>
        <div className="vdd-footer">
          <button type="button" className="vdd-restore" onClick={onRestore}>
            Restaurer cette version…
          </button>
          <button type="button" className="vdd-cancel" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
