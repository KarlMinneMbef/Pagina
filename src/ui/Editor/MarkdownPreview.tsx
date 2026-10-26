/**
 * Vue "Markdown basique" : rendu simple et continu du document (comme un
 * aperçu GitHub/VS Code), sans la mise en page "feuille A4" ni la
 * pagination. Lecture seule — pour éditer, on retourne à la vue Pages ou à
 * la vue Code.
 */
import { useMemo } from "react";
import { docFieldLabel } from "../../core/pageLayout";
import { renderFieldValue } from "./extensions/DocField";
import "./MarkdownPreview.css";

/** Prépare le HTML de l'éditeur pour une lecture simple : les repères d'édition (début/fin de page de
 *  garde, sauts, marqueur de sommaire) disparaissent, les champs de document (`{{title}}`, `{{date}}`…)
 *  reçoivent leur valeur (dans l'éditeur c'est la couche peinte qui les remplit : le HTML brut contient
 *  des `<span>` VIDES, d'où des « Le » suivis d'un trait) et les cases à cocher sont en lecture seule. */
export function prepareMarkdownPreviewHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  doc
    .querySelectorAll('[data-type="cover-zone-start"], [data-type="cover-zone-end"], [data-type="page-break"], [data-type="toc-marker"], [data-type="section-break"]')
    .forEach((el) => el.remove());
  doc.querySelectorAll<HTMLElement>('span[data-type="doc-field"]').forEach((el) => {
    const name = el.getAttribute("data-name") ?? "";
    const value = renderFieldValue(name);
    if (value) {
      el.textContent = value;
    } else {
      el.textContent = docFieldLabel(name);
      el.classList.add("xmd-preview-empty-field");
    }
  });
  doc.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((el) => el.setAttribute("disabled", ""));
  return doc.body.firstElementChild?.innerHTML ?? html;
}

/** Aperçu HTML brut du document (Vue → Aperçu), sans pagination. */
export function MarkdownPreview({ html }: { html: string }) {
  const prepared = useMemo(() => prepareMarkdownPreviewHtml(html), [html]);
  return (
    <div className="xmd-preview-wrap">
      <div className="xmd-preview-content" dangerouslySetInnerHTML={{ __html: prepared }} />
    </div>
  );
}
