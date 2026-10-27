/**
 * Poignées de redimensionnement d'une image SÉLECTIONNÉE (2026-10-26,
 * demande utilisateur : « agrandir ou réduire l'image en étirant les bords,
 * comme Casual ») — un calque posé sur l'image PEINTE (les pages sont des
 * clones, même mécanisme que la pastille de langage : voir useCodeLangChip)
 * : cadre bleu + 4 poignées d'angle façon CasualOffice
 * (`ImageSelectionOverlay` du fork), redimensionnement EN DIRECT pendant le
 * glissement, infobulle de dimensions, commit en UNE transaction au relâcher
 * (un seul Ctrl+Z annule le geste entier).
 *
 * MODÈLE : la largeur reste un POURCENTAGE de la zone de texte (voir
 * ImageAsset.ts) — le glissement mesure la nouvelle largeur à l'écran, la
 * convertit en % de la largeur de contenu, l'arrondit à l'entier. La hauteur
 * suit toute seule (`height: auto`) : les proportions sont TOUJOURS
 * conservées, plus simple et plus honnête que des poignées libres.
 */
import { useEffect, type RefObject, type MutableRefObject } from "react";
import type { Editor } from "@tiptap/react";
import type { PageLayoutSettings } from "../../../core/pageLayout";
import { resolvePageSizeMm } from "../../../core/pageLayout";
import { mmToPx } from "../editorUtils";

const MIN_SCREEN_PX = 24;

type Corner = "nw" | "ne" | "sw" | "se";

