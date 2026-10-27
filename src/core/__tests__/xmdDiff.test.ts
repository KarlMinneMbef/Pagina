/**
 * Moteur de comparaison mot par mot (core/xmd/diff.ts, roadmap 5.3) :
 * segments dans l'ordre de lecture, statistiques en mots, garde-fou des
 * très gros documents (bascule ligne par ligne).
 */
import { describe, it, expect } from "vitest";
import { diffWords, diffStats, diffStatsLabel } from "../xmd/diff";

/** Recompose le texte complet d'un diff (l'ordre de lecture). */
function reassemble(segments: { op: string; text: string }[]): string {
  return segments.map((s) => s.text).join("");
}

describe("diffWords — segments", () => {
  it("textes identiques = un seul segment conservé", () => {
    const { segments } = diffWords("Le chat dort.", "Le chat dort.");
    expect(segments).toEqual([{ op: "keep", text: "Le chat dort." }]);
  });

  it("texte vide d'un côté = tout ajouté / tout supprimé", () => {
    expect(diffWords("", "Nouveau").segments).toEqual([{ op: "add", text: "Nouveau" }]);
    expect(diffWords("Ancien", "").segments).toEqual([{ op: "remove", text: "Ancien" }]);
  });

  it("un mot remplacé = un segment supprimé + un ajouté, le reste conservé", () => {
    const { segments, mode } = diffWords("La ventilation doit être assurée.", "La climatisation doit être assurée.");
    expect(mode).toBe("words");
    expect(segments.some((s) => s.op === "remove" && s.text.includes("ventilation"))).toBe(true);
    expect(segments.some((s) => s.op === "add" && s.text.includes("climatisation"))).toBe(true);
    expect(segments.some((s) => s.op === "keep" && s.text.includes("doit être assurée"))).toBe(true);
  });

  it("ajout en fin de texte", () => {
    const { segments } = diffWords("Fin des travaux.", "Fin des travaux. Nettoyage compris.");
    expect(segments.some((s) => s.op === "add" && s.text.includes("Nettoyage compris"))).toBe(true);
  });

  it("les segments recomposent le texte des deux côtés", () => {
    const before = "Le lot 2 CVC comprend la ventilation et le chauffage.";
    const after = "Le lot 2 CVC comprend la climatisation, la ventilation et le chauffage.";
    const { segments } = diffWords(before, after);
    // Les segments retirés recomposent `before` avec les espaces collés :
    const removed = reassemble(segments.filter((s) => s.op !== "add"));
    const added = reassemble(segments.filter((s) => s.op !== "remove"));
    // `removed`/`added` contiennent AU MOINS les mots de before/after
    // (les espaces collées au segment précédent peuvent bouger d'un op à
    // l'autre) — on vérifie mot par mot.
    const words = (t: string) => t.split(/\s+/).filter(Boolean);
    expect(words(removed).join(" ")).toBe(words(before).join(" "));
    expect(words(added).join(" ")).toBe(words(after).join(" "));
  });

  it("très gros document : bascule ligne par ligne sans exploser", () => {
    const a = Array.from({ length: 3000 }, (_, i) => `Ligne ${i} du document`).join("\n");
    const b = a.replace("Ligne 1500", "Ligne modifiée 1500") + "\nLigne finale ajoutée";
    const { segments, mode } = diffWords(a, b);
    expect(mode).toBe("lines");
    expect(segments.some((s) => s.op === "remove" && s.text.includes("Ligne 1500"))).toBe(true);
    expect(segments.some((s) => s.op === "add" && s.text.includes("modifiée"))).toBe(true);
  });
});

describe("diffStats / diffStatsLabel", () => {
  it("compte les MOTS (ni la ponctuation ni les espaces)", () => {
    const { segments } = diffWords("Deux mots.", "Trois mots différents !");
    const stats = diffStats(segments);
    expect(stats.removed).toBe(1); // « Deux »
    expect(stats.added).toBe(2); // « Trois » + « différents » — la ponctuation (« ! ») ne compte pas
  });

  it("phrase résumée", () => {
    expect(diffStatsLabel({ added: 0, removed: 0 })).toBe("contenu identique au document actuel");
    expect(diffStatsLabel({ added: 3, removed: 1 })).toBe("3 mots ajoutés, 1 mot supprimé");
    expect(diffStatsLabel({ added: 1, removed: 0 })).toBe("1 mot ajouté");
  });
});
