/**
 * Sérialisation des tableaux : une cellule qui contient autre chose qu'UN paragraphe
 * (case à cocher, liste, titre, bloc de code…) ne doit jamais être écrite en
 * tableau GFM (qui ne garde que le texte) mais en HTML — sinon son contenu, dont
 * l'état coché d'une case, est perdu à l'enregistrement (bug du 2026-10-26).
 */
import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import { ParagraphMarkdown } from "../ParagraphMarkdown";
import { TableMarkdown } from "../TableMarkdown";
import { TableRowStyled } from "../TableRowStyle";
import { TableCellStyled, TableHeaderStyled } from "../TableCellStyle";

function makeEditor(content: string): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false }, paragraph: false }),
      ParagraphMarkdown,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableMarkdown.configure({ resizable: true }),
      TableRowStyled,
      TableHeaderStyled,
      TableCellStyled,
      Markdown.configure({ html: true }),
    ],
    content,
  });
}

function getMarkdown(ed: Editor): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ed.storage as any).markdown.getMarkdown() as string;
}

/** États cochés de toutes les cases du document, dans l'ordre. */
function checkedStates(ed: Editor): boolean[] {
  const out: boolean[] = [];
  ed.state.doc.descendants((n) => {
    if (n.type.name === "taskItem") out.push(!!n.attrs.checked);
  });
  return out;
}

const taskCell = (checked: boolean) =>
  `<td><ul data-type="taskList"><li data-type="taskItem" data-checked="${checked}"><label><input type="checkbox"${checked ? " checked" : ""}><span></span></label><div><p></p></div></li></ul></td>`;

const TABLE = `<table><tbody><tr><th>#</th><th>OK</th></tr><tr><td>A1</td>${taskCell(true)}</tr><tr><td>A2</td>${taskCell(false)}</tr><tr><td>A3</td>${taskCell(true)}</tr></tbody></table>`;

describe("TableMarkdown — contenu de cellule non textuel", () => {
  it("garde l'état coché des cases dans les cellules (aller-retour Markdown)", () => {
    const ed = makeEditor(TABLE);
    expect(checkedStates(ed)).toEqual([true, false, true]);
    const md = getMarkdown(ed);
    // Écrit en HTML (pas en tableau GFM, qui perdrait les cases).
    expect(md).toContain("<table");
    expect(md).not.toMatch(/^\| A1 \|/m);
    const relu = makeEditor(md);
    expect(checkedStates(relu)).toEqual([true, false, true]);
  });

  it("garde une case avec du texte et une liste à puces dans une cellule", () => {
    const html =
      `<table><tbody><tr><th>#</th><th>OK</th></tr><tr><td>B1</td><td><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>fait</p></div></li></ul></td></tr>` +
      `<tr><td>B2</td><td><ul><li><p>un</p></li><li><p>deux</p></li></ul></td></tr></tbody></table>`;
    const ed = makeEditor(html);
    const relu = makeEditor(getMarkdown(ed));
    expect(checkedStates(relu)).toEqual([true]);
    expect(relu.getText()).toContain("fait");
    expect(relu.getText()).toContain("deux");
  });

  it("garde un vrai tableau Markdown pour un tableau de simple texte", () => {
    const ed = makeEditor("| a | b |\n| --- | --- |\n| 1 | 2 |\n");
    const md = getMarkdown(ed);
    expect(md).toMatch(/^\| a \| b \|/m);
    expect(md).not.toContain("<table");
  });

  it("relit les bordures en raccourci (border: none) et les largeurs de colonne d'un tableau d'en-tête", () => {
    const html =
      '<table><tbody><tr><td colwidth="440" style="border-top:none;border-right:none;border-bottom:none;border-left:none"><p>a</p></td>' +
      '<td colwidth="240" style="border:none"><p>b</p></td><td style="border-bottom: 2px solid #ff0000"><p>c</p></td></tr></tbody></table>';
    const ed = makeEditor(html);
    const cells: Record<string, unknown>[] = [];
    ed.state.doc.descendants((n) => {
      if (n.type.name === "tableCell") cells.push(n.attrs);
    });
    expect(cells.map((c) => c.borderTop)).toEqual(["none", "none", null]);
    expect(cells.map((c) => c.borderLeft)).toEqual(["none", "none", null]);
    expect(String(cells[2].borderBottom)).toContain("solid");
    expect(cells.map((c) => c.colwidth)).toEqual([[440], [240], null]);
    // Aller-retour : bordures et largeurs survivent à l'écriture puis à la relecture.
    const relu = makeEditor(getMarkdown(ed));
    const again: Record<string, unknown>[] = [];
    relu.state.doc.descendants((n) => {
      if (n.type.name === "tableCell") again.push(n.attrs);
    });
    expect(again.map((c) => c.borderTop)).toEqual(["none", "none", null]);
    expect(again.map((c) => c.colwidth)).toEqual([[440], [240], null]);
  });
});
