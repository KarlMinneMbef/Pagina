/**
 * Panneau « En-tête / Pied de page » : pilote le CHAMP RICHE en cours
 * d'édition (mini-éditeur Tiptap ouvert sur la zone de la page, voir
 * `startHeaderFooterEdit` dans MarkdownEditor.tsx). Trois sections :
 * - Mise en forme : gras/italique/souligné, police, taille, couleur du
 *   texte, alignement — appliqués à la sélection du champ.
 * - Tableau : insertion et commandes de lignes/colonnes DANS le champ.
 * - Variables : jetons {{page}}, {{date}}… insérés au curseur.
 *
 * Monté dans `ContextualPanelHost` (App.tsx) — visible uniquement pendant
 * l'édition, il suit le cycle de vie du champ. Tous les boutons
 * neutralisent leur `mousedown` : ne pas voler le focus au mini-éditeur.
 */
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconColDelete,
  IconColLeft,
  IconColRight,
  IconRowAbove,
  IconRowBelow,
  IconRowDelete,
  IconVarAuthor,
  IconVarDate,
  IconVarFile,
  IconVarPage,
  IconVarPages,
  IconVarVersion,
} from "../Toolbar/icons";
import { TableSizePicker } from "../Toolbar/TableSizePicker";
import { ColorPicker } from "../ColorPicker/ColorPicker";
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

