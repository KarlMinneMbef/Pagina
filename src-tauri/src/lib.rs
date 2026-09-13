mod fs_commands;
mod print_commands;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            print_commands::print_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
