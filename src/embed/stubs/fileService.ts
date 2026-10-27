/**
 * Remplaçant de `persistence/fileService.ts` pour la version LÉGÈRE de Pagina (voir stubs/MermaidDiagram.ts) : pas de
 * Tauri, donc pas de disque ni de boîtes de dialogue natives. Seul `ui/Editor/imageInsert.ts` l'importe : le bouton
 * « Image » n'a rien à ouvrir, et le collage / glisser-déposer de fichiers passe par le navigateur, sans ce module.
 */

/** Pas de sélecteur de fichiers natif : aucune image choisie. */
export async function pickImageFiles(): Promise<string[]> {
  return [];
}

/** Jamais appelé (aucun chemin à lire sans `pickImageFiles`). */
export async function readBinaryFile(_path: string): Promise<Uint8Array> {
  throw new Error("Lecture de fichier indisponible dans la version légère.");
}