export function useImageResize(
  editor: Editor | null,
  readOnly: boolean,
  canvasRef: RefObject<HTMLDivElement | null>,
  syncRef: MutableRefObject<() => void>,
  layoutRef: MutableRefObject<PageLayoutSettings>,
  zoomRef: MutableRefObject<number>,
): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = canvas?.parentElement ?? null;
    if (!canvas || !frame || !editor) return;

    // Largeur de la zone de texte en pixels logiques (le % s'y rapporte).
    const contentWidthPx = () => {
      const layout = layoutRef.current;
      const { widthMm } = resolvePageSizeMm(layout);
      return mmToPx(widthMm - layout.marginLeftMm - layout.marginRightMm);
    };

    // --- Calque (imperatif, comme la pastille de langage) ---
    const overlay = document.createElement("div");
    overlay.className = "xmd-img-resize";
    overlay.style.display = "none";
    const border = document.createElement("div");
    border.className = "xmd-img-resize-border";
    overlay.appendChild(border);
    const tooltip = document.createElement("div");
    tooltip.className = "xmd-img-resize-tip";
    tooltip.style.display = "none";
    overlay.appendChild(tooltip);
    const handles: Record<Corner, HTMLDivElement> = {} as Record<Corner, HTMLDivElement>;
    for (const corner of ["nw", "ne", "sw", "se"] as const) {
      const h = document.createElement("div");
      h.className = `xmd-img-resize-handle xmd-img-resize-${corner}`;
      h.dataset.corner = corner;
      overlay.appendChild(h);
      handles[corner] = h;
    }
    frame.appendChild(overlay);

    // Cible courante (remplie par sync) : position PM de l'image + élément
    // peint + rectangle écran. Pendant un glissement, sync ne les écrase pas.
    let dragging = false;
    let target: { pos: number; img: HTMLImageElement; rect: DOMRect } | null = null;

    /** Retrouve l'image PEINTE correspondant à l'image sélectionnée :
     *  bloc clone `[data-src-pos]` + RANG de l'image dans le bloc (même
     *  logique inverse que `imagePosOfClone` dans imageInsert.ts). */
    const findPaintedImage = (): { pos: number; img: HTMLImageElement } | null => {
      const sel = editor.state.selection as unknown as { node?: { type: { name: string } } };
      if (!sel.node || sel.node.type.name !== "image") return null;
      const pos = editor.state.selection.from;
      const $from = editor.state.selection.$from;
      let blockPos = -1;
      for (let d = $from.depth; d >= 1; d--) {
        if ($from.node(d).isBlock) {
          blockPos = $from.before(d);
          break;
        }
      }
      if (blockPos < 0) return null;
      let index = 0;
      editor.state.doc.nodesBetween(blockPos + 1, pos, (n) => {
        if (n.type.name === "image") index++;
        return true;
      });
      // Le bloc peut être cloné sur plusieurs pages (liste coupée) : prend
      // le clone dont l'image est visible à l'écran, sinon le premier.
      const clones = Array.from(canvas.querySelectorAll<HTMLElement>(`[data-src-pos="${blockPos}"]`));
      let img: HTMLImageElement | null = null;
      for (const clone of clones) {
        const imgs = Array.from(clone.querySelectorAll<HTMLImageElement>("img:not(.ProseMirror-separator)"));
        const candidate = imgs[index] ?? null;
        if (candidate) {
          const r = candidate.getBoundingClientRect();
          if (img === null || (r.bottom > 120 && r.top < window.innerHeight - 16)) img = candidate;
        }
      }
      return img ? { pos, img } : null;
    };

    const sync = () => {
      if (dragging) return;
      const found = readOnly ? null : findPaintedImage();
      if (!found) {
        overlay.style.display = "none";
        target = null;
        return;
      }
      const frameRect = frame.getBoundingClientRect();
      const rect = found.img.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        overlay.style.display = "none";
        target = null;
        return;
      }
      target = { pos: found.pos, img: found.img, rect };
      overlay.style.display = "";
      overlay.style.left = `${rect.left - frameRect.left}px`;
      overlay.style.top = `${rect.top - frameRect.top}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    };
    syncRef.current = sync;

    const wrap = canvas.closest(".xmd-page-wrap") ?? canvas;
    wrap.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    sync();

    // --- Glissement d'une poignée ---
    const onHandleMouseDown = (e: MouseEvent) => {
      if (!target || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const corner = (e.currentTarget as HTMLElement).dataset.corner as Corner;
      const startX = e.clientX;
      // Largeur de départ à l'écran ; l'ancre opposée fixe le bord qui ne
      // bouge pas (poignée ouest : le bord DROIT reste en place).
      const anchorRight = target.rect.right;
      const startWidth = target.rect.width;
      const side = corner.includes("w") ? -1 : 1;
      const contentW = contentWidthPx();
      const zoom = zoomRef.current;
      let newWidth = startWidth;

      dragging = true;
      tooltip.style.display = "";

      const onMove = (ev: MouseEvent) => {
        newWidth = Math.min(Math.max(startWidth + side * (ev.clientX - startX), MIN_SCREEN_PX), contentW * zoom);
        const logicalW = newWidth / zoom;
        // Aperçu EN DIRECT sur l'image peinte (sans repaint complet) +
        // recadrage du calque (le bord opposé ne bouge pas).
        target!.img.style.width = `${logicalW}px`;
        overlay.style.width = `${newWidth}px`;
        if (corner.includes("w")) overlay.style.left = `${anchorRight - newWidth - frame.getBoundingClientRect().left}px`;
        const pct = Math.min(100, Math.max(5, Math.round((logicalW / contentW) * 100)));
        const logicalH = target!.img.getBoundingClientRect().height / zoom;
        tooltip.textContent = `${Math.round(logicalW)} × ${Math.round(logicalH)} px — ${pct} %`;
        tooltip.style.left = `${overlay.offsetLeft + overlay.offsetWidth / 2}px`;
        tooltip.style.top = `${overlay.offsetTop + overlay.offsetHeight + 8}px`;
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        tooltip.style.display = "none";
        dragging = false;
        const logicalW = newWidth / zoomRef.current;
        const pct = Math.min(100, Math.max(5, Math.round((logicalW / contentWidthPx()) * 100)));
        // UNE transaction pour tout le geste (un seul Ctrl+Z).
        const t = target;
        if (t) editor.view.dispatch(editor.state.tr.setNodeAttribute(t.pos, "width", `${pct}%`));
        sync();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    for (const corner of Object.keys(handles) as Corner[]) {
      handles[corner].addEventListener("mousedown", onHandleMouseDown);
    }

    return () => {
      wrap.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      overlay.remove();
      syncRef.current = () => {};
    };
  }, [editor, readOnly]);
}
