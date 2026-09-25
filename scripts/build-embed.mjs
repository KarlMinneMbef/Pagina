/**
 * Fabrique le paquet npm de la version légère de Pagina : `releases/pagina-light-<version>.tgz`.
 *
 * Usage : `npm run build:embed`. L'application hôte (MBEF Platform, Ingenerix) dépend de ce fichier via son
 * URL brute GitHub épinglée sur un TAG de Pagina ; mettre à jour = changer le tag dans son package.json.
 *
 * Étapes : build de la bibliothèque (Vite) → déclarations de types (tsc) → package.json du paquet (seules les
 * dépendances réellement utilisées par la version légère, React en peerDependency) → `npm pack`.
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Version du PAQUET léger — indépendante de la version de l'application Pagina (package.json) : à incrémenter
// à la main quand la version légère évolue (nouvelle fonction, correctif), avant de reconstruire et de poser un tag.
const VERSION_PAQUET = "0.1.2";

const racine = process.cwd();
const pkg = JSON.parse(readFileSync(join(racine, "package.json"), "utf-8"));
const executer = (commande) => execSync(commande, { stdio: "inherit", cwd: racine });

// Dépendances de Pagina inutiles à la version légère (Tauri, état de l'app, diagrammes, formules).
const EXCLUES = new Set(["@tauri-apps/api", "@tauri-apps/plugin-dialog", "@tauri-apps/plugin-opener", "zustand", "mermaid", "katex", "react", "react-dom"]);
const dependances = Object.fromEntries(Object.entries(pkg.dependencies).filter(([nom]) => !EXCLUES.has(nom)));

executer("npx vite build --config vite.lib.config.ts");
executer("npx tsc -p tsconfig.lib.json");

// Garde-fou : chaque import « nu » du fichier produit doit être une dépendance déclarée du paquet (ou React) —
// sinon l'application hôte échouerait à la compilation (ex. import de katex oublié, voir vite.lib.config.ts).
{
  const code = readFileSync(join(racine, "lib-embed", "pagina-light.js"), "utf-8");
  // Uniquement les instructions `import` statiques (une par ligne dans la sortie du build), pas le texte du code.
  const importes = new Set([...code.matchAll(/^import\s.*?from\s*["']([^"'./][^"']*)["']|^import\s*["']([^"'./][^"']*)["']/gm)].map((m) => m[1] ?? m[2]));
  const declares = new Set([...Object.keys(dependances), "react", "react-dom"]);
  const inconnus = [...importes].filter((spec) => ![...declares].some((d) => spec === d || spec.startsWith(`${d}/`)));
  if (inconnus.length > 0) throw new Error(`Le paquet importe des modules non déclarés : ${inconnus.join(", ")}`);
}

const sortie = join(racine, "lib-embed");
const css = readdirSync(sortie).find((f) => f.endsWith(".css"));
if (!css) throw new Error("Aucun fichier CSS produit par le build de la bibliothèque.");
if (css !== "pagina-light.css") renameSync(join(sortie, css), join(sortie, "pagina-light.css"));

const paquet = join(racine, "lib-embed-paquet");
rmSync(paquet, { recursive: true, force: true });
mkdirSync(paquet, { recursive: true });
cpSync(join(sortie, "pagina-light.js"), join(paquet, "pagina-light.js"));
cpSync(join(sortie, "pagina-light.css"), join(paquet, "pagina-light.css"));
cpSync(join(sortie, "types"), join(paquet, "types"), { recursive: true });

writeFileSync(
  join(paquet, "package.json"),
  JSON.stringify(
    {
      name: "pagina-light",
      version: VERSION_PAQUET,
      description: "Pagina (éditeur Markdown WYSIWYG paginé A4) — version légère intégrable",
      license: pkg.license,
      type: "module",
      main: "./pagina-light.js",
      module: "./pagina-light.js",
      types: "./types/embed/index.d.ts",
      exports: {
        ".": { types: "./types/embed/index.d.ts", import: "./pagina-light.js" },
        "./style.css": "./pagina-light.css",
      },
      sideEffects: ["*.css"],
      dependencies: dependances,
      peerDependencies: { react: "^18.3.0 || ^19.0.0", "react-dom": "^18.3.0 || ^19.0.0" },
    },
    null,
    2,
  ) + "\n",
);

mkdirSync(join(racine, "releases"), { recursive: true });
const nom = execSync("npm pack --silent --pack-destination ../releases", { cwd: paquet, encoding: "utf-8" }).trim().split("\n").pop();
rmSync(paquet, { recursive: true, force: true });
if (!existsSync(join(racine, "releases", nom))) throw new Error(`Paquet introuvable : releases/${nom}`);
console.log(`\nPaquet prêt : releases/${nom}`);
