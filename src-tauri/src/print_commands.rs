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
