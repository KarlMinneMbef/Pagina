/**
 * Fenêtre « Paramétrage » (roadmap 1.4, 2026-10-21) — les préférences
 * GLOBALES de l'application, l'équivalent de « Fichier > Options » de
 * Word. À la différence des dialogues de mise en page (Propriétés,
 * Mise en page, Paragraphe), rien d'ici n'est enregistré dans le
 * document : tout vit dans le store settingsStore (localStorage).
 *
 * Sections :
 * - Affichage : montrer/masquer les règles graduées (roadmap 1.2, qui
 *   dépendait de cette fenêtre pour exister).
 * - Interface : langue et thème — proposés mais VERROUILLÉS pour
 *   l'instant (français/clair sont les seules valeurs existantes) ;
 *   les débloquer se fera avec le thème sombre et l'i18n, sans changer
 *   cette fenêtre.
 * - Édition : correction automatique — verrouillée aussi (roadmap 4.3 :
 *   guillemets intelligents… ; le spellcheck natif du navigateur reste
 *   DÉSACTIVÉ sur l'éditeur invisible, voir CLAUDE.md).
 * - Sauvegarde : auto-sauvegarde de l'onglet actif + intervalle.
 *
 * Application IMMÉDIATE à la validation (bouton OK) : le store est le
 * même que celui que lisent App/MarkdownEditor, donc aucun rechargement
 * n'est nécessaire.
 */
import { useState } from "react";
import { useSettingsStore, AUTO_SAVE_INTERVALS_SEC } from "../../core/store/settingsStore";
import "./SettingsDialog.css";

/** Libellé d'un intervalle d'auto-sauvegarde (« 1 min », « 2 min »…). */
function intervalLabel(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const min = sec / 60;
  return `${min} min`;
}

/** Fenêtre Paramétrage : préférences globales de l'application. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore();
  // Brouillon local : rien n'est appliqué avant OK (même ergonomie que
  // les autres dialogues de l'app — Annuler repart sans rien changer).
  const [showRulers, setShowRulers] = useState(settings.showRulers);
  const [spellcheck, setSpellcheck] = useState(settings.spellcheck);
  const [autoSave, setAutoSave] = useState(settings.autoSave);
  const [autoSaveIntervalSec, setAutoSaveIntervalSec] = useState(settings.autoSaveIntervalSec);

  const handleApply = () => {
    settings.setShowRulers(showRulers);
    settings.setSpellcheck(spellcheck);
    settings.setAutoSave(autoSave);
    settings.setAutoSaveIntervalSec(autoSaveIntervalSec);
    onClose();
  };

  return (
    <div className="st-overlay" onMouseDown={onClose}>
      <div className="st-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="st-header">
          <span>Paramétrage</span>
          <button className="st-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>

        <div className="st-body">
          <section className="st-section">
            <h4 className="st-section-title">Affichage</h4>
            <label className="st-check">
              <input
                type="checkbox"
                checked={showRulers}
                onChange={(e) => setShowRulers(e.target.checked)}
              />
              Afficher les règles graduées (horizontale et verticale)
            </label>
          </section>

          <section className="st-section">
            <h4 className="st-section-title">Interface</h4>
            <div className="st-row">
              <label className="st-field">
                <span>Langue :</span>
                <select value="fr" disabled title="Autres langues à venir">
                  <option value="fr">Français</option>
                </select>
              </label>
              <label className="st-field">
                <span>Thème :</span>
                <select value="clair" disabled title="Thème sombre à venir">
                  <option value="clair">Clair</option>
                </select>
              </label>
            </div>
          </section>

          <section className="st-section">
            <h4 className="st-section-title">Édition</h4>
            <label className="st-check" title="Souligne en rouge les mots inconnus du dictionnaire ; clic droit pour corriger, ignorer ou ajouter au dictionnaire">
              <input type="checkbox" checked={spellcheck} onChange={(e) => setSpellcheck(e.target.checked)} />
              Correction orthographique (français)
            </label>
            <label className="st-check" title="Guillemets intelligents, majuscule en début de phrase… (à venir)">
              <input type="checkbox" checked={false} disabled />
              Correction automatique (à venir)
            </label>
          </section>

          <section className="st-section">
            <h4 className="st-section-title">Sauvegarde</h4>
            <label className="st-check">
              <input
                type="checkbox"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
              />
              Auto-enregistrer le document en cours de modification
            </label>
            <div className="st-row">
              <label className="st-field">
                <span>Intervalle :</span>
                <select
                  value={autoSaveIntervalSec}
                  disabled={!autoSave}
                  onChange={(e) => setAutoSaveIntervalSec(Number(e.target.value))}
                  title="Délai entre deux enregistrements automatiques"
                >
                  {AUTO_SAVE_INTERVALS_SEC.map((sec) => (
                    <option key={sec} value={sec}>
                      {intervalLabel(sec)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>

        <div className="st-actions">
          <span className="st-actions-spacer" />
          <button className="st-btn st-btn-primary" onClick={handleApply}>
            OK
          </button>
          <button className="st-btn" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
