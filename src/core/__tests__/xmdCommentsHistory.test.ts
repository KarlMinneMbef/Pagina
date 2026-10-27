/**
 * Commentaires et historique du format `.xmd` (2026-10-27, roadmap 5.2/5.3) :
 * les deux modèles purs (comments.ts / history.ts) — tolérance de lecture,
 * round-trip JSON, plafond de l'historique, révision automatique vs nommée —
 * plus l'aller-retour Markdown de la marque de commentaire (CommentMark.ts).
 */
import { describe, it, expect } from "vitest";
import { parseComments, serializeComments, newCommentId, type DocComment } from "../xmd/comments";
import { parseHistory, serializeHistory, appendRevision, MAX_REVISIONS, type HistoryFile } from "../xmd/history";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { ParagraphMarkdown } from "../../ui/Editor/extensions/ParagraphMarkdown";
import { CommentMark } from "../../ui/Editor/extensions/CommentMark";

function comment(over: Partial<DocComment> = {}): DocComment {
  return {
    id: newCommentId(),
    quote: "passage cité",
    author: "Karl Minne",
    text: "À revoir",
    createdAt: "2026-10-27T10:00:00.000Z",
    resolved: false,
    resolvedAt: null,
    replies: [],
    ...over,
  };
}

describe("comments.ts — modèle", () => {
  it("round-trip JSON identique", () => {
    const file = { version: 1 as const, comments: [comment(), comment({ resolved: true, resolvedAt: "2026-10-27T11:00:00.000Z", replies: [{ id: newCommentId(), author: "A", text: "Réponse", createdAt: "2026-10-27T10:30:00.000Z" }] })] };
    const raw = serializeComments(file);
    expect(parseComments(raw)).toEqual(file);
  });

  it("fichier absent/corrompu = liste vide, jamais d'erreur", () => {
    expect(parseComments("")).toEqual({ version: 1, comments: [] });
    expect(parseComments("{corrompu")).toEqual({ version: 1, comments: [] });
    expect(parseComments(JSON.stringify({ version: 1, comments: "pas une liste" }))).toEqual({ version: 1, comments: [] });
  });

  it("champs manquants complétés (document ancien)", () => {
    const raw = JSON.stringify({ version: 1, comments: [{ id: "c1", text: "ok" }, null, 42] });
    const file = parseComments(raw);
    expect(file.comments.length).toBe(1);
    expect(file.comments[0].text).toBe("ok");
    expect(file.comments[0].resolved).toBe(false);
    expect(file.comments[0].replies).toEqual([]);
  });
});

describe("history.ts — modèle", () => {
  const mk = (n: number): HistoryFile => ({ version: 1, revisions: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, label: i === n - 1 ? "gardée" : null, author: "K", savedAt: `2026-10-27T10:0${i}:00Z`, markdown: `# v${i}` })) });

  it("round-trip JSON identique", () => {
    const file = mk(3);
    expect(parseHistory(serializeHistory(file))).toEqual(file);
  });

  it("fichier absent/corrompu = liste vide", () => {
    expect(parseHistory("")).toEqual({ version: 1, revisions: [] });
    expect(parseHistory("non-json")).toEqual({ version: 1, revisions: [] });
  });

  it("appendRevision : contenu identique = RIEN (sauf version nommée)", () => {
    const file = mk(1);
    expect(appendRevision(file, "# v0", "K", null).revisions.length).toBe(1);
    expect(appendRevision(file, "# nouvelle", "K", null).revisions.length).toBe(2);
    // Nommer crée TOUJOURS une entrée, même sans changement.
    expect(appendRevision(file, "# v0", "K", "Ma version").revisions.length).toBe(2);
    expect(appendRevision(file, "# v0", "K", "Ma version").revisions[appendRevision(file, "# v0", "K", "Ma version").revisions.length - 1]?.label).toBe("Ma version");
  });

  it("plafond : les plus vieilles révisions AUTOMATIQUES sautent d'abord ; les 3 dernières jamais", () => {
    let file = mk(MAX_REVISIONS + 5);
    file = appendRevision(file, "# nouvelle", "K", null);
    expect(file.revisions.length).toBeLessThanOrEqual(MAX_REVISIONS + 3); // les nommées/protégées peuvent dépasser le plafond
    // Les 3 dernières révisions sont toujours là.
    const ids = file.revisions.slice(-3).map((r) => r.id);
    expect(ids).toContain(`r${MAX_REVISIONS + 4}`);
    // La révision « gardée » (nommée) survit au plafond.
    expect(file.revisions.some((r) => r.label === "gardée")).toBe(true);
  });
});

describe("CommentMark — aller-retour Markdown", () => {
  function makeEditor(markdown: string): Editor {
    return new Editor({
      extensions: [
        StarterKit.configure({ link: { openOnClick: false }, paragraph: false }),
        ParagraphMarkdown,
        CommentMark,
        Markdown.configure({ html: true }),
      ],
      content: markdown,
    });
  }
  const getMarkdown = (ed: Editor) => ((ed.storage as any).markdown.getMarkdown() as string).trimEnd(); // eslint-disable-line @typescript-eslint/no-explicit-any

  it("le span data-comment devient une MARQUE et ressort à l'identique", () => {
    const ed = makeEditor("Voir <span data-comment=\"cabc123\">ce passage</span> ci-dessus.");
    const md = getMarkdown(ed);
    expect(md).toContain('<span data-comment="cabc123">ce passage</span>');
    const again = makeEditor(md);
    expect(getMarkdown(again)).toBe(md);
  });

  it("addMark → sérialisation, puis relecture : la marque survit", () => {
    const ed = makeEditor("Un passage à commenter.");
    const { from, to } = { from: 4, to: 23 }; // « passage à commenter » (pos 4..22)
    ed.view.dispatch(ed.state.tr.addMark(from, to, ed.state.schema.marks.comment.create({ id: "ctest9" })));
    const md = getMarkdown(ed);
    expect(md).toContain('<span data-comment="ctest9">passage à commenter</span>');
    const again = makeEditor(md);
    let found = false;
    again.state.doc.descendants((node) => {
      if (node.marks.some((m) => m.type.name === "comment" && m.attrs.id === "ctest9")) found = true;
      return true;
    });
    expect(found).toBe(true);
  });
});
