mod fs_commands;
mod print_commands;
mod spell_commands;
mod startup_files;
mod watcher;

use startup_files::PendingOpenFiles;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // DOIT être enregistré avant les autres plugins (contrainte
        // documentée de tauri-plugin-single-instance) : intercepte un
        // second lancement de l'exe (double-clic sur un fichier associé
        // pendant que l'app tourne déjà) pour transmettre le fichier à la
        // fenêtre existante plutôt que d'ouvrir une seconde fenêtre.
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            startup_files::handle_second_instance(app, args, cwd);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingOpenFiles(Mutex::new(startup_files::filter_openable_args(
            &std::env::args().collect::<Vec<_>>(),
        ))))
        .manage(watcher::WatcherState::default())
        .manage(spell_commands::SpellState::default())
        .invoke_handler(tauri::generate_handler![
            fs_commands::read_workspace_tree,
            fs_commands::read_text_file,
            fs_commands::write_text_file,
            fs_commands::create_file,
            fs_commands::create_folder,
            fs_commands::rename_path,
            fs_commands::delete_path,
            fs_commands::duplicate_path,
            watcher::watch_workspace,
            watcher::unwatch_workspace,
            spell_commands::spell_languages,
            spell_commands::spell_check,
            spell_commands::spell_suggest,
            print_commands::print_window,
            print_commands::export_pdf,
            startup_files::pending_open_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
