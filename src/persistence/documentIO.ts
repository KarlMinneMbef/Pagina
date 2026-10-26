/**
 * Lecture et écriture d'un DOCUMENT (`.md` ou `.xmd`) : relie le conteneur pur (`core/xmd/container.ts`) aux octets du
 * disque (`fileService.ts`, seul module qui appelle `invoke`). `tabsStore` ne connaît que ces deux fonctions.
 */
import {
  EMPTY_COMMENTS,
  EMPTY_HISTORY,
  IMAGE_DIR,
  extensionOf,
  imageMimeOf,
  isSafeEntryName,
  packXmd,
  referencedAssets,
  unpackXmd,
  type XmdAsset,
  type XmdPackage,
} from "../core/xmd/container";
import { APP_NAME, APP_VERSION } from "../core/appInfo";
import { pathExists, readBinaryFile, readTextFile, writeBinaryFile, writeTextFile } from "./fileService";

export type DocumentFormat = "md" | "xmd";

/** Ce que l'on retient d'un document ouvert (en plus de son texte, géré par `pageLayout.ts`). */
export interface LoadedDocument {
  format: DocumentFormat;
  /** Texte Markdown brut du fichier (commentaire de config compris). */
  raw: string;
  /** Images par chemin relatif (`images/x.png`). */
  assets: Record<string, XmdAsset>;
  comments: string;
  history: string;
  extras: Record<string, Uint8Array>;
}

export function formatOf(path: string): DocumentFormat {
  return path.toLowerCase().endsWith(".xmd") ? "xmd" : "md";
}

function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return i < 0 ? "" : path.slice(0, i);
}

/** Images relatives d'un `.md` (`![](images/x.png)`) lues À CÔTÉ du fichier — pour les afficher ; les liens absolus,
 *  `http(s):` et `data:` restent tels quels. Une image introuvable est simplement absente (lien cassé affiché). */
async function loadRelativeImages(mdPath: string, markdown: string): Promise<Record<string, XmdAsset>> {
  const assets: Record<string, XmdAsset> = {};
  const dir = dirOf(mdPath);
  for (const rel of referencedAssets(markdown)) {
    if (!isSafeEntryName(rel) || /^[a-z][a-z0-9+.-]*:/i.test(rel)) continue;
    const mime = imageMimeOf(rel);
    if (!mime) continue;
    try {
      assets[rel] = { bytes: await readBinaryFile(`${dir}/${rel}`), mime };
    } catch {
      /* image absente du disque */
    }
  }
  return assets;
}

export async function loadDocument(path: string): Promise<LoadedDocument> {
  if (formatOf(path) === "xmd") {
    const pkg = unpackXmd(await readBinaryFile(path));
    return { format: "xmd", raw: pkg.markdown, assets: pkg.assets, comments: pkg.comments, history: pkg.history, extras: pkg.extras };
  }
  const raw = await readTextFile(path);
  return { format: "md", raw, assets: await loadRelativeImages(path, raw), comments: EMPTY_COMMENTS, history: EMPTY_HISTORY, extras: {} };
}

/** Ce qu'il faut pour écrire un document. */
export interface DocumentToSave {
  /** Texte Markdown complet à écrire (`withDocumentConfig(layout, contenu)`). */
  raw: string;
  assets: Record<string, XmdAsset>;
  comments: string;
  history: string;
  extras: Record<string, Uint8Array>;
}

/** Écrit un document dans `path`, au format donné par son extension. Pour un `.md`, les images embarquées dans le
 *  document (qui venaient d'un `.xmd`) sont extraites dans `images/` à côté du fichier. */
export async function saveDocument(path: string, doc: DocumentToSave): Promise<void> {
  if (formatOf(path) === "xmd") {
    const pkg: XmdPackage = { markdown: doc.raw, assets: doc.assets, comments: doc.comments, history: doc.history, extras: doc.extras };
    await writeBinaryFile(path, packXmd(pkg, { app: APP_NAME, version: APP_VERSION }));
    return;
  }
  await writeTextFile(path, doc.raw);
  const dir = dirOf(path);
  for (const name of referencedAssets(doc.raw)) {
    const asset = doc.assets[name];
    if (!asset || !name.startsWith(IMAGE_DIR) || !isSafeEntryName(name) || !extensionOf(name)) continue;
    const target = `${dir}/${name}`;
    // Une image déjà présente à côté du `.md` n'est pas réécrite à chaque enregistrement.
    if (!(await pathExists(target))) await writeBinaryFile(target, asset.bytes);
  }
}
