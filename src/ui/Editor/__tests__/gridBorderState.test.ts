/**
 * Schéma de bordures du panneau Tableau : il doit refléter les bordures RÉELLES de la sélection
 * (bug du 2026-10-26 : il repartait vierge et ne montrait jamais l'état du document).
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { CellSelection } from "@tiptap/pm/tables";
import { ParagraphMarkdown } from "../extensions/ParagraphMarkdown";
import { TableMarkdown } from "../extensions/TableMarkdown";
import { TableRowStyled } from "../extensions/TableRowStyle";
import { TableCellStyled, TableHeaderStyled } from "../extensions/TableCellStyle";
import { applyBorderPreset, readGridBorderState, setGridLineBorder } from "../editorTableOps";

const TABLE = "<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>";

function makeEditor(): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false }, paragraph: false }),
      ParagraphMarkdown,
      TableMarkdown.configure({ resizable: true }),
      TableRowStyled,
      TableHeaderStyled,
      TableCellStyled,
      Markdown.configure({ html: true }),
    ],
    content: TABLE,
  });
}

/** Sélectionne toutes les cellules du tableau (CellSelection première → dernière). */
function selectAll(ed: Editor): void {
  const cells: number[] = [];
  ed.state.doc.descendants((n, pos) => {
    if (n.type.name === "tableCell" || n.type.name === "tableHeader") cells.push(pos);
  });
  ed.view.dispatch(ed.state.tr.setSelection(CellSelection.create(ed.state.doc, cells[0], cells[cells.length - 1])));
}

const states = (ed: Editor) => Object.fromEntries([...(readGridBorderState(ed) ?? new Map()).entries()].map(([k, v]) => [k, v.state]));

describe("readGridBorderState — état réel des bordures", () => {
  it("un tableau sans réglage : toutes les lignes sont visibles (bordure par défaut)", () => {
    const ed = makeEditor();
    selectAll(ed);
    const s = readGridBorderState(ed)!;
    expect([...s.values()].every((i) => i.state === "on" && i.css === null)).toBe(true);
    expect(s.size).toBe(6); // 3 horizontales + 3 verticales pour 2×2
  });

  it("« Aucune » : toutes les lignes sont absentes", () => {
    const ed = makeEditor();
    selectAll(ed);
    applyBorderPreset(ed, "none", null);
    expect(Object.values(states(ed)).every((v) => v === "off")).toBe(true);
  });

  it("« Extérieur » avec un trait : le pourtour porte ce trait, l'intérieur garde la bordure par défaut", () => {
    const ed = makeEditor();
    selectAll(ed);
    applyBorderPreset(ed, "none", null);
    applyBorderPreset(ed, "outside", "2px dashed #ff0000");
    const s = readGridBorderState(ed)!;
    expect(s.get("row-0")).toEqual({ state: "on", css: "2px dashed #ff0000" });
    expect(s.get("col-2")).toEqual({ state: "on", css: "2px dashed #ff0000" });
    expect(s.get("row-1")!.state).toBe("off");
    expect(s.get("col-1")!.state).toBe("off");
  });

  it("une ligne présente sur une partie seulement est « mixed »", () => {
    const ed = makeEditor();
    selectAll(ed);
    // Retire le bord haut d'une seule des deux cellules de la première ligne.
    let first = -1;
    ed.state.doc.descendants((n, pos) => {
      if (first < 0 && n.type.name === "tableCell") first = pos;
    });
    const node = ed.state.doc.nodeAt(first)!;
    ed.view.dispatch(ed.state.tr.setNodeMarkup(first, undefined, { ...node.attrs, borderTop: "none" }));
    selectAll(ed);
    expect(states(ed)["row-0"]).toBe("mixed");
    expect(states(ed)["row-2"]).toBe("on");
  });

  it("supprimer une ligne interne via le schéma écrit « none » des deux côtés", () => {
    const ed = makeEditor();
    selectAll(ed);
    setGridLineBorder(ed, [{ axis: "col", index: 1 }], "none");
    selectAll(ed);
    const s = states(ed);
    expect(s["col-1"]).toBe("off");
    expect(s["col-0"]).toBe("on");
    expect(s["col-2"]).toBe("on");
  });
});
