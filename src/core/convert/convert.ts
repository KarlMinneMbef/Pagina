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

/** Les pourcentages de colonnes de Pandoc sont relatifs à la LARGEUR DE LA
 *  PAGE du document source (A4 ≈ 794 px à 96 dpi, vérifié sur un CCTP réel
 *  : grille Word de 756 px rendue « 95 % »). Plafond = zone de texte d'une
 *  page A4 aux marges par défaut (170 mm ≈ 640 px) : un tableau Word plus
 *  large que la zone (fréquent sur les pages de garde, Word laisse déborder
 *  dans ses marges) est réduit proportionnellement pour rester DANS la
 *  page. Les colonnes restent ensuite redimensionnables à la souris. */
const PAGE_REF_PX = 794;
const TEXT_ZONE_MAX_PX = 640;

/** Attribut `colwidth` pour la PREMIÈRE ligne d'un tableau, à partir des
 *  largeurs de colonnes : c'est elle qui fixe la largeur de chaque colonne
 *  au rendu (prosemirror-tables). Une cellule fusionnée porte la liste des
 *  largeurs qu'elle couvre (`colspan="3"` → `colwidth="64,32,45"`). */
function firstRowColwidth(row: string, widths: number[]): string {
  let col = 0;
  return row.replace(/<(td|th)((?:(?!>)[\s\S])*)>/g, (tag, tagname: string, attrs: string) => {
    const span = Number(/colspan="(\d+)"/.exec(attrs)?.[1] ?? 1);
    const cols = widths.slice(col, col + span);
    col += span;
    if (!cols.length) return tag;
    return `<${tagname}${attrs} colwidth="${cols.join(",")}">`;
  });
}

/** Largeurs de colonnes Pandoc → `colwidth` compréhensibles par l'éditeur.
 *  Pour les tableaux qui ne passent pas en GFM (fusions…), Pandoc écrit les
 *  proportions du document Word en POURCENTAGES de style
 *  (`<col style="width: 2%" />`) — un format que l'éditeur ne sait pas
 *  relire : les proportions sont perdues DÈS L'OUVERTURE (l'app
 *  réenregistre des largeurs par défaut) et le tableau sort de la zone de
 *  texte (constaté au premier import réel : grille de page de garde à 25
 *  colonnes « hors champs »). On convertit donc en pixels et on pose
 *  `colwidth` sur les cellules de la première ligne — le colgroup part
 *  (Tiptap y relirait les largeurs cellule par cellule de chaque ligne,
 *  ce qui est faux dès qu'il y a des fusions) ; un `width: 0%` de Word
 *  (séparateur) devient 1 px car 0 est lu comme « pas de largeur ». */
function normalizeTableWidths(markdown: string): string {
  return markdown.replace(/<table[^>]*>[\s\S]*?<\/table>/g, (block) => {
    const widths: number[] = [];
    let out = block.replace(/<col style="width: (\d+(?:\.\d+)?)%" ?\/>/g, (_m, pct: string) => {
      widths.push(Math.max(1, Math.round((Number(pct) * PAGE_REF_PX) / 100)));
      return "";
    });
    out = out.replace(/<col style="min-width: (\d+)px;">/g, (_m, px: string) => {
      widths.push(Math.max(1, Number(px)));
      return "";
    });
    // Le style du `<table>` ne survit pas à l'analyse (l'éditeur recalcule
    // sa largeur au rendu) : on ne le transporte pas.
    out = out.replace(/<table style="width:100%;?">/, "<table>").replace(/<table style="min-width: \d+px;">/, "<table>");
    if (!widths.length) return out;
    // Tableau Word plus large que la zone de texte : réduction
    // proportionnelle (le plafond vaut pour la TABLE : les colonnes se
    // répartissent ensuite les px manquants au rendu).
    const sum = widths.reduce((a, b) => a + b, 0);
    if (sum > TEXT_ZONE_MAX_PX) {
      const scale = TEXT_ZONE_MAX_PX / sum;
      for (let i = 0; i < widths.length; i++) widths[i] = Math.max(1, Math.round(widths[i] * scale));
    }
    out = out.replace(/<colgroup>\s*<\/colgroup>/g, "").replace(/<colgroup><\/colgroup>/g, "");
    out = out.replace(/<tr>((?:(?!<\/tr>)[\s\S])*)<\/tr>/, (_m, row: string) => `<tr>${firstRowColwidth(row, widths)}</tr>`);
    return out;
  });
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
    markdown = normalizeTableWidths(markdown);
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
    // Les images affichées portent un lien `blob:` (rendu) et le lien du
    // conteneur dans `data-asset-src` (images des tableaux, sérialisés en
    // HTML) : Pandoc ne sait pas relire `blob:`, on exporte le lien réel.
    const src = /data-asset-src="([^"]+)"/i.exec(tag)?.[1] ?? /src="([^"]+)"/i.exec(tag)?.[1];
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
