/**
 * Panneau latéral « Variables » pour l'édition d'en-tête/pied de page —
 * s'affiche automatiquement à droite quand un champ flottant
 * d'en-tête/pied de page est ouvert (voir `EditorStats.headerFooterEditMode`
 * dans MarkdownEditor.tsx), et disparaît quand le champ se ferme (commit ou
 * annulation). Chaque bouton insère son jeton à la position du curseur du
 * champ ouvert (`insertHeaderFooterVariable`).
 *
 * Présentation sobre gris clair, cohérente avec `TablePropertiesPanel`.
 */
import {
  IconVarAuthor,
  IconVarDate,
  IconVarFile,
  IconVarPage,
  IconVarPages,
  IconVarVersion,
} from "../Toolbar/icons";
import "./HeaderFooterPanel.css";

/** Jetons disponibles — voir `resolveHeaderFooterText` dans
 * core/pageLayout.ts pour la substitution réelle. */
const VARIABLES: { token: string; label: string; title: string; icon: React.ReactNode }[] = [
  { token: "{{page}}", label: "Page", title: "Insérer le numéro de la page courante", icon: <IconVarPage size={20} /> },
  { token: "{{pages}}", label: "Pages", title: "Insérer le nombre total de pages du document", icon: <IconVarPages size={20} /> },
  { token: "{{date}}", label: "Date", title: "Insérer la date du jour", icon: <IconVarDate size={20} /> },
  { token: "{{filename}}", label: "Fichier", title: "Insérer le nom du fichier", icon: <IconVarFile size={20} /> },
  { token: "{{version}}", label: "Version", title: "Insérer la version du document", icon: <IconVarVersion size={20} /> },
  { token: "{{author}}", label: "Auteur", title: "Insérer le nom de l'auteur", icon: <IconVarAuthor size={20} /> },
];

export function HeaderFooterPanel({
  mode,
  onInsertVariable,
  onClose,
}: {
  /** Champ actuellement ouvert — pilote le titre du panneau. */
  mode: "header" | "footer";
  /** Insère le jeton dans le champ ouvert (action existante
   * `insertHeaderFooterVariable`). */
  onInsertVariable: (token: string) => void;
  /** Termine l'édition (valide le texte saisi). */
  onClose: () => void;
}) {
  return (
    <aside className="hf-panel">
      <header className="hf-header">
        <span className="hf-title">{mode === "header" ? "En-tête" : "Pied de page"}</span>
        <button
          type="button"
          className="hf-close"
          onClick={onClose}
          title="Terminer l'édition (valide le texte saisi)"
        >
          ✕
        </button>
      </header>

      <div className="hf-body">
        <section className="hf-section">
          <h4 className="hf-section-title">Variables</h4>
          <div className="hf-grid">
            {VARIABLES.map((v) => (
              <button
                key={v.token}
                type="button"
                className="hf-action"
                title={v.title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsertVariable(v.token)}
              >
                <span className="hf-action-icon">{v.icon}</span>
                <span className="hf-action-label">{v.label}</span>
                <span className="hf-action-token">{v.token}</span>
              </button>
            ))}
          </div>
        </section>

        <p className="hf-hint">
          Cliquez une variable pour l'insérer à la position du curseur du champ ; elle est remplacée par sa valeur
          (numéro de page, date…) dans l'en-tête/le pied de page rendu.
        </p>
      </div>
    </aside>
  );
}
