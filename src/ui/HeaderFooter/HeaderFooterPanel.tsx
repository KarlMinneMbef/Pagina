/**
 * Panneau « En-tête / Pied de page » : accompagne le CHAMP RICHE en cours
 * d'édition (mini-éditeur Tiptap ouvert sur la zone de la page, voir
 * `startHeaderFooterEdit` dans MarkdownEditor.tsx). Il ne porte QUE les
 * Variables : la mise en forme (police, taille, couleur, alignement,
 * tableaux…) vient du RUBAN, qui s'applique directement au champ ouvert
 * via le routage `cmd()` — aucune commande dédiée ici.
 *
 * Monté dans `ContextualPanelHost` (App.tsx) — visible uniquement pendant
 * l'édition, il suit le cycle de vie du champ. Les boutons neutralisent
 * leur `mousedown` : ne pas voler le focus au mini-éditeur.
 */
import { IconVarAuthor, IconVarDate, IconVarFile, IconVarPage, IconVarPages, IconVarText, IconVarVersion } from "../Toolbar/icons";
import "./HeaderFooterPanel.css";
import { PanelHeader } from "../ContextualPanels/PanelHeader";

/** Jetons disponibles — voir `resolveHeaderFooterText` dans
 * core/pageLayout.ts pour la substitution réelle. */
const VARIABLES: { token: string; label: string; title: string; icon: React.ReactNode }[] = [
  { token: "{{page}}", label: "Page", title: "Insérer le numéro de la page courante", icon: <IconVarPage size={20} /> },
  { token: "{{pages}}", label: "Pages", title: "Insérer le nombre total de pages du document", icon: <IconVarPages size={20} /> },
  { token: "{{date}}", label: "Date", title: "Insérer la date du jour", icon: <IconVarDate size={20} /> },
  { token: "{{filename}}", label: "Fichier", title: "Insérer le nom du fichier", icon: <IconVarFile size={20} /> },
  { token: "{{version}}", label: "Version", title: "Insérer la version du document", icon: <IconVarVersion size={20} /> },
  { token: "{{author}}", label: "Auteur", title: "Insérer le nom de l'auteur", icon: <IconVarAuthor size={20} /> },
  // Propriétés du document (roadmap 1.6, 2026-10-21) — définies dans la
  // fenêtre « Propriétés du document » du ruban.
  { token: "{{title}}", label: "Titre", title: "Insérer le titre du document (fenêtre Propriétés)", icon: <IconVarText size={20} /> },
  { token: "{{subject}}", label: "Sujet", title: "Insérer le sujet du document (fenêtre Propriétés)", icon: <IconVarText size={20} /> },
  { token: "{{keywords}}", label: "Mots-clés", title: "Insérer les mots-clés du document (fenêtre Propriétés)", icon: <IconVarText size={20} /> },
  { token: "{{created}}", label: "Créé le", title: "Insérer la date de création du document", icon: <IconVarDate size={20} /> },
  { token: "{{modified}}", label: "Modifié le", title: "Insérer la date de modification du document", icon: <IconVarDate size={20} /> },
];

/** Panneau d'édition de l'en-tête/pied courant : variables insérables en un
 *  clic ({{page}}, {{title}}, champs personnalisés…). */
export function HeaderFooterPanel({
  mode,
  onInsertVariable,
  customVariables = [],
  onClose,
}: {
  /** Champ actuellement ouvert — pilote le titre du panneau. */
  mode: "header" | "footer";
  /** Insère le jeton dans le champ ouvert. */
  onInsertVariable: (token: string) => void;
  /** Champs personnalisés du document (roadmap 1.6) — un bouton par
   * champ : {{NomDuChamp}} inséré, défini dans la fenêtre Propriétés. */
  customVariables?: { token: string; label: string }[];
  /** Termine l'édition (referme le champ ; le contenu est déjà appliqué). */
  onClose: () => void;
}) {
  const noFocus = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="hf-panel">
      <PanelHeader
        title={mode === "header" ? "En-tête" : "Pied de page"}
        onClose={onClose}
        closeTitle="Terminer l'édition (le contenu est déjà appliqué)"
      />

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
                onMouseDown={noFocus}
                onClick={() => onInsertVariable(v.token)}
              >
                <span className="hf-action-icon">{v.icon}</span>
                <span className="hf-action-label">{v.label}</span>
                <span className="hf-action-token">{v.token}</span>
              </button>
            ))}
          </div>
        </section>

        {customVariables.length > 0 && (
          <section className="hf-section">
            <h4 className="hf-section-title">Champs personnalisés</h4>
            <div className="hf-grid">
              {customVariables.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  className="hf-action"
                  title={`Insérer la valeur du champ « ${v.label} » (défini dans la fenêtre Propriétés du document)`}
                  onMouseDown={noFocus}
                  onClick={() => onInsertVariable(v.token)}
                >
                  <span className="hf-action-icon">
                    <IconVarText size={20} />
                  </span>
                  <span className="hf-action-label">{v.label}</span>
                  <span className="hf-action-token">{v.token}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <p className="hf-hint">
          Le ruban (police, taille, couleur, tableaux…) s'applique au champ ouvert ; les variables sont remplacées par leur valeur (numéro de
          page, date…) dans l'en-tête/le pied de page rendu. Cliquez hors du champ pour terminer.
        </p>
      </div>
    </div>
  );
}
