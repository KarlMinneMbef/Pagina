//! Impression réelle de la fenêtre (Windows/WebView2 uniquement).
//!
//! `window.print()` côté JS ne fonctionne PAS dans cette configuration
//! Tauri/wry : Tauri réinjecte sa propre implémentation de `window.print`
//! (voir `tauri::webview::scripts::print.js`) qui invoque la commande IPC
//! interne `plugin:webview|print`, laquelle appelle côté Rust
//! `wry::WebView::print()` — qui, sur le backend WebView2 de wry 0.55,
//! n'est lui-même qu'un `eval("window.print()")` (voir
//! `wry-0.55.1/src/webview2/mod.rs`). Comme `window.print` a déjà été
//! réécrit par Tauri au moment de cet `eval`, cela rappelle exactement la
//! même chaîne indéfiniment (JS → IPC → Rust → eval → JS → IPC → ...),
//! sans jamais atteindre un vrai appel natif : aucune boîte de dialogue
//! n'apparaît jamais, sans la moindre erreur ni plantage (chaque maillon
//! de la chaîne est asynchrone et se résout instantanément, donc rien ne
//! bloque ni ne plante — juste une boucle qui ne fait jamais rien).
//!
//! **Contournement** : on n'appelle plus JAMAIS `window.print()` (ni le
//! nôtre ni celui de Tauri). On accède directement au handle natif
//! WebView2 (`PlatformWebview::controller()`, exposé par Tauri via
//! `WebviewWindow::with_webview`, nécessite la feature Cargo `unstable`)
//! et on appelle `ICoreWebView2_16::ShowPrintUI` — l'API COM native qui
//! ouvre réellement la boîte de dialogue d'impression système, sans passer
//! par aucun JavaScript.
use tauri::Emitter;

#[tauri::command]
pub fn print_window(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(windows)]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM,
        };
        use windows::core::Interface;

        window
            .with_webview(|webview| {
                let controller = webview.controller();
                let core = match unsafe { controller.CoreWebView2() } {
                    Ok(core) => core,
                    Err(_) => return,
                };
                let core16: ICoreWebView2_16 = match core.cast() {
                    Ok(v) => v,
                    Err(_) => return,
                };
                // SAFETY : appel COM direct sur l'interface WebView2 native,
                // sans toucher au DOM/JS de la page — c'est précisément ce
                // qui permet d'éviter la boucle décrite plus haut.
                unsafe {
                    let _ = core16.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM);
                }
            })
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        // macOS/Linux : window.print() natif (WKWebView/WebKitGTK) ne
        // souffre pas de ce bug, on peut donc laisser le JS s'en charger
        // normalement — cette commande n'a donc rien à faire ici.
        let _ = window;
    }
    Ok(())
}

