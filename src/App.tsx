/**
 * Composant racine de Pagina : disposition générale (barre de titre, ruban,
 * explorateur, zone éditeur, colonne de panneaux contextuels) et orchestration
 * de l'état applicatif — onglets actifs, dialogues (Mise en page, Styles de
 * titres, Propriétés du document, Paragraphe), panneaux latéraux et câblage
 * des actions du ruban vers l'éditeur via MarkdownEditorHandle.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm as confirmDialog, message as messageDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { FileExplorer } from "./ui/FileExplorer/FileExplorer";
import { TitleBar } from "./ui/TitleBar/TitleBar";
import { Toolbar, type ToolbarActions } from "./ui/Toolbar/Toolbar";
import { TabBar } from "./ui/TabBar/TabBar";
import { MarkdownEditor, type MarkdownEditorHandle, type EditorStats } from "./ui/Editor/MarkdownEditor";
import { MarkdownSourceView } from "./ui/Editor/MarkdownSourceView";
import { MarkdownPreview } from "./ui/Editor/MarkdownPreview";
import { StatusBar, type ViewMode } from "./ui/StatusBar/StatusBar";
import { PageSetupDialog } from "./ui/PageSetup/PageSetupDialog";
import { HeadingStyleDialog } from "./ui/HeadingStyles/HeadingStyleDialog";
import { TablePropertiesPanel } from "./ui/TableProperties/TablePropertiesPanel";
import { HeaderFooterPanel } from "./ui/HeaderFooter/HeaderFooterPanel";
import { TocPanel } from "./ui/Toc/TocPanel";
import { EquationPanel } from "./ui/Math/EquationPanel";
import { FindReplacePanel } from "./ui/FindReplace/FindReplacePanel";
import { DocumentPropertiesDialog } from "./ui/PageSetup/DocumentPropertiesDialog";
import { ParagraphDialog } from "./ui/Paragraph/ParagraphDialog";
import { DiagramPanel } from "./ui/Mermaid/DiagramPanel";
import { ImagePanel } from "./ui/Image/ImagePanel";
import { CommentsPanel } from "./ui/Comments/CommentsPanel";
import { HistoryPanel } from "./ui/History/HistoryPanel";
import { parseComments, serializeComments, newCommentId, type CommentsFile } from "./core/xmd/comments";
import { parseHistory, serializeHistory, type Revision } from "./core/xmd/history";
import { SectionBreakDialog } from "./ui/Section/SectionBreakDialog";
import { CoverGalleryDialog } from "./ui/Cover/CoverGalleryDialog";
import { addUserCoverTemplate } from "./core/coverTemplates";
import { CoverPagePanel } from "./ui/Cover/CoverPagePanel";
import { HeadingStylesPanel } from "./ui/HeadingStyles/HeadingStylesPanel";
import { SettingsDialog } from "./ui/Settings/SettingsDialog";
import { DocumentCheckDialog } from "./ui/DocumentCheck/DocumentCheckDialog";
import { PromptHost } from "./ui/dialogs/PromptHost";
import { askNewFileName } from "./ui/dialogs/prompts";
import { askConfirm, askText } from "./ui/dialogs/promptStore";
import type { AddImage } from "./ui/Editor/imageInsert";
import { freeXmdPath, titleOf } from "./core/xmd/paths";
import { UserDialog } from "./ui/User/UserDialog";
import { useSettingsStore, useUserStore, userInitials } from "./core/store/settingsStore";
import { resolvePageSizeMm } from "./core/pageLayout";
import { ContextualPanelHost, type ContextualTab } from "./ui/ContextualPanels/ContextualPanelHost";
import { clampZoom } from "./ui/Editor/pagination/zoom";
import { printWindow, exportPdf, pickPdfSaveLocation, pickFiles, pickSaveLocation, getStartupFiles } from "./persistence/fileService";
import { useWorkspaceStore } from "./core/store/workspaceStore";
import { useTabsStore } from "./core/store/tabsStore";
import "./App.css";

const EMPTY_STATS: EditorStats = {
  words: 0,
  characters: 0,
  pageCount: 1,
  currentPage: 1,
  activeBlockStyle: "paragraph",
  activeMarks: { bold: false, italic: false, underline: false, strike: false, code: false, subscript: false, superscript: false, highlight: false },
  activeAlign: null,
  activeList: null,
  activeFontFamily: null,
  activeColor: null,
  activeFontSizePt: 12,
  insideTable: false,
  tableSelectionShape: null,
  headerFooterEditMode: null,
  insideToc: false,
  math: null,
  mermaid: null,
  image: null,
  coverZone: null,
};

function App() {
  const restoreLastWorkspace = useWorkspaceStore((s) => s.restoreLastWorkspace);
  const createNewFile = useWorkspaceStore((s) => s.createNewFile);
  const workspaceRoot = useWorkspaceStore((s) => s.root);
  const openFolderPicker = useWorkspaceStore((s) => s.openFolderPicker);
  const {
    tabs,
    activePath,
    pendingContent,
    openFile,
    closeTab,
    setActive,
    updateContent,
    updateLayout,
    patchLayout,
    saveTab,
    saveTabAs,
    restoreSession,
    updateComments,
    updateHistory,
    saveNamedRevision,
    restoreRevision,
  } = useTabsStore();

  const editorRef = useRef<MarkdownEditorHandle>(null);
  const [actions, setActions] = useState<ToolbarActions | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("pages");
  const [stats, setStats] = useState<EditorStats>(EMPTY_STATS);
  const [zoom, setZoom] = useState(1);
  const [markdownPreviewHtml, setMarkdownPreviewHtml] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const [headingStylesOpen, setHeadingStylesOpen] = useState(false);
  // Fenêtre « Propriétés du document » (roadmap 1.3).
  const [documentPropertiesOpen, setDocumentPropertiesOpen] = useState(false);
  // Fenêtre « Paragraphe — Retrait et espacement » (comme Word).
  const [paragraphDialogOpen, setParagraphDialogOpen] = useState(false);
  // Fenêtre « Paramétrage » (préférences globales, roadmap 1.4) —
  // indépendante des documents, peut s'ouvrir sans onglet actif.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [documentCheckOpen, setDocumentCheckOpen] = useState(false);
  // Fenêtre « Utilisateur » (prénom + nom, roadmap 1.5 V1) — idem.
  const [userOpen, setUserOpen] = useState(false);
  // Panneau latéral contextuel de mise en forme de tableau (voir
  // TablePropertiesPanel.tsx). S'ouvre automatiquement au FRONT MONTANT de
  // `stats.insideTable` (même principe que la bascule d'onglet ruban
  // "Tableau" dans Toolbar.tsx) ; une fermeture manuelle n'est pas annulée
  // tant que le curseur reste dans le même tableau.
  const [tablePanelOpen, setTablePanelOpen] = useState(false);
  const wasInsideTableRef = useRef(false);
  // Panneau latéral contextuel « Sommaire » (Mettre à jour/Supprimer) — même
  // principe de front montant que `tablePanelOpen`, piloté par
  // `stats.insideToc` (voir `isTocList` dans TocMarker.ts).
  const [tocPanelOpen, setTocPanelOpen] = useState(false);
  // Panneau « Équation » (2026-10-17, éditeur MathLive) : même front montant
  // que tablePanelOpen, piloté par stats.math (NodeSelection sur une formule).
  const [mathPanelOpen, setMathPanelOpen] = useState(false);
  // Panneau « Rechercher / Remplacer » (roadmap 2.4) : ouvert par Ctrl+F,
  // comme Word — pas contextuel, c'est l'utilisateur qui l'ouvre/ferme.
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  // Requête venant du champ de RECHERCHE RAPIDE de la barre de titre :
  // portée dans le panneau « Rechercher » (seed) à chaque frappe.
  const [findSeed, setFindSeed] = useState("");
  // Panneau « Diagramme » (édition Mermaid, 2026-10-21) : ouvert au clic
  // sur un diagramme peint / à l'insertion, refermé quand la sélection
  // quitte le diagramme — même cycle que le panneau Équation.
  const [mermaidPanelOpen, setMermaidPanelOpen] = useState(false);
  // Fenêtres « Saut de section » et galerie « Page de garde » (2026-10-22)
  // — ouvertes depuis l'onglet Insertion du ruban.
  const [sectionBreakDialogOpen, setSectionBreakDialogOpen] = useState(false);
  const [coverGalleryOpen, setCoverGalleryOpen] = useState(false);
  // Panneau « Page de garde » : front montant piloté par stats.coverZone
  // (le curseur entre dans la zone transparente, voir CoverZone.ts) —
  // même cycle que le panneau Tableau.
  const [coverPanelOpen, setCoverPanelOpen] = useState(false);
  const wasCoverSelRef = useRef(false);
  const wasMermaidSelRef = useRef(false);
  // Panneau « Image » : ouvert quand une image est sélectionnée, refermé quand la sélection la quitte (même cycle que Diagramme).
  const [imagePanelOpen, setImagePanelOpen] = useState(false);
  const wasImageSelRef = useRef(false);
  // Panneaux « Commentaires » et « Historique » (format .xmd uniquement,
  // roadmap 5.2/5.3) : ouverts MANUELLEMENT depuis les boutons du coin du
  // ruban — pas de front montant, ils restent ouverts tant que l'onglet
  // .xmd est actif.
  const [commentsPanelOpen, setCommentsPanelOpen] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  useEffect(() => {
    const was = wasImageSelRef.current;
    wasImageSelRef.current = !!stats.image;
    if (stats.image && !was) {
      setImagePanelOpen(true);
      setCtxTab("image");
    } else if (!stats.image && was) {
      setImagePanelOpen(false);
    }
  }, [stats.image]);
  useEffect(() => {
    const was = wasMermaidSelRef.current;
    wasMermaidSelRef.current = !!stats.mermaid;
    if (stats.mermaid && !was) {
      setMermaidPanelOpen(true);
      setCtxTab("diagramme");
    } else if (!stats.mermaid && was) {
      setMermaidPanelOpen(false);
    }
  }, [stats.mermaid]);
  useEffect(() => {
    const was = wasCoverSelRef.current;
    wasCoverSelRef.current = !!stats.coverZone;
    if (stats.coverZone && !was) {
      setCoverPanelOpen(true);
      setCtxTab("page-de-garde");
    } else if (!stats.coverZone && was) {
      setCoverPanelOpen(false);
    }
  }, [stats.coverZone]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+S partout (le raccourci de l'éditeur ne marche que s'il a le focus : après une fenêtre de dialogue, un
      // champ de panneau ou la vue Code, Ctrl+S ne faisait rien). Déjà traité par l'éditeur = defaultPrevented.
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s" && !e.defaultPrevented) {
        e.preventDefault();
        const { activePath, saveTab: save } = useTabsStore.getState();
        if (activePath) void save(activePath);
        return;
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        // Ne pas voler le Ctrl+F de l'EXPLORATEUR (son propre champ de
        // recherche) ni hors document ouvert.
        const inExplorerInput = (e.target as HTMLElement)?.closest?.(".app-sidebar");
        if (inExplorerInput || !document.querySelector(".xmd-page-wrap")) return;
        e.preventDefault();
        setFindReplaceOpen((o) => {
          if (!o) setCtxTab("rechercher");
          return true;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const wasMathSelRef = useRef(false);
  const wasInsideTocRef = useRef(false);
  // Onglet actif de l'hôte de panneaux contextuels (« tableau » | « hf » |
  // « toc ») : quand plusieurs contextes sont actifs en même temps (curseur
  // dans un tableau + édition d'en-tête/pied de page, p. ex.), l'utilisateur
  // choisit l'onglet.
  const [ctxTab, setCtxTab] = useState<"tableau" | "hf" | "toc" | "styles" | "equation" | "rechercher" | "diagramme" | "page-de-garde" | "image" | "commentaires" | "historique">("tableau");
  // Panneau « Styles de titres » : ouvert/fermé À LA MAIN (chevron de la
  // galerie de styles du ruban), pas automatiquement comme Tableau/Sommaire.
  const [headingPanelOpen, setHeadingPanelOpen] = useState(false);
  const prevHfModeRef = useRef<string | null>(null);

  useEffect(() => {
    restoreLastWorkspace();
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const wasInside = wasInsideTableRef.current;
    wasInsideTableRef.current = stats.insideTable;
    if (stats.insideTable && !wasInside) {
      setTablePanelOpen(true);
    } else if (!stats.insideTable && wasInside) {
      setTablePanelOpen(false);
    }
  }, [stats.insideTable]);

  useEffect(() => {
    const wasInside = wasInsideTocRef.current;
    wasInsideTocRef.current = stats.insideToc;
    if (stats.insideToc && !wasInside) {
      setTocPanelOpen(true);
      // Ne prend PAS la main sur l'onglet « Rechercher » : une recherche qui
      // atterrit dans un sommaire ne doit pas éjecter le panneau ouvert
      // volontairement par l'utilisateur (route 2.4) — l'onglet Sommaire
      // reste accessible dans le bandeau.
      if (!findReplaceOpen) setCtxTab("toc");
    } else if (!stats.insideToc && wasInside) {
      setTocPanelOpen(false);
    }
  }, [stats.insideToc, findReplaceOpen]);

  // Formule sélectionnée → panneau « Équation » (front montant), fermeture
  // quand la sélection quitte la formule (clic ailleurs dans le document).
  useEffect(() => {
    const was = wasMathSelRef.current;
    wasMathSelRef.current = !!stats.math;
    if (stats.math && !was) {
      setMathPanelOpen(true);
      setCtxTab("equation");
    } else if (!stats.math && was) {
      setMathPanelOpen(false);
    }
  }, [stats.math]);

  // Sélection automatique de l'onglet : une édition d'en-tête/pied qui
  // DÉMARRE prend la main (l'utilisateur vient de cliquer dessus), sa fin
  // rend la main à l'onglet Tableau s'il est encore ouvert.
  useEffect(() => {
    const mode = stats.headerFooterEditMode;
    if (mode && !prevHfModeRef.current) {
      setCtxTab("hf");
    } else if (!mode && prevHfModeRef.current && tablePanelOpen) {
      setCtxTab("tableau");
    }
    prevHfModeRef.current = mode;
  }, [stats.headerFooterEditMode, tablePanelOpen]);

  // Un onglet Tableau ouvert doit toujours être sélectionné si aucun
  // contexte en-tête/pied n'est actif (état initial, retour de l'hôte) —
  // SAUF pendant une recherche (roadmap 2.4) : l'effet forcerait l'onglet
  // Tableau dès qu'une occurrence atterrit dans un tableau, éjectant le
  // panneau Rechercher que l'utilisateur a ouvert volontairement. La
  // recherche terminée (panneau fermé), la priorité Tableau revient.
  useEffect(() => {
    if (tablePanelOpen && !stats.headerFooterEditMode && !stats.insideToc && !headingPanelOpen && !findReplaceOpen && ctxTab !== "tableau") {
      setCtxTab("tableau");
    }
  }, [tablePanelOpen, stats.headerFooterEditMode, stats.insideToc, findReplaceOpen]);

  // Ouverture depuis l'Explorateur Windows (double-clic sur un .md/.xmd
  // associé à Pagina, ou "Ouvrir avec") — voir `startup_files.rs` côté Rust.
  // Deux chemins d'arrivée bien distincts :
  // - fichiers passés en argument au tout premier lancement du processus
  //   (`getStartupFiles`, "tiré" une seule fois depuis Rust — le frontend ne
  //   peut pas écouter un évènement émis avant même d'exister) ;
  // - fichier(s) d'un lancement ULTÉRIEUR pendant que l'app tourne déjà
  //   (`tauri-plugin-single-instance` empêche une vraie 2e fenêtre et
  //   réémet plutôt l'évènement `"open-files"` vers celle-ci, déjà montée).
  useEffect(() => {
    void getStartupFiles().then((paths) => {
      for (const p of paths) void useTabsStore.getState().openFile(p);
    });
    let unlisten: (() => void) | undefined;
    listen<string[]>("open-files", (event) => {
      for (const p of event.payload) void useTabsStore.getState().openFile(p);
    }).then((f) => {
      unlisten = f;
    });
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Confirmation à la fermeture de la FENÊTRE (bouton ✕ du TitleBar, mais
  // aussi Alt+F4 ou tout autre déclencheur système) si des documents ont des
  // modifications non enregistrées — jusqu'ici seule la fermeture d'un
  // ONGLET individuel demandait confirmation (`handleCloseTab` plus bas),
  // rien n'empêchait de fermer toute l'application sans avertissement.
  // `Window.close()` émet un évènement `closeRequested` annulable (voir
  // doc @tauri-apps/api) — le bouton ✕ du TitleBar l'appelle déjà tel quel,
  // il suffit d'intercepter ici plutôt que de dupliquer la logique dans
  // TitleBar.tsx (qui ne connaît pas le store des onglets).
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    appWindow
      .onCloseRequested(async (event) => {
        const hasDirty = useTabsStore.getState().tabs.some((t) => t.dirty);
        if (!hasDirty) return;
        event.preventDefault();
        // PAS `window.confirm()` : Tauri le réachemine vers sa propre
        // commande native (`dialog.confirm`), qui échoue silencieusement
        // (`Command not found`, rejet non intercepté) sans la permission
        // dédiée — même piège que `window.print()` documenté dans
        // `print_commands.rs`. On passe directement par le plugin dialogue
        // officiel (`@tauri-apps/plugin-dialog`), permission
        // `dialog:allow-confirm` ajoutée dans `capabilities/default.json`.
        const ok = await confirmDialog(
          "Un ou plusieurs documents contiennent des modifications non enregistrées. Fermer sans enregistrer ?",
          { title: "Pagina", kind: "warning" },
        );
        if (ok) {
          // `.close()` réémettrait le même évènement (boucle) : `.destroy()`
          // force la fermeture sans repasser par `closeRequested`.
          await appWindow.destroy();
        }
      })
      .then((f) => {
        unlisten = f;
      });
    return () => unlisten?.();
  }, []);

  const activeTab = tabs.find((t) => t.path === activePath) ?? null;

  // Commentaires/historique de l'onglet actif, REPARSÉS quand le JSON
  // change (action du panneau ou changement d'onglet).
  const activeComments: CommentsFile = useMemo(
    () => parseComments(activeTab?.comments ?? ""),
    [activeTab?.comments, activeTab?.path],
  );
  const activeRevisions: Revision[] = useMemo(
    () => parseHistory(activeTab?.history ?? "").revisions.slice().reverse(),
    [activeTab?.history, activeTab?.path],
  );
  // Un document `.md` n'a ni commentaires ni historique : les panneaux
  // ouverts se referment d'eux-mêmes au changement d'onglet.
  useEffect(() => {
    if (activeTab?.format !== "xmd") {
      setCommentsPanelOpen(false);
      setHistoryPanelOpen(false);
    }
  }, [activeTab?.format, activeTab?.path]);

  // Changer d'onglet revient toujours à la vue Pages avec des statistiques
  // fraîches — sinon on garderait la vue "code" ou les stats du fichier
  // précédent affichées sur le nouveau.
  useEffect(() => {
    setViewMode("pages");
    setStats(EMPTY_STATS);
  }, [activeTab?.path]);

  // La vue "Markdown basique" est en lecture seule : on ne recalcule son HTML
  // qu'au moment d'y entrer (l'éditeur Tiptap reste monté en arrière-plan
  // même en vue Code, donc getHTML() reflète toujours le texte à jour).
  useEffect(() => {
    if (viewMode === "preview" && editorRef.current) {
      setMarkdownPreviewHtml(editorRef.current.getHTML());
    }
  }, [viewMode, activeTab?.path]);

  const handleSave = async () => {
    if (!activeTab) return;
    await saveTab(activeTab.path);
  };

  // Réglages globaux (fenêtre Paramétrage, roadmap 1.4) et profil
  // utilisateur (roadmap 1.5 V1) — stores localStorage, indépendants
  // des documents ouverts.
  const showRulers = useSettingsStore((s) => s.showRulers);
  const autoSave = useSettingsStore((s) => s.autoSave);
  const autoSaveIntervalSec = useSettingsStore((s) => s.autoSaveIntervalSec);
  const firstName = useUserStore((s) => s.firstName);
  const lastName = useUserStore((s) => s.lastName);

  // Auto-sauvegarde : enregistre l'onglet actif à intervalle régulier,
  // uniquement s'il porte des modifications non enregistrées (dirty).
  // Les refs gardent le timer stable — il n'est reprogrammé que si les
  // réglages changent, pas à chaque frappe.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  useEffect(() => {
    if (!autoSave) return;
    const id = setInterval(() => {
      if (activeTabRef.current?.dirty) void saveRef.current();
    }, autoSaveIntervalSec * 1000);
    return () => clearInterval(id);
  }, [autoSave, autoSaveIntervalSec]);

  const handleNewFile = async () => {
    if (!workspaceRoot) {
      await messageDialog("Ouvrez d'abord un dossier de travail.", { title: "Pagina", kind: "warning" });
      return;
    }
    const name = await askNewFileName();
    if (!name) return;
    try {
      const path = await createNewFile(name.trim());
      await openFile(path);
    } catch (e) {
      await messageDialog(`Impossible de créer le fichier : ${e}`, { title: "Pagina", kind: "error" });
    }
  };

  // "Ouvrir un fichier" — contrairement à "Ouvrir un dossier", ne nécessite
  // aucun workspace : `tabsStore.openFile` accepte n'importe quel chemin
  // absolu, dossier de travail ouvert ou non.
  const handleOpenFiles = async () => {
    const paths = await pickFiles();
    for (const p of paths) {
      await openFile(p);
    }
  };

  /** Range une image dans le document actif (collage, glisser-déposer, bouton Image). Un document `.md` passe d'abord au
   * format `.xmd` — avec confirmation — puisque seul le conteneur embarque les images ; renvoie le lien relatif à écrire. */
  const handleAddImage: AddImage = async (file) => {
    const store = useTabsStore.getState();
    let tab = store.tabs.find((t) => t.path === store.activePath);
    if (!tab) return null;
    try {
      if (tab.format !== "xmd") {
        const target = await freeXmdPath(tab.path);
        const ok = await askConfirm({
          title: "Images : format .xmd",
          message:
            `Pour contenir des images, le document passe au format .xmd (un fichier compressé qui regroupe le texte, les images, ` +
            `les commentaires et l'historique). « ${titleOf(target)} » va être créé dans le même dossier ; votre fichier ${tab.title} n'est pas modifié.`,
          okLabel: "Créer le .xmd",
        });
        if (!ok) return null;
        await store.convertToXmd(tab.path, target);
        tab = useTabsStore.getState().tabs.find((t) => t.path === target);
        if (!tab) return null;
      }
      return await useTabsStore.getState().addAsset(tab.path, file.name, file.bytes, file.mime);
    } catch (e) {
      await messageDialog(`Impossible d'ajouter l'image : ${e}`, { title: "Pagina", kind: "error" });
      return null;
    }
  };

  // --- Commentaires de relecture (format .xmd, roadmap 5.2) ---
  // Le texte du commentaire vit dans `comments.json` du conteneur, l'ancre
  // est surlignée dans le document (marque `comment`, voir CommentMark.ts).
  const commentAuthor = `${firstName} ${lastName}`.trim();

  const handleAddComment = async () => {
    if (!activeTab || activeTab.format !== "xmd" || !editorRef.current) return;
    const quote = editorRef.current.getSelectionText();
    if (!quote.trim()) {
      await messageDialog("Sélectionnez d'abord le passage de texte à commenter.", { title: "Commentaires", kind: "warning" });
      return;
    }
    const text = await askText({
      title: "Nouveau commentaire",
      label: "Votre commentaire :",
      placeholder: "Écrivez votre remarque de relecture…",
      okLabel: "Commenter",
      validate: (v) => (v.trim() ? null : "Le commentaire ne peut pas être vide."),
    });
    if (text === null || !text.trim()) return;
    const id = newCommentId();
    if (!editorRef.current.addCommentMark(id)) return;
    const file = parseComments(activeTab.comments);
    file.comments.push({
      id,
      quote,
      author: commentAuthor,
      text: text.trim(),
      createdAt: new Date().toISOString(),
      resolved: false,
      resolvedAt: null,
      replies: [],
    });
    updateComments(activeTab.path, serializeComments(file));
  };

  const handleReplyComment = (id: string, text: string) => {
    if (!activeTab) return;
    const file = parseComments(activeTab.comments);
    const comment = file.comments.find((c) => c.id === id);
    if (!comment) return;
    comment.replies.push({ id: newCommentId(), author: commentAuthor, text, createdAt: new Date().toISOString() });
    updateComments(activeTab.path, serializeComments(file));
  };

  const handleToggleResolveComment = (id: string) => {
    if (!activeTab) return;
    const file = parseComments(activeTab.comments);
    const comment = file.comments.find((c) => c.id === id);
    if (!comment) return;
    comment.resolved = !comment.resolved;
    comment.resolvedAt = comment.resolved ? new Date().toISOString() : null;
    updateComments(activeTab.path, serializeComments(file));
  };

  const handleDeleteComment = (id: string) => {
    if (!activeTab) return;
    const file = parseComments(activeTab.comments);
    file.comments = file.comments.filter((c) => c.id !== id);
    updateComments(activeTab.path, serializeComments(file));
    // Le surlignage suit le commentaire : il disparaît aussi.
    editorRef.current?.removeCommentMark(id);
  };

  const handleJumpToComment = (id: string) => {
    void editorRef.current?.jumpToComment(id);
  };

  // --- Historique des révisions (format .xmd, roadmap 5.3) ---
  const handleSaveNamedRevision = async () => {
    if (!activeTab) return;
    const label = await askText({
      title: "Enregistrer une version nommée",
      label: "Nom de la version :",
      placeholder: "ex. Soumission client",
      okLabel: "Enregistrer",
      validate: (v) => (v.trim() ? null : "Le nom ne peut pas être vide."),
    });
    if (label === null || !label.trim()) return;
    saveNamedRevision(activeTab.path, label.trim());
    setHistoryPanelOpen(true);
  };

  const handleRestoreRevision = async (id: string) => {
    if (!activeTab) return;
    const revision = parseHistory(activeTab.history).revisions.find((r) => r.id === id);
    if (!revision) return;
    const ok = await askConfirm({
      title: "Restaurer une version",
      message:
        `Le contenu de l'onglet va être remplacé par « ${revision.label ?? "Enregistrée automatiquement"} » ` +
        `(enregistrée le ${new Date(revision.savedAt).toLocaleString("fr-FR")}). ` +
        `L'onglet passera « modifié » : enregistrez-le pour l'appliquer au fichier — la version actuelle restera dans l'historique.`,
      okLabel: "Restaurer",
    });
    if (ok) restoreRevision(activeTab.path, id);
  };

  const handleRenameRevision = async (id: string) => {
    if (!activeTab) return;
    const file = parseHistory(activeTab.history);
    const revision = file.revisions.find((r) => r.id === id);
    if (!revision) return;
    const label = await askText({
      title: "Renommer la version",
      label: "Nouveau nom (vide = version automatique) :",
      initial: revision.label ?? "",
      okLabel: "Renommer",
    });
    if (label === null) return;
    revision.label = label.trim() || null;
    updateHistory(activeTab.path, serializeHistory(file));
  };

  const handleDeleteRevision = async (id: string) => {
    if (!activeTab) return;
    const ok = await askConfirm({
      title: "Supprimer la version",
      message: "Cette version sera définitivement retirée de l'historique du document. Continuer ?",
      okLabel: "Supprimer",
    });
    if (!ok) return;
    const file = parseHistory(activeTab.history);
    file.revisions = file.revisions.filter((r) => r.id !== id);
    updateHistory(activeTab.path, serializeHistory(file));
  };

  const handleSaveAs = async () => {
    if (!activeTab) return;
    const newPath = await pickSaveLocation(activeTab.title);
    if (!newPath) return;
    await saveTabAs(activeTab.path, newPath);
  };

  // Impression / export PDF : on imprime (ou on exporte) directement la
  // couche déjà peinte par la vue Pages (paintPages.ts) — les mêmes boîtes
  // A4 à taille fixe que ce que l'utilisateur voit à l'écran, avec la même
  // police/mise en page. Pas de moteur de pagination séparé (Paged.js a été
  // abandonné : instable dans la WebView2 de Tauri, et redondant avec notre
  // propre pagination déjà fiable — voir CLAUDE.md). Une feuille de style
  // @media print (voir App.css) masque tout le reste de l'interface et
  // force l'affichage de la couche peinte même si l'utilisateur est en vue
  // Markdown/Code au moment d'imprimer/exporter.
  //
  // `printWindow()`/`exportPdf()` (commandes Rust natives), PAS
  // `window.print()` : voir `src-tauri/src/print_commands.rs` —
  // `window.print()` ne fait jamais rien de visible sur cette version de
  // Tauri/wry (boucle infinie interne entre le JS et l'IPC, sans jamais
  // atteindre un vrai appel natif).
  const handlePrint = () => {
    if (!activeTab) return;
    void printWindow();
  };

  // Export PDF DIRECT (pas de boîte de dialogue d'impression système) —
  // demandé par l'utilisateur après avoir trouvé l'impression "pas super" :
  // "Imprimer > Enregistrer au format PDF" exige de naviguer la boîte de
  // dialogue système à chaque export ; ce bouton écrit directement le PDF
  // à l'emplacement choisi, sans aucune boîte de dialogue intermédiaire
  // au-delà du "Enregistrer sous" — même rendu/mise en page que l'impression
  // (voir `exportPdf` dans `fileService.ts`).
  //
  // La commande Rust `export_pdf` revient IMMÉDIATEMENT (elle se contente de
  // LANCER l'écriture du PDF) — le vrai résultat arrive plus tard via
  // l'évènement `"pdf-export-result"` (voir `print_commands.rs` : une
  // première version qui attendait ce résultat de façon SYNCHRONE à
  // l'intérieur de la commande restait bloquée indéfiniment dans cette
  // configuration Tauri/wry, abandonnée). On écoute donc cet évènement ICI
  // pour afficher une confirmation/erreur une fois l'écriture réellement
  // terminée.
  const handleExportPdf = async () => {
    if (!activeTab) return;
    const defaultName = activeTab.title.replace(/\.(md|xmd)$/i, "") + ".pdf";
    const path = await pickPdfSaveLocation(defaultName);
    if (!path) return;
    const unlisten = await listen<string | null>("pdf-export-result", async (event) => {
      unlisten();
      if (event.payload) {
        await messageDialog(`Échec de l'export PDF : ${event.payload}`, { title: "Pagina", kind: "error" });
      } else {
        await messageDialog(`PDF enregistré : ${path}`, { title: "Pagina", kind: "info" });
      }
    });
    const { widthMm, heightMm } = resolvePageSizeMm(activeTab.layout);
    await exportPdf(path, widthMm, heightMm);
  };

  const handleCloseTab = async (path: string) => {
    const tab = tabs.find((t) => t.path === path);
    if (tab?.dirty) {
      // PAS `window.confirm()` (voir le commentaire détaillé sur
      // `onCloseRequested` plus haut) : Tauri le réachemine vers une
      // commande native sans la permission adéquate, qui rejette
      // silencieusement — `ok` valait alors une PROMESSE (toujours
      // "truthy"), donc `if (!ok)` ne bloquait JAMAIS rien : fermer un
      // onglet modifié perdait le travail non enregistré sans jamais
      // vraiment demander confirmation. Bug pré-existant, corrigé au
      // passage en même temps que le même piège sur la fermeture de la
      // fenêtre.
      const ok = await confirmDialog(`« ${tab.title} » contient des modifications non enregistrées. Fermer sans enregistrer ?`, {
        title: "Pagina",
        kind: "warning",
      });
      if (!ok) return;
    }
    closeTab(path);
  };

  useEffect(() => {
    if (!activeTab) {
      setActions(null);
      return;
    }
    // Le handle est stable tant que le composant MarkdownEditor de l'onglet actif ne change pas.
    const handle = editorRef.current;
    if (!handle) return;
    setActions({
      // Toutes les actions du ruban sont celles du handle de l'éditeur ;
      // seuls l'interligne et les espacements passent par le layout du store.
      ...handle,
      // patchLayout : lit le layout COURANT du store — l'ancienne forme
      // capturait activeTab.layout (effet d'app construit au changement
      // d'onglet seulement) et chaque réglage écrasait les précédents.
      setLineSpacing: (value) => {
        if (activeTab) patchLayout(activeTab.path, { lineHeight: value });
      },
      setParagraphSpacingBefore: (pt) => {
        if (activeTab) patchLayout(activeTab.path, { spacingBeforePt: pt });
      },
      setParagraphSpacingAfter: (pt) => {
        if (activeTab) patchLayout(activeTab.path, { paragraphSpacingPt: pt });
      },
    });
  }, [activeTab?.path]);

  return (
    <div className="app-shell">
      <TitleBar
        documentTitle={activeTab?.title ?? null}
        disabled={!activeTab}
        onSave={handleSave}
        onUndo={() => actions?.undo()}
        onRedo={() => actions?.redo()}
        onNewFile={handleNewFile}
        onOpenFolder={() => void openFolderPicker()}
        onOpenFiles={() => void handleOpenFiles()}
        onSaveAs={() => void handleSaveAs()}
        onPrint={handlePrint}
        onExportPdf={() => void handleExportPdf()}
        /* Recherche rapide (barre de titre) : chaque frappe ouvre le
         * panneau « Rechercher » et y porte la requête en direct. */
        onSearch={
          activeTab
            ? (query) => {
                setFindReplaceOpen(true);
                setCtxTab("rechercher");
                setFindSeed(query);
              }
            : undefined
        }
        /* Fenêtres globales (roadmap 1.4/1.5) : ⚙ et avatar de la barre. */
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenUser={() => setUserOpen(true)}
        userInitials={userInitials(firstName, lastName)}
      />
      <Toolbar
        actions={actions}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        sidebarOpen={sidebarOpen}
        /* Commentaires + Historique : format .xmd uniquement (conteneur),
         * sinon le bouton est visible mais inactif. L'ouverture sélectionne
         * AUSSI l'onglet contextuel correspondant (sinon l'hôte rend la
         * colonne sans contenu). */
        onToggleComments={() => {
          setCommentsPanelOpen((o) => {
            if (!o) setCtxTab("commentaires");
            return !o;
          });
        }}
        commentsOpen={commentsPanelOpen}
        canComments={activeTab?.format === "xmd"}
        onToggleHistory={() => {
          setHistoryPanelOpen((o) => {
            if (!o) setCtxTab("historique");
            return !o;
          });
        }}
        historyOpen={historyPanelOpen}
        canHistory={activeTab?.format === "xmd"}
        onOpenPageSetup={() => setPageSetupOpen(true)}
        onOpenHeadingStyles={() => setHeadingStylesOpen(true)}
        onOpenDocumentProperties={() => setDocumentPropertiesOpen(true)}
        /* Sections + pages de garde (2026-10-22) : onglet Insertion. */
        onInsertSectionBreak={() => setSectionBreakDialogOpen(true)}
        onOpenCoverGallery={() => setCoverGalleryOpen(true)}
        onOpenParagraphDialog={() => setParagraphDialogOpen(true)}
        onToggleHeadingPanel={() => {
          setHeadingPanelOpen((o) => !o);
          setCtxTab("styles");
        }}
        headingPanelOpen={headingPanelOpen}
        activeBlockStyle={stats.activeBlockStyle}
        activeMarks={stats.activeMarks}
        activeAlign={stats.activeAlign}
        activeList={stats.activeList}
        activeFontFamily={stats.activeFontFamily}
        activeColor={stats.activeColor}
        activeFontSizePt={stats.activeFontSizePt}
        lineSpacing={activeTab?.layout.lineHeight}
        spacingBeforePt={activeTab?.layout.spacingBeforePt}
      />
      <div className="app-body">
        {sidebarOpen && (
          <aside className="app-sidebar">
            <FileExplorer onOpenFile={openFile} onClose={() => setSidebarOpen(false)} activePath={activePath} />
          </aside>
        )}
        <div className="app-main-column">
          <TabBar tabs={tabs} activePath={activePath} onSelect={setActive} onClose={handleCloseTab} />
          <div className="app-editor-area">
            {activeTab ? (
              <>
                {/* L'éditeur Tiptap reste toujours monté (juste masqué hors vue
                 * Pages) : ça préserve son état (undo, sélection) et permet à
                 * la vue Markdown basique de lire son HTML à jour même quand on
                 * a édité entre-temps depuis la vue Code. */}
                {/* La classe (pas seulement le style inline) est nécessaire
                 * pour que la règle @media print puisse forcer cette zone
                 * visible avec !important à l'impression, même quand
                 * l'utilisateur est en vue Markdown/Code — voir App.css. */}
                <div
                  className="xmd-pages-mount"
                  style={{ display: viewMode === "pages" ? "contents" : "none" }}
                >
                  <MarkdownEditor
                    key={`${activeTab.key ?? activeTab.path}#${activeTab.revision}`}
                    ref={editorRef}
                    initialContent={pendingContent[activeTab.path] ?? activeTab.content}
                    onChange={(md) => updateContent(activeTab.path, md)}
                    onBaseline={(md) => useTabsStore.getState().setBaseline(activeTab.path, md)}
                    assets={activeTab.assets}
                    onAddImage={handleAddImage}
                    onSaveRequest={handleSave}
                    onStats={setStats}
                    layout={activeTab.layout}
                    documentTitle={activeTab.title}
                    onLayoutChange={(layout) => updateLayout(activeTab.path, layout)}
                    zoom={zoom}
                    showRulers={showRulers}
                    onZoomChange={(z) => setZoom(clampZoom(z))}
                  />
                </div>
                {viewMode === "source" && (
                  <MarkdownSourceView
                    value={pendingContent[activeTab.path] ?? activeTab.content}
                    onChange={(md) => updateContent(activeTab.path, md)}
                  />
                )}
                {viewMode === "preview" && <MarkdownPreview html={markdownPreviewHtml} />}
              </>
            ) : (
              <div className="app-placeholder-wrap">
                <div className="app-placeholder">
                  Ouvrez un dossier de travail puis sélectionnez un fichier .md/.xmd.
                </div>
              </div>
            )}
          </div>
          <StatusBar
            words={stats.words}
            currentPage={stats.currentPage}
            pageCount={stats.pageCount}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            disabled={!activeTab}
            zoom={zoom}
            onZoomChange={(z) => setZoom(clampZoom(z))}
            issueCount={activeTab?.issues.length ?? 0}
            onOpenCheck={() => setDocumentCheckOpen(true)}
          />
        </div>
        {/* Hôte UNIQUE des panneaux contextuels droits : onglets quand
         * plusieurs contextes actifs (demande 2026-10-17) — une seule
         * colonne, jamais de panneaux côte à côte. */}
        {activeTab && (tablePanelOpen || stats.headerFooterEditMode || tocPanelOpen || headingPanelOpen || mathPanelOpen || findReplaceOpen || mermaidPanelOpen || coverPanelOpen || imagePanelOpen || commentsPanelOpen || historyPanelOpen) && (
          <ContextualPanelHost
            tabs={
              ([
                ...(tablePanelOpen ? [{ id: "tableau", label: "Tableau" }] : []),
                ...(stats.headerFooterEditMode
                  ? [{ id: "hf", label: stats.headerFooterEditMode === "header" ? "En-tête" : "Pied de page" }]
                  : []),
                ...(tocPanelOpen ? [{ id: "toc", label: "Sommaire" }] : []),
                ...(mathPanelOpen && stats.math ? [{ id: "equation", label: stats.math.kind === "block" ? "Équation (bloc)" : "Équation" }] : []),
                ...(headingPanelOpen ? [{ id: "styles", label: "Styles" }] : []),
                ...(findReplaceOpen ? [{ id: "rechercher", label: "Rechercher" }] : []),
                ...(mermaidPanelOpen && stats.mermaid ? [{ id: "diagramme", label: "Diagramme" }] : []),
                ...(coverPanelOpen && stats.coverZone ? [{ id: "page-de-garde", label: "Page de garde" }] : []),
                ...(imagePanelOpen && stats.image ? [{ id: "image", label: "Image" }] : []),
                ...(commentsPanelOpen && activeTab?.format === "xmd" ? [{ id: "commentaires", label: "Commentaires" }] : []),
                ...(historyPanelOpen && activeTab?.format === "xmd" ? [{ id: "historique", label: "Historique" }] : []),
              ] as ContextualTab[])
            }
            activeId={ctxTab}
            onSelect={(id) => setCtxTab(id as "tableau" | "hf" | "toc" | "styles" | "equation" | "rechercher" | "diagramme" | "page-de-garde" | "image" | "commentaires" | "historique")}
            /* « Rechercher » plus large (volet façon Word, retour
             * utilisateur 2026-10-21) — appliqué au changement d'onglet
             * seulement, l'utilisateur garde la main sur la poignée. */
            widthRequest={ctxTab === "rechercher" ? 360 : 260}
          >
            {ctxTab === "tableau" &&
              tablePanelOpen &&
              actions && (
                <TablePropertiesPanel
                  actions={actions}
                  disabled={!activeTab}
                  shape={stats.tableSelectionShape}
                  onClose={() => setTablePanelOpen(false)}
                />
              )}
            {ctxTab === "hf" &&
              stats.headerFooterEditMode &&
              editorRef.current && (
                <HeaderFooterPanel
                  mode={stats.headerFooterEditMode}
                  customVariables={(activeTab?.layout.documentProperties?.custom ?? [])
                    .filter((c) => c.name.trim() !== "")
                    .map((c) => ({ token: `{{${c.name.trim()}}}`, label: c.name.trim() }))}
                  onInsertVariable={(token) => actions?.insertHeaderFooterVariable(token)}
                  onClose={() => editorRef.current?.closeHeaderFooterEdit()}
                />
              )}
            {ctxTab === "styles" &&
              headingPanelOpen &&
              actions && (
                <HeadingStylesPanel
                  headingStyles={activeTab.layout.headingStyles}
                  active={stats.activeBlockStyle}
                  onPick={(level) => actions.toggleHeading(level)}
                  onPickParagraph={() => actions.setParagraph()}
                  onOpenSettings={() => setHeadingStylesOpen(true)}
                  onClose={() => setHeadingPanelOpen(false)}
                />
              )}
            {ctxTab === "toc" &&
              tocPanelOpen &&
              actions && (
                <TocPanel
                  toc={activeTab.layout.toc}
                  onChangeToc={(patch) => {
                    // Lecture du style COURANT dans le store (jamais une closure périmée).
                    const state = useTabsStore.getState();
                    const current = state.tabs.find((t) => t.path === activeTab.path)?.layout.toc;
                    if (!current) return;
                    state.patchLayout(activeTab.path, { toc: { ...current, ...patch } });
                    // La profondeur n'est lue qu'à la génération : régénérer une fois le réglage appliqué.
                    if (patch.maxLevel !== undefined) setTimeout(() => actions?.updateTocAtCursor(), 150);
                  }}
                  onUpdate={() => actions?.updateTocAtCursor()}
                  onDelete={() => actions?.deleteTocAtCursor()}
                  onClose={() => setTocPanelOpen(false)}
                />
              )}
            {/* key = position du nœud formule : le panneau se remonte au
             * CHANGEMENT de formule, jamais à la frappe. Le CHAMP vit
             * désormais sur la page (startMathEdit, MarkdownEditor) — le
             * panneau ne porte que la palette de symboles. */}
            {ctxTab === "equation" &&
              mathPanelOpen &&
              stats.math &&
              editorRef.current && (
                <EquationPanel
                  key={stats.math.pos}
                  kind={stats.math.kind}
                  onInsertLatex={(latex) => editorRef.current?.insertMathLatex(latex)}
                  onDelete={() => editorRef.current?.deleteMath()}
                  onClose={() => setMathPanelOpen(false)}
                />
              )}
            {ctxTab === "rechercher" &&
              findReplaceOpen &&
              activeTab &&
              editorRef.current && (
                <FindReplacePanel
                  seed={findSeed}
                  onListMatches={(query, options) => editorRef.current?.listFindMatches(query, options) ?? []}
                  onSelectMatch={(from, to) => editorRef.current?.selectMatch(from, to)}
                  onReplaceCurrent={(query, options, replacement) =>
                    editorRef.current?.replaceCurrent(query, options, replacement) ?? null
                  }
                  onReplaceAll={(query, options, replacement) =>
                    editorRef.current?.replaceAll(query, options, replacement) ?? 0
                  }
                  onClose={() => setFindReplaceOpen(false)}
                />
              )}
            {ctxTab === "image" &&
              imagePanelOpen &&
              stats.image &&
              editorRef.current && (
                <ImagePanel
                  key={stats.image.pos}
                  src={stats.image.src}
                  alt={stats.image.alt}
                  width={stats.image.width}
                  transform={stats.image.transform}
                  borderWidth={stats.image.borderWidth}
                  borderColor={stats.image.borderColor}
                  onChange={(patch) => editorRef.current?.updateImage(patch)}
                  onTransform={(action) => editorRef.current?.transformImage(action)}
                  onDelete={() => editorRef.current?.deleteImage()}
                  onClose={() => setImagePanelOpen(false)}
                />
              )}
            {ctxTab === "commentaires" &&
              commentsPanelOpen &&
              activeTab?.format === "xmd" && (
                <CommentsPanel
                  comments={activeComments.comments}
                  onAdd={() => void handleAddComment()}
                  onReply={handleReplyComment}
                  onToggleResolve={handleToggleResolveComment}
                  onDelete={handleDeleteComment}
                  onJump={handleJumpToComment}
                  onClose={() => setCommentsPanelOpen(false)}
                />
              )}
            {ctxTab === "historique" &&
              historyPanelOpen &&
              activeTab?.format === "xmd" && (
                <HistoryPanel
                  revisions={activeRevisions}
                  onSaveNamed={() => void handleSaveNamedRevision()}
                  onRestore={(id) => void handleRestoreRevision(id)}
                  onRename={(id) => void handleRenameRevision(id)}
                  onDelete={(id) => void handleDeleteRevision(id)}
                  onClose={() => setHistoryPanelOpen(false)}
                />
              )}
            {ctxTab === "diagramme" &&
              mermaidPanelOpen &&
              stats.mermaid &&
              editorRef.current && (
                <DiagramPanel
                  key={stats.mermaid.pos}
                  source={stats.mermaid.source}
                  onSourceChange={(source) => editorRef.current?.updateMermaidSource(source)}
                  onDelete={() => editorRef.current?.deleteMermaid()}
                  onClose={() => setMermaidPanelOpen(false)}
                />
              )}
            {ctxTab === "page-de-garde" &&
              coverPanelOpen &&
              stats.coverZone &&
              editorRef.current && (
                <CoverPagePanel
                  key={stats.coverZone.start}
                  zoneStart={stats.coverZone.start}
                  headerFooter={stats.coverZone.headerFooter}
                  theme={stats.coverZone.theme}
                  onChangeTheme={(theme) => editorRef.current?.setCoverZoneTheme(theme)}
                  margins={{ top: stats.coverZone.marginTopMm, left: stats.coverZone.marginLeftMm, right: stats.coverZone.marginRightMm, bottom: stats.coverZone.marginBottomMm }}
                  documentMargins={{
                    top: activeTab?.layout.marginTopMm ?? 25,
                    left: activeTab?.layout.marginLeftMm ?? 20,
                    right: activeTab?.layout.marginRightMm ?? 20,
                    bottom: activeTab?.layout.marginBottomMm ?? 25,
                  }}
                  onChangeMargins={(m) => editorRef.current?.setCoverZoneMargins(m)}
                  customVariables={(activeTab?.layout.documentProperties?.custom ?? [])
                    .filter((c) => c.name.trim() !== "")
                    .map((c) => ({ token: `{{${c.name.trim()}}}`, label: c.name.trim() }))}
                  onToggleHeaderFooter={(show) => editorRef.current?.setCoverZoneHeaderFooter(show)}
                  onInsertField={(name) => editorRef.current?.insertDocField(name)}
                  onSaveAsType={(name) => {
                    const source = editorRef.current?.getCoverZoneSource();
                    if (source != null) addUserCoverTemplate({ name, source, theme: stats.coverZone?.theme ?? "" });
                  }}
                  onDelete={() => editorRef.current?.deleteCoverZone()}
                  onClose={() => setCoverPanelOpen(false)}
                />
              )}
          </ContextualPanelHost>
        )}
      </div>
      {pageSetupOpen && activeTab && (
        <PageSetupDialog
          layout={activeTab.layout}
          onApply={(layout) => updateLayout(activeTab.path, layout)}
          onClose={() => setPageSetupOpen(false)}
        />
      )}
      {paragraphDialogOpen && activeTab && (
        <ParagraphDialog
          layout={activeTab.layout}
          /* Snapshot du paragraphe sous le curseur au moment de l'ouverture —
           * la fenêtre est modale, ce format ne bouge pas pendant qu'elle est
           * ouverte ; il n'est lu qu'une fois (états initiaux du dialogue). */
          paragraphFormat={
            editorRef.current?.getActiveParagraphFormat() ?? { align: null, indentLeftCm: 0, indentRightCm: 0 }
          }
          onApply={({ align, indentLeftCm, indentRightCm, layout }) => {
            editorRef.current?.setTextAlign(align);
            editorRef.current?.setParagraphIndent(indentLeftCm, indentRightCm);
            updateLayout(activeTab.path, layout);
          }}
          onClose={() => setParagraphDialogOpen(false)}
        />
      )}
      {documentPropertiesOpen && activeTab && (
        <DocumentPropertiesDialog
          layout={activeTab.layout}
          onApply={(layout) => updateLayout(activeTab.path, layout)}
          onClose={() => setDocumentPropertiesOpen(false)}
        />
      )}
      {headingStylesOpen && activeTab && (
        <HeadingStyleDialog
          layout={activeTab.layout}
          onApply={(layout) => updateLayout(activeTab.path, layout)}
          onClose={() => setHeadingStylesOpen(false)}
        />
      )}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <PromptHost />
      {documentCheckOpen && activeTab && (
        <DocumentCheckDialog path={activeTab.path} onClose={() => setDocumentCheckOpen(false)} />
      )}
      {sectionBreakDialogOpen && activeTab && (
        <SectionBreakDialog
          onApply={({ title, restart }) => editorRef.current?.insertSectionBreak(title, restart)}
          onClose={() => setSectionBreakDialogOpen(false)}
        />
      )}
      {coverGalleryOpen && activeTab && (
        <CoverGalleryDialog
          onInsert={(source, withPageBreak, theme) => editorRef.current?.insertCoverZone(source, withPageBreak, theme)}
          onClose={() => setCoverGalleryOpen(false)}
        />
      )}
      {userOpen && <UserDialog onClose={() => setUserOpen(false)} />}
    </div>
  );
}

export default App;
