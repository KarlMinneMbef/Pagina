/**
 * Image du document : le texte garde le lien RELATIF, le rendu utilise l'adresse blob des octets, une largeur donne du
 * HTML <img>, et le tout fait l'aller-retour Markdown sans rien perdre.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { ImageAsset } from "../ImageAsset";
import { syncAssetUrls, resolveAssetUrl, releaseAssetUrls } from "../../assetUrls";

function makeEditor(content: string): Editor {
  return new Editor({ extensions: [StarterKit, ImageAsset, Markdown.configure({ html: true })], content });
}
const md = (ed: Editor) => ((ed.storage as any).markdown.getMarkdown() as string).trimEnd(); // eslint-disable-line @typescript-eslint/no-explicit-any

const PNG = new Uint8Array([1, 2, 3]);

describe("ImageAsset", () => {
  beforeEach(() => {
    releaseAssetUrls();
    // jsdom n'implémente pas createObjectURL : adresse factice stable par Blob.
    let n = 0;
    URL.createObjectURL = () => `blob:test/${++n}`;
    URL.revokeObjectURL = () => {};
  });

  it("une image Markdown est EN LIGNE, avec du texte autour, et ressort à l'identique", () => {
    const src = "Voir ![plan](images/plan-aaaa1111.png) ci-dessus.\n";
    const ed = makeEditor(src);
    expect(ed.state.doc.firstChild?.type.name).toBe("paragraph");
    expect(ed.state.doc.childCount).toBe(1);
    expect(md(ed)).toBe(src.trimEnd());
  });

  it("le lien du texte reste relatif, le rendu DOM utilise l'adresse blob", () => {
    syncAssetUrls({ "images/plan-aaaa1111.png": { bytes: PNG, mime: "image/png" } });
    const ed = makeEditor("![plan](images/plan-aaaa1111.png)\n");
    const html = ed.getHTML();
    expect(html).toContain('src="blob:test/1"');
    expect(html).toContain('data-asset-src="images/plan-aaaa1111.png"');
    // Relu depuis son propre rendu (copier-coller dans l'application) : le lien d'origine est retrouvé.
    const again = makeEditor(html);
    expect(md(again)).toBe("![plan](images/plan-aaaa1111.png)");
  });

  it("une largeur donne un <img> HTML (lisible partout) et fait l'aller-retour", () => {
    const ed = makeEditor('<p><img src="images/a.png" alt="vue" width="50%"></p>');
    expect(md(ed)).toBe('<img src="images/a.png" alt="vue" width="50%">');
    const again = makeEditor(md(ed));
    let width: unknown = null;
    again.state.doc.descendants((n) => {
      if (n.type.name === "image") width = n.attrs.width;
    });
    expect(width).toBe("50%");
  });

  it("titre et parenthèses du chemin échappés", () => {
    const ed = makeEditor('![a](images/x.png "Légende")\n');
    expect(md(ed)).toContain('![a](images/x.png "Légende")');
  });

  it("le registre : même octets = même adresse, octets changés = nouvelle adresse, inconnu = tel quel", () => {
    const a = { bytes: PNG, mime: "image/png" };
    syncAssetUrls({ "images/a.png": a });
    const u1 = resolveAssetUrl("images/a.png");
    syncAssetUrls({ "images/a.png": a, "images/b.png": { bytes: new Uint8Array([9]), mime: "image/png" } });
    expect(resolveAssetUrl("images/a.png")).toBe(u1);
    expect(resolveAssetUrl("images/b.png")).not.toBe(u1);
    expect(resolveAssetUrl("https://exemple.org/x.png")).toBe("https://exemple.org/x.png");
    syncAssetUrls({ "images/a.png": { bytes: new Uint8Array([7]), mime: "image/png" } });
    expect(resolveAssetUrl("images/a.png")).not.toBe(u1);
    expect(resolveAssetUrl("images/b.png")).toBe("images/b.png");
  });
});
