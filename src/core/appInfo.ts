/**
 * Identité de l'application, utilisée uniquement pour documenter les
 * fichiers générés (voir `pageLayout.ts` — commentaire `pagina:generator`).
 * `APP_VERSION` suit `package.json` (import JSON direct, toujours
 * synchronisé — pas de constante à mettre à jour à la main à chaque bump
 * de version).
 */
import pkg from "../../package.json";

export const APP_NAME = "Pagina";
export const APP_VERSION: string = pkg.version;
export const PUBLISHER = "Mon BE Fluides";
export const PUBLISHER_WEBSITE = "https://www.monbefluides.fr";
export const LICENSE_NOTE = "Dépôt GitHub public";
