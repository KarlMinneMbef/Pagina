/**
 * Chemins des documents `.xmd` : noms libres, titres. Pur sauf `freeXmdPath` (interroge le disque par `pathExists`).
 */
import { pathExists } from "../../persistence/fileService";

/** Dernier élément d'un chemin Windows ou POSIX. */
export function titleOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** `dossier/rapport.md` → `dossier/rapport.xmd` (sans toucher au reste du chemin). */
export function xmdPathFor(path: string, suffix = ""): string {
  const base = path.replace(/\.(md|xmd)$/i, "");
  return `${base}${suffix}.xmd`;
}

/** Premier chemin `.xmd` LIBRE à côté de `mdPath` : `rapport.xmd`, sinon `rapport (2).xmd`, `rapport (3).xmd`… — jamais d'écrasement. */
export async function freeXmdPath(mdPath: string): Promise<string> {
  const first = xmdPathFor(mdPath);
  if (!(await pathExists(first))) return first;
  for (let n = 2; n < 1000; n++) {
    const candidate = xmdPathFor(mdPath, ` (${n})`);
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error("Aucun nom de fichier .xmd libre.");
}
