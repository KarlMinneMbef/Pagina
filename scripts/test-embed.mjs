/**
 * Test de bout en bout de la version légère (PaginaLight) dans un vrai navigateur : lance le banc d'essai
 * (harness-embed) via Vite, le pilote avec Playwright (Chrome/Edge déjà installé) et vérifie le rendu,
 * l'édition, la sérialisation Markdown et la lecture seule. Usage : `node scripts/test-embed.mjs [dossier-captures]`.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const dossierCaptures = process.argv[2] ?? join(process.cwd(), "harness-embed", "captures");
mkdirSync(dossierCaptures, { recursive: true });
const NAVIGATEURS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const navigateur = NAVIGATEURS.find((p) => existsSync(p));
if (!navigateur) throw new Error("Ni Chrome ni Edge trouvés.");

const serveur = spawn("npx", ["vite", "--config", "vite.harness.config.ts"], { shell: true, stdio: "pipe" });
let echecs = 0;
const verifier = (ok, message) => { console.log(`${ok ? "OK  " : "ÉCHEC"} ${message}`); if (!ok) echecs++; };
const attendreServeur = async () => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch("http://localhost:5199/"); if (r.ok) return; } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Le serveur Vite du banc d'essai n'a pas démarré.");
};

try {
  await attendreServeur();
  const nav = await chromium.launch({ executablePath: navigateur, headless: true });
  const page = await nav.newPage({ viewport: { width: 1200, height: 900 } });
  const erreursConsole = [];
  page.on("pageerror", (e) => erreursConsole.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("404")) erreursConsole.push(m.text()); });

  await page.goto("http://localhost:5199/");
  await page.waitForSelector(".xmd-page", { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(dossierCaptures, "1-chargement.png") });

  // 1. Ruban léger
  verifier((await page.locator(".tb-tabbar").count()) === 0, "pas de barre d'onglets (Accueil/Format avancé/Extras)");
  verifier((await page.getByText("Explorateur").count()) === 0, "pas de bouton Explorateur");
  verifier((await page.locator('button[title="Image"]').count()) === 0, "pas de bouton Image");
  verifier((await page.locator('button[title="Gras (Ctrl+B)"]').count()) === 1, "bouton Gras présent");
  verifier((await page.getByText("En-tête et pied de page").count()) === 1, "groupe En-tête et pied de page présent");

  // 2. Pages A4
  const largeur = await page.locator(".xmd-page").first().evaluate((el) => el.getBoundingClientRect().width);
  verifier(Math.abs(largeur - 793.7) < 3, `page A4 (largeur ${largeur.toFixed(1)} px ≈ 793,7)`);
  const texte = await page.locator(".xmd-page").first().innerText();
  verifier(texte.includes("Compte rendu mensuel RH") && texte.includes("Julien DESCHAMPS"), "contenu du rapport affiché");
  verifier((await page.locator(".xmd-page table").count()) >= 1, "tableau du rapport rendu en vrai tableau");

  // 3. Aucun onChange sans intervention (sinon « modifié » s'afficherait à tort dans la plateforme)
  await page.waitForTimeout(700);
  verifier((await page.evaluate(() => window.__journal.length)) === 0, "aucun onChange au chargement");

  // 4. Frappe + sérialisation
  await page.locator(".xmd-page h1").first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" TEST-FRAPPE", { delay: 40 });
  await page.waitForTimeout(500);
  let md = await page.evaluate(() => window.__dernierMarkdown);
  verifier(md !== null && md.includes("TEST-FRAPPE"), "la frappe remonte dans le Markdown");
  verifier(md !== null && md.includes("<!-- pagina:config"), "commentaire de mise en page pagina:config réinjecté");
  verifier(md !== null && /\|\s*Matricule\s*\|/.test(md) && /\|\s*-{3,}\s*\|/.test(md), "tableau GFM conservé (en-tête + séparateur)");
  verifier(md !== null && md.includes("**Total**"), "gras `**Total**` conservé");
  verifier(md !== null && md.includes("## Synthèse de l'équipe"), "titre de niveau 2 conservé");

  // 5. Ruban : gras via le bouton
  await page.locator(".xmd-page h2").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.locator('button[title="Gras (Ctrl+B)"]').click();
  await page.waitForTimeout(400);
  md = await page.evaluate(() => window.__dernierMarkdown);
  verifier(md !== null && /##\s+\*\*Synthèse de l'équipe\*\*/.test(md), "le bouton Gras met le titre sélectionné en gras");
  await page.screenshot({ path: join(dossierCaptures, "2-apres-edition.png") });

  // 6. Lecture seule
  await page.evaluate(() => { window.__journal.length = 0; });
  await page.locator("#lecture-seule").check();
  await page.waitForTimeout(300);
  await page.locator(".xmd-page h1").first().click();
  await page.keyboard.type("INTERDIT", { delay: 40 });
  await page.waitForTimeout(400);
  verifier((await page.evaluate(() => window.__journal.length)) === 0, "lecture seule : la frappe ne change rien");
  verifier((await page.locator('button[title="Gras (Ctrl+B)"]').isDisabled()), "lecture seule : ruban désactivé");
  await page.screenshot({ path: join(dossierCaptures, "3-lecture-seule.png") });

  verifier(erreursConsole.length === 0, `aucune erreur console${erreursConsole.length ? " : " + erreursConsole.slice(0, 3).join(" | ") : ""}`);
  await nav.close();
} finally {
  serveur.kill();
  spawn("taskkill", ["/pid", String(serveur.pid), "/T", "/F"], { shell: true, stdio: "ignore" });
}
console.log(echecs === 0 ? "\nTous les contrôles passent." : `\n${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
