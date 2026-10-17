use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event};
use std::path::Path;
use std::sync::mpsc::channel;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Watcher actif du dossier de travail, gardé dans l'état géré de Tauri.
/// Le thread de boucle d'évènements ne détient PAS le watcher : le garder
/// ici permet de l'arrêter explicitement (drop) depuis `unwatch_workspace`
/// lors d'un changement de dossier de travail.
pub struct WatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            watcher: Mutex::new(None),
        }
    }
}

/// Watches the given workspace root folder for filesystem changes and emits
/// a debounced "workspace://changed" event to the frontend, which then
/// re-reads the tree via read_workspace_tree (itself debounced côté JS).
#[tauri::command]
pub fn watch_workspace(
    app: AppHandle,
    root: String,
    state: tauri::State<WatcherState>,
) -> Result<(), String> {
    let (tx, rx) = channel::<notify::Result<Event>>();
    let mut watcher: RecommendedWatcher = notify::recommended_watcher(tx)
        .map_err(|e| format!("Impossible de créer le watcher: {}", e))?;
    watcher
        .watch(Path::new(&root), RecursiveMode::Recursive)
        .map_err(|e| format!("Impossible de surveiller {}: {}", root, e))?;

    // Remplace l'éventuel watcher précédent : le drop de l'ancien arrête
    // son watch (et termine sa boucle d'évènements, le sender étant droppé).
    {
        let mut guard = state
            .watcher
            .lock()
            .map_err(|_| "Verrou du watcher empoisonné")?;
        *guard = Some(watcher);
    }

    std::thread::spawn(move || {
        let mut last_emit = std::time::Instant::now() - Duration::from_secs(10);
        for res in rx {
            if res.is_ok() {
                // Debounce: only emit at most every 300ms
                if last_emit.elapsed() > Duration::from_millis(300) {
                    let _ = app.emit("workspace://changed", ());
                    last_emit = std::time::Instant::now();
                }
            }
        }
        // Channel fermé (watcher droppé) : le thread se termine proprement.
    });
    Ok(())
}

/// Arrête le watcher courant (changement de dossier de travail) : le drop
/// du watcher ferme le channel, ce qui termine aussi la boucle du thread.
#[tauri::command]
pub fn unwatch_workspace(state: tauri::State<WatcherState>) -> Result<(), String> {
    let mut guard = state
        .watcher
        .lock()
        .map_err(|_| "Verrou du watcher empoisonné")?;
    if let Some(w) = guard.take() {
        drop(w);
    }
    Ok(())
}
