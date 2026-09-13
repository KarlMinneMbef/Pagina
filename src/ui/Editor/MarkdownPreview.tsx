/**
 * Vue "Markdown basique" : rendu simple et continu du document (comme un
 * aperçu GitHub/VS Code), sans la mise en page "feuille A4" ni la
 * pagination. Lecture seule — pour éditer, on retourne à la vue Pages ou à
 * la vue Code.
 */
import "./MarkdownPreview.css";

export function MarkdownPreview({ html }: { html: string }) {
  return (
    <div className="xmd-preview-wrap">
      <div className="xmd-preview-content" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
