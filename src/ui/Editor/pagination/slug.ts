// Anchor de titre façon GitHub : minuscules, espaces → tirets, ponctuation
// retirée — utilisé à la fois pour générer les liens du sommaire
// (`TocMarker.ts`) et pour poser l'`id` correspondant sur chaque titre peint
// (`paintPages.ts`). Les deux DOIVENT utiliser exactement cet algorithme
// (et parcourir les titres dans le même ordre) pour que les liens générés
// pointent vers le bon `id` — voir CLAUDE.md pour le contexte complet.
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents (é → e, à → a...)
    .replace(/[^a-z0-9\s-]/g, "") // ponctuation
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Rend un slug unique parmi ceux déjà attribués (comme GitHub : "titre",
 * "titre-1", "titre-2"...) — deux titres avec le même texte sont fréquents
 * (ex. plusieurs "Introduction" dans un document à sections). `used` est
 * mutée : à appeler dans l'ordre du document, avec le MÊME `Set` partagé
 * pour tous les titres d'un même passage. */
export function uniqueHeadingSlug(text: string, used: Set<string>): string {
  const base = slugifyHeading(text) || "titre";
  let slug = base;
  let n = 1;
  while (used.has(slug)) {
    slug = `${base}-${n}`;
    n += 1;
  }
  used.add(slug);
  return slug;
}
