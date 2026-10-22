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
import "./coverThemes.css";

const PREVIEW_VALUES: Record<string, string> = {
  title: "Titre du document",
  subject: "Sujet du document",
  author: "Auteur",
  date: "JJ/MM/AAAA",
  version: "Version A",
  created: "JJ/MM/AAAA",
  modified: "JJ/MM/AAAA",
  filename: "document.md",
};

const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Aperçu d'un modèle : variables remplacées par des valeurs d'exemple, blocs
 *  `#`/`##`/`###`/texte rendus avec le THÈME (mêmes règles CSS que la page).
 *  Un ancien modèle à HTML inline (ligne commençant par `<`) est gardé tel quel. */
function coverPreviewHtml(source: string, theme: string): string {
  const attr = theme ? ` data-cover-theme="${theme}"` : "";
  return source
    .split(/\n{2,}/)
    .map((raw) => {
      const block = raw.replace(/{{(\w+)}}/g, (_m, name: string) => PREVIEW_VALUES[name] ?? name);
      if (block.trimStart().startsWith("<")) return block;
      const heading = block.match(/^(#{1,3})\s+([\s\S]*)$/);
      if (heading) return `<h${heading[1].length}${attr}>${escapeHtml(heading[2])}</h${heading[1].length}>`;
      return `<p${attr}>${escapeHtml(block)}</p>`;
    })
    .join("");
}

/** Galerie de pages de garde : modèles intégrés + utilisateur. */
export function CoverGalleryDialog({ onInsert, onClose }: { onInsert: (source: string, addPageBreak: boolean, theme: string) => void; onClose: () => void }) {
  const [userTemplates, setUserTemplates] = useState<CoverTemplate[]>(() => loadUserCoverTemplates());
  const [selected, setSelected] = useState<CoverTemplate | null>(null);
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
    onInsert(selected.source, addPageBreak, selected.theme ?? "");
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
                  <div className="cvg-preview-html" dangerouslySetInnerHTML={{ __html: coverPreviewHtml(selected.source, selected.theme ?? "") }} />
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
