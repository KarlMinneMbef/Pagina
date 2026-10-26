import { describe, it, expect } from "vitest";
import { replaceStraightQuote, shouldCapitalize } from "../autocorrect";

const NBSP = String.fromCharCode(0x00a0);

describe("guillemets français", () => {
  it("ouvrant en début de bloc, après une espace, une parenthèse ou un tiret", () => {
    for (const before of ["", "Il dit ", "(", "a -", "x/"]) {
      expect(replaceStraightQuote(before).insert).toBe(`«${NBSP}`);
    }
  });

  it("fermant après une lettre, un chiffre ou une ponctuation", () => {
    for (const before of ["« bonjour", "« a1", "« fin."]) {
      expect(replaceStraightQuote(before).insert).toBe(`${NBSP}»`);
    }
  });
});

describe("majuscule en début de phrase", () => {
  it("début de bloc", () => {
    expect(shouldCapitalize("", "a")).toBe(true);
  });

  it("pas de majuscule en début de cellule de tableau", () => {
    expect(shouldCapitalize("", "k", { inTableCell: true })).toBe(false);
  });

  it("après un point, un point d'exclamation ou d'interrogation suivi d'une espace", () => {
    expect(shouldCapitalize("Le réseau est posé. ", "l")).toBe(true);
    expect(shouldCapitalize("Vraiment ? ", "o")).toBe(true);
    expect(shouldCapitalize("Stop ! ", "n")).toBe(true);
    expect(shouldCapitalize("Il a dit « fin. » ", "c")).toBe(true);
    expect(shouldCapitalize(`Il a dit « fin.${NBSP}» `, "c")).toBe(true);
  });

  it("pas de majuscule sans espace après le point (adresse, nombre décimal)", () => {
    expect(shouldCapitalize("monbefluides.", "f")).toBe(false);
    expect(shouldCapitalize("Version 1.", "2")).toBe(false);
  });

  it("pas de majuscule après une abréviation, un mot court ou un nombre", () => {
    for (const before of ["voir ex. ", "chauffage, etc. ", "cf. ", "M. ", "2.1. ", "gaz R32. ", "Fig. "]) {
      expect(shouldCapitalize(before, "d")).toBe(false);
    }
  });

  it("ne touche ni aux majuscules, ni aux chiffres, ni au milieu d'une phrase", () => {
    expect(shouldCapitalize("Bonjour. ", "L")).toBe(false);
    expect(shouldCapitalize("Bonjour. ", "3")).toBe(false);
    expect(shouldCapitalize("Le réseau ", "e")).toBe(false);
    expect(shouldCapitalize("Voici, ", "e")).toBe(false);
  });
});
