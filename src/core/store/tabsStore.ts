/**
 * État des onglets ouverts (couche "état du document").
 * Ne dépend d'aucune bibliothèque d'édition (pas de Tiptap ici) : le contenu
 * texte (Markdown) est la seule source de vérité persistée par onglet.
 */
import { create } from "zustand";
import { isEditableDocument } from "../types";
import { loadDocument, saveDocument, type DocumentFormat } from "../../persistence/documentIO";
import { assetPathFor, EMPTY_COMMENTS, EMPTY_HISTORY, type XmdAsset } from "../xmd/container";
import { checkDocument, repairDocument, backupPathFor, type Problem } from "../documentCheck";
import { extractDocumentConfig, withDocumentConfig, type PageLayoutSettings } from "../pageLayout";

/** Un onglet document ouvert : chemin, contenu Markdown courant, mise en
 *  page, état modifié, restauration de session. */
export interface EditorTab {
  path: string;
  title: string;
  content: string; // dernier contenu markdown sauvegardé (ou chargé) — SANS le commentaire de config (voir pageLayout.ts)
  dirty: boolean;
  layout: PageLayoutSettings;
  /** Problèmes relevés dans le fichier tel qu'il est SUR LE DISQUE (voir
   * `documentCheck`) — recalculés à l'ouverture, à l'enregistrement et après
   * réparation. Sert au badge de la barre d'état. */
  issues: Problem[];
  /** Incrémenté quand le contenu est rechargé depuis le disque : fait remonter
   * l'éditeur (clé du composant), qui ne relit son contenu initial qu'au montage. */
  revision: number;
  /** Vrai quand le fichier a disparu du disque (rafraîchissement de
   * l'arbre) : l'onglet reste ouvert, marqué « (introuvable) ». */
  missing?: boolean;
  /** `md` : fichier texte ; `xmd` : conteneur ZIP (document + images + commentaires + historique, voir core/xmd/container.ts). */
  format: DocumentFormat;
  /** Images du document par chemin relatif (`images/plan-3fa9c1d2.png`) : celles embarquées dans le `.xmd`, ou lues à côté d'un `.md`. */
  assets: Record<string, XmdAsset>;
  /** JSON brut des commentaires / de l'historique (conservés tels quels), fichiers inconnus du conteneur (réécrits à l'identique). */
  comments: string;
  history: string;
  extras: Record<string, Uint8Array>;
}

/** Valeurs par défaut des champs « conteneur » d'un onglet (document texte sans image) — utile aux tests et aux nouveaux onglets. */
export function blankTabData(): Pick<EditorTab, "format" | "assets" | "comments" | "history" | "extras"> {
  return { format: "md", assets: {}, comments: EMPTY_COMMENTS, history: EMPTY_HISTORY, extras: {} };
}

const LAST_TABS_KEY = "xmd.openTabs";
const LAST_ACTIVE_KEY = "xmd.activeTab";

// Évite qu'un même fichier soit ouvert deux fois lors d'appels concurrents à
// openFile (ex. double-clic, ou double montage des effets en StrictMode) :
// deux appels sur le même chemin partagent la même promesse de lecture.
const inFlightOpens = new Map<string, Promise<void>>();

function formatOfPath(path: string): DocumentFormat {
  return path.toLowerCase().endsWith(".xmd") ? "xmd" : "md";
}

function titleFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

interface TabsState {
  tabs: EditorTab[];
  activePath: string | null;
  pendingContent: Record<string, string>; // contenu en cours d'édition (non sauvegardé) par onglet

  openFile: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  updateContent: (path: string, content: string) => void;
  /** Référence de l'indicateur « modifié » : le Markdown tel que l'éditeur le sérialise à l'ouverture. Sans effet sur
   * un onglet déjà modifié (ses modifications en attente restent à enregistrer). */
  setBaseline: (path: string, markdown: string) => void;
  patchLayout: (path: string, patch: Partial<PageLayoutSettings>) => void;
  updateLayout: (path: string, layout: PageLayoutSettings) => void;
  saveTab: (path: string) => Promise<void>;
  /** Relit le fichier sur le disque (contenu, mise en page, problèmes) et remonte l'éditeur.
   * Écrase l'état mémoire de l'onglet : à n'appeler que sur un onglet non modifié. */
  reloadTab: (path: string) => Promise<void>;
  /** « Vérifier le document » : répare le fichier du disque (copie de sauvegarde écrite
   * AVANT), puis recharge l'onglet. Un onglet modifié est enregistré d'abord.
   * `backup` vaut null quand il n'y avait rien à réparer. */
  repairTabFile: (path: string) => Promise<{ applied: string[]; backup: string | null }>;
  /** "Enregistrer sous" : écrit le contenu actuel de `path` à `newPath`, puis
   * bascule sur un onglet pour `newPath` (contenu/mise en page repris tels
   * quels, `dirty:false` puisqu'on vient de l'écrire) — l'ancien onglet
   * reste ouvert inchangé, comme dans la plupart des éditeurs. */
  saveTabAs: (path: string, newPath: string) => Promise<void>;
  /** Ajoute une image au document (octets bruts) et renvoie son chemin RELATIF (`images/<nom>-<empreinte>.<ext>`). Un
   * contenu identique réutilise le même chemin. Le texte du document est modifié par l'appelant (nœud image). */
  addAsset: (path: string, fileName: string, bytes: Uint8Array, mime: string) => Promise<string>;
  /** Renommage disque d'un fichier OU d'un dossier : met à jour le chemin de
   * tout onglet sous `from` (le fichier lui-même, ou les fichiers contenus
   * dans le dossier) vers `to`, en conservant contenu, dirty et mise en
   * page. Appelé par `workspaceStore.renameEntry`. */
  renameTabPaths: (from: string, to: string) => void;
  /** Marque les onglets dont le fichier a disparu du disque (ou reparu).
   * Ne ferme jamais l'onglet : le contenu reste éditable/sauvegardable. */
  markMissingPaths: (missingPaths: Set<string>) => void;
  restoreSession: () => Promise<void>;
}

