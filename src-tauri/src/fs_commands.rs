use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

// Documents éditables + formats convertibles visibles dans l'explorateur (clic droit
// « Convertir » pour .docx/.odt ; .pdf/.odp affichés, conversion PDF hors
// périmètre — décision utilisateur 2026-10-27).
const ALLOWED_EXTENSIONS: [&str; 5] = ["md", "xmd", "docx", "odt", "pdf"];

fn should_include_dir_entry(path: &Path, is_dir: bool) -> bool {
    if is_dir {
        // Skip hidden/system folders
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        !name.starts_with('.') && name != "node_modules"
    } else {
        match path.extension().and_then(|e| e.to_str()) {
            Some(ext) => ALLOWED_EXTENSIONS.contains(&ext.to_lowercase().as_str()),
            None => false,
        }
    }
}

fn read_dir_recursive(dir: &Path) -> Result<Vec<FileNode>, String> {
    let mut entries = fs::read_dir(dir)
        .map_err(|e| format!("Impossible de lire le dossier {:?}: {}", dir, e))?
        .filter_map(|e| e.ok())
        .collect::<Vec<_>>();

    // Sort: directories first, then alphabetical
    entries.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.file_name().to_ascii_lowercase().cmp(&b.file_name().to_ascii_lowercase()),
        }
    });

    let mut nodes = Vec::new();
    for entry in entries {
        let path = entry.path();
        let is_dir = path.is_dir();
        if !should_include_dir_entry(&path, is_dir) {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let children = if is_dir {
            Some(read_dir_recursive(&path)?)
        } else {
            None
        };
        // Skip empty subdirectories that contain no md/xmd files anywhere (keep folders that have children though)
        if is_dir {
            if let Some(ref c) = children {
                if c.is_empty() {
                    continue;
                }
            }
        }
        nodes.push(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            children,
        });
    }
    Ok(nodes)
}

#[tauri::command]
pub fn read_workspace_tree(root: String) -> Result<Vec<FileNode>, String> {
    let path = Path::new(&root);
    if !path.exists() {
        return Err(format!("Le dossier {} n'existe pas", root));
    }
    read_dir_recursive(path)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Impossible de lire {}: {}", path, e))
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Impossible d'écrire {}: {}", path, e))
}

#[tauri::command]
pub fn create_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(p, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_folder(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn duplicate_path(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Fichier introuvable".to_string());
    }
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("copie");
    let ext = p.extension().and_then(|s| s.to_str());
    let parent = p.parent().unwrap_or(Path::new("."));
    let mut counter = 1;
    loop {
        let candidate_name = match ext {
            Some(e) => format!("{} - copie{}.{}", stem, if counter > 1 { format!(" ({})", counter) } else { "".to_string() }, e),
            None => format!("{} - copie{}", stem, if counter > 1 { format!(" ({})", counter) } else { "".to_string() }),
        };
        let candidate = parent.join(candidate_name);
        if !candidate.exists() {
            fs::copy(p, &candidate).map_err(|e| e.to_string())?;
            return Ok(candidate.to_string_lossy().to_string());
        }
        counter += 1;
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Fichiers BINAIRES (format .xmd : conteneur ZIP, images) — octets bruts par l'IPC, sans passer par du JSON/base64.
// ---------------------------------------------------------------------------------------------------------------

/// Lit un fichier en octets bruts (renvoyés tels quels au frontend sous forme d'ArrayBuffer).
#[tauri::command]
pub fn read_binary_file(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Impossible de lire {}: {}", path, e))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Décode un texte « pourcentage » (`encodeURIComponent` côté JS) : le chemin voyage dans un en-tête HTTP.
fn percent_decode(s: &str) -> Result<String, String> {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return Err("Chemin invalide (séquence % incomplète)".to_string());
            }
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|_| "Chemin invalide")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "Chemin invalide (hexadécimal)".to_string())?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "Chemin invalide (UTF-8)".to_string())
}

/// Écrit un fichier en octets bruts : le contenu est le CORPS de la requête, le chemin l'en-tête `path`
/// (encodé par `encodeURIComponent`). L'écriture est ATOMIQUE (fichier temporaire puis renommage) : un
/// `.xmd` à moitié écrit — coupure, disque plein — ne remplace jamais l'ancien. Crée les dossiers manquants
/// (extraction des images dans `images/` à côté d'un `.md`).
#[tauri::command]
pub fn write_binary_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Contenu binaire manquant".to_string());
    };
    let header = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| "Chemin manquant".to_string())?;
    let path = percent_decode(header)?;
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Impossible de créer {}: {}", parent.display(), e))?;
    }
    let tmp = format!("{}.pagina-tmp", path);
    fs::write(&tmp, bytes).map_err(|e| format!("Impossible d'écrire {}: {}", path, e))?;
    fs::rename(&tmp, target).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Impossible d'écrire {}: {}", path, e)
    })
}

/// Le chemin existe-t-il (fichier ou dossier) ? — pour proposer un nom libre sans écraser.
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}
