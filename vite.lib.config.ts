/**
 * Build en BIBLIOTHÈQUE de la version légère de Pagina (src/embed) — distinct de vite.config.ts, qui sert
 * l'application Tauri. Différences voulues :
 * - Mermaid et KaTeX sont remplacés par des stubs vides (src/embed/stubs) : plusieurs Mo inutiles pour la
 *   version légère, qui n'a ni diagrammes ni formules.
 * - Toutes les dépendances (Tiptap, ProseMirror, lowlight…) et React restent EXTERNES : l'application hôte
 *   les installe elle-même (voir le package.json généré par scripts/build-embed.mjs) et n'en embarque donc
 *   qu'UNE instance — indispensable pour ProseMirror, qui casse s'il est chargé en double.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const chemin = (relatif: string) => fileURLToPath(new URL(relatif, import.meta.url));
const pkg = JSON.parse(readFileSync(chemin("./package.json"), "utf-8")) as { dependencies: Record<string, string> };
const externes = [...Object.keys(pkg.dependencies), "react", "react-dom", "react/jsx-runtime"];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^.*\/extensions\/MermaidDiagram$/, replacement: chemin("./src/embed/stubs/MermaidDiagram.ts") },
      { find: /^.*\/extensions\/Math$/, replacement: chemin("./src/embed/stubs/Math.ts") },
      { find: /^katex\/dist\/katex\.min\.css$/, replacement: chemin("./src/embed/stubs/vide.css") },
    ],
  },
  build: {
    outDir: "lib-embed",
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: chemin("./src/embed/index.ts"), formats: ["es"], fileName: () => "pagina-light.js" },
    rollupOptions: {
      external: (id: string) => externes.some((d) => id === d || id.startsWith(`${d}/`)),
    },
  },
});
