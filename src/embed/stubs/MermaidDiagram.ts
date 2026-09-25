/**
 * Remplaçant de `ui/Editor/extensions/MermaidDiagram.ts` pour la version LÉGÈRE de Pagina (build en
 * bibliothèque, voir vite.lib.config.ts). Mermaid pèse plusieurs Mo : l'inclure alourdirait toute
 * application qui intègre l'éditeur pour une fonction dont la version légère ne dispose pas.
 * Sans l'extension, un bloc ```mermaid reste un simple bloc de code — le fichier .md n'est pas altéré.
 */
import { Extension } from "@tiptap/core";

export const MermaidDiagram = Extension.create({ name: "mermaidDiagramAbsent" });
