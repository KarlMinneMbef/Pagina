/** Serveur de développement du banc d'essai de la version légère (harness-embed) — mêmes stubs que le build en bibliothèque. */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const chemin = (relatif: string) => fileURLToPath(new URL(relatif, import.meta.url));

export default defineConfig({
  root: chemin("./harness-embed"),
  plugins: [react()],
  server: { port: 5199, strictPort: true },
  resolve: {
    alias: [
      { find: /^.*\/extensions\/MermaidDiagram$/, replacement: chemin("./src/embed/stubs/MermaidDiagram.ts") },
      { find: /^.*\/extensions\/Math$/, replacement: chemin("./src/embed/stubs/Math.ts") },
      { find: /^katex\/dist\/katex\.min\.css$/, replacement: chemin("./src/embed/stubs/vide.css") },
    ],
  },
});
