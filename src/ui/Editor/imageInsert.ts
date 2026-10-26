/**
 * Insertion d'images dans le document (format .xmd, 2026-10-26) : choix de fichiers, collage d'une capture, glisser-déposer.
 *
 * Les octets ne vont jamais dans le texte : `addImage` (fourni par l'application, voir App.tsx) les range dans le document
 * (conteneur `.xmd`, converti au besoin) et renvoie le lien RELATIF à écrire (`images/<nom>-<empreinte>.<ext>`) ; ce module
 * insère ensuite le nœud image à la sélection.
 */
import type { EditorView } from "@tiptap/pm/view";
import { imageMimeOf } from "../../core/xmd/container";
import { pickImageFiles, readBinaryFile } from "../../persistence/fileService";

export interface ImageFile {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

/** Range une image dans le document ; renvoie son lien relatif, ou `null` si l'utilisateur renonce. */
export type AddImage = (file: ImageFile) => Promise<string | null>;

/** Texte alternatif proposé : le nom du fichier sans extension (« plan-etage_1.png » → « plan etage 1 »). */
export function altFromFileName(name: string): string {
  return name.replace(/\.[^.]*$/, "").replace(/[-_]+/g, " ").trim();
}

/** Insère UNE image à la sélection ; `false` si l'insertion est abandonnée. */
export async function insertImageFile(view: EditorView, file: ImageFile, addImage: AddImage | undefined): Promise<boolean> {
  if (!addImage) return false;
  const src = await addImage(file);
  if (!src) return false;
  const type = view.state.schema.nodes.image;
  if (!type) return false;
  const node = type.create({ src, alt: altFromFileName(file.name) });
  view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
  return true;
}

/** Insère plusieurs images à la suite, l'une après l'autre (chacune à la sélection laissée par la précédente). */
export async function insertImageFiles(view: EditorView, files: ImageFile[], addImage: AddImage | undefined): Promise<number> {
  let done = 0;
  for (const f of files) {
    if (await insertImageFile(view, f, addImage)) done++;
    else break; // renoncement : on n'enchaîne pas les autres
  }
  return done;
}

/** Boîte de fichiers « Insérer une image » : lit les images choisies et les insère. */
export async function pickAndInsertImages(view: EditorView, addImage: AddImage | undefined): Promise<number> {
  const paths = await pickImageFiles();
  const files: ImageFile[] = [];
  for (const p of paths) {
    const name = p.split(/[\\/]/).pop() ?? "image";
    const mime = imageMimeOf(name);
    if (!mime) continue;
    files.push({ name, bytes: await readBinaryFile(p), mime });
  }
  return insertImageFiles(view, files, addImage);
}

/** Images (fichiers) d'un transfert de collage / glisser-déposer. */
export async function imageFilesFromTransfer(dt: DataTransfer | null): Promise<ImageFile[]> {
  if (!dt) return [];
  const out: ImageFile[] = [];
  for (const f of Array.from(dt.files)) {
    const mime = f.type && f.type.startsWith("image/") ? f.type : imageMimeOf(f.name);
    if (!mime) continue;
    // Une capture collée n'a pas de nom utile (« image.png ») : le nom sert seulement de base au chemin.
    out.push({ name: f.name || "image.png", bytes: new Uint8Array(await f.arrayBuffer()), mime });
  }
  return out;
}

/** Le collage est-il UNIQUEMENT une image (capture d'écran) ? Un collage mixte (page web, Word : HTML + image) reste un collage de texte. */
export function isPureImagePaste(dt: DataTransfer | null): boolean {
  if (!dt || dt.files.length === 0) return false;
  return !dt.getData("text/html") && !dt.getData("text/plain");
}

/**
 * Position (dans le document) de l'image dont `img` est le CLONE peint : le bloc peint qui la contient porte `data-src-pos`
 * (position du nœud de premier niveau, de l'item de liste ou de la ligne de tableau) ; l'image est la n-ième image de ce
 * bloc, dans l'ordre du document.
 */
export function imagePosOfClone(doc: import("@tiptap/pm/model").Node, img: HTMLImageElement): number | null {
  const block = img.closest<HTMLElement>("[data-src-pos]");
  const start = block ? Number(block.getAttribute("data-src-pos")) : NaN;
  if (!block || Number.isNaN(start)) return null;
  const node = doc.nodeAt(start);
  if (!node) return null;
  const index = Array.from(block.querySelectorAll("img")).indexOf(img);
  if (index < 0) return null;
  let seen = 0;
  let found: number | null = null;
  const visit = (n: import("@tiptap/pm/model").Node, pos: number) => {
    if (found !== null) return false;
    if (n.type.name === "image") {
      if (seen === index) found = pos;
      seen++;
      return false;
    }
    return true;
  };
  if (node.type.name === "image") visit(node, start);
  else node.descendants((n, offset) => visit(n, start + 1 + offset));
  return found;
}
