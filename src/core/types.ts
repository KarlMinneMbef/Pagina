/**
 * Types partagés par les 3 couches (état, édition, persistance).
 * Ce fichier ne doit dépendre d'aucune bibliothèque UI (ni Tiptap, ni React).
 */

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

/** Un fichier .md ou .xmd du workspace, éligible à l'ouverture dans un onglet. */
export function isEditableDocument(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".xmd");
}
