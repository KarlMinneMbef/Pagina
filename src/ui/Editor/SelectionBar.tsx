/**
 * Mini-barre flottante de mise en forme, affichée au-dessus d'une sélection
 * de texte (G I S S̶ x² x₂, lien, couleur du texte, surlignage) — demandée
 * d'après la barre équivalente de CasualOffice/docs. Positionnée par
 * `MarkdownEditor.tsx` (`selBarSync`, qui calcule où la sélection est PEINTE
 * à l'écran) ; ce composant ne fait que dessiner les boutons et appliquer les
 * commandes Tiptap sur l'éditeur.
 *
 * Piège du projet appliqué dès l'écriture : chaque bouton neutralise
 * `mousedown` (`preventDefault`) — sinon le clic vole le focus DOM à l'éditeur
 * invisible AVANT que la commande ne s'exécute et la sélection est perdue.
 */
import type { Editor } from "@tiptap/react";
import { ColorPicker } from "../ColorPicker/ColorPicker";
import { IconLink } from "../Toolbar/icons";
import "./SelectionBar.css";

const run = (editor: Editor) => editor.chain().focus(undefined, { scrollIntoView: false });

/** Mini-barre flottante de mise en forme au-dessus de la sélection
 *  (G I S, exposant/indice, lien, couleur, surlignage). */
export function SelectionBar({ editor, left, top }: { editor: Editor; left: number; top: number }) {
  const mark = (name: string, label: React.ReactNode, title: string, toggle: () => void, extraClass = "") => (
    <button
      type="button"
      key={name}
      className={`xmd-selbar-btn${editor.isActive(name) ? " xmd-selbar-btn-active" : ""}${extraClass}`}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
    >
      {label}
    </button>
  );

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL du lien :", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      run(editor).extendMarkRange("link").unsetLink().run();
      return;
    }
    run(editor).extendMarkRange("link").setLink({ href: url }).run();
  };

  const textColor = (editor.getAttributes("textStyle").color as string | undefined) ?? undefined;

  return (
    <div className="xmd-selbar" style={{ left, top }} role="toolbar" aria-label="Mise en forme rapide" onMouseDown={(e) => e.preventDefault()}>
      {mark("bold", <strong>B</strong>, "Gras (Ctrl+B)", () => run(editor).toggleBold().run())}
      {mark("italic", <em>I</em>, "Italique (Ctrl+I)", () => run(editor).toggleItalic().run())}
      {mark("underline", <u>U</u>, "Souligné (Ctrl+U)", () => run(editor).toggleUnderline().run())}
      {mark("strike", <s>S</s>, "Barré", () => run(editor).toggleStrike().run())}
      {mark("superscript", <span>x<sup>2</sup></span>, "Exposant", () => run(editor).toggleSuperscript().run())}
      {mark("subscript", <span>x<sub>2</sub></span>, "Indice", () => run(editor).toggleSubscript().run())}
      <span className="xmd-selbar-sep" />
      {mark("link", <IconLink size={15} />, "Lien hypertexte", setLink)}
      <span className="xmd-selbar-sep" />
      <ColorPicker
        title="Couleur du texte"
        triggerClassName="xmd-selbar-btn xmd-selbar-btn-color"
        trigger={
          <>
            <span className="xmd-selbar-letter">A</span>
            <span className="xmd-selbar-colorbar" style={{ background: textColor ?? "#343334" }} />
            <span className="xmd-selbar-caret">▾</span>
          </>
        }
        value={textColor}
        onAutomatic={() => run(editor).unsetColor().run()}
        automaticSwatch="#343334"
        onChange={(color) => run(editor).setColor(color).run()}
      />
      {mark(
        "highlight",
        <span className="xmd-selbar-letter xmd-selbar-highlight">S</span>,
        "Surlignage",
        () => run(editor).toggleHighlight().run(),
      )}
    </div>
  );
}
