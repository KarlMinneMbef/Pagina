/**
 * Adresses d'affichage des images d'un document (format .xmd, 2026-10-26).
 *
 * Dans le texte, une image est un lien RELATIF (`images/plan-3fa9c1d2.png`) — c'est ce qui est écrit dans le fichier. Pour
 * l'AFFICHER, les octets de l'image (embarqués dans le `.xmd`, ou lus à côté d'un `.md`) sont transformés en adresses
 * `blob:` du navigateur : ce registre fait la correspondance, et l'extension `ImageAsset` s'en sert au rendu.
 *
 * Une seule table pour toute l'application : l'éditeur affiche un document à la fois (un éditeur par onglet actif).
 * `syncAssetUrls` est idempotent : une image inchangée garde la MÊME adresse (les clones déjà peints restent valides).
 */
import type { XmdAsset } from "../../core/xmd/container";

interface Entry {
  url: string;
  bytes: Uint8Array;
}

const entries = new Map<string, Entry>();

/** Aligne le registre sur les images du document affiché : crée les nouvelles adresses, libère celles qui ont disparu. */
export function syncAssetUrls(assets: Record<string, XmdAsset> | undefined): void {
  const wanted = assets ?? {};
  for (const [name, entry] of entries) {
    const next = wanted[name];
    if (!next || next.bytes !== entry.bytes) {
      URL.revokeObjectURL(entry.url);
      entries.delete(name);
    }
  }
  for (const [name, asset] of Object.entries(wanted)) {
    if (!entries.has(name)) {
      const blob = new Blob([asset.bytes as unknown as BlobPart], { type: asset.mime });
      entries.set(name, { url: URL.createObjectURL(blob), bytes: asset.bytes });
    }
  }
}

/** Adresse d'affichage d'un lien d'image ; un lien inconnu (http, data:, chemin absolu…) est rendu tel quel. */
export function resolveAssetUrl(src: string | null | undefined): string {
  if (!src) return "";
  const hit = entries.get(src);
  if (hit) return hit.url;
  try {
    const decoded = entries.get(decodeURIComponent(src));
    if (decoded) return decoded.url;
  } catch {
    /* séquence % invalide : on garde le lien brut */
  }
  return src;
}

/** Libère toutes les adresses (fermeture du dernier onglet). */
export function releaseAssetUrls(): void {
  syncAssetUrls({});
}
