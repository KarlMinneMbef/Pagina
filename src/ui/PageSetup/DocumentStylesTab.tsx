/**
 * Onglet « Styles » de la fenêtre Mise en page (2026-10-24) : galerie de
 * STYLES DE DOCUMENT — toute la mise en forme (police, page, en-tête/pied,
 * bordure, titres, sommaire) en un style nommé que l'on applique, enregistre,
 * exporte vers un fichier et importe d'un autre poste. Même principe que la
 * galerie de pages de garde (CoverGalleryDialog.tsx).
 *
 * L'application modifie le BROUILLON de la fenêtre (comme tous les champs de
 * Mise en page) : rien n'est changé dans le document avant « OK ».
 */
import { useState } from "react";
import type { PageLayoutSettings } from "../../core/pageLayout";
import {
  ALL_STYLE_PARTS,
  STYLE_PARTS,
  addUserDocumentStyle,
  applyStyleToLayout,
  builtinDocumentStyles,
  describeStyle,
  extractStyleLayout,
  loadUserDocumentStyles,
  parseDocumentStyleFile,
  removeUserDocumentStyle,
  serializeDocumentStyle,
  stylePartsPresent,
  type DocumentStyle,
  type StylePartId,
} from "../../core/documentStyles";
import { pickDocumentStyleFile, pickDocumentStyleSaveLocation, readTextFile, writeTextFile } from "../../persistence/fileService";
import "./DocumentStylesTab.css";

const BUILTINS = builtinDocumentStyles();

export function DocumentStylesTab({ draft, onApplyToDraft }: { draft: PageLayoutSettings; onApplyToDraft: (next: PageLayoutSettings) => void }) {
  const [userStyles, setUserStyles] = useState<DocumentStyle[]>(() => loadUserDocumentStyles());
  const [selected, setSelected] = useState<DocumentStyle | null>(null);
  const [parts, setParts] = useState<StylePartId[]>(ALL_STYLE_PARTS);
  const [saveName, setSaveName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const present = selected ? stylePartsPresent(selected) : ALL_STYLE_PARTS;
  const togglePart = (id: StylePartId) => setParts((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const apply = () => {
    if (!selected) return;
    const applied = parts.filter((p) => present.includes(p));
    if (applied.length === 0) {
      setStatus("Cochez au moins un élément présent dans ce style.");
      return;
    }
    onApplyToDraft(applyStyleToLayout(draft, selected, applied));
    setStatus(`Style « ${selected.name} » appliqué (${applied.length} élément${applied.length > 1 ? "s" : ""}) — cliquez OK pour valider.`);
  };

  const saveCurrent = () => {
    const name = saveName.trim();
    if (!name) {
      setStatus("Donnez d'abord un nom au style.");
      return;
    }
    if (parts.length === 0) {
      setStatus("Cochez au moins un élément à enregistrer.");
      return;
    }
    if (BUILTINS.some((s) => s.name === name)) {
      setStatus("Ce nom est réservé à un style intégré.");
      return;
    }
    addUserDocumentStyle({ name, layout: extractStyleLayout(draft, parts) });
    setUserStyles(loadUserDocumentStyles());
    setStatus(`Style « ${name} » enregistré dans « Mes styles ».`);
    setSaveName("");
  };

  const exportStyle = async (style: DocumentStyle) => {
    try {
      const path = await pickDocumentStyleSaveLocation(`${style.name.replace(/[\\/:*?"<>|]/g, "_")}-style.json`);
      if (!path) return;
      await writeTextFile(path, serializeDocumentStyle(style));
      setStatus(`Style « ${style.name} » exporté.`);
    } catch {
      setStatus("Échec de l'export du style.");
    }
  };

  const importStyle = async () => {
    try {
      const path = await pickDocumentStyleFile();
      if (!path) return;
      const style = parseDocumentStyleFile(await readTextFile(path));
      if (!style) {
        setStatus("Fichier illisible : ce n'est pas un style de document Pagina.");
        return;
      }
      addUserDocumentStyle(style);
      setUserStyles(loadUserDocumentStyles());
      setStatus(`Style « ${style.name} » importé.`);
    } catch {
      setStatus("Échec de l'import du style.");
    }
  };

  const removeStyle = (name: string) => {
    removeUserDocumentStyle(name);
    setUserStyles(loadUserDocumentStyles());
    if (selected?.name === name) setSelected(null);
  };

  const item = (style: DocumentStyle, user: boolean) => (
    <div key={`${user ? "u" : "b"}-${style.name}`} className={`dst-item-row${selected?.name === style.name ? " dst-item-active" : ""}`}>
      <button type="button" className="dst-item" onClick={() => setSelected(style)} title={style.description}>
        {style.name}
      </button>
      <button type="button" className="dst-tool" title="Exporter ce style (fichier JSON réutilisable)" onClick={() => void exportStyle(style)}>
        ↗
      </button>
      {user && (
        <button type="button" className="dst-tool dst-danger" title="Supprimer ce style" onClick={() => removeStyle(style.name)}>
          ✕
        </button>
      )}
    </div>
  );

  return (
    <div className="dst-root">
      <div className="dst-list">
        <h4 className="dst-title">Styles intégrés</h4>
        {BUILTINS.map((s) => item(s, false))}
        <h4 className="dst-title">Mes styles</h4>
        {userStyles.length === 0 && <p className="dst-empty">Aucun style enregistré — enregistrez la mise en forme actuelle ci-contre, ou importez un fichier.</p>}
        {userStyles.map((s) => item(s, true))}
        <button type="button" className="dst-import" onClick={() => void importStyle()}>
          Importer un style…
        </button>
      </div>

      <div className="dst-detail">
        <div className="dst-box">
          <div className="dst-box-title">{selected ? selected.name : "Choisissez un style à gauche"}</div>
          {selected?.description && <p className="dst-desc">{selected.description}</p>}
          {selected && (
            <ul className="dst-summary">
              {describeStyle(selected).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>

        <fieldset className="dst-parts">
          <legend>Éléments concernés</legend>
          {STYLE_PARTS.map((p) => {
            const missing = !!selected && !present.includes(p.id);
            return (
              <label key={p.id} className={`dst-part${missing ? " dst-part-missing" : ""}`} title={p.hint}>
                <input type="checkbox" checked={parts.includes(p.id)} onChange={() => togglePart(p.id)} />
                {p.label}
                <span className="dst-part-hint">{missing ? "absent de ce style" : p.hint}</span>
              </label>
            );
          })}
        </fieldset>

        <div className="dst-actions">
          <button type="button" className="dst-btn dst-btn-primary" disabled={!selected} onClick={apply}>
            Appliquer au document
          </button>
        </div>

        <div className="dst-save">
          <input type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Nom du style (ex. Rapport d'étude)" />
          <button type="button" className="dst-btn" onClick={saveCurrent} title="Enregistre la mise en forme actuelle de cette fenêtre (éléments cochés) comme style réutilisable">
            Enregistrer la mise en forme actuelle
          </button>
        </div>
        {status && <p className="dst-status">{status}</p>}
      </div>
    </div>
  );
}
