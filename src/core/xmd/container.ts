/**
 * Le conteneur `.xmd` (2026-10-26) : un ZIP renommé qui contient le document Markdown, ses images et ses données
 * annexes. Module PUR (octets ↔ objet) : la lecture/écriture du fichier est dans `persistence/fileService.ts`.
 *
 * Contenu du ZIP :
 *
 *   manifest.json    identité du format (`format`, `formatVersion`), fichier principal, outil générateur
 *   document.md      LE document : du Markdown standard (le même que celui d'un fichier `.md` Pagina, avec ses
 *                    commentaires HTML invisibles). Les images y sont des liens RELATIFS : `![texte](images/x.png)`.
 *                    Extrait du ZIP, il s'affiche correctement dans n'importe quel lecteur Markdown, sans rien de plus.
 *   images/*         les images référencées par le document (stockées sans recompression)
 *   comments.json    commentaires de relecture (`{"version":1,"comments":[]}`) — jamais dans le Markdown
 *   history.json     historique des révisions (`{"version":1,"revisions":[]}`) — jamais dans le Markdown
 *
 * Tolérance : un fichier `.xmd` qui n'est PAS un ZIP (un `.md` simplement renommé) est lu comme du Markdown ;
 * tout fichier inconnu du ZIP est conservé tel quel à la réécriture (`extras`) — un `.xmd` écrit par une version
 * plus récente ne perd rien quand une version plus ancienne l'enregistre.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

export const XMD_FORMAT = "pagina-xmd";
export const XMD_FORMAT_VERSION = 1;
export const MAIN_DOCUMENT = "document.md";
const MANIFEST = "manifest.json";
const COMMENTS = "comments.json";
const HISTORY = "history.json";
export const IMAGE_DIR = "images/";

/** Garde-fous contre un ZIP piégé (bombe de décompression) ou démesuré. */
const MAX_ENTRY_BYTES = 200 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

export interface XmdAsset {
  bytes: Uint8Array;
  mime: string;
}

/** Contenu d'un document `.xmd` en mémoire. */
export interface XmdPackage {
  /** Markdown du document, tel qu'écrit dans `document.md` (config Pagina comprise). */
  markdown: string;
  /** Images, par chemin RELATIF dans le conteneur (`images/plan-3fa9c1d2.png`). */
  assets: Record<string, XmdAsset>;
  /** JSON brut de `comments.json` / `history.json` (conservés tels quels tant qu'aucune fonction ne les édite). */
  comments: string;
  history: string;
  /** Autres fichiers du ZIP (inconnus de cette version) : réécrits à l'identique. */
  extras: Record<string, Uint8Array>;
}

export const EMPTY_COMMENTS = JSON.stringify({ version: 1, comments: [] });
export const EMPTY_HISTORY = JSON.stringify({ version: 1, revisions: [] });

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Type MIME d'une image d'après son extension ; `null` si ce n'est pas une image gérée. */
export function imageMimeOf(name: string): string | null {
  return MIME_BY_EXT[extensionOf(name)] ?? null;
}

/** Un nom d'entrée de ZIP sûr : relatif, sans `..`, sans lettre de lecteur. */
export function isSafeEntryName(name: string): boolean {
  if (!name || name.startsWith("/") || name.startsWith("\\") || /^[a-zA-Z]:/.test(name)) return false;
  return !name.split(/[\\/]/).includes("..");
}

/** Le contenu commence-t-il par la signature d'un ZIP (« PK ») ? */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5);
}

/** Paquet vide (nouveau document) autour d'un texte Markdown. */
export function newPackage(markdown: string): XmdPackage {
  return { markdown, assets: {}, comments: EMPTY_COMMENTS, history: EMPTY_HISTORY, extras: {} };
}