const FONT_FAMILIES = [
  { label: "Arial", value: "Arial, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', serif" },
  { label: "Calibri", value: "Calibri, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

const FONT_SIZES = ["8pt", "9pt", "10pt", "11pt", "12pt", "14pt", "16pt"];

export function HeaderFooterPanel({
  mode,
  onInsertVariable,
  onClose,
  hf,
}: {
  /** Champ actuellement ouvert — pilote le titre du panneau. */
  mode: "header" | "footer";
  /** Insère le jeton dans le champ ouvert. */
  onInsertVariable: (token: string) => void;
  /** Termine l'édition (referme le champ ; le contenu est déjà appliqué). */
  onClose: () => void;
  /** Commandes du mini-éditeur (voir les méthodes `hf*` du handle). */
  hf: {
    toggleBold: () => void;
    toggleItalic: () => void;
    toggleUnderline: () => void;
    setFontFamily: (family: string) => void;
    unsetFontFamily: () => void;
    setFontSize: (size: string) => void;
    unsetFontSize: () => void;
    setColor: (color: string) => void;
    unsetColor: () => void;
    setTextAlign: (align: "left" | "center" | "right") => void;
    insertTable: (rows: number, cols: number) => void;
    addRowBefore: () => void;
    addRowAfter: () => void;
    deleteRow: () => void;
    addColumnBefore: () => void;
    addColumnAfter: () => void;
    deleteColumn: () => void;
    deleteTable: () => void;
  };
}) {
  const noFocus = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="hf-panel">
      <header className="hf-header">
        <span className="hf-title">{mode === "header" ? "En-tête" : "Pied de page"}</span>
        <button type="button" className="hf-close" onClick={onClose} title="Terminer l'édition (le contenu est déjà appliqué)">
          ✕
        </button>
      </header>

      <div className="hf-body">
        <section className="hf-section">
          <h4 className="hf-section-title">Mise en forme</h4>
          <div className="hf-row">
            <button type="button" className="hf-mini" onMouseDown={noFocus} onClick={hf.toggleBold} title="Gras">
              <span className="hf-letter hf-letter-bold">G</span>
            </button>
            <button type="button" className="hf-mini" onMouseDown={noFocus} onClick={hf.toggleItalic} title="Italique">
              <span className="hf-letter hf-letter-italic">I</span>
            </button>
            <button type="button" className="hf-mini" onMouseDown={noFocus} onClick={hf.toggleUnderline} title="Souligné">
              <span className="hf-letter hf-letter-underline">S</span>
            </button>
            <ColorPicker
              title="Couleur du texte"
              triggerClassName="hf-mini hf-mini-with-caret"
              trigger={
                <>
                  <span className="hf-letter">A</span>
                  <span className="hf-caret">▾</span>
                </>
              }
              onAutomatic={hf.unsetColor}
              automaticSwatch="#2a2a24"
              onChange={hf.setColor}
            />
          </div>
          <label className="hf-field">
            Police
            <select
              defaultValue=""
              onChange={(e) => (e.target.value ? hf.setFontFamily(e.target.value) : hf.unsetFontFamily())}
              title="Police du texte sélectionné dans l'en-tête/le pied de page"
            >
              <option value="">Par défaut</option>
              {FONT_FAMILIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="hf-field">
            Taille
            <select
              defaultValue=""
              onChange={(e) => (e.target.value ? hf.setFontSize(e.target.value) : hf.unsetFontSize())}
              title="Taille du texte sélectionné dans l'en-tête/le pied de page"
            >
              <option value="">Par défaut</option>
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="hf-row">
            <button type="button" className="hf-mini" onMouseDown={noFocus} onClick={() => hf.setTextAlign("left")} title="Aligner à gauche">
              <IconAlignLeft size={16} />
            </button>
            <button type="button" className="hf-mini" onMouseDown={noFocus} onClick={() => hf.setTextAlign("center")} title="Centrer">
              <IconAlignCenter size={16} />
            </button>
            <button type="button" className="hf-mini" onMouseDown={noFocus} onClick={() => hf.setTextAlign("right")} title="Aligner à droite">
              <IconAlignRight size={16} />
            </button>
          </div>
        </section>

        <section className="hf-section">
          <h4 className="hf-section-title">Tableau</h4>
          <div className="hf-table-grid">
            <TableSizePicker disabled={false} onPick={(rows, cols) => hf.insertTable(rows, cols)} title="Insérer un tableau dans l'en-tête/le pied de page" />
            <button type="button" className="hf-action" onMouseDown={noFocus} onClick={hf.addRowBefore} title="Insérer une ligne au-dessus">
              <span className="hf-action-icon"><IconRowAbove size={20} /></span>
              <span className="hf-action-label">Ligne au-dessus</span>
            </button>
            <button type="button" className="hf-action" onMouseDown={noFocus} onClick={hf.addRowAfter} title="Insérer une ligne en dessous">
              <span className="hf-action-icon"><IconRowBelow size={20} /></span>
              <span className="hf-action-label">Ligne en dessous</span>
            </button>
            <button type="button" className="hf-action" onMouseDown={noFocus} onClick={hf.addColumnBefore} title="Insérer une colonne à gauche">
              <span className="hf-action-icon"><IconColLeft size={20} /></span>
              <span className="hf-action-label">Colonne à gauche</span>
            </button>
            <button type="button" className="hf-action" onMouseDown={noFocus} onClick={hf.addColumnAfter} title="Insérer une colonne à droite">
              <span className="hf-action-icon"><IconColRight size={20} /></span>
              <span className="hf-action-label">Colonne à droite</span>
            </button>
            <button type="button" className="hf-action" onMouseDown={noFocus} onClick={hf.deleteRow} title="Supprimer la ligne">
              <span className="hf-action-icon"><IconRowDelete size={20} /></span>
              <span className="hf-action-label">Supprimer ligne</span>
            </button>
            <button type="button" className="hf-action" onMouseDown={noFocus} onClick={hf.deleteColumn} title="Supprimer la colonne">
              <span className="hf-action-icon"><IconColDelete size={20} /></span>
              <span className="hf-action-label">Supprimer colonne</span>
            </button>
          </div>
          <button type="button" className="hf-delete-table" onMouseDown={noFocus} onClick={hf.deleteTable} title="Supprimer tout le tableau du champ">
            Supprimer le tableau
          </button>
        </section>

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

        <p className="hf-hint">
          La mise en forme s'applique à la sélection du champ ; les variables sont remplacées par leur valeur (numéro de page, date…) dans
          l'en-tête/le pied de page rendu. Cliquez hors du champ pour terminer.
        </p>
      </div>
    </div>
  );
}
