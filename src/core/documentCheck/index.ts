/**
 * « Vérifier le document » — point d'entrée du module (voir `checks.ts`).
 *
 * - `checkDocument(raw)` liste les problèmes d'un fichier (texte brut du disque).
 * - `repairDocument(raw)` applique les réparations et dit lesquelles ont changé quelque chose.
 * - `backupPathFor(path)` : nom de la copie de sauvegarde écrite AVANT toute réparation.
 */
import { CHECKS, type Problem } from "./checks";

export type { Problem, Severity, DocumentCheck } from "./checks";

export function checkDocument(raw: string): Problem[] {
  return CHECKS.flatMap((c) => c.inspect(raw));
}

export interface RepairResult {
  text: string;
  /** Intitulés des vérifications qui ont modifié le fichier. */
  applied: string[];
}

export function repairDocument(raw: string): RepairResult {
  let text = raw;
  const applied: string[] = [];
  for (const check of CHECKS) {
    const next = check.repair(text);
    if (next !== text) {
      applied.push(check.label);
      text = next;
    }
  }
  return { text, applied };
}

/** `dossier\rapport.md` → `dossier\rapport.avant-reparation-20261026-1530.md`. */
export function backupPathFor(path: string, now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  const dot = path.lastIndexOf(".");
  const sep = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  const hasExt = dot > sep + 1;
  const base = hasExt ? path.slice(0, dot) : path;
  const ext = hasExt ? path.slice(dot) : ".md";
  return `${base}.avant-reparation-${stamp}${ext}`;
}
