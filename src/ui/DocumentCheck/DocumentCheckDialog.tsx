/**
 * Fenêtre « Vérifier le document » (2026-10-26) — liste les problèmes relevés dans
 * le fichier TEL QU'IL EST SUR LE DISQUE (module `core/documentCheck`) et propose de
 * les réparer. Avant toute modification, une copie `nom.avant-reparation-AAAAMMJJ-HHMM.md`
 * est écrite à côté du fichier ; l'onglet est ensuite rechargé.
 *
 * La réparation porte sur le disque : un onglet modifié est enregistré d'abord.
 */
import { useState } from "react";
import { useTabsStore } from "../../core/store/tabsStore";
import "./DocumentCheckDialog.css";

export function DocumentCheckDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const tab = useTabsStore((s) => s.tabs.find((t) => t.path === path));
  const repairTabFile = useTabsStore((s) => s.repairTabFile);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ applied: string[]; backup: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!tab) return null;
  const issues = tab.issues;

  const handleRepair = async () => {
    setBusy(true);
    setError(null);
    try {
      setDone(await repairTabFile(path));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dck-overlay" onMouseDown={onClose}>
      <div className="dck-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dck-header">
          <span>Vérifier le document</span>
          <button className="dck-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>
        <div className="dck-body">
          {done && done.backup && (
            <div className="dck-result">
              <strong>Document réparé</strong> ({done.applied.join(", ")}).
              <br />
              Copie de l'ancienne version : <span className="dck-path">{done.backup}</span>
            </div>
          )}
          {issues.length === 0 ? (
            <p className="dck-ok">✔ Aucun problème détecté dans le fichier « {tab.title} ».</p>
          ) : (
            <>
              <p className="dck-note">
                {issues.length === 1 ? "1 problème" : `${issues.length} problèmes`} dans le fichier « {tab.title} » :
              </p>
              <ul className="dck-list">
                {issues.map((p, i) => (
                  <li key={i} className={`dck-item dck-${p.severity}`}>
                    <span className="dck-badge">{p.severity === "error" ? "Erreur" : "À noter"}</span>
                    <span>
                      {p.message}
                      {p.line ? <span className="dck-line"> (ligne {p.line})</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
              {tab.dirty && (
                <p className="dck-warn">
                  Le document a des modifications non enregistrées : il sera enregistré avant la réparation. Une copie du
                  fichier actuel est faite d'abord.
                </p>
              )}
              {error && <p className="dck-error">{error}</p>}
            </>
          )}
        </div>
        <div className="dck-actions">
          <span className="dck-spacer" />
          {issues.length > 0 && (
            <button className="dck-btn dck-btn-primary" disabled={busy} onClick={handleRepair}>
              {busy ? "Réparation…" : tab.dirty ? "Enregistrer et réparer" : "Réparer"}
            </button>
          )}
          <button className="dck-btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