/// Export PDF DIRECT (pas de boîte de dialogue système) — demandé par
/// l'utilisateur après avoir trouvé l'impression "pas super" : passer par
/// `ShowPrintUI` (ci-dessus) exige de naviguer la boîte de dialogue système
/// Windows à chaque export (choisir "Microsoft Print to PDF", confirmer...),
/// alors qu'on a déjà, à l'écran, EXACTEMENT la mise en page qu'on veut dans
/// le PDF (même CSS `@media print`/`@page` que l'impression, voir
/// `App.css`). `ICoreWebView2_7::PrintToPdf` écrit directement un PDF sur
/// disque, sans passer par AUCUNE boîte de dialogue — en se basant sur le
/// même rendu HTML/CSS que `ShowPrintUI`, donc la même mise en page déjà
/// validée (voir CLAUDE.md, section "Impression / export PDF").
///
/// API asynchrone côté COM (le résultat arrive via un callback
/// `ICoreWebView2PrintToPdfCompletedHandler`, pas une valeur de retour
/// directe). **Première version RATÉE, gardée en mémoire ci-dessous à
/// dessein** : `webview2_com::PrintToPdfCompletedHandler::
/// wait_for_async_operation` (qui bloque en pompant la boucle de messages
/// Windows, `wait_with_pump`, jusqu'à ce que le callback arrive) ne
/// fonctionne PAS dans cette configuration Tauri/wry — **ça reste bloqué
/// indéfiniment**, confirmé en conditions réelles (invoke jamais résolu,
/// même après plusieurs minutes). Cause probable : `with_webview` dispatche
/// déjà la closure SUR la boucle d'évènements principale de `tao`/wry (qui
/// n'est pas une boucle Win32 brute) — y imbriquer un second appel à
/// `GetMessageA` (ce que fait `wait_with_pump`) ne reçoit jamais le message
/// de complétion, cette boucle n'étant apparemment pas ré-entrante de cette
/// façon ici (contrairement à un vrai message loop Win32 natif, où un
/// pompage imbriqué est un procédé courant et normalement sûr — ex. les
/// boîtes de dialogue modales, le drag-and-drop).
///
/// **Fix** : abandon de toute attente SYNCHRONE à l'intérieur de la
/// commande. `export_pdf` lance l'opération et retourne IMMÉDIATEMENT
/// (le PDF n'est pas encore forcément écrit au moment où la commande
/// répond) ; le VRAI résultat arrive plus tard via un évènement Tauri
/// (`"pdf-export-result"`, écouté côté frontend dans `App.tsx`) — la
/// completion handler COM se contente d'émettre cet évènement quand
/// WebView2 la déclenche, sans jamais chercher à bloquer qui que ce soit.
/// Aucune boucle de messages à pomper nous-mêmes : la livraison du callback
/// repose entièrement sur la boucle d'évènements EXISTANTE de l'application
/// (celle que Tauri fait déjà tourner en permanence pour tout le reste),
/// jamais sur une seconde boucle concurrente qu'on essaierait de piloter
/// depuis l'intérieur de la commande.
#[tauri::command]
pub fn export_pdf(window: tauri::WebviewWindow, path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_7;
        use webview2_com::PrintToPdfCompletedHandler;
        use windows::core::{Interface, HSTRING};

        let emit_window = window.clone();
        window
            .with_webview(move |webview| {
                let controller = webview.controller();
                let core = match unsafe { controller.CoreWebView2() } {
                    Ok(core) => core,
                    Err(e) => {
                        let _ = emit_window.emit("pdf-export-result", Some(e.to_string()));
                        return;
                    }
                };
                let core7: ICoreWebView2_7 = match core.cast() {
                    Ok(v) => v,
                    Err(e) => {
                        let _ = emit_window.emit("pdf-export-result", Some(e.to_string()));
                        return;
                    }
                };
                let path_wide = HSTRING::from(path.as_str());

                // `PrintToPdfCompletedHandler::create` construit l'objet COM du
                // callback SANS attendre quoi que ce soit (contrairement à
                // `wait_for_async_operation`, voir le commentaire de fonction) —
                // juste une closure appelée plus tard par WebView2, le jour où
                // elle a fini d'écrire le PDF.
                let handler_emit_window = emit_window.clone();
                let handler = PrintToPdfCompletedHandler::create(Box::new(move |hr, _success| {
                    let error = hr.err().map(|e| e.to_string());
                    let _ = handler_emit_window.emit("pdf-export-result", error);
                    Ok(())
                }));
                // `None` = réglages d'impression PAR DÉFAUT — la mise en page
                // vient déjà entièrement du CSS `@page`/`@media print` de la
                // page, pas besoin de les piloter ici.
                if let Err(e) = unsafe { core7.PrintToPdf(&path_wide, None, &handler) } {
                    let _ = emit_window.emit("pdf-export-result", Some(e.to_string()));
                }
            })
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = (window, path);
        Err("Export PDF direct non implémenté sur cette plateforme — utiliser Imprimer > Enregistrer au format PDF".to_string())
    }
}
