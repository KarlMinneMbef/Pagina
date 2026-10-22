import { useEffect, type RefObject, type MutableRefObject } from "react";
import type { Editor } from "@tiptap/react";
import { CODE_BLOCK_LANGUAGE_OPTIONS } from "../codeBlockLanguages";

// Pastille « langage du bloc de code » (2026-10-17, retirée du ruban
// Insertion) : un petit sélecteur natif collé en haut à droite du
// BLOC PEINT contenant le curseur. Les pages affichées sont des
// clones (data-src-pos = position ProseMirror du bloc d'origine) :
// on retrouve celui de la sélection, on s'y cale en position fixe,
// et on se resynchronise à chaque repaint (codeLangSyncRef, appelé
// par repaint/repaintCaretOnly), scroll du wrapper et resize.
export function useCodeLangChip(
  editor: Editor | null,
  readOnly: boolean,
  canvasRef: RefObject<HTMLDivElement | null>,
  syncRef: MutableRefObject<() => void>
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !editor) return;

    const chip = document.createElement("div");
    chip.className = "xmd-code-lang-chip";
    chip.style.display = "none";
    const select = document.createElement("select");
    select.title = "Langage du bloc de code";
    const plainOption = document.createElement("option");
    plainOption.value = "";
    plainOption.textContent = "Texte";
    select.appendChild(plainOption);
    for (const lang of CODE_BLOCK_LANGUAGE_OPTIONS) {
      const o = document.createElement("option");
      o.value = lang;
      o.textContent = lang;
      select.appendChild(o);
    }
    select.addEventListener("change", () => {
      // « Texte » (valeur vide) → langue par défaut de CodeBlockLowlight.
      editor.chain().focus().updateAttributes("codeBlock", { language: select.value || "text" }).run();
    });
    chip.appendChild(select);
    document.body.appendChild(chip);

    const sync = () => {
      const { selection } = editor.state;
      // Remonte les niveaux jusqu'au bloc de code englobant la sélection.
      let cbNode: { attrs: Record<string, unknown> } | null = null;
      let cbStart = -1;
      for (let d = selection.$from.depth; d >= 1; d--) {
        const node = selection.$from.node(d);
        if (node.type.name === "codeBlock") {
          cbNode = node;
          cbStart = selection.$from.before(d);
          break;
        }
      }
      if (readOnly || !cbNode || cbStart < 0) {
        chip.style.display = "none";
        return;
      }
      // Le bloc peut être cloné sur plusieurs pages (bloc long) : prend
      // le fragment visible, sinon le premier.
      const clones = Array.from(canvas.querySelectorAll<HTMLElement>(`[data-src-pos="${cbStart}"]`));
      let rect: DOMRect | null = null;
      for (const c of clones) {
        const r = c.getBoundingClientRect();
        if (r.bottom > 120 && r.top < window.innerHeight - 16) {
          rect = r;
          break;
        }
      }
      if (!rect && clones.length > 0) rect = clones[0].getBoundingClientRect();
      if (!rect) {
        chip.style.display = "none";
        return;
      }
      const lang = String(cbNode.attrs.language ?? "");
      select.value = (CODE_BLOCK_LANGUAGE_OPTIONS as readonly string[]).includes(lang) ? lang : "";
      chip.style.display = "";
      chip.style.top = `${Math.max(rect.top, 0) + 4}px`;
      chip.style.left = `${rect.right - chip.offsetWidth - 6}px`;
    };
    syncRef.current = sync;

    const wrap = canvas.closest(".xmd-page-wrap") ?? canvas;
    wrap.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    sync();

    return () => {
      wrap.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      chip.remove();
      syncRef.current = () => {};
    };
  }, [editor, readOnly]);
}
