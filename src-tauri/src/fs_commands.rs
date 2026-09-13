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

const ALLOWED_EXTENSIONS: [&str; 2] = ["md", "xmd"];

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
