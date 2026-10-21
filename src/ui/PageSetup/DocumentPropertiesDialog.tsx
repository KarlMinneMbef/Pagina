/**
 * Fenêtre « Propriétés du document » (roadmap 1.3, 2026-10-21) —
 * l'équivalent de « Fichier > Informations » de Word : Titre, Sujet,
 * Auteur, Version, Mots-clés, Commentaires, dates de création/
 * modification (lecture seule, tenues automatiquement) et champs
 * personnalisés libres.
 *
 * Stockage : le même commentaire `pagina:config` que la mise en page
 * (core/pageLayout.ts, DocumentProperties) — invisible et sans effet de
 * bord dans tout autre outil Markdown. L'AUTEUR et la VERSION restent
 * les champs existants `layout.author`/`layout.documentVersion` (les
 * variables {{author}}/{{version}} des en-têtes/pieds) : la fenêtre les
 * édite au même endroit plutôt que de dupliquer l'information.
 *
 * « Enregistrer » applique le patch au layout via onApply (updateLayout :
 * l'onglet passe à non-enregistré, la sauvegarde écrit le commentaire).
 */
import { useState } from "react";
import type { DocumentCustomProperty, PageLayoutSettings } from "../../core/pageLayout";
import "./DocumentPropertiesDialog.css";

/** Fenêtre Propriétés du document (titre, sujet, auteur, mots-clés, champs
 *  personnalisés) — comme Fichier > Informations de Word. */
export function DocumentPropertiesDialog({
  layout,
  onApply,
  onClose,
}: {
  layout: PageLayoutSettings;
  onApply: (layout: PageLayoutSettings) => void;
  onClose: () => void;
}) {
  const [props, setProps] = useState(layout.documentProperties);
  const [author, setAuthor] = useState(layout.author);
  const [version, setVersion] = useState(layout.documentVersion);

  const setProp = (patch: Partial<typeof props>) => setProps((prev) => ({ ...prev, ...patch }));

  const setCustom = (index: number, patch: Partial<DocumentCustomProperty>) =>
    setProps((prev) => ({
      ...prev,
      custom: prev.custom.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));

  const addCustom = () =>
    setProps((prev) => ({
      ...prev,
      custom: [...prev.custom, { name: "", value: "" }],
    }));

  const removeCustom = (index: number) =>
    setProps((prev) => ({ ...prev, custom: prev.custom.filter((_, i) => i !== index) }));

  const handleApply = () => {
    onApply({
      ...layout,
      author,
      documentVersion: version,
      documentProperties: props,
    });
    onClose();
  };

  return (
    <div className="dp-overlay" onMouseDown={onClose}>
      <div className="dp-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dp-header">
          <span>Propriétés du document</span>
          <button className="dp-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>

        <div className="dp-body">
          <label className="dp-field">
            <span className="dp-label">Titre</span>
            <input type="text" value={props.title} onChange={(e) => setProp({ title: e.target.value })} placeholder="Titre du document" />
          </label>
          <label className="dp-field">
            <span className="dp-label">Sujet</span>
            <input type="text" value={props.subject} onChange={(e) => setProp({ subject: e.target.value })} placeholder="Sujet du document" />
          </label>
          <div className="dp-row">
            <label className="dp-field">
              <span className="dp-label">Auteur (variable {`{{author}}`})</span>
              <input type="text" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Nom de l'auteur" />
            </label>
            <label className="dp-field">
              <span className="dp-label">Version (variable {`{{version}}`})</span>
              <input type="text" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Ex. 1.2" />
            </label>
          </div>
          <label className="dp-field">
            <span className="dp-label">Mots-clés (séparés par des points-virgules)</span>
            <input type="text" value={props.keywords} onChange={(e) => setProp({ keywords: e.target.value })} placeholder="CCTP; plomberie; chantier…" />
          </label>
          <label className="dp-field">
            <span className="dp-label">Commentaires</span>
            <textarea rows={3} value={props.comments} onChange={(e) => setProp({ comments: e.target.value })} placeholder="Remarques sur le document…" />
          </label>
          <div className="dp-row">
            <label className="dp-field">
              <span className="dp-label">Créé le</span>
              <input type="text" value={props.createdDate} readOnly title="Établie au premier enregistrement Pagina du fichier" />
            </label>
            <label className="dp-field">
              <span className="dp-label">Modifié le</span>
              <input type="text" value={props.modifiedDate} readOnly title="Remise à jour à chaque sauvegarde, automatiquement" />
            </label>
          </div>

          <div className="dp-custom">
            <div className="dp-custom-head">
              <span className="dp-label">Champs personnalisés</span>
              <button type="button" className="dp-custom-add" onClick={addCustom}>
                + Ajouter un champ
              </button>
            </div>
            {props.custom.length === 0 && <p className="dp-hint">Champs libres (nom + valeur) — réutilisables plus tard comme variables d'en-tête/pied.</p>}
            {props.custom.map((c, i) => (
              <div className="dp-custom-row" key={i}>
                <input
                  type="text"
                  className="dp-custom-name"
                  value={c.name}
                  placeholder="Nom"
                  onChange={(e) => setCustom(i, { name: e.target.value })}
                />
                <input
                  type="text"
                  className="dp-custom-value"
                  value={c.value}
                  placeholder="Valeur"
                  onChange={(e) => setCustom(i, { value: e.target.value })}
                />
                <button type="button" className="dp-custom-remove" onClick={() => removeCustom(i)} title="Supprimer ce champ">
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="dp-actions">
          <button className="dp-btn" onClick={onClose}>
            Annuler
          </button>
          <button className="dp-btn dp-btn-primary" onClick={handleApply}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
