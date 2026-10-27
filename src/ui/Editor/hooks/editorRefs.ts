/**
 * Les « refs » partagées de MarkdownEditor (dette technique 0.4, 2026-10-26) : le corps du composant a été découpé en
 * hooks (`useCanvasRepaint`…) qui lisent et écrivent les mêmes refs — elles sont regroupées ici dans UN objet passé aux
 * hooks. Les refs sont déclarées (useRef) dans le composant ; ce fichier n'en porte que le TYPE.
 */
import type { MutableRefObject, RefObject } from "react";
import type { Editor } from "@tiptap/core";
import type { MathfieldElement } from "mathlive";
import type { CloneIndex } from "../pagination/cloneIndex";
import type { PageLayoutSettings } from "../../../core/pageLayout";
import type { EditorStats } from "../editorTypes";
import type { AddImage } from "../imageInsert";

export interface EditorRefs {
  // Éléments DOM de la couche peinte
  wrapRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  caretRef: RefObject<HTMLDivElement | null>;
  selectionLayerRef: RefObject<HTMLDivElement | null>;
  liveHostRef: RefObject<HTMLDivElement | null>;
  // Valeurs courantes (mises à jour à chaque rendu)
  pageCountRef: MutableRefObject<number>;
  currentPageRef: MutableRefObject<number>;
  zoomRef: MutableRefObject<number>;
  layoutRef: MutableRefObject<PageLayoutSettings>;
  documentTitleRef: MutableRefObject<string>;
  onStatsRef: MutableRefObject<((stats: EditorStats) => void) | undefined>;
  onLayoutChangeRef: MutableRefObject<(layout: PageLayoutSettings) => void>;
  /** Range une image dans le document et renvoie son lien relatif (fourni par l'application, voir imageInsert.ts). */
  addImageRef: MutableRefObject<AddImage | undefined>;
  // Fonctions peuplées par les hooks (appelables depuis les callbacks Tiptap, créés une seule fois)
  repaintRef: MutableRefObject<() => void>;
  repaintCaretRef: MutableRefObject<() => void>;
  selBarSyncRef: MutableRefObject<() => void>;
  codeLangSyncRef: MutableRefObject<() => void>;
  /** Poignées de redimensionnement d'image — recalées à chaque repaint/curseur, comme la pastille de langage. */
  imgResizeSyncRef: MutableRefObject<() => void>;
  scrollSelectionIntoViewRef: MutableRefObject<() => void>;
  startHeaderFooterEditRef: MutableRefObject<(target: HTMLElement) => void>;
  insertHeaderFooterVariableRef: MutableRefObject<(token: string) => void>;
  startMathEditRef: MutableRefObject<(mathPos: number, target?: HTMLElement | null | undefined) => void>;
  // État d'édition en cours
  headerMiniEditorRef: MutableRefObject<Editor | null>;
  headerFooterCommitRef: MutableRefObject<(() => void) | null>;
  headerFooterModeRef: MutableRefObject<"header" | "footer" | null>;
  mathEditRef: MutableRefObject<{ host: HTMLDivElement; mf: MathfieldElement; mathPos: number; detach: () => void } | null>;
  pendingMathLatexRef: MutableRefObject<string | null>;
  cloneIndexRef: MutableRefObject<CloneIndex | null>;
  /** Dernier Markdown posé dans l'éditeur (évite de rappeler setContent() sur chaque frappe, voir onUpdate). */
  loadedContentRef: MutableRefObject<string>;
}
