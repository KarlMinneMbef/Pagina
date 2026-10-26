/**
 * Suivi du défilement et du zoom : page courante (« Page 8 sur 27 »), calage de la règle verticale, Ctrl+molette = zoom.
 *
 * Extrait de MarkdownEditor.tsx (dette technique 0.4, 2026-10-26) : le corps est inchangé, seul son emplacement a bougé.
 */
import type { Dispatch, SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import type { PageLayoutSettings } from "../../../core/pageLayout";
import { useEffect, useRef } from "react";
import { PAGE_GAP_PX } from "../pagination/Ruler";
import { getActiveBlockStyle, getActiveMarks, getActiveAlign, getActiveListType, getInsideToc, getMermaidAtSelection, getCoverZoneAtSelection, getMathAtSelection, currentTextColor, currentFontFamily } from "../editorQueries";
import { getSelectionShape } from "../editorTableOps";
import { currentFontSizePt } from "../editorUtils";
import type { EditorRefs } from "./editorRefs";

export function useViewportTracking({ editor, cmd, layout, zoom, onZoomChange, setVRulerPeriods, refs }: {
  editor: Editor;
  layout: PageLayoutSettings;
  cmd: () => Editor;
  zoom: number;
  onZoomChange: ((zoom: number) => void) | undefined;
  setVRulerPeriods: Dispatch<SetStateAction<number>>;
  refs: EditorRefs;
}) {
  const { wrapRef, canvasRef, pageCountRef, currentPageRef, onStatsRef, headerFooterModeRef } = refs;

  // Page courante (comme "Page 8 sur 27" dans Word) : la page dont la
  // boîte a défilé sous le haut de la zone visible.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || !editor) return;

    let scheduled = false;
    const recomputeCurrentPage = () => {
      scheduled = false;
      const pages = Array.from(canvas.querySelectorAll<HTMLElement>(".xmd-page"));
      const wrapTop = wrap.getBoundingClientRect().top;
      const thresholdY = wrapTop + 40;
      let page = 1;
      for (let i = 0; i < pages.length; i++) {
        if (pages[i].getBoundingClientRect().top < thresholdY) page = i + 1;
      }
      if (page !== currentPageRef.current) {
        currentPageRef.current = page;
        const words: number = editor.storage.characterCount.words();
        const characters: number = editor.storage.characterCount.characters();
        onStatsRef.current?.({
          words,
          characters,
          pageCount: pageCountRef.current,
          currentPage: page,
          activeBlockStyle: getActiveBlockStyle(cmd()),
          activeMarks: getActiveMarks(cmd()),
          activeAlign: getActiveAlign(cmd()),
          activeList: getActiveListType(cmd()),
          activeFontFamily: currentFontFamily(cmd()),
        activeColor: currentTextColor(cmd()),
          activeFontSizePt: currentFontSizePt(cmd()),
          insideTable: cmd().isActive("table"),
          insideToc: getInsideToc(editor),
        math: getMathAtSelection(editor),
        mermaid: getMermaidAtSelection(editor),
        coverZone: getCoverZoneAtSelection(editor),
          tableSelectionShape: getSelectionShape(cmd()),
          headerFooterEditMode: headerFooterModeRef.current,
        });
      }
    };

    const onScroll = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(recomputeCurrentPage);
    };

    wrap.addEventListener("scroll", onScroll, { passive: true });
    recomputeCurrentPage();
    return () => wrap.removeEventListener("scroll", onScroll);
  }, [editor]);

  // Règle verticale (roadmap 1.1) — recalcul calé sur le DOM réel, jamais
  // sur des valeurs dérivées : la règle est sticky (gauche + sous la règle
  // horizontale), ses graduations doivent suivre la page sous le viewport.
  // Principe : un motif de page par période « hauteur de page + espace
  // entre pages » (voir Ruler.tsx) ; on translate l'ensemble pour que le
  // motif reste à l'aplomb des pages réelles, mesuré depuis les boîtes
  // peintes (getBoundingClientRect intègre déjà le zoom via transform).
  // Le calage est posé en variables CSS SUR LE DOM (pas d'état React) :
  // le défilement le déclenche à chaque frame, un re-render serait du
  // gaspillage ; seul le NOMBRE de motifs (dépend de la hauteur du
  // viewport et du zoom, change rarement) passe par setVRulerPeriods.
  const recomputeVRulerRef = useRef<() => void>(() => {});
  recomputeVRulerRef.current = () => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const rulerV = wrap.querySelector<HTMLElement>(".xmd-ruler-v");
    const page = canvas.querySelector<HTMLElement>(".xmd-page");
    if (!rulerV || !page) return;
    const wrapTop = wrap.getBoundingClientRect().top;
    const scrollTop = wrap.scrollTop;
    // Position réelle (coords contenu) de la règle sticky — mesurée, pas
    // déduite : près de la fin du document, le sticky est contraint par le
    // bas du bloc conteneur et la règle remonte avec le contenu.
    const rulerTop = rulerV.getBoundingClientRect().top - wrapTop + scrollTop;
    const pageTop = page.getBoundingClientRect().top - wrapTop + scrollTop;
    const pageHeight = page.getBoundingClientRect().height;
    // Période = hauteur de page + espace entre pages (le `gap` de
    // .xmd-page-canvas, lu depuis le style calculé pour rester juste si
    // la valeur CSS change un jour).
    const gap = parseFloat(getComputedStyle(canvas).rowGap) || PAGE_GAP_PX;
    const stride = pageHeight + gap;
    // Hauteur visible : tout le viewport du wrap moins la règle
    // horizontale (18px + bordure) moins une marge de sécurité.
    const height = Math.max(0, wrap.clientHeight - 20);
    // Calage : le motif est translaté pour que ses marques de page
    // tombent sur les vrais bords de page (offset dans [-stride, 0)).
    const raw = (((pageTop - rulerTop) % stride) + stride) % stride;
    rulerV.style.setProperty("--xmd-ruler-v-offset", `${raw - stride}px`);
    rulerV.style.setProperty("--xmd-ruler-v-stride", `${stride}px`);
    rulerV.style.height = `${height}px`;
    const periods = Math.max(2, Math.ceil((height + stride) / stride));
    setVRulerPeriods((prev) => (prev === periods ? prev : periods));
  };
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        recomputeVRulerRef.current();
      });
    };
    wrap.addEventListener("scroll", schedule, { passive: true });
    // Le viewport (wrap) ET la pile de pages (canvas) changent de taille
    // (fenêtre redimensionnée, panneaux latéraux, repaint des pages,
    // zoom) : ResizeObserver couvre tout, y compris le premier paint
    // (le canvas passe de 0 à la hauteur de la première page).
    const ro = new ResizeObserver(schedule);
    ro.observe(wrap);
    ro.observe(canvas);
    schedule();
    return () => {
      wrap.removeEventListener("scroll", schedule);
      ro.disconnect();
    };
  }, [zoom, layout, editor]);

  // Ctrl+molette : zoom façon Word/Google Docs. Purement visuel
  // (`transform: scale()` sur `.xmd-page-canvas`, voir le rendu plus bas).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !onZoomChange) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      onZoomChange(zoom + delta);
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [zoom, onZoomChange]);
}
