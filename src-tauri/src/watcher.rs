use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event};
use std::sync::mpsc::channel;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Watches the given workspace root folder for filesystem changes and emits
/// a debounced "workspace://changed" event to the frontend, which then
/// re-reads the tree via read_workspace_tree.
#[tauri::command]
pub fn watch_workspace(app: AppHandle, root: String) -> Result<(), String> {
    std::thread::spawn(move || {
        let (tx, rx) = channel::<notify::Result<Event>>();
        let mut watcher: RecommendedWatcher = match notify::recommended_watcher(tx) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Impossible de créer le watcher: {}", e);
                return;
            }
        };
        if let Err(e) = watcher.watch(std::path::Path::new(&root), RecursiveMode::Recursive) {
            eprintln!("Impossible de surveiller {}: {}", root, e);
            return;
        }

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
    });
    Ok(())
}
