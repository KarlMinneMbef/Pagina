/**
 * Menu contextuel du clic droit (tableau, orthographe, presse-papiers).
 *
 * Extrait de MarkdownEditor.tsx (dette technique 0.4, 2026-10-26).
 */
import { type Editor } from "@tiptap/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { refreshSpellcheck } from "./extensions/Spellcheck";
import { addUserWord, ignoreWord } from "../../core/spellcheck/userDictionary";
import { keepEditorFocus } from "../focusGuard";
import { copyEditorSelection, cutEditorSelection, pasteIntoEditor } from "./editorUtils";

/** Menu contextuel clic-droit sur une cellule de tableau (voir `onContextMenu`
 * dans le composant principal) — reprend les mêmes commandes natives de
 * `@tiptap/extension-table` déjà exposées dans le ruban (voir `CLAUDE.md`,
 * inspiré du menu équivalent de CasualOffice/docs, `TextContextMenu.tsx` :
 * right-click dans un tableau y ajoute les mêmes actions que la barre
 * d'outils dédiée, en plus de couper/copier/coller). Les commandes agissent
 * ici directement sur l'instance `editor` (pas besoin de repasser par
 * `MarkdownEditorHandle`/`ToolbarActions` : ce composant a déjà un accès
 * direct, plus simple que de dupliquer l'indirection). */
export function TableContextMenu({
  x,
  y,
  inTable,
  spell,
  editable,
  hasSelection,
  onAction,
  onClose,
}: {
  x: number;
  y: number;
  /** Mot mal orthographié sous le clic : suggestions, « Ignorer », « Ajouter au dictionnaire ». */
  spell?: { from: number; to: number; word: string; suggestions: string[] | null };
  /** Le clic est dans un tableau : ajoute les actions de tableau. */
  inTable: boolean;
  editable: boolean;
  hasSelection: boolean;
  onAction: (run: (editor: Editor) => void) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Recale dans la fenêtre (le menu s'ouvre au point du clic : près du bord
  // droit/bas il déborderait sinon).
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    });
  }, [x, y, inTable]);

  // Fermeture lue par RÉFÉRENCE : `onClose` est une fonction inline, nouvelle à chaque rendu. L'avoir
  // en dépendance de l'effet retirait puis reposait les écouteurs à chaque rendu — un clic dans le
  // texte (qui change la sélection, donc redessine l'éditeur de façon synchrone) arrivait pendant la
  // fenêtre où l'écouteur n'existait pas et le menu restait ouvert (bug du 2026-10-26).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onCloseRef.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    // `setTimeout` : le `contextmenu` natif qui a ouvert ce menu déclenche
    // aussi, juste après, un `mousedown`/`click` fantôme sur certains
    // navigateurs — sans ce délai, le menu se refermerait instantanément
    // lui-même dès son ouverture (même piège que les menus du ruban, voir
    // `Toolbar.tsx`, mais ici sur l'évènement d'OUVERTURE plutôt que sur un
    // clic d'option).
    const t = setTimeout(() => {
      // Phase de CAPTURE : le menu se ferme avant que la page ne traite le clic.
      document.addEventListener("mousedown", onMouseDown, true);
      document.addEventListener("keydown", onKeyDown);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onMouseDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const item = (label: string, run: (editor: Editor) => void, danger?: boolean, shortcut?: string, disabled?: boolean) => (
    <button
      key={label}
      type="button"
      disabled={disabled}
      className={`xmd-table-ctx-item${danger ? " xmd-table-ctx-item-danger" : ""}`}
      // Garde le focus (donc la sélection) dans l'éditeur invisible.
      onMouseDown={keepEditorFocus}
      onClick={() => onAction(run)}
    >
      <span>{label}</span>
      {shortcut && <span className="xmd-table-ctx-shortcut">{shortcut}</span>}
    </button>
  );

  const chain = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => (editor: Editor) =>
    fn(editor.chain().focus(undefined, { scrollIntoView: false })).run();

  return (
    <div
      ref={rootRef}
      className="xmd-table-ctx-menu"
      style={pos}
      role="menu"
    >
      {/* Correction orthographique (inspirée du menu de suggestions de CasualOffice/docs). */}
      {spell && editable && (
        <>
          {spell.suggestions === null && <div className="xmd-table-ctx-note">Recherche de suggestions…</div>}
          {spell.suggestions?.length === 0 && <div className="xmd-table-ctx-note">Aucune suggestion</div>}
          {spell.suggestions?.map((sug) => (
            <button
              key={sug}
              type="button"
              className="xmd-table-ctx-item xmd-table-ctx-suggestion"
              onMouseDown={keepEditorFocus}
              onClick={() =>
                // insertText conserve les marques (gras, couleur…) du mot remplacé.
                onAction((ed) => ed.view.dispatch(ed.state.tr.insertText(sug, spell.from, spell.to)))
              }
            >
              <span>{sug}</span>
            </button>
          ))}
          {item("Ignorer", (ed) => { ignoreWord(spell.word); refreshSpellcheck(ed.view); })}
          {item("Ajouter au dictionnaire", (ed) => { addUserWord(spell.word); refreshSpellcheck(ed.view); })}
          <div className="xmd-table-ctx-sep" />
        </>
      )}
      {/* Édition de texte (inspiré du menu de CasualOffice/docs — sans
       * « Traduire » ni « Commenter », volontairement : commentaires prévus
       * plus tard avec le format .xmd). */}
      {item("Couper", (ed) => cutEditorSelection(ed), false, "Ctrl+X", !editable || !hasSelection)}
      {item("Copier", (ed) => copyEditorSelection(ed), false, "Ctrl+C", !hasSelection)}
      {item("Coller", (ed) => pasteIntoEditor(ed, false), false, "Ctrl+V", !editable)}
      {item("Coller en texte brut", (ed) => pasteIntoEditor(ed, true), false, "Ctrl+Maj+V", !editable)}
      <div className="xmd-table-ctx-sep" />
      {item("Supprimer", chain((c) => c.deleteSelection()), false, "Suppr", !editable || !hasSelection)}
      <div className="xmd-table-ctx-sep" />
      {item("Tout sélectionner", chain((c) => c.selectAll()), false, "Ctrl+A")}
      {inTable && editable && (
        <>
          <div className="xmd-table-ctx-sep" />
          {item("Insérer une ligne au-dessus", chain((c) => c.addRowBefore()))}
          {item("Insérer une ligne en dessous", chain((c) => c.addRowAfter()))}
          {item("Supprimer la ligne", chain((c) => c.deleteRow()), true)}
          <div className="xmd-table-ctx-sep" />
          {item("Insérer une colonne à gauche", chain((c) => c.addColumnBefore()))}
          {item("Insérer une colonne à droite", chain((c) => c.addColumnAfter()))}
          {item("Supprimer la colonne", chain((c) => c.deleteColumn()), true)}
          <div className="xmd-table-ctx-sep" />
          {item("Fusionner les cellules", chain((c) => c.mergeCells()))}
          {item("Scinder la cellule", chain((c) => c.splitCell()))}
          <div className="xmd-table-ctx-sep" />
          {item("Supprimer le tableau", chain((c) => c.deleteTable()), true)}
        </>
      )}
    </div>
  );
}
