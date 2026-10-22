/**
 * Galerie « Page de garde » (2026-10-22, refonte zone transparente) — les
 * modèles intégrés (charte MBEF, voir core/coverTemplates.ts) + les types
 * de l'utilisateur (localStorage, exportables/importables en fichiers
 * JSON pour un autre poste). Chaque modèle est inséré au CURSEUR via
 * `onInsert` comme une ZONE page de garde (CoverZone.ts) : deux marqueurs
 * transparents encadrant du CONTENU NORMAL, avec un saut de page
 * optionnel juste après (recommandé pour une vraie page dédiée). Le
 * contenu se réédite ensuite directement sur la page (tout l'éditeur y
 * fonctionne) ; le panneau latéral « Page de garde »
 * (CoverPagePanel.tsx) s'ouvre quand le curseur est dans la zone.
 */
import { useState } from "react";
import {
  BUILTIN_COVER_TEMPLATES,
  COVER_VARIABLES,
  loadUserCoverTemplates,
  addUserCoverTemplate,
  removeUserCoverTemplate,
  parseCoverTemplateFile,
  serializeCoverTemplate,
  type CoverTemplate,
} from "../../core/coverTemplates";
import { pickCoverTemplateFile, pickCoverTemplateSaveLocation, readTextFile, writeTextFile } from "../../persistence/fileService";
import "./CoverGalleryDialog.css";

/** Galerie de pages de garde : modèles intégrés + utilisateur. */
export function CoverGalleryDialog({ onInsert, onClose }: { onInsert: (source: string, addPageBreak: boolean) => void; onClose: () => void }) {
  const [userTemplates, setUserTemplates] = useState<CoverTemplate[]>(() => loadUserCoverTemplates());
  const [selected, setSelected] = useState<{ name: string; source: string } | null>(null);
  const [addPageBreak, setAddPageBreak] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const importModel = async () => {
    try {
      const path = await pickCoverTemplateFile();
      if (!path) return;
      const raw = await readTextFile(path);
      const model = parseCoverTemplateFile(raw);
      if (!model) {
        setStatus("Fichier illisible : ce n'est pas un modèle de page de garde Pagina.");
        return;
      }
      addUserCoverTemplate(model);
      setUserTemplates(loadUserCoverTemplates());
      setStatus(`Modèle « ${model.name} » importé.`);
    } catch {
      setStatus("Échec de l'import du modèle.");
    }
  };

  const exportModel = async (model: CoverTemplate) => {
    try {
      const path = await pickCoverTemplateSaveLocation(`${model.name.replace(/[\\/:*?"<>|]/g, "_")}-page-de-garde.json`);
      if (!path) return;
      await writeTextFile(path, serializeCoverTemplate(model));
      setStatus(`Modèle « ${model.name} » exporté.`);
    } catch {
      setStatus("Échec de l'export du modèle.");
    }
  };

  const removeModel = (name: string) => {
    removeUserCoverTemplate(name);
    setUserTemplates(loadUserCoverTemplates());
    if (selected?.name === name) setSelected(null);
  };

  const insert = () => {
    if (!selected) return;
    onInsert(selected.source, addPageBreak);
    onClose();
  };

  return (
    <div className="cvg-overlay" onMouseDown={onClose}>
      <div className="cvg-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cvg-header">
          <span>Page de garde</span>
          <button className="cvg-close" onClick={onClose} title="Fermer">
            ✕
          </button>
        </div>
        <div className="cvg-body">
          <div className="cvg-cols">
            <div className="cvg-list">
              <h4 className="cvg-list-title">Modèles intégrés</h4>
              {BUILTIN_COVER_TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  className={`cvg-item${selected?.name === t.name ? " cvg-item-active" : ""}`}
                  onClick={() => setSelected(t)}
                >
                  {t.name}
                </button>
              ))}
              <h4 className="cvg-list-title">Mes modèles</h4>
              {userTemplates.length === 0 && <p className="cvg-empty">Aucun modèle enregistré — enregistrez une page de garde depuis son panneau, ou importez un fichier.</p>}
              {userTemplates.map((t) => (
                <div key={t.name} className={`cvg-item-row${selected?.name === t.name ? " cvg-item-active" : ""}`}>
                  <button type="button" className="cvg-item" onClick={() => setSelected(t)}>
                    {t.name}
                  </button>
                  <button type="button" className="cvg-item-tool" title="Exporter ce modèle (fichier JSON réutilisable)" onClick={() => void exportModel(t)}>
                    ↗
                  </button>
                  <button type="button" className="cvg-item-tool cvg-item-danger" title="Supprimer ce modèle" onClick={() => removeModel(t.name)}>
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" className="cvg-import" onClick={() => void importModel()}>
                Importer un modèle…
              </button>
            </div>
            <div className="cvg-preview">
              <div className="cvg-preview-title">Aperçu du modèle</div>
              <div className="cvg-preview-paper">
                {selected ? (
                  <div
                    className="cvg-preview-html"
                    dangerouslySetInnerHTML={{
                      __html: selected.source
                        .split("\n\n")
                        .map((line) =>
                          line
                            .replace(/{{title}}/g, "Titre du document")
                            .replace(/{{subject}}/g, "Sujet du document")
                            .replace(/{{author}}/g, "Auteur")
                            .replace(/{{date}}/g, "JJ/MM/AAAA")
                            .replace(/{{version}}/g, "Version A")
                            .replace(/{{created}}/g, "JJ/MM/AAAA")
                            .replace(/{{modified}}/g, "JJ/MM/AAAA")
                            .replace(/{{filename}}/g, "document.md"),
                        )
                        .join(""),
                    }}
                  />
                ) : (
                  <p className="cvg-empty">Choisissez un modèle à gauche.</p>
                )}
              </div>
              <p className="cvg-variables-note">
                Variables disponibles dans le contenu : {COVER_VARIABLES.map((v) => v.token).join(" ")}
              </p>
            </div>
          </div>
          <label className="cvg-check">
            <input type="checkbox" checked={addPageBreak} onChange={(e) => setAddPageBreak(e.target.checked)} />
            Ajouter un saut de page après la page de garde
          </label>
          {status && <p className="cvg-status">{status}</p>}
        </div>
        <div className="cvg-actions">
          <span className="cvg-actions-spacer" />
          <button className="cvg-btn cvg-btn-primary" disabled={!selected} onClick={insert}>
            Insérer au curseur
          </button>
          <button className="cvg-btn" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
