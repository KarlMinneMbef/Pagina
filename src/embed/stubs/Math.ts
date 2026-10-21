/**
 * Remplaçant de `ui/Editor/extensions/Math.ts` pour la version LÉGÈRE de Pagina (voir
 * stubs/MermaidDiagram.ts) : pas de KaTeX. Les formules `$...$` restent du texte dans le fichier .md.
 */
import { Extension } from "@tiptap/core";

/** Extension factice : garde le nom de nœud connu pour ne pas casser les
 *  documents contenant des formules, sans charger KaTeX. */
export const InlineMath = Extension.create({ name: "inlineMathAbsent" });
/** Idem, pour les formules en bloc. */
export const BlockMath = Extension.create({ name: "blockMathAbsent" });
