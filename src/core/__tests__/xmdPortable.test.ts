/**
 * « Dans un autre lecteur Markdown il ne faut rien voir » : le document.md d'un .xmd, rendu par un lecteur Markdown
 * ordinaire (markdown-it, comme GitHub / VS Code), ne montre que le contenu — ni configuration, ni commentaire,
 * ni historique ; les images sont de simples liens relatifs vers le dossier images/ du conteneur extrait.
 */
import { describe, it, expect } from "vitest";
import MarkdownIt from "markdown-it";
import { unzipSync, strFromU8 } from "fflate";
import { extractDocumentConfig, withDocumentConfig } from "../pageLayout";
import { newPackage, packXmd } from "../xmd/container";

const PNG = new Uint8Array([1, 2, 3]);

describe("document.md d'un .xmd dans un lecteur Markdown ordinaire", () => {
  it("rien d'autre que le contenu n'est visible ; les images sont des liens relatifs", () => {
    const layout = extractDocumentConfig("").layout;
    const body = [
      "# Titre",
      "",
      "<!-- coverzone-start -->",
      "",
      "Texte de couverture",
      "",
      "<!-- coverzone-end -->",
      "",
      "<!-- pagebreak -->",
      "",
      "Un paragraphe avec une image ![plan](images/plan-aaaa1111.png) dedans.",
      "",
      '<img src="images/plan-aaaa1111.png" alt="vue" width="50%">',
      "",
    ].join("\n");
    const pkg = newPackage(withDocumentConfig(layout, body));
    pkg.assets["images/plan-aaaa1111.png"] = { bytes: PNG, mime: "image/png" };
    pkg.comments = '{"version":1,"comments":[{"id":"c1","text":"SECRET-COMMENTAIRE"}]}';
    pkg.history = '{"version":1,"revisions":[{"id":"r1","note":"SECRET-HISTORIQUE"}]}';

    // Le Markdown extrait du ZIP, tel qu'un autre outil le lirait
    const inner = strFromU8(unzipSync(packXmd(pkg, { app: "Pagina", version: "test" }))["document.md"]);
    const html = new MarkdownIt({ html: true }).render(inner);
    const host = document.createElement("div");
    host.innerHTML = html;

    const visible = host.textContent ?? "";
    expect(visible).toContain("Titre");
    expect(visible).toContain("Texte de couverture");
    for (const junk of ["pagina:", "configVersion", "coverzone", "pagebreak", "SECRET", "generator"]) {
      expect(visible).not.toContain(junk);
    }
    // Les commentaires de comptes rendus (commentaires de relecture, historique) ne sont JAMAIS dans le Markdown.
    expect(inner).not.toContain("SECRET");
    const srcs = Array.from(host.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(srcs).toEqual(["images/plan-aaaa1111.png", "images/plan-aaaa1111.png"]);
    expect(host.querySelector("img[width]")?.getAttribute("width")).toBe("50%");
  });
});
