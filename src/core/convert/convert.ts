/**
 * Import/export Word (.docx) et LibreOffice (.odt) — orchestration au-dessus
 * de Pandoc (voir persistence/fileService.ts ↔ src-tauri/src/convert_commands.rs,
 * décision utilisateur 2026-10-27 : moteur local léger, pas de PDF pour
 * l'instant — usage trop personnel pour un projet open source).
 *
 * IMPORT (`importDocument`) : Pandoc convertit en Markdown GFM et extrait les
 * images dans un dossier temporaire ; les images sont rangées dans un
 * `.xmd` créé À CÔTÉ de l'original (nom libre, jamais d'écrasement — même
 * règle que l'insertion d'image), le Markdown est réécrit vers les chemins
 * `images/…` du conteneur, et le fichier d'origine n'est JAMAIS touché.
 *
 * EXPORT (`exportDocument`) : le Markdown du document actif (SANS le
 * commentaire de config Pagina, qui ne regarde que Pagina) + les images du
 * conteneur partent vers Pandoc, qui écrit le `.docx`/`.odt` — tout le
 * temporaire vit côté Rust.
 */
import {
  pandocPath,
  convertImport,
  convertExport,
  cleanupTempDir,
  readBinaryFile,
  pathExists,
  type ConvertExportMedia,
} from "../../persistence/fileService";
import { assetPathFor, imageMimeOf, EMPTY_COMMENTS, EMPTY_HISTORY, isSafeEntryName, extensionOf } from "../xmd/container";
import { saveDocument } from "../../persistence/documentIO";
import { titleOf } from "../xmd/paths";

/** Pandoc est-il installé et trouvable ? */
export async function pandocAvailable(): Promise<boolean> {
  return (await pandocPath()) !== null;
}

/** Extension convertible à l'import (clic droit explorateur / boîte de fichier). */
export function isImportableDocument(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".docx") || lower.endsWith(".odt");
}

/** Cible `.xmd` à côté de l'original : `rapport.docx` → `rapport.xmd`. */
function xmdTargetFor(sourcePath: string): string {
  return `${sourcePath.replace(/\.(docx|odt)$/i, "")}.xmd`;
}

/** Réécrit TOUTE référence à un média extrait vers le chemin `images/…` du
 *  conteneur. Pandoc écrit le chemin ABSOLU du dossier temporaire (séparateurs
 *  imprévisibles : `\\`, `/`, forme 8.3…) — on cible donc le NOM DE FICHIER
 *  dans chaque syntaxe d'image (`src="…"` HTML ou `](…)` Markdown) : le
 *  préfixe temporaire disparaît ENTIEREMENT, sinon `packXmd` (qui
 *  n'embarque que les images RÉFÉRENCÉES) jetterait l'image (bug constaté
 *  au premier test : préfixe resté, image perdue). */
function rewriteMediaPath(markdown: string, mediaRel: string, target: string): string {
  const base = titleOf(mediaRel);
  if (!base) return markdown;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `src="…<nom>"` (Pandoc produit des <img> HTML pour les .docx) puis
  // `](…<nom>)` (syntaxe Markdown).
  let out = markdown.replace(new RegExp(`src="[^"]*${escaped}"`, "gi"), `src="${target}"`);
  out = out.replace(new RegExp(`\\]\\([^)]*${escaped}\\)`, "gi"), `](${target})`);
  return out;
}

/** Convertit un `.docx`/`.odt` en `.xmd` à côté de l'original et renvoie le
 *  chemin créé — prêt à ouvrir dans un onglet. Le fichier d'origine n'est
 *  ni modifié ni supprimé. */
export async function importDocument(sourcePath: string): Promise<string> {
  if (!(await pandocAvailable())) {
    throw new Error("Pandoc n'est pas installé (ou introuvable). Installez-le depuis https://pandoc.org, puis réessayez.");
  }
  const result = await convertImport(sourcePath);
  try {
    // Range chaque média extrait dans le conteneur (nom par empreinte,
    // comme l'insertion d'image) et réécrit le Markdown.
    let markdown = result.markdown;
    const assets: Record<string, { bytes: Uint8Array; mime: string }> = {};
    for (const rel of result.media) {
      const sourceFile = `${result.tempDir}/${rel}`;
      const bytes = await readBinaryFile(sourceFile);
      const fileName = titleOf(rel);
      const ext = extensionOf(fileName);
      if (!ext || !isSafeEntryName(fileName)) continue;
      const target = await assetPathFor(fileName, bytes);
      const mime = imageMimeOf(fileName);
      if (!target || !mime) continue; // extension non image : le média reste ignoré
      if (!assets[target]) {
        assets[target] = { bytes, mime };
      }
      markdown = rewriteMediaPath(markdown, rel, target);
    }
    // Cible libre — jamais d'écrasement (même règle que partout ailleurs).
    let target = xmdTargetFor(sourcePath);
    if (await pathExists(target)) {
      const base = target.replace(/\.xmd$/i, "");
      for (let n = 2; n < 1000; n++) {
        const candidate = `${base} (${n}).xmd`;
        if (!(await pathExists(candidate))) {
          target = candidate;
          break;
        }
      }
    }
    await saveDocument(target, { raw: markdown, assets, comments: EMPTY_COMMENTS, history: EMPTY_HISTORY, extras: {} });
    return target;
  } finally {
    // Le dossier temporaire disparaît toujours, même en cas d'erreur.
    await cleanupTempDir(result.tempDir).catch(() => undefined);
  }
}

/** Exporte du Markdown (+ images d'un conteneur `.xmd`) en `.docx`/`.odt`.
 *  `markdown` doit être le contenu SANS le commentaire de config Pagina. */
export async function exportDocument(
  markdown: string,
  assets: Record<string, { bytes: Uint8Array; mime: string }>,
  outputPath: string,
): Promise<void> {
  if (!(await pandocAvailable())) {
    throw new Error("Pandoc n'est pas installé (ou introuvable). Installez-le depuis https://pandoc.org, puis réessayez.");
  }
  // Les images d'un document Pagina peuvent être du HTML brut (`<img …>`,
  // repli des réglages sans équivalent Markdown) : le writer docx/odt de
  // Pandoc IGNORE le HTML brut — sans cette normalisation, les images
  // disparaissaient de l'export (bug constaté au premier test). La syntaxe
  // `![alt](src)` est convertie en vraie image embarquée.
  markdown = markdown.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /src="([^"]+)"/i.exec(tag)?.[1];
    if (!src) return tag;
    const alt = /alt="([^"]*)"/i.exec(tag)?.[1] ?? "";
    return `![${alt}](${src})`;
  });
  const media: ConvertExportMedia[] = [];
  for (const [name, asset] of Object.entries(assets)) {
    // Uniquement les images du conteneur référencées avec un nom sûr.
    if (!name.startsWith("images/") || !isSafeEntryName(name)) continue;
    media.push({ name, bytes: asset.bytes });
  }
  await convertExport(markdown, media, outputPath);
}