/** Lit un fichier `.xmd`. Lève une `Error` au message lisible si le contenu est illisible. */
export function unpackXmd(bytes: Uint8Array): XmdPackage {
  if (!looksLikeZip(bytes)) {
    // Un .md renommé en .xmd : lisible tel quel, converti en conteneur à la prochaine sauvegarde.
    return newPackage(strFromU8(bytes));
  }
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (file.originalSize > MAX_ENTRY_BYTES) throw new Error("entrée trop volumineuse");
        total += file.originalSize;
        if (total > MAX_TOTAL_BYTES) throw new Error("archive trop volumineuse");
        return true;
      },
    });
  } catch (e) {
    throw new Error(`Fichier .xmd illisible (${e instanceof Error ? e.message : String(e)}).`);
  }

  // Fichier principal : celui du manifeste, à défaut document.md, à défaut le premier .md de la racine.
  let main = MAIN_DOCUMENT;
  if (files[MANIFEST]) {
    try {
      const m = JSON.parse(strFromU8(files[MANIFEST])) as { main?: unknown };
      if (typeof m.main === "string" && isSafeEntryName(m.main)) main = m.main;
    } catch {
      /* manifeste illisible : on garde la valeur par défaut */
    }
  }
  if (!files[main]) {
    const firstMd = Object.keys(files).find((n) => !n.includes("/") && n.toLowerCase().endsWith(".md"));
    if (!firstMd) throw new Error("Fichier .xmd invalide : aucun document Markdown à l'intérieur.");
    main = firstMd;
  }

  const pkg = newPackage(strFromU8(files[main]));
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/") || !isSafeEntryName(name)) continue;
    if (name === main || name === MANIFEST) continue;
    if (name === COMMENTS) pkg.comments = strFromU8(data);
    else if (name === HISTORY) pkg.history = strFromU8(data);
    else if (name.startsWith(IMAGE_DIR) && imageMimeOf(name)) pkg.assets[name] = { bytes: data, mime: imageMimeOf(name)! };
    else pkg.extras[name] = data;
  }
  return pkg;
}

/** Noms d'images relatifs référencés par un Markdown : `![…](images/x.png)`, `<img src="images/x.png">`. */
export function referencedAssets(markdown: string): Set<string> {
  const found = new Set<string>();
  for (const m of markdown.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>"]+)/g)) found.add(decodeUri(m[1]));
  for (const m of markdown.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) found.add(decodeUri(m[1]));
  return found;
}

function decodeUri(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Écrit un `.xmd`. Seules les images RÉFÉRENCÉES par le Markdown sont embarquées (une image retirée du texte ne
 * reste pas dans le fichier) ; les fichiers inconnus (`extras`) sont conservés.
 */
export function packXmd(pkg: XmdPackage, generator: { app: string; version: string }, now: Date = new Date()): Uint8Array {
  const used = referencedAssets(pkg.markdown);
  const zip: Zippable = {};
  zip[MANIFEST] = strToU8(
    JSON.stringify(
      {
        format: XMD_FORMAT,
        formatVersion: XMD_FORMAT_VERSION,
        main: MAIN_DOCUMENT,
        generator,
        modified: now.toISOString(),
      },
      null,
      2,
    ),
  );
  zip[MAIN_DOCUMENT] = strToU8(pkg.markdown);
  zip[COMMENTS] = strToU8(pkg.comments || EMPTY_COMMENTS);
  zip[HISTORY] = strToU8(pkg.history || EMPTY_HISTORY);
  for (const [name, asset] of Object.entries(pkg.assets)) {
    if (!used.has(name) || !isSafeEntryName(name)) continue;
    zip[name] = [asset.bytes, { level: 0 }]; // déjà compressées : stockées telles quelles
  }
  for (const [name, data] of Object.entries(pkg.extras)) {
    if (isSafeEntryName(name) && !(name in zip)) zip[name] = data;
  }
  return zipSync(zip, { level: 6 });
}

/** Empreinte courte (8 caractères hexadécimaux) du contenu — dédoublonne les images identiques. */
export async function shortHash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Nom de fichier d'image sûr et lisible : `Plan étage 1.PNG` → `plan-etage-1`. */
export function slugBaseName(fileName: string): string {
  const base = fileName.replace(/\.[^.]*$/, "");
  const slug = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "image";
}

/** Chemin relatif d'une nouvelle image : `images/<nom>-<empreinte>.<ext>` (même contenu → même chemin). */
export async function assetPathFor(fileName: string, bytes: Uint8Array): Promise<string> {
  const ext = extensionOf(fileName) || "png";
  return `${IMAGE_DIR}${slugBaseName(fileName)}-${await shortHash(bytes)}.${ext}`;
}
