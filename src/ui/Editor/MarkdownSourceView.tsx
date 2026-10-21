/**
 * Vue "code Markdown" : le texte source brut du fichier, éditable directement
 * (pour un utilisateur avancé qui préfère taper du Markdown à la main). Les
 * modifications remontent comme n'importe quelle frappe dans la vue Pages —
 * même `onChange`, même store — donc revenir à la vue Pages recharge
 * automatiquement l'éditeur Tiptap avec le texte modifié ici.
 */
import "./MarkdownSourceView.css";

/** Vue « code Markdown » : le texte source brut du fichier, éditable à la
 *  main — détail du cycle Pages/Source en tête de fichier. */
export function MarkdownSourceView({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="xmd-source-wrap">
      <textarea
        className="xmd-source-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        placeholder="Commencez à rédiger…"
      />
    </div>
  );
}
