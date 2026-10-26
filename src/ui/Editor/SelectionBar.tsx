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
import { keepEditorFocus } from "../focusGuard";
import { useColorMemory } from "../colorMemory";

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
      onMouseDown={keepEditorFocus}
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
  // Comme le ruban (roadmap 2.3) : le bouton APPLIQUE la dernière couleur, le chevron ouvre le nuancier.
  const lastTextColor = useColorMemory((m) => m.lastTextColor);
  const lastHighlightColor = useColorMemory((m) => m.lastHighlightColor);
  const rememberTextColor = useColorMemory((m) => m.rememberTextColor);
  const rememberHighlightColor = useColorMemory((m) => m.rememberHighlightColor);
  const highlighted = editor.isActive("highlight");

  return (
    <div className="xmd-selbar" style={{ left, top }} role="toolbar" aria-label="Mise en forme rapide" onMouseDown={keepEditorFocus}>
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
        caretClassName="xmd-selbar-btn xmd-selbar-btn-caret"
        trigger={
          <>
            <span className="xmd-selbar-letter">A</span>
            <span className="xmd-selbar-colorbar" style={{ background: textColor ?? lastTextColor ?? "#343334" }} />
          </>
        }
        value={textColor}
        onApplyLast={lastTextColor ? () => run(editor).setColor(lastTextColor).run() : undefined}
        applyLastTitle={lastTextColor ? `Appliquer la dernière couleur choisie (${lastTextColor})` : "Couleur du texte"}
        onAutomatic={() => run(editor).unsetColor().run()}
        automaticSwatch="#343334"
        onChange={(color) => {
          rememberTextColor(color);
          run(editor).setColor(color).run();
        }}
      />
      <ColorPicker
        title="Couleur de surlignage"
        triggerClassName={`xmd-selbar-btn${highlighted ? " xmd-selbar-btn-active" : ""}`}
        caretClassName="xmd-selbar-btn xmd-selbar-btn-caret"
        trigger={<span className="xmd-selbar-letter xmd-selbar-highlight" style={{ background: lastHighlightColor }}>S</span>}
        // Le bouton surligne avec la dernière couleur (ou retire le surlignage s'il est déjà posé).
        onApplyLast={() => (highlighted ? run(editor).unsetHighlight().run() : run(editor).setHighlight({ color: lastHighlightColor }).run())}
        applyLastTitle={highlighted ? "Retirer le surlignage" : `Surligner avec ${lastHighlightColor}`}
        onChange={(color) => {
          rememberHighlightColor(color);
          run(editor).setHighlight({ color }).run();
        }}
      />
    </div>
  );
}
