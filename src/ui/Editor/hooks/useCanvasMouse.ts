/**
 * Souris sur la couche peinte : clic → position réelle dans l'éditeur invisible (resolveClickPosition.ts), glisser, double et
 * triple clic, Maj+clic, cases à cocher, liens, formules, diagrammes, repères d'en-tête/pied, clic droit (menu contextuel).
 *
 * Extrait de MarkdownEditor.tsx (dette technique 0.4, 2026-10-26) : le corps est inchangé, seul son emplacement a bougé.
 */
import type { Dispatch, SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { CellSelection } from "@tiptap/pm/tables";
import { useEffect } from "react";
import { useSettingsStore } from "../../../core/store/settingsStore";
import { spellErrorAt } from "../extensions/Spellcheck";
import { suggestWord } from "../../../persistence/spellService";
import { type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { COL_RESIZE_HANDLE_CLASS, COL_RESIZE_TABLE_POS_ATTR, COL_RESIZE_COL_INDEX_ATTR, ROW_RESIZE_HANDLE_CLASS, ROW_RESIZE_TABLE_POS_ATTR, ROW_RESIZE_ROW_INDEX_ATTR, SRC_POS_ATTR } from "../pagination/paintPages";
import { resolveClickPosition, findClonedBlock } from "../pagination/resolveClickPosition";
import { findCellPos, applyColumnWidth, applyRowHeight } from "../editorTableOps";
import { openDocFieldEditor } from "../docFieldEdit";
import type { EditorRefs } from "./editorRefs";

/** État du menu contextuel (clic droit) : position écran, dans un tableau ou non, mot mal orthographié sous le clic. */
export interface TableContextMenuState {
  x: number;
  y: number;
  inTable: boolean;
  /** Mot mal orthographié sous le clic (suggestions chargées à l'ouverture). */
  spell?: { from: number; to: number; word: string; suggestions: string[] | null };
}

export function useCanvasMouse({ editor, readOnly, setTableContextMenu, refs }: {
  editor: Editor;
  readOnly: boolean;
  setTableContextMenu: Dispatch<SetStateAction<TableContextMenuState | null>>;
  refs: EditorRefs;
}) {
  const { canvasRef, zoomRef, layoutRef, onLayoutChangeRef, startHeaderFooterEditRef, startMathEditRef, cloneIndexRef } = refs;

  // Clics sur la couche peinte : traduits en position réelle dans
  // l'éditeur invisible (voir resolveClickPosition.ts), qui reprend le
  // focus. Glisser (mousedown puis mousemove) étend la sélection.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !editor) return;

    let dragging = false;
    let anchorPos: number | null = null;
    // Position de la CELLULE (pas du texte) où le glisser a commencé — voir
    // `findCellPos` plus haut. `null` si le glisser n'a pas démarré dans un
    // tableau, auquel cas on reste sur une sélection de texte normale.
    let cellAnchorPos: number | null = null;
    // Glisser une poignée de redimensionnement de colonne (voir
    // paintPages.ts) — état séparé du glisser-sélection ci-dessus,
    // mutuellement exclusif avec lui (un mousedown sur une poignée
    // retourne avant d'atteindre la logique de sélection).
    let resizingCol: {
      tablePos: number;
      colIndex: number;
      startClientX: number;
      startHandleLeft: number;
      /** Largeur mesurée au mousedown — JAMAIS modifiée pendant le
       * glisser, sert de référence pour calculer `currentWidthPx` à
       * chaque déplacement. */
      startWidthPx: number;
      /** Largeur courante recalculée à chaque `mousemove` — c'est elle
       * qui est appliquée au document au `mouseup`. */
      currentWidthPx: number;
      handle: HTMLElement;
    } | null = null;
    // Même principe que `resizingCol`, sur l'axe vertical (hauteur de ligne).
    let resizingRow: {
      tablePos: number;
      rowIndex: number;
      startClientY: number;
      startHandleTop: number;
      startHeightPx: number;
      currentHeightPx: number;
      handle: HTMLElement;
    } | null = null;

    const posFromEvent = (e: MouseEvent): number | null => {
      const block = findClonedBlock(e.target);
      if (!block) return null;
      return resolveClickPosition(editor.view, e.clientX, e.clientY, block, zoomRef.current, cloneIndexRef.current ?? undefined, e.target as Element);
    };

    /** Résolution par COORDONNÉES seules (sans événement) — utilisée par
     * l'auto-scroll de glissement : après un scroll programmatique il n'y
     * a pas de nouvel événement souris, il faut retrouver ce qui se
     * trouve maintenant sous le point mémorisé. */
    const posFromCoords = (x: number, y: number): number | null => {
      const el = document.elementFromPoint(x, y);
      if (!(el instanceof Element)) return null;
      const block = findClonedBlock(el);
      if (!block) return null;
      return resolveClickPosition(editor.view, x, y, block, zoomRef.current, cloneIndexRef.current ?? undefined, el);
    };

    /** Plage du MOT sous un point (double-clic) — via l'index du clone :
     * le nœud texte VISIBLE sous le point, précision caractère, donc
     * insensible au zoom et à la cellule. */
    const wordRangeAtPoint = (x: number, y: number): { from: number; to: number } | null => {
      const index = cloneIndexRef.current;
      if (!index) return null;
      const caret = document.caretRangeFromPoint(x, y);
      const container = caret?.startContainer;
      if (!caret || !container || container.nodeType !== Node.TEXT_NODE) return null;
      const textNode = container as Text;
      const start = index.text.get(textNode);
      if (start === undefined) return null;
      const text = textNode.data;
      const off = caret.startOffset;
      const isWordChar = (ch: string) => /[\p{L}\p{N}_'’-]/u.test(ch);
      let s = off;
      let e = off;
      while (s > 0 && isWordChar(text[s - 1])) s--;
      while (e < text.length && isWordChar(text[e])) e++;
      if (s === e) return null;
      return { from: start + s, to: start + e };
    };

    // --- Auto-scroll pendant le glisser-sélection (refonte 2026-10-17,
    // réimplémentation du concept de useDragAutoScroll de CasualOffice,
    // voir ROADMAP-CASUALOFFICE.md) : quand la souris s'approche du bord
    // haut/bas du wrapper de pages, une boucle requestAnimationFrame
    // fait défeler le conteneur à vitesse proportionnelle à la proximité
    // et étend la sélection à chaque tick — sélectionner sur plusieurs
    // pages devient possible (avant : le glissement s'arrêtait net au
    // bord du viewport).
    const DRAG_EDGE_ZONE = 40;
    const DRAG_MAX_SPEED = 12;
    let dragAutoScrollRaf: number | null = null;
    const lastDragPoint = { x: 0, y: 0 };
    const wrap = canvas.closest(".xmd-page-wrap") as HTMLElement | null;
    const stopDragAutoScroll = () => {
      if (dragAutoScrollRaf !== null) {
        cancelAnimationFrame(dragAutoScrollRaf);
        dragAutoScrollRaf = null;
      }
    };
    const extendDragAt = (x: number, y: number) => {
      const pos = posFromCoords(x, y);
      if (pos === null || anchorPos === null) return;
      const cellPos = findCellPos(editor.state.doc, pos);
      if (cellAnchorPos !== null && cellPos !== null && cellPos !== cellAnchorPos) {
        try {
          const sel = CellSelection.create(editor.state.doc, cellAnchorPos, cellPos);
          editor.view.dispatch(editor.state.tr.setSelection(sel));
          return;
        } catch {
          // Repli texte ci-dessous.
        }
      }
      editor.commands.setTextSelection({ from: Math.min(anchorPos, pos), to: Math.max(anchorPos, pos) });
    };
    const dragAutoScrollTick = () => {
      dragAutoScrollRaf = null;
      if (!dragging || !wrap) return;
      const r = wrap.getBoundingClientRect();
      let delta = 0;
      if (lastDragPoint.y < r.top + DRAG_EDGE_ZONE) {
        delta = -Math.min(DRAG_MAX_SPEED, ((r.top + DRAG_EDGE_ZONE - lastDragPoint.y) / DRAG_EDGE_ZONE) * DRAG_MAX_SPEED);
      } else if (lastDragPoint.y > r.bottom - DRAG_EDGE_ZONE) {
        delta = Math.min(DRAG_MAX_SPEED, ((lastDragPoint.y - (r.bottom - DRAG_EDGE_ZONE)) / DRAG_EDGE_ZONE) * DRAG_MAX_SPEED);
      }
      if (delta !== 0) {
        wrap.scrollTop += delta;
        extendDragAt(lastDragPoint.x, lastDragPoint.y);
      }
      dragAutoScrollRaf = requestAnimationFrame(dragAutoScrollTick);
    };

    /** Clic dans une zone VIDE d'une page peinte (aucun bloc sous la souris) : position du
     *  document la plus proche, ou { insertAt } quand le clic tombe SOUS un bloc qui n'accepte pas
     *  de curseur (tableau, diagramme, formule en bloc…) et n'est suivi d'aucun texte où aller
     *  (fin du document, saut de page ou de section, autre tableau…) — un paragraphe vide doit
     *  alors être ajouté à cet endroit, comme après un tableau dans Word. */
    const resolveBlankClick = (e: MouseEvent): number | { insertAt: number } | null => {
      const target = e.target as HTMLElement | null;
      const page = target?.closest<HTMLElement>(".xmd-page");
      const content = page?.querySelector<HTMLElement>(".xmd-page-content");
      if (!page || !content) return null;
      const blocks = Array.from(content.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c.hasAttribute(SRC_POS_ATTR));
      if (blocks.length === 0) return null;
      // Bloc le plus proche verticalement (les clics dans les marges gauche/droite en font partie).
      let best = blocks[0];
      let bestDist = Infinity;
      for (const b of blocks) {
        const r = b.getBoundingClientRect();
        const d = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
        if (d < bestDist) {
          best = b;
          bestDist = d;
        }
      }
      const rect = best.getBoundingClientRect();
      // Bloc VISIBLE situé au-dessus du clic (les repères de hauteur nulle — saut de page, fin de zone de
      // garde — sont ignorés : ils collent au bas du tableau et passeraient sinon pour le bloc le plus proche).
      const visibles = blocks.filter((b) => b.getBoundingClientRect().height >= 1);
      let anchor: HTMLElement | null = null;
      for (const b of visibles) if (b.getBoundingClientRect().top <= e.clientY) anchor = b;
      if (anchor && e.clientY > anchor.getBoundingClientRect().bottom) {
        const doc = editor.state.doc;
        const accepteTexte = (n: ProseMirrorNode | null | undefined) =>
          !!n && (n.isTextblock || n.type.name === "bulletList" || n.type.name === "orderedList" || n.type.name === "taskList");
        const srcAttr = anchor.getAttribute(SRC_POS_ATTR);
        const node = srcAttr !== null ? doc.nodeAt(Number(srcAttr)) : null;
        if (srcAttr !== null && node && !accepteTexte(node)) {
          const end = Number(srcAttr) + node.nodeSize;
          // Un tableau coupé sur plusieurs pages : seul son DERNIER morceau est « sous le tableau ».
          const pages = Array.from(canvas.querySelectorAll<HTMLElement>(".xmd-page"));
          const nextFirst = pages[pages.indexOf(page) + 1]?.querySelector<HTMLElement>(".xmd-page-content")?.children[0];
          const continuesOnNextPage =
            anchor === visibles[visibles.length - 1] && nextFirst?.getAttribute(SRC_POS_ATTR) === srcAttr;
          if (!continuesOnNextPage && !accepteTexte(doc.nodeAt(end))) return { insertAt: end };
        }
      }
      // Ailleurs : on résout dans le bloc le plus proche, point ramené à l'intérieur du bloc.
      const x = Math.min(Math.max(e.clientX, rect.left + 2), rect.right - 2);
      const y = Math.min(Math.max(e.clientY, rect.top + 2), rect.bottom - 2);
      return resolveClickPosition(editor.view, x, y, best, zoomRef.current, cloneIndexRef.current ?? undefined, best);
    };

    /** Case à cocher d'une liste de tâches sur la page PEINTE (copie du document) : son
     *  état ne vit que dans le document ProseMirror — le basculer dans la copie ne
     *  changerait que l'image, perdue au prochain redessin et jamais enregistrée
     *  (bug du 2026-10-26). On retrouve l'item du document et on change son attribut. */
    const taskCheckboxOf = (target: EventTarget | null): HTMLElement | null =>
      (target as HTMLElement | null)?.closest?.<HTMLElement>('li[data-checked] > label input[type="checkbox"]') ?? null;

    const toggleTaskItemFor = (li: HTMLElement) => {
      const doc = editor.state.doc;
      let itemPos: number | null = null;
      // Items des listes à plat : le <li> peint porte la position de son item.
      const attr = li.getAttribute(SRC_POS_ATTR);
      if (attr !== null && doc.nodeAt(Number(attr))?.type.name === "taskItem") itemPos = Number(attr);
      if (itemPos === null) {
        // Liste dans une cellule de tableau : pas de position propre — on résout un point
        // juste à droite de la case (sur le texte de l'item, même vide) puis on remonte à l'item.
        const r = (li.querySelector("label") ?? li).getBoundingClientRect();
        const pos = posFromCoords(r.right + 10, r.top + r.height / 2);
        if (pos !== null) {
          const $p = doc.resolve(Math.min(pos, doc.content.size));
          for (let d = $p.depth; d > 0; d--) {
            if ($p.node(d).type.name === "taskItem") {
              itemPos = $p.before(d);
              break;
            }
          }
        }
      }
      if (itemPos === null) return;
      const node = doc.nodeAt(itemPos);
      if (!node) return;
      editor.view.dispatch(editor.state.tr.setNodeMarkup(itemPos, undefined, { ...node.attrs, checked: !node.attrs.checked }));
    };

    const onMouseDown = (e: MouseEvent) => {
      // Clic droit : ne touche ni la sélection ni le glisser — le menu
      // contextuel (`onContextMenu`) décide lui-même quoi sélectionner.
      if (e.button !== 0) return;
      const taskBox = taskCheckboxOf(e.target);
      if (taskBox) {
        e.preventDefault();
        const li = taskBox.closest<HTMLElement>("li[data-checked]");
        if (li && editor.isEditable) toggleTaskItemFor(li);
        return;
      }
      // Poignée de redimensionnement de colonne (voir paintPages.ts) —
      // vérifiée en tout premier : une poignée peut visuellement se
      // trouver à l'intérieur d'un tableau d'en-tête/pied de page, donc
      // AVANT le test `headerFooterTarget` ci-dessous pour ne jamais lui
      // laisser la priorité par erreur.
      const resizeHandleTarget = (e.target as HTMLElement)?.closest<HTMLElement>(`.${COL_RESIZE_HANDLE_CLASS}`);
      if (resizeHandleTarget) {
        e.preventDefault();
        const tablePos = Number(resizeHandleTarget.getAttribute(COL_RESIZE_TABLE_POS_ATTR));
        const colIndex = Number(resizeHandleTarget.getAttribute(COL_RESIZE_COL_INDEX_ATTR));
        // Largeur de départ mesurée sur le tableau ORIGINAL (invisible,
        // mais attaché au document donc mesurable) via son `<col>` — pas
        // sur la cellule, qui n'a pas forcément d'attribut `colwidth`
        // explicite tant qu'elle n'a jamais été redimensionnée.
        const originalWrapper = editor.view.nodeDOM(tablePos) as HTMLElement | null;
        const originalTable = originalWrapper?.matches("table") ? originalWrapper : originalWrapper?.querySelector("table");
        const col = originalTable?.querySelectorAll(":scope > colgroup > col")[colIndex] as HTMLElement | undefined;
        const startWidthPx = col?.getBoundingClientRect().width;
        if (!startWidthPx) return;
        resizingCol = {
          tablePos,
          colIndex,
          startClientX: e.clientX,
          startHandleLeft: parseFloat(resizeHandleTarget.style.left),
          startWidthPx,
          currentWidthPx: startWidthPx,
          handle: resizeHandleTarget,
        };
        resizeHandleTarget.classList.add("xmd-col-resize-active");
        return;
      }
      // Poignée de redimensionnement de LIGNE — même principe, miroir
      // vertical du cas colonne ci-dessus.
      const rowResizeHandleTarget = (e.target as HTMLElement)?.closest<HTMLElement>(`.${ROW_RESIZE_HANDLE_CLASS}`);
      if (rowResizeHandleTarget) {
        e.preventDefault();
        const tablePos = Number(rowResizeHandleTarget.getAttribute(ROW_RESIZE_TABLE_POS_ATTR));
        const rowIndex = Number(rowResizeHandleTarget.getAttribute(ROW_RESIZE_ROW_INDEX_ATTR));
        const originalWrapper = editor.view.nodeDOM(tablePos) as HTMLElement | null;
        const originalTable = originalWrapper?.matches("table") ? originalWrapper : originalWrapper?.querySelector("table");
        const rows = originalTable?.querySelectorAll(":scope > tbody > tr, :scope > tr");
        const row = rows?.[rowIndex] as HTMLElement | undefined;
        const startHeightPx = row?.getBoundingClientRect().height;
        if (!startHeightPx) return;
        resizingRow = {
          tablePos,
          rowIndex,
          startClientY: e.clientY,
          startHandleTop: parseFloat(rowResizeHandleTarget.style.top),
          startHeightPx,
          currentHeightPx: startHeightPx,
          handle: rowResizeHandleTarget,
        };
        rowResizeHandleTarget.classList.add("xmd-row-resize-active");
        return;
      }
      const headerFooterTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-page-header, .xmd-page-footer");
      if (headerFooterTarget) {
        e.preventDefault();
        startHeaderFooterEditRef.current(headerFooterTarget);
        return;
      }
      // Marqueur de sommaire (voir TocMarker.ts) : cliquer dessus le
      // remplit directement — remonté par l'utilisateur ("le marqueur de
      // sommaire n'ouvre pas le panneau"), le bouton ruban dédié
      // ("Mettre à jour") ayant été retiré au profit du panneau latéral
      // « Sommaire », qui s'ouvre automatiquement une fois le sommaire
      // généré (voir `insideToc`/le curseur repositionné dedans par
      // `generateToc`).
      const tocMarkerTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-toc-marker");
      if (tocMarkerTarget) {
        e.preventDefault();
        editor.chain().focus(undefined, { scrollIntoView: false }).generateToc().run();
        return;
      }
      // Ancre de sommaire (voir TocMarker.ts, generateToc) : un lien
      // `#slug` ne peut pas être laissé au navigateur (la couche peinte
      // n'est pas un document normal, et le clic serait de toute façon
      // intercepté juste en dessous pour la résolution de position) — on
      // le gère nous-mêmes en faisant défiler jusqu'à l'élément portant
      // cet `id` (posé sur chaque titre peint par paintPages.ts).
      const anchorLink = (e.target as HTMLElement)?.closest<HTMLAnchorElement>('a[href^="#"]');
      if (anchorLink) {
        e.preventDefault();
        const targetId = decodeURIComponent(anchorLink.getAttribute("href")!.slice(1));
        const targetEl = canvas.querySelector(`#${CSS.escape(targetId)}`);
        targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      // Référence de note de fin de document (voir Footnote.ts) : saute à sa
      // définition (en fin de document) plutôt que de positionner le
      // curseur dedans — c'est un atome en lecture seule dans la couche
      // peinte, pas du texte à éditer directement.
      const footnoteRef = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-footnote-ref");
      if (footnoteRef) {
        e.preventDefault();
        const id = footnoteRef.getAttribute("data-id");
        const targetEl = canvas.querySelector(`.xmd-footnote-def[data-id="${CSS.escape(id ?? "")}"]`);
        targetEl?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      // Formule mathématique (voir Math.ts) : clic → invite avec la
      // source LaTeX actuelle, plutôt que d'éditer le rendu KaTeX
      // directement (un atome, comme les notes de fin de document). Réutilise
      // `posFromEvent` (déjà fiable sur du contenu en ligne, voir
      // resolveClickPosition.ts) pour retrouver la position réelle du
      // clic, puis cherche l'atome pile à cette position (ou juste avant,
      // selon de quel côté `posFromEvent` est tombé).
      // Diagramme Mermaid (2026-10-21, éditeur dédié) : clic sur le
      // diagramme peint → NodeSelection → le panneau latéral
      // « Diagramme » s'ouvre avec la source et l'aperçu en direct
      // (la PAGE ne montre QUE le diagramme rendu, plus jamais la
      // source brute).
      // NB : le clone peint porte la CLASSE .xmd-mermaid (le DOM du
      // NodeView, cloné tel quel), pas l'attribut data-type (qui n'existe
      // que sur le HTML sérialisé) — viser la classe, pas l'attribut.
      const mermaidTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-mermaid");
      if (mermaidTarget) {
        e.preventDefault();
        const isMermaidNode = (n: any) => n && n.type.name === "mermaidDiagram";
        let mermaidPos: number | null = null;
        // Chemin PRINCIPAL : le clone peint du bloc porte data-src-pos =
        // la position EXACTE du nœud dans le document (paintPages) — un
        // atome sans texte ne passe pas toujours bien posFromEvent.
        const blockPosAttr = mermaidTarget.closest<HTMLElement>("[data-src-pos]")?.getAttribute("data-src-pos");
        if (blockPosAttr != null) {
          const p = parseInt(blockPosAttr, 10);
          if (isMermaidNode(editor.state.doc.nodeAt(p))) mermaidPos = p;
        }
        // Repli : résolution au point cliqué (position avant/après l'atome).
        if (mermaidPos === null) {
          const clickPos = posFromEvent(e);
          if (clickPos !== null) {
            if (isMermaidNode(editor.state.doc.nodeAt(clickPos))) mermaidPos = clickPos;
            else if (isMermaidNode(editor.state.doc.nodeAt(clickPos - 1))) mermaidPos = clickPos - 1;
          }
        }
        if (mermaidPos === null) return;
        editor.commands.focus(undefined, { scrollIntoView: false });
        editor.commands.setNodeSelection(mermaidPos);
        return;
      }
      const mathTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-math");
      // Saut de section : clic → NodeSelection (sélectionnable, Suppr le
      // retire — même confort que le saut de page).
      const sectionTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-sectionbreak");
      if (sectionTarget) {
        e.preventDefault();
        const isSectionNode = (n: any) => n && n.type.name === "sectionBreak";
        const blockPosAttr = sectionTarget.closest<HTMLElement>("[data-src-pos]")?.getAttribute("data-src-pos");
        let sectionPos: number | null = null;
        if (blockPosAttr != null) {
          const p = parseInt(blockPosAttr, 10);
          if (isSectionNode(editor.state.doc.nodeAt(p))) sectionPos = p;
        }
        if (sectionPos === null) {
          const clickPos = posFromEvent(e);
          if (clickPos !== null) {
            if (isSectionNode(editor.state.doc.nodeAt(clickPos))) sectionPos = clickPos;
            else if (isSectionNode(editor.state.doc.nodeAt(clickPos - 1))) sectionPos = clickPos - 1;
          }
        }
        if (sectionPos === null) return;
        editor.commands.focus(undefined, { scrollIntoView: false });
        editor.commands.setNodeSelection(sectionPos);
        return;
      }
      // Champ de document ({{title}}…) : un clic ouvre sa saisie directe
      // (propriétés du document) au lieu de le sélectionner comme un
      // atome muet. Les champs calculés (date…) gardent le clic normal.
      const docFieldTarget = (e.target as HTMLElement)?.closest<HTMLElement>(".xmd-docfield");
      if (docFieldTarget && !readOnly) {
        const fieldName = docFieldTarget.getAttribute("data-name") ?? "";
        if (openDocFieldEditor(docFieldTarget, fieldName, layoutRef.current, (l) => onLayoutChangeRef.current(l))) {
          e.preventDefault();
          return;
        }
      }
      if (mathTarget) {
        e.preventDefault();
        const clickPos = posFromEvent(e);
        if (clickPos === null) return;
        const isMathNode = (n: any) => n && (n.type.name === "inlineMath" || n.type.name === "blockMath");
        let mathPos = clickPos;
        let node = editor.state.doc.nodeAt(mathPos);
        if (!isMathNode(node)) {
          mathPos = clickPos - 1;
          node = editor.state.doc.nodeAt(mathPos);
        }
        if (!isMathNode(node)) return;
        // Sélectionne la formule (NodeSelection) : le panneau latéral
        // « Équation » s'ouvre automatiquement avec l'éditeur WYSIWYG
        // MathLive pré-rempli (plus de window.prompt de LaTeX brut —
        // les utilisateurs ne codent pas d'équation).
        editor.commands.focus(undefined, { scrollIntoView: false });
        editor.commands.setNodeSelection(mathPos);
        // Édition DIRECTE SUR LA PAGE (point ① maquette) : le champ
        // MathLive flotte sur la zone cliquée, le panneau ne garde
        // que la palette.
        startMathEditRef.current(mathPos, mathTarget);
        return;
      }
      let pos = posFromEvent(e);
      if (pos === null) {
        // Clic dans une zone VIDE de la page (sous le dernier bloc, dans les marges, entre deux
        // blocs) : aucun bloc sous la souris. Avant (2026-10-26) rien ne se passait — impossible de
        // placer le curseur après un tableau ou un saut de section en fin de document.
        const blank = resolveBlankClick(e);
        if (blank === null) return;
        e.preventDefault();
        editor.commands.focus(undefined, { scrollIntoView: false });
        if (typeof blank === "object") {
          // Sous un bloc dans lequel on ne tape pas (tableau, formule, diagramme…) et que rien
          // ne suit où mettre le curseur : comme Word, on ouvre un paragraphe vide juste après lui.
          const { state } = editor;
          const tr = state.tr.insert(blank.insertAt, state.schema.nodes.paragraph.create());
          editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, blank.insertAt + 1)));
          return;
        }
        pos = blank;
      }
      e.preventDefault();
      editor.commands.focus(undefined, { scrollIntoView: false });

      // Maj+clic (simple) : étend la sélection existante depuis son
      // ancre (comme un glisser-sélection, sans glisser).
      if (e.shiftKey && e.detail === 1) {
        const { anchor } = editor.state.selection;
        // Deux cellules différentes d'un même tableau : vraie CellSelection (comme le glisser) — un
        // simple setTextSelection est normalisé par ProseMirror et ne sélectionne qu'une cellule.
        const anchorCell = findCellPos(editor.state.doc, anchor);
        const headCell = findCellPos(editor.state.doc, pos);
        if (anchorCell !== null && headCell !== null && anchorCell !== headCell) {
          try {
            editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, anchorCell, headCell)));
            return;
          } catch {
            /* cellules de tableaux différents : repli texte ci-dessous */
          }
        }
        editor.commands.setTextSelection({ from: anchor, to: pos });
        return;
      }
      // Double-clic : sélectionne le MOT sous le point (le repli = un
      // simple clic si le point n'est pas sur du texte indexé).
      if (e.detail === 2) {
        const word = wordRangeAtPoint(e.clientX, e.clientY);
        if (word) {
          editor.commands.setTextSelection(word);
          return;
        }
      }
      // Triple-clic : sélectionne le BLOC entier (sauf tableau — une
      // grille ne se sélectionne pas d'un triple-clic, ça n'aurait pas
      // de sens d'englober tout le tableau).
      if (e.detail === 3) {
        const block = findClonedBlock(e.target);
        const srcPosAttr = block?.getAttribute("data-src-pos");
        if (block && srcPosAttr != null) {
          const srcPos = parseInt(srcPosAttr, 10);
          const node = editor.state.doc.nodeAt(srcPos);
          if (node && node.type.name !== "table") {
            const from = srcPos + 1;
            const to = srcPos + node.nodeSize - 1;
            if (from < to) {
              editor.commands.setTextSelection({ from, to });
              return;
            }
          }
        }
      }

      dragging = true;
      anchorPos = pos;
      cellAnchorPos = findCellPos(editor.state.doc, pos);
      editor.commands.setTextSelection(pos);
      // Démarre la boucle d'auto-scroll (sans effet tant que la souris
      // n'approche pas un bord — le tick ne fait alors rien).
      lastDragPoint.x = e.clientX;
      lastDragPoint.y = e.clientY;
      if (dragAutoScrollRaf === null) dragAutoScrollRaf = requestAnimationFrame(dragAutoScrollTick);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (resizingCol) {
        // Delta en pixels ÉCRAN (`clientX`) converti en pixels LOGIQUES
        // (avant le `transform: scale(zoom)` de `.xmd-page-canvas`) —
        // sans cette division, glisser à 150% de zoom déplacerait la
        // poignée 1,5× plus vite que la souris. Mêmes unités que
        // `caretPosition.ts`/`selectionHighlight.ts` pour la même raison.
        const logicalDelta = (e.clientX - resizingCol.startClientX) / zoomRef.current;
        const MIN_COL_WIDTH_PX = 40;
        resizingCol.currentWidthPx = Math.max(MIN_COL_WIDTH_PX, resizingCol.startWidthPx + logicalDelta);
        // La poignée ne bouge que de l'écart réellement appliqué (clampé
        // à la largeur minimale), pas du delta brut — sinon elle
        // continuerait de suivre la souris au-delà de la limite tout en
        // laissant la largeur réelle bloquée, décalage visible et
        // trompeur.
        const appliedDelta = resizingCol.currentWidthPx - resizingCol.startWidthPx;
        resizingCol.handle.style.left = `${resizingCol.startHandleLeft + appliedDelta}px`;
        return;
      }
      if (resizingRow) {
        const logicalDelta = (e.clientY - resizingRow.startClientY) / zoomRef.current;
        const MIN_ROW_HEIGHT_PX = 24;
        resizingRow.currentHeightPx = Math.max(MIN_ROW_HEIGHT_PX, resizingRow.startHeightPx + logicalDelta);
        const appliedDeltaY = resizingRow.currentHeightPx - resizingRow.startHeightPx;
        resizingRow.handle.style.top = `${resizingRow.startHandleTop + appliedDeltaY}px`;
        return;
      }
      if (!dragging || anchorPos === null) return;
      // Point mémorisé pour l'auto-scroll de glissement (le tick rAF
      // étend la sélection à CE point après chaque scroll programmatique).
      lastDragPoint.x = e.clientX;
      lastDragPoint.y = e.clientY;
      const pos = posFromEvent(e);
      if (pos === null) return;
      // Glisser à travers plusieurs cellules d'un tableau DOIT produire une
      // vraie `CellSelection` (nécessaire pour `mergeCells`/`setCellBorder`
      // etc., voir `applyToSelectedCells` plus haut) — un simple
      // `setTextSelection({from, to})` ne la construit JAMAIS, même si la
      // plage traverse des cellules : ProseMirror la normalise en
      // sélection de texte ordinaire, ce qui rendait la fusion de cellules
      // glissées-sélectionnées peu fiable (jamais une vraie sélection
      // multi-cellules, quel que soit le zoom/la résolution d'écran —
      // cette étape-ci n'a d'ailleurs rien de géométrique, donc n'est en
      // fait pas sensible à ça, contrairement à `posFromEvent` ci-dessus).
      const cellPos = findCellPos(editor.state.doc, pos);
      if (cellAnchorPos !== null && cellPos !== null && cellPos !== cellAnchorPos) {
        try {
          const sel = CellSelection.create(editor.state.doc, cellAnchorPos, cellPos);
          editor.view.dispatch(editor.state.tr.setSelection(sel));
          return;
        } catch {
          // Les deux cellules ne sont pas dans le même tableau (ou autre
          // position invalide) — repli sur la sélection de texte normale.
        }
      }
      editor.commands.setTextSelection({ from: anchorPos, to: pos });
    };
    const onMouseUp = () => {
      if (resizingCol) {
        resizingCol.handle.classList.remove("xmd-col-resize-active");
        applyColumnWidth(editor, resizingCol.tablePos, resizingCol.colIndex, Math.round(resizingCol.currentWidthPx));
        resizingCol = null;
        return;
      }
      if (resizingRow) {
        resizingRow.handle.classList.remove("xmd-row-resize-active");
        applyRowHeight(editor, resizingRow.tablePos, resizingRow.rowIndex, Math.round(resizingRow.currentHeightPx));
        resizingRow = null;
        return;
      }
      dragging = false;
      anchorPos = null;
      cellAnchorPos = null;
      stopDragAutoScroll();
    };

    // Filet de sécurité : un lien réel (`<a href="https://…">`) cliqué
    // dans la couche peinte a fait naviguer le NAVIGATEUR SYSTÈME (Chrome
    // ouvert par-dessus l'appli — `tauri-plugin-opener` redirige toute
    // navigation externe hors de la WebView vers le navigateur par
    // défaut, comportement de sécurité voulu par Tauri) au lieu de se
    // contenter de positionner le curseur, comme n'importe quel autre
    // clic sur cette couche en lecture seule. `preventDefault()` sur
    // `mousedown` (dans `onMouseDown` ci-dessus) ne suffit PAS à annuler
    // la navigation déclenchée par l'événement `click` natif du lien qui
    // suit — il faut l'empêcher explicitement, lui aussi.
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest("a")) {
        e.preventDefault();
      }
      // Le basculement natif de la case de la copie peinte est annulé : l'état vient du document.
      if (taskCheckboxOf(e.target)) e.preventDefault();
    };

    // Menu contextuel clic-droit (voir `tableContextMenu`/`TableContextMenu`
    // plus bas) — uniquement si le clic tombe dans un tableau, façon Word :
    // le menu natif du navigateur reste disponible partout ailleurs (texte
    // normal), on n'intercepte QUE ce cas précis.
    const onContextMenu = (e: MouseEvent) => {
      const pos = posFromEvent(e);
      if (pos === null) return;
      const cellPos = findCellPos(editor.state.doc, pos);
      e.preventDefault();
      // Préserve une sélection déjà en place si le clic tombe dedans (pour
      // que Couper/Copier/"Fusionner" agissent dessus) ; sinon positionne
      // le curseur au point cliqué, comme un clic normal.
      const sel = editor.state.selection;
      const insideSelection = sel.from !== sel.to && pos >= sel.from && pos <= sel.to;
      if (!(sel instanceof CellSelection) && !insideSelection) {
        editor.commands.focus(undefined, { scrollIntoView: false });
        editor.commands.setTextSelection(pos);
      }
      const spell = spellErrorAt(editor.state, pos);
      setTableContextMenu({
        x: e.clientX,
        y: e.clientY,
        inTable: cellPos !== null,
        spell: spell ? { ...spell, suggestions: null } : undefined,
      });
      if (spell) {
        // Les suggestions (recherche Hunspell) arrivent après l'ouverture du menu.
        void suggestWord(useSettingsStore.getState().spellLanguage, spell.word, 5)
          .catch(() => [] as string[])
          .then((suggestions) =>
            setTableContextMenu((m) => (m?.spell && m.spell.from === spell.from ? { ...m, spell: { ...m.spell, suggestions } } : m)),
          );
      }
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      stopDragAutoScroll();
    };
  }, [editor]);
}
