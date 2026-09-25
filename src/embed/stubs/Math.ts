/**
 * Remplaçant de `ui/Editor/extensions/Math.ts` pour la version LÉGÈRE de Pagina (voir
 * stubs/MermaidDiagram.ts) : pas de KaTeX. Les formules `$...$` restent du texte dans le fichier .md.
 */
import { Extension } from "@tiptap/core";

export const InlineMath = Extension.create({ name: "inlineMathAbsent" });
export const BlockMath = Extension.create({ name: "blockMathAbsent" });
