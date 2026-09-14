import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm as confirmDialog } from "@tauri-apps/plugin-dialog";
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
import { clampZoom } from "./ui/Editor/pagination/zoom";
import { printWindow } from "./persistence/fileService";
import { useWorkspaceStore } from "./core/store/workspaceStore";
import { useTabsStore } from "./core/store/tabsStore";
import "./App.css";

const EMPTY_STATS: EditorStats = { words: 0, characters: 0, pageCount: 1, currentPage: 1, activeBlockStyle: "paragraph" };

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

  useEffect(() => {
    restoreLastWorkspace();
    restoreSession();
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

  // Impression / export PDF : on imprime directement la couche déjà peinte
  // par la vue Pages (paintPages.ts) — les mêmes boîtes A4 à taille fixe que
  // ce que l'utilisateur voit à l'écran, avec la même police/mise en page.
  // Pas de moteur de pagination séparé (Paged.js a été abandonné : instable
  // dans la WebView2 de Tauri, et redondant avec notre propre pagination
  // déjà fiable — voir CLAUDE.md). Une feuille de style @media print (voir
  // App.css) masque tout le reste de l'interface et force l'affichage de
  // la couche peinte même si l'utilisateur est en vue Markdown/Code au
  // moment d'imprimer. "Enregistrer au format PDF" dans la boîte de dialogue
  // d'impression système EST notre export PDF (mêmes pages, rien de plus).
  //
  // `printWindow()` (commande Rust native), PAS `window.print()` : voir
  // `src-tauri/src/print_commands.rs` — `window.print()` ne fait jamais
  // rien de visible sur cette version de Tauri/wry (boucle infinie interne
  // entre le JS et l'IPC, sans jamais atteindre un vrai appel natif).
  const handlePrint = () => {
    if (!activeTab) return;
    void printWindow();
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
      setCodeBlockLanguage: (language) => handle.setCodeBlockLanguage(language),
      setLink: () => handle.setLink(),
      insertImage: () => {
        const url = window.prompt("URL de l'image :", "https://");
        if (url) handle.insertImage(url);
      },
      insertTable: () => handle.insertTable(),
      insertHorizontalRule: () => handle.insertHorizontalRule(),
      insertPageBreak: () => handle.insertPageBreak(),
      setFontFamily: (family) => handle.setFontFamily(family),
      unsetFontFamily: () => handle.unsetFontFamily(),
      setFontSize: (size) => handle.setFontSize(size),
      unsetFontSize: () => handle.unsetFontSize(),
      setColor: (color) => handle.setColor(color),
      toggleHighlight: () => handle.toggleHighlight(),
      setTextAlign: (align) => handle.setTextAlign(align),
      toggleSubscript: () => handle.toggleSubscript(),
      toggleSuperscript: () => handle.toggleSuperscript(),
      toggleTaskList: () => handle.toggleTaskList(),
      clearFormatting: () => handle.clearFormatting(),
      editHeader: () => handle.editHeader(),
      editFooter: () => handle.editFooter(),
      insertHeaderFooterVariable: (token) => handle.insertHeaderFooterVariable(token),
      insertTocMarker: () => handle.insertTocMarker(),
      generateToc: () => handle.generateToc(),
      insertFootnote: () => handle.insertFootnote(),
      insertMermaidDiagram: () => handle.insertMermaidDiagram(),
      insertInlineMath: () => handle.insertInlineMath(),
      insertBlockMath: () => handle.insertBlockMath(),
      insertEmoji: (emoji) => handle.insertEmoji(emoji),
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
        onPrint={handlePrint}
      />
      <Toolbar
        actions={actions}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        sidebarOpen={sidebarOpen}
        onOpenPageSetup={() => setPageSetupOpen(true)}
        onOpenHeadingStyles={() => setHeadingStylesOpen(true)}
        activeBlockStyle={stats.activeBlockStyle}
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
