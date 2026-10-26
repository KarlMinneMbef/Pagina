import { describe, it, expect } from "vitest";
import { parseNumberText } from "../../ui/NumberField";

describe("saisie numérique libre (parseNumberText)", () => {
  it("accepte la virgule ou le point comme séparateur décimal", () => {
    expect(parseNumberText("1,5")).toBe(1.5);
    expect(parseNumberText("1.5")).toBe(1.5);
    expect(parseNumberText(" 12 ")).toBe(12);
    expect(parseNumberText(",5")).toBe(0.5);
    expect(parseNumberText("-2,25")).toBe(-2.25);
  });

  it("laisse une saisie en cours (virgule finale, vide, signe seul) sans valeur plutôt que de la réécrire", () => {
    expect(parseNumberText("1,")).toBe(1); // « 1, » est déjà un nombre valide : le texte tapé est conservé par le champ
    expect(parseNumberText("")).toBeNull();
    expect(parseNumberText("-")).toBeNull();
    expect(parseNumberText(",")).toBeNull();
  });

  it("refuse le texte qui n'est pas un nombre", () => {
    expect(parseNumberText("abc")).toBeNull();
    expect(parseNumberText("1,2,3")).toBeNull();
    expect(parseNumberText("1e5")).toBeNull();
  });
});
