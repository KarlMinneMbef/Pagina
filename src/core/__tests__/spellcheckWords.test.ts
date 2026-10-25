import { describe, it, expect } from "vitest";
import { elisionRest, extractWords, hyphenParts, shouldCheckWord } from "../spellcheck/words";

const words = (text: string) => extractWords(text).map((t) => t.word);

describe("correction orthographique — mots à vérifier", () => {
  it("découpe un texte français avec accents, apostrophes et traits d'union", () => {
    expect(words("L'entreprise doit réaliser le rez-de-chaussée aujourd'hui.")).toEqual([
      "L'entreprise", "doit", "réaliser", "le", "rez-de-chaussée", "aujourd'hui",
    ]);
    expect(words("c’est l’œuvre")).toEqual(["c’est", "l’œuvre"]);
  });

  it("donne des positions exactes", () => {
    const [a, b] = extractWords("ab  cde");
    expect(a).toMatchObject({ word: "ab", start: 0, end: 2 });
    expect(b).toMatchObject({ word: "cde", start: 4, end: 7 });
  });

  it("ignore les sigles, unités et références du BE", () => {
    expect(words("La CTA et le DRV au R32, DN50, 25 mm, 3 kW, 120 dBA, PPSPS, 5mm")).toEqual(["La", "et", "le", "au"]);
    expect(words("Pression en kPa et débit en m³/h")).toEqual(["Pression", "en", "et", "débit", "en"]);
  });

  it("ignore variables, adresses web et courriels", () => {
    expect(words("Projet {{Projet}} voir https://exemple.fr/page ou www.exemple.fr écrire a.b@exemple.fr merci")).toEqual([
      "Projet", "voir", "ou", "écrire", "merci",
    ]);
    // Les positions des mots suivants ne bougent pas.
    const t = "{{x}} bonjour";
    expect(extractWords(t)[0]).toMatchObject({ start: 6, end: 13 });
  });

  it("ignore les mots d'une lettre et les majuscules internes", () => {
    expect(shouldCheckWord("a", "", "")).toBe(false);
    expect(shouldCheckWord("iPhone", "", "")).toBe(false);
    expect(shouldCheckWord("Ventilation", "", "")).toBe(true);
    expect(shouldCheckWord("VENTILATION", "", "")).toBe(true); // > 5 lettres : vérifié
  });

  it("décompose un mot composé", () => {
    expect(hyphenParts("rez-de-chaussée")).toEqual(["rez", "de", "chaussée"]);
    expect(hyphenParts("ventilation")).toEqual([]);
  });

  it("sépare l'élision pour ne souligner que le mot", () => {
    expect(elisionRest("l'entrepeneur")).toEqual({ rest: "entrepeneur", offset: 2 });
    expect(elisionRest("jusqu’à")).toBeNull(); // « à » : une lettre
    expect(elisionRest("aujourd'hui")).toBeNull(); // préfixe trop long : traité comme un seul mot
    expect(elisionRest("ventilation")).toBeNull();
  });
});
