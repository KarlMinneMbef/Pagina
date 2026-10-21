/** Utilitaires de calcul de teintes/nuances pour `ColorPicker` — mélange
 * linéaire en RGB (pas HSL) : suffisant pour une grille de nuances façon
 * Word/Office, pas besoin de la précision perceptuelle d'un vrai espace
 * colorimétrique pour cet usage.
 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Éclaircit `hex` vers le blanc, `amount` entre 0 (inchangé) et 1 (blanc pur). */
export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

/** Assombrit `hex` vers le noir, `amount` entre 0 (inchangé) et 1 (noir pur). */
export function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/** Valide une chaîne comme couleur hexadécimale `#rgb`/`#rrggbb` (avec ou
 * sans le `#` initial). */
export function isValidHex(value: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

/** Normalise un code hexadécimal (préfixe « # » ajouté si absent). */
export function normalizeHex(value: string): string {
  const v = value.trim();
  return v.startsWith("#") ? v : `#${v}`;
}
