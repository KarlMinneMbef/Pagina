// Gère les fichiers .md/.xmd passés en argument au lancement de l'app —
// double-clic depuis l'Explorateur Windows (association de fichiers, voir
// `bundle.fileAssociations` dans tauri.conf.json), ou "Ouvrir avec" du menu
// contextuel.
//
// Deux chemins d'arrivée possibles pour un chemin de fichier :
// - **Premier lancement** (l'app n'était pas encore ouverte) : le chemin est
//   dans `std::env::args()` du tout premier processus. Stocké ici dans un
//   état partagé le temps que le frontend soit prêt à le récupérer via la
//   commande `pending_open_files` (le frontend ne peut pas encore écouter un
//   évènement au moment exact où Rust démarre — il doit donc plutôt
//   "tirer" cette liste une fois monté, jamais l'inverse).
// - **App déjà ouverte** : Windows relance un DEUXIÈME processus xmd-editor
//   avec le nouveau chemin en argument ; `tauri-plugin-single-instance`
//   intercepte ce second lancement (il ne crée jamais de vraie deuxième
//   fenêtre) et redonne la main ici avec ses arguments — on émet alors un
//   évènement `"open-files"` directement vers la fenêtre déjà ouverte,
//   cette fois le frontend est déjà monté et à l'écoute.
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

const ALLOWED_EXTENSIONS: [&str; 2] = ["md", "xmd"];

pub struct PendingOpenFiles(pub Mutex<Vec<String>>);

/// Ne garde que les arguments qui ressemblent à un vrai chemin de fichier
/// `.md`/`.xmd` existant — `argv[0]` est toujours le chemin de l'exécutable
/// lui-même (jamais un document à ouvrir), et Windows peut aussi glisser des
/// arguments techniques (ex. `--flag`) selon comment le raccourci a été
/// enregistré.
pub fn filter_openable_args(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| {
            let path = Path::new(a);
            let ext_ok = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| ALLOWED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
                .unwrap_or(false);
            ext_ok && path.is_file()
        })
        .cloned()
        .collect()
}

/// Rappelé par `tauri-plugin-single-instance` quand l'utilisateur relance
/// l'app (double-clic sur un fichier) alors qu'une instance tourne déjà :
/// transmet directement les fichiers à la fenêtre existante plutôt que
/// d'ouvrir une seconde fenêtre, et la ramène au premier plan.
pub fn handle_second_instance(app: &AppHandle, args: Vec<String>, _cwd: String) {
    let files = filter_openable_args(&args);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
    if !files.is_empty() {
        let _ = app.emit("open-files", files);
    }
}

#[tauri::command]
pub fn pending_open_files(state: tauri::State<PendingOpenFiles>) -> Vec<String> {
    // `take` plutôt qu'un simple clone : ces fichiers ne doivent être
    // consommés qu'une seule fois (au tout premier appel depuis le
    // frontend au démarrage), jamais réouverts sur un futur remontage.
    std::mem::take(&mut state.0.lock().unwrap())
}
