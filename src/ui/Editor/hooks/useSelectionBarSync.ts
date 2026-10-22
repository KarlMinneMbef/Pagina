import { useEffect, type RefObject, type MutableRefObject, type Dispatch, type SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { CellSelection } from "@tiptap/pm/tables";
import { computeSelectionRects } from "../pagination/selectionHighlight";

export type SelBarState = { left: number; top: number; rev: number } | null;

// Mini-barre de mise en forme à la sélection : calcule où la sélection est
// PEINTE (mêmes rectangles que la surbrillance) et place la barre juste
// au-dessus de la première ligne visible (en dessous si elle sortirait de
// la zone visible). Masquée : pendant un glisser de souris (affichée au
// relâchement), sélection vide, sélection de cellules, bloc de code,
// lecture seule, édition d'en-tête/pied de page.
export function useSelectionBarSync(
  editor: Editor | null,
  readOnly: boolean,
  canvasRef: RefObject<HTMLDivElement | null>,
  zoomRef: MutableRefObject<number>,
  headerMiniEditorRef: MutableRefObject<Editor | null>,
  syncRef: MutableRefObject<() => void>,
  setSelBar: Dispatch<SetStateAction<SelBarState>>
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!editor || !canvas) return;
    const wrap = (canvas.closest(".xmd-page-wrap") ?? canvas) as HTMLElement;
    let selecting = false;
    const BAR_WIDTH = 330;
    const BAR_HEIGHT = 40;

    const hide = () => setSelBar((cur) => (cur === null ? cur : null));

    const sync = () => {
      const sel = editor.state.selection;
      if (
        readOnly ||
        selecting ||
        sel.empty ||
        sel instanceof CellSelection ||
        headerMiniEditorRef.current ||
        editor.isActive("codeBlock") ||
        editor.isActive("mermaid")
      ) {
        hide();
        return;
      }
      const rects = computeSelectionRects(editor.view, canvas, sel, zoomRef.current);
      const frame = (canvas.parentElement as HTMLElement).getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();
      const screen = rects
        .map((r) => ({ left: frame.left + r.left, top: frame.top + r.top, width: r.width, height: r.height }))
        .filter((r) => r.top + r.height > wrapRect.top && r.top < wrapRect.bottom);
      if (screen.length === 0) {
        hide();
        return;
      }
      const first = screen[0];
      const last = screen[screen.length - 1];
      let top = first.top - BAR_HEIGHT - 8;
      if (top < wrapRect.top + 4) top = last.top + last.height + 8;
      const center = first.left + first.width / 2;
      const left = Math.max(wrapRect.left + 4, Math.min(center - BAR_WIDTH / 2, wrapRect.right - BAR_WIDTH - 4));
      setSelBar((cur) => ({ left: Math.round(left), top: Math.round(top), rev: (cur?.rev ?? 0) + 1 }));
    };
    syncRef.current = sync;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      selecting = true;
      hide();
    };
    const onUp = () => {
      if (!selecting) return;
      selecting = false;
      // Après le traitement du mouseup de l'éditeur (sélection finale).
      setTimeout(sync, 0);
    };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    wrap.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
      wrap.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      syncRef.current = () => {};
    };
  }, [editor, readOnly]);
}