/** Store Zustand des onglets : ouverture/fermeture, activation, contenu,
 *  dirty state, patchs de mise en page (patchLayout — toujours par là pour un
 *  réglage unitaire, jamais par une capture de layout). */
export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activePath: null,
  pendingContent: {},

  openFile: async (path: string) => {
    if (!isEditableDocument(path)) return;
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activePath: path });
      persist(get());
      return;
    }

    const alreadyLoading = inFlightOpens.get(path);
    if (alreadyLoading) {
      await alreadyLoading;
      set({ activePath: path });
      persist(get());
      return;
    }

    const loadPromise = (async () => {
      const doc = await loadDocument(path);
      const raw = doc.raw;
      // Revérifier après l'attente : un appel concurrent a pu créer l'onglet entre-temps.
      if (get().tabs.some((t) => t.path === path)) return;
      // Le commentaire de config (voir pageLayout.ts) est extrait ICI, avant
      // que le contenu n'atteigne jamais l'éditeur Tiptap — un HTML comment
      // n'a pas de nœud de schéma dédié et disparaîtrait silencieusement au
      // premier aller-retour markdown si on le laissait dans `content`.
      const { layout, content } = extractDocumentConfig(raw);
      const tab: EditorTab = {
        path,
        title: titleFromPath(path),
        content,
        dirty: false,
        layout,
        issues: checkDocument(raw),
        revision: 0,
        format: doc.format,
        assets: doc.assets,
        comments: doc.comments,
        history: doc.history,
        extras: doc.extras,
      };
      set((s) => ({
        tabs: [...s.tabs, tab],
        activePath: path,
        pendingContent: { ...s.pendingContent, [path]: content },
      }));
      persist(get());
    })();

    inFlightOpens.set(path, loadPromise);
    try {
      await loadPromise;
    } finally {
      inFlightOpens.delete(path);
    }
    set({ activePath: path });
    persist(get());
  },

  closeTab: (path: string) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      const { [path]: _removed, ...pendingContent } = s.pendingContent;
      let activePath = s.activePath;
      if (activePath === path) {
        activePath = tabs.length > 0 ? tabs[tabs.length - 1].path : null;
      }
      return { tabs, activePath, pendingContent };
    });
    persist(get());
  },

  setActive: (path: string) => {
    set({ activePath: path });
    persist(get());
  },

  setBaseline: (path: string, markdown: string) => {
    set((s) => {
      const tab = s.tabs.find((t) => t.path === path);
      if (!tab || tab.dirty || tab.content === markdown) return s;
      return {
        tabs: s.tabs.map((t) => (t.path === path ? { ...t, content: markdown } : t)),
        pendingContent: { ...s.pendingContent, [path]: markdown },
      };
    });
  },

  updateContent: (path: string, content: string) => {
    set((s) => ({
      pendingContent: { ...s.pendingContent, [path]: content },
      tabs: s.tabs.map((t) =>
        t.path === path ? { ...t, dirty: content !== t.content } : t
      ),
    }));
  },

  /** Applique un PATCH à la mise en page d'un onglet — à privilégier pour
   * les réglages unitaires (interligne, espacement…) : lit TOUJOURS le
   * layout courant du store, jamais une capture passée par l'appelant
   * (piège rencontré le 2026-10-21 : les actions du ruban capturaient un
   * `activeTab.layout` périmé — régler l'interligne PUIS l'espacement
   * réécrasait l'interligne avec l'ancienne valeur). */
  patchLayout: (path: string, patch: Partial<PageLayoutSettings>) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path ? { ...t, layout: { ...t.layout, ...patch }, dirty: true } : t
      ),
    }));
  },
  updateLayout: (path: string, layout: PageLayoutSettings) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, layout, dirty: true } : t)),
    }));
  },

  saveTab: async (path: string) => {
    const { pendingContent, tabs } = get();
    const content = pendingContent[path];
    const tab = tabs.find((t) => t.path === path);
    if (content === undefined || !tab) return;
    // Le commentaire de config est réinjecté ICI, juste avant l'écriture
    // disque — jamais porté par l'éditeur (voir pageLayout.ts).
    const raw = withDocumentConfig(tab.layout, content);
    await saveDocument(path, { raw, assets: tab.assets, comments: tab.comments, history: tab.history, extras: tab.extras });
    const issues = checkDocument(raw);
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, content, dirty: false, issues } : t)),
    }));
  },

  reloadTab: async (path: string) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) return;
    const doc = await loadDocument(path);
    const raw = doc.raw;
    const { layout, content } = extractDocumentConfig(raw);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path
          ? {
              ...t,
              content,
              layout,
              dirty: false,
              missing: false,
              issues: checkDocument(raw),
              revision: t.revision + 1,
              format: doc.format,
              assets: doc.assets,
              comments: doc.comments,
              history: doc.history,
              extras: doc.extras,
            }
          : t
      ),
      pendingContent: { ...s.pendingContent, [path]: content },
    }));
  },

  repairTabFile: async (path: string) => {
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab) throw new Error("Document introuvable.");
    const disk = await loadDocument(path);
    const { applied } = repairDocument(disk.raw);
    if (applied.length === 0) return { applied, backup: null };
    // La copie d'abord, de l'état du disque tel qu'il est : si la suite échoue, rien n'est perdu.
    const backup = backupPathFor(path);
    await saveDocument(backup, disk);
    // Un onglet modifié est enregistré d'abord (le bouton le dit) : l'éditeur normalise déjà
    // une partie des défauts (zone de garde refermée, commentaires en double…), et la
    // réparation du disque ne doit pas écraser les modifications en cours.
    if (tab.dirty) await get().saveTab(path);
    const after = await loadDocument(path);
    const rest = repairDocument(after.raw);
    if (rest.applied.length > 0) await saveDocument(path, { ...after, raw: rest.text });
    await get().reloadTab(path);
    return { applied, backup };
  },

  saveTabAs: async (path: string, newPath: string) => {
    const { pendingContent, tabs } = get();
    const content = pendingContent[path];
    const tab = tabs.find((t) => t.path === path);
    if (content === undefined || !tab) return;
    await saveDocument(newPath, {
      raw: withDocumentConfig(tab.layout, content),
      assets: tab.assets,
      comments: tab.comments,
      history: tab.history,
      extras: tab.extras,
    });
    const newTab: EditorTab = {
      path: newPath,
      title: titleFromPath(newPath),
      content,
      dirty: false,
      layout: tab.layout,
      issues: [],
      revision: 0,
      format: formatOfPath(newPath),
      assets: tab.assets,
      comments: tab.comments,
      history: tab.history,
      extras: tab.extras,
    };
    set((s) => ({
      tabs: [...s.tabs.filter((t) => t.path !== newPath), newTab],
      pendingContent: { ...s.pendingContent, [newPath]: content },
      activePath: newPath,
    }));
    persist(get());
  },

  addAsset: async (path: string, fileName: string, bytes: Uint8Array, mime: string) => {
    const name = await assetPathFor(fileName, bytes);
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path && !t.assets[name] ? { ...t, assets: { ...t.assets, [name]: { bytes, mime } } } : t)),
    }));
    return name;
  },

  renameTabPaths: (from: string, to: string) => {
    const under = (p: string) =>
      p === from || p.startsWith(from + "\\") || p.startsWith(from + "/");
    set((s) => {
      if (!s.tabs.some((t) => under(t.path))) return s;
      const remap = (p: string) =>
        p === from ? to : to + p.slice(from.length);
      const tabs = s.tabs.map((t) =>
        under(t.path)
          ? { ...t, path: remap(t.path), title: titleFromPath(remap(t.path)) }
          : t
      );
      const pendingContent: Record<string, string> = {};
      for (const [k, v] of Object.entries(s.pendingContent)) {
        pendingContent[under(k) ? remap(k) : k] = v;
      }
      const activePath =
        s.activePath && under(s.activePath) ? remap(s.activePath) : s.activePath;
      return { tabs, pendingContent, activePath };
    });
    persist(get());
  },

  markMissingPaths: (missingPaths: Set<string>) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        missingPaths.has(t.path)
          ? t.missing
            ? t
            : { ...t, missing: true }
          : t.missing
            ? { ...t, missing: false }
            : t
      ),
    }));
    persist(get());
  },

  restoreSession: async () => {
    const raw = localStorage.getItem(LAST_TABS_KEY);
    const activeSaved = localStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) return;
    try {
      const paths: string[] = JSON.parse(raw);
      for (const p of paths) {
        try {
          await get().openFile(p);
        } catch {
          // fichier peut-être supprimé/déplacé depuis : on l'ignore silencieusement
        }
      }
      if (activeSaved && get().tabs.some((t) => t.path === activeSaved)) {
        set({ activePath: activeSaved });
      }
    } catch {
      // session corrompue : on ignore
    }
  },
}));

function persist(state: TabsState) {
  localStorage.setItem(LAST_TABS_KEY, JSON.stringify(state.tabs.map((t) => t.path)));
  if (state.activePath) {
    localStorage.setItem(LAST_ACTIVE_KEY, state.activePath);
  }
}
