import { useEffect, useRef, useState } from "react";
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
import { HeadingStylesPanel } from "./ui/HeadingStyles/HeadingStylesPanel";
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
    saveTab,
    saveTabAs,
    restoreSession,
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
  const wasMathSelRef = useRef(false);
  const wasInsideTocRef = useRef(false);
  // Onglet actif de l'hôte de panneaux contextuels (« tableau » | « hf » |
  // « toc ») : quand plusieurs contextes sont actifs en même temps (curseur
  // dans un tableau + édition d'en-tête/pied de page, p. ex.), l'utilisateur
  // choisit l'onglet.
  const [ctxTab, setCtxTab] = useState<"tableau" | "hf" | "toc" | "styles" | "equation">("tableau");
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
      setCtxTab("toc");
    } else if (!stats.insideToc && wasInside) {
      setTocPanelOpen(false);
    }
  }, [stats.insideToc]);

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
  // contexte en-tête/pied n'est actif (état initial, retour de l'hôte).
  useEffect(() => {
    if (tablePanelOpen && !stats.headerFooterEditMode && !stats.insideToc && !headingPanelOpen && ctxTab !== "tableau") {
      setCtxTab("tableau");
    }
  }, [tablePanelOpen, stats.headerFooterEditMode, stats.insideToc]);

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

  const handleNewFile = async () => {
    if (!workspaceRoot) {
      window.alert("Ouvrez d'abord un dossier de travail.");
      return;
    }
    const name = window.prompt("Nom du nouveau fichier :", "Nouveau document.md");
    if (!name) return;
    try {
      const path = await createNewFile(name.trim());
      await openFile(path);
    } catch (e) {
      window.alert(`Impossible de créer le fichier : ${e}`);
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
    await exportPdf(path);
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
      undo: () => handle.undo(),
      redo: () => handle.redo(),
      copySelection: () => handle.copySelection(),
      cutSelection: () => handle.cutSelection(),
      pasteClipboard: () => handle.pasteClipboard(),
      toggleBold: () => handle.toggleBold(),
      toggleItalic: () => handle.toggleItalic(),
      toggleUnderline: () => handle.toggleUnderline(),
      toggleStrike: () => handle.toggleStrike(),
      toggleHeading: (level) => handle.toggleHeading(level),
      setParagraph: () => handle.setParagraph(),
      toggleBulletList: () => handle.toggleBulletList(),
      toggleOrderedList: () => handle.toggleOrderedList(),
      toggleBlockquote: () => handle.toggleBlockquote(),
      toggleCodeBlock: () => handle.toggleCodeBlock(),
      toggleCode: () => handle.toggleCode(),
      setLink: () => handle.setLink(),
      insertTable: (rows, cols) => handle.insertTable(rows, cols),
      addRowBefore: () => handle.addRowBefore(),
      addRowAfter: () => handle.addRowAfter(),
      deleteRow: () => handle.deleteRow(),
      addColumnBefore: () => handle.addColumnBefore(),
      addColumnAfter: () => handle.addColumnAfter(),
      deleteColumn: () => handle.deleteColumn(),
      deleteTable: () => handle.deleteTable(),
      mergeCells: () => handle.mergeCells(),
      splitCell: () => handle.splitCell(),
      toggleHeaderRow: () => handle.toggleHeaderRow(),
      clearCellContents: () => handle.clearCellContents(),
      setCellBackgroundColor: (color: string | null) => handle.setCellBackgroundColor(color),
      setCellBorder: (sides, css) => handle.setCellBorder(sides, css),
      setCellBorderPreset: (preset, css) => handle.setCellBorderPreset(preset, css),
      setGridLineBorder: (lines, css) => handle.setGridLineBorder(lines, css),
      setCellVerticalAlign: (align) => handle.setCellVerticalAlign(align),
      insertHorizontalRule: () => handle.insertHorizontalRule(),
      insertPageBreak: () => handle.insertPageBreak(),
      setFontFamily: (family) => handle.setFontFamily(family),
      unsetFontFamily: () => handle.unsetFontFamily(),
      setFontSize: (size) => handle.setFontSize(size),
      unsetFontSize: () => handle.unsetFontSize(),
      increaseFontSize: () => handle.increaseFontSize(),
      decreaseFontSize: () => handle.decreaseFontSize(),
      changeCase: () => handle.changeCase(),
      setColor: (color) => handle.setColor(color),
      unsetColor: () => handle.unsetColor(),
      toggleHighlight: () => handle.toggleHighlight(),
      setTextAlign: (align) => handle.setTextAlign(align),
      increaseIndent: () => handle.increaseIndent(),
      decreaseIndent: () => handle.decreaseIndent(),
      setLineSpacing: (value) => {
        if (activeTab) updateLayout(activeTab.path, { ...activeTab.layout, lineHeight: value });
      },
      setParagraphSpacingBefore: (pt) => {
        if (activeTab) updateLayout(activeTab.path, { ...activeTab.layout, spacingBeforePt: pt });
      },
      setParagraphSpacingAfter: (pt) => {
        if (activeTab) updateLayout(activeTab.path, { ...activeTab.layout, paragraphSpacingPt: pt });
      },
      toggleSubscript: () => handle.toggleSubscript(),
      toggleSuperscript: () => handle.toggleSuperscript(),
      toggleTaskList: () => handle.toggleTaskList(),
      clearFormatting: () => handle.clearFormatting(),
      editHeader: () => handle.editHeader(),
      editFooter: () => handle.editFooter(),
      insertHeaderFooterVariable: (token) => handle.insertHeaderFooterVariable(token),
      insertTocMarker: () => handle.insertTocMarker(),
      generateToc: () => handle.generateToc(),
      updateTocAtCursor: () => handle.updateTocAtCursor(),
      deleteTocAtCursor: () => handle.deleteTocAtCursor(),
      insertFootnote: () => handle.insertFootnote(),
      insertMermaidDiagram: () => handle.insertMermaidDiagram(),
      insertInlineMath: () => handle.insertInlineMath(),
      insertBlockMath: () => handle.insertBlockMath(),
      insertEmoji: (emoji) => handle.insertEmoji(emoji),
      insertBookmark: () => handle.insertBookmark(),
      insertCrossReference: () => handle.insertCrossReference(),
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
      />
      <Toolbar
        actions={actions}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        sidebarOpen={sidebarOpen}
        onOpenPageSetup={() => setPageSetupOpen(true)}
        onOpenHeadingStyles={() => setHeadingStylesOpen(true)}
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
        spacingAfterPt={activeTab?.layout.paragraphSpacingPt}
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
                    key={activeTab.path}
                    ref={editorRef}
                    initialContent={pendingContent[activeTab.path] ?? activeTab.content}
                    onChange={(md) => updateContent(activeTab.path, md)}
                    onSaveRequest={handleSave}
                    onStats={setStats}
                    layout={activeTab.layout}
                    documentTitle={activeTab.title}
                    onLayoutChange={(layout) => updateLayout(activeTab.path, layout)}
                    zoom={zoom}
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
          />
        </div>
        {/* Hôte UNIQUE des panneaux contextuels droits : onglets quand
         * plusieurs contextes actifs (demande 2026-10-17) — une seule
         * colonne, jamais de panneaux côte à côte. */}
        {activeTab && (tablePanelOpen || stats.headerFooterEditMode || tocPanelOpen || headingPanelOpen || mathPanelOpen) && (
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
              ] as ContextualTab[])
            }
            activeId={ctxTab}
            onSelect={(id) => setCtxTab(id as "tableau" | "hf" | "toc" | "styles" | "equation")}
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
      {headingStylesOpen && activeTab && (
        <HeadingStyleDialog
          layout={activeTab.layout}
          onApply={(layout) => updateLayout(activeTab.path, layout)}
          onClose={() => setHeadingStylesOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
