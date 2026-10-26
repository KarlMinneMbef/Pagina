/**
 * Édition de formule DANS LA PAGE : un champ MathLive flottant (hôte `position: fixed` sur le body) posé sur la formule
 * peinte, recalé au repaint/scroll et refermé au clic extérieur ; le panneau latéral ne garde que la palette.
 *
 * Extrait de MarkdownEditor.tsx (dette technique 0.4, 2026-10-26) : le corps est inchangé, seul son emplacement a bougé.
 */
import type { Editor } from "@tiptap/react";
import type { EditorRefs } from "./editorRefs";

export function useMathEdit({ editor, refs }: {
  editor: Editor;
  refs: EditorRefs;
}) {
  const { wrapRef, canvasRef, startMathEditRef, mathEditRef, pendingMathLatexRef } = refs;

  // --- Édition de formule DANS LA PAGE (point ① maquette, 2026-10-21) ---
  //
  // Retrouve le clone peint d'une formule à partir de sa position dans le
  // document : les clones de bloc portent `data-src-pos` (paintPages.ts)
  // et un bloc n'est JAMAIS coupé entre deux pages, donc la formule est
  // toujours entière dans un seul clone. `blockMath` EST un bloc (cherche
  // direct) ; `inlineMath` se localise par son bloc ancêtre + son RANG
  // parmi les formules inline du bloc (l'ordre des clones suit l'ordre du
  // document).
  const findPaintedMath = (mathPos: number): HTMLElement | null => {
    const canvas = canvasRef.current;
    if (!canvas || !editor) return null;
    const node = editor.state.doc.nodeAt(mathPos);
    if (!node) return null;
    if (node.type.name === "blockMath") {
      return canvas.querySelector<HTMLElement>(`[data-src-pos="${mathPos}"]`);
    }
    if (node.type.name !== "inlineMath") return null;
    const resolved = editor.state.doc.resolve(mathPos);
    let blockPos = -1;
    for (let d = resolved.depth; d >= 1; d--) {
      if (resolved.node(d).isBlock) {
        blockPos = resolved.before(d);
        break;
      }
    }
    if (blockPos < 0) return null;
    // Rang de CETTE formule parmi celles du bloc : compte les formules
    // entièrement avant elle dans le bloc (nodesBetween est exclusif de
    // la borne `to`, la nôtre commence exactement à mathPos).
    let index = 0;
    editor.state.doc.nodesBetween(blockPos + 1, mathPos, (n) => {
      if (n.type.name === "inlineMath") index++;
      return true;
    });
    const blockEl = canvas.querySelector<HTMLElement>(`[data-src-pos="${blockPos}"]`);
    if (!blockEl) return null;
    const maths = blockEl.querySelectorAll<HTMLElement>('[data-type="inline-math"]');
    return maths[index] ?? null;
  };

  // Ouvre le champ MathLive flottant SUR la formule peinte (même
  // mécanisme que startHeaderFooterEdit : hôte fixed sur le body,
  // coordonnées de la zone peinte, recalé à chaque repaint/scroll —
  // le repaint DÉTRUIT la zone, on la retrouve par position). La
  // formule est modifiée là où elle s'affiche ; le panneau latéral
  // garde la palette de symboles, qui route ici par insertMathLatex.
  const startMathEdit = (mathPos: number, target?: HTMLElement | null) => {
    // Une seule formule éditée à la fois : cliquer une autre formule
    // referme la précédente (le clic extérieur fait déjà le ménage,
    // ceci couvre les ouvertures programmatiques).
    mathEditRef.current?.detach();
    const ed = editor;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!ed || !canvas) return;
    const node = ed.state.doc.nodeAt(mathPos);
    if (!node || (node.type.name !== "inlineMath" && node.type.name !== "blockMath")) return;
    const isBlock = node.type.name === "blockMath";
    const source = String(node.attrs.source ?? "");

    const host = document.createElement("div");
    host.className = `xmd-math-edit${isBlock ? " xmd-math-edit-block" : ""}`;
    // Étiquette de la maquette : la zone se lit comme éditable.
    const tag = document.createElement("span");
    tag.className = "xmd-math-edit-tag";
    tag.textContent = "Édition sur la page";
    host.appendChild(tag);
    document.body.appendChild(host);

    // Position : sur le clone peint ; repli = première page visible
    // (jamais rencontré en pratique — un bloc sélectionné est toujours
    // peint — mais garantit qu'un champ s'ouvre dans tous les cas).
    const positionOn = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      host.style.left = `${r.left}px`;
      host.style.top = `${r.top}px`;
      host.style.width = `${r.width}px`;
      host.style.minHeight = `${r.height}px`;
      return true;
    };
    const positionFallback = () => {
      const pages = Array.from(canvas.querySelectorAll<HTMLElement>(".xmd-page"));
      const visible = pages.find((p) => {
        const r = p.getBoundingClientRect();
        return r.bottom > 60 && r.top < window.innerHeight;
      });
      if (!visible) return;
      const r = visible.getBoundingClientRect();
      host.style.left = `${r.left + r.width * 0.15}px`;
      host.style.top = `${r.top + 100}px`;
      host.style.width = `${r.width * 0.7}px`;
      host.style.minHeight = "40px";
    };
    const painted = target ?? findPaintedMath(mathPos);
    if (painted && positionOn(painted)) {
      // posé sur la zone peinte
    } else {
      positionFallback();
    }

    let closed = false;

    // Recalage : la zone peinte est DÉTRUITE à chaque frappe (repaint) —
    // on la retrouve par position et le champ la suit. Si la formule a
    // disparu du document (suppression depuis le panneau), fermeture.
    const reposition = () => {
      if (closed) return;
      const el = findPaintedMath(mathPos);
      if (el) {
        positionOn(el);
        return;
      }
      const n = ed.state.doc.nodeAt(mathPos);
      if (!n || (n.type.name !== "inlineMath" && n.type.name !== "blockMath")) detach();
    };

    const resizeObserver = new ResizeObserver(() => reposition());
    resizeObserver.observe(canvas);
    window.addEventListener("resize", reposition);
    wrap?.addEventListener("scroll", reposition, { passive: true });

    // Referme au clic ailleurs que dans le champ, le panneau latéral ou
    // les barres de commandes (mêmes exclusions que l'en-tête/pied).
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (host.contains(t)) return;
      if (t instanceof Element && t.closest(".ctx-host")) return;
      if (t instanceof Element && t.closest(".tb-ribbon-stack, .tbar")) return;
      detach();
    };
    document.addEventListener("mousedown", onDocMouseDown, true);

    const detach = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener("mousedown", onDocMouseDown, true);
      resizeObserver.disconnect();
      window.removeEventListener("resize", reposition);
      wrap?.removeEventListener("scroll", reposition);
      if (mathEditRef.current?.host === host) mathEditRef.current = null;
      host.remove();
    };
    const onHostKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        detach(); // la NodeSelection reste : le panneau et la palette demeurent
      }
    };
    host.addEventListener("keydown", onHostKeyDown);

    // MathLive en import DYNAMIQUE (lourd) : le champ apparaît un
    // instant après le clic, comme dans le panneau avant. Le module
    // embarque les styles du champ (mathLiveField.ts).
    const load = import("../mathLiveField");
    load.then(({ MathfieldElement: MathfieldElementClass }) => {
      if (closed || !host.isConnected) return;
      const mf = new MathfieldElementClass();
      // « manual » : le clavier virtuel flottant de MathLive ne se
      // déclenche JAMAIS automatiquement. L'ancien attribut
      // « virtual-keyboard-mode » n'existait pas (ignoré en silence) et
      // le clavier géant s'affichait au focus — supprimé définitivement
      // (retour utilisateur : « trop grossier ») : la palette de
      // symboles du panneau latéral Équation la remplace, et le clavier
      // est en plus tué par CSS (voir MarkdownEditor.css).
      mf.setAttribute("math-virtual-keyboard-policy", "manual");
      mf.setAttribute("locale", "fr");
      mf.setValue(source, { silenceNotifications: true });
      mf.addEventListener("input", () => {
        // Mise à jour EN DIRECT du document (même chemin que le panneau
        // avant : setNodeAttribute → repaint → KaTeX sous le champ).
        ed.view.dispatch(ed.view.state.tr.setNodeAttribute(mathPos, "source", mf.value));
      });
      host.appendChild(mf);
      mathEditRef.current = { host, mf, mathPos, detach };
      mf.focus();
      // Insertion en attente (palette cliquée avant l'ouverture) ?
      if (pendingMathLatexRef.current !== null) {
        const latex = pendingMathLatexRef.current;
        pendingMathLatexRef.current = null;
        mf.insert(latex, { focus: true, feedback: false, selectionMode: "placeholder" });
      }
    });
    // Filet : si l'import échoue, ne pas laisser un hôte vide.
    load.catch(() => detach());
  };
  startMathEditRef.current = startMathEdit;
}
