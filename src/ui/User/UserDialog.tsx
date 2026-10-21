/**
 * Fenêtre « Utilisateur » (roadmap 1.5, V1, 2026-10-21) — prénom et nom
 * de l'utilisateur local, affichés en initiales dans l'avatar de la barre
 * de titre. V1 est VOLONTAIREMENT minimale : pas de mot de passe, pas de
 * connexion — la V2 branchera le serveur MBEF pour l'authentification
 * Ingenerix (ne jamais implémenter ici, le store reste localStorage).
 *
 * Stockage : store userStore (localStorage `pagina.user`), jamais dans
 * les documents.
 */
import { useState } from "react";
import { useUserStore } from "../../core/store/settingsStore";
import "./UserDialog.css";

/** Fenêtre Utilisateur V1 : prénom + nom (avatar et métadonnées). */
export function UserDialog({ onClose }: { onClose: () => void }) {
  const { firstName, lastName, setName } = useUserStore();
  // Brouillon local : rien n'est appliqué avant OK.
  const [draftFirstName, setDraftFirstName] = useState(firstName);
  const [draftLastName, setDraftLastName] = useState(lastName);

  const handleApply = () => {
    setName(draftFirstName, draftLastName);
    onClose();
  };

  return (
    <div className="usr-overlay" onMouseDown={onClose}>
      <div className="usr-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="usr-header">
          <span>Utilisateur</span>
          <button className="usr-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>

        <div className="usr-body">
          <p className="usr-note">
            Ces informations identifient l'utilisateur local de cette installation (avatar
            de la barre de titre). La connexion au serveur MBEF arrivera dans une
            version ultérieure.
          </p>
          <label className="usr-field">
            <span>Prénom :</span>
            <input
              type="text"
              value={draftFirstName}
              onChange={(e) => setDraftFirstName(e.target.value)}
              placeholder="Prénom"
            />
          </label>
          <label className="usr-field">
            <span>Nom :</span>
            <input
              type="text"
              value={draftLastName}
              onChange={(e) => setDraftLastName(e.target.value)}
              placeholder="Nom"
            />
          </label>
        </div>

        <div className="usr-actions">
          <span className="usr-actions-spacer" />
          <button className="usr-btn usr-btn-primary" onClick={handleApply}>
            OK
          </button>
          <button className="usr-btn" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
