/**
 * Édition directe d'un champ de document (`{{title}}`, `{{author}}`…) en
 * cliquant dessus sur la page : un petit champ de saisie flotte sur le champ,
 * Entrée valide, Échap annule. La valeur est écrite dans les propriétés du
 * document (voir `setEditableDocField`), comme si on avait ouvert la fenêtre
 * Propriétés — mais sans quitter la page de garde.
 */
import { getEditableDocField, setEditableDocField, docFieldLabel, type PageLayoutSettings } from "../../core/pageLayout";

/** Ouvre l'éditeur flottant ; retourne `false` si le champ n'est pas éditable
 *  (date, nom de fichier… : le clic garde alors son comportement normal). */
export function openDocFieldEditor(
  target: HTMLElement,
  name: string,
  layout: PageLayoutSettings,
  onLayoutChange: (layout: PageLayoutSettings) => void,
): boolean {
  const current = getEditableDocField(layout, name);
  if (current === null) return false;

  const rect = target.getBoundingClientRect();
  const input = document.createElement("input");
  input.type = "text";
  input.value = current;
  input.placeholder = docFieldLabel(name);
  input.className = "xmd-docfield-input";
  input.style.cssText =
    `position:fixed;z-index:60;left:${rect.left}px;top:${rect.top}px;` +
    `min-width:${Math.max(rect.width, 180)}px;height:${Math.max(rect.height, 24)}px;` +
    "box-sizing:border-box;padding:2px 6px;font:inherit;font-size:13px;color:#343334;background:#fff;" +
    "border:2px solid #24ac6e;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.25);";
  document.body.appendChild(input);

  let done = false;
  const close = (commit: boolean) => {
    if (done) return;
    done = true;
    if (commit && input.value !== current) {
      const next = setEditableDocField(layout, name, input.value);
      if (next) onLayoutChange(next);
    }
    input.remove();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(false);
    }
    e.stopPropagation();
  });
  input.addEventListener("blur", () => close(true));
  input.focus();
  input.select();
  return true;
}
