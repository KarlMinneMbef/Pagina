//! Import/export Word (.docx) et LibreOffice (.odt) via **Pandoc** (décision
//! utilisateur 2026-10-27 : moteur local léger plutôt que LibreOffice/unoserver
//! — l'outil de la plateforme MBEF reste utilisé côté serveur). Pagina ne
//! réimplémente AUCUNE logique de format : il appelle l'exécutable `pandoc`
//! trouvé sur la machine (PATH ou emplacements d'installation connus) et
//! traduit autour (fichiers temporaires, images, messages).
//!
//! - `pandoc_path` : détection (null si absent → l'interface affiche comment
//!   l'installer).
//! - `convert_import` : docx/odt → Markdown GFM (pipe tables, lisible par notre
//!   markdown-it) + images extraites dans un dossier temporaire ; le frontend
//!   les range ensuite dans le `.xmd` créé à côté de l'original.
//! - `convert_export` : Markdown → docx/odt ; lancé avec le DOSSIER du fichier
//!   Markdown comme répertoire de travail pour que les chemins d'images
//!   relatifs (`images/…`) se résolvent.
//! - `cleanup_temp_dir` : supprime le dossier temporaire d'un import une fois
//!   les images lues.
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

/// Résultat d'un import : le Markdown produit + le dossier temporaire qui
/// contient les images extraites (le frontend les lit puis appelle
/// `cleanup_temp_dir`).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertImportResult {
    pub markdown: String,
    /// Dossier temporaire à nettoyer après lecture des médias. */
    pub temp_dir: String,
    /// Fichiers médias extraits, chemins RELATIFS au dossier temporaire
    /// (ex. `media/image1.png`) — tels que référencés dans le Markdown. */
    pub media: Vec<String>,
}

/** Cherche l'exécutable Pandoc : PATH, puis emplacements d'installation
 *  classiques de Windows (MSI par utilisateur ou par machine). */
fn find_pandoc() -> Option<String> {
    let exe = if cfg!(windows) { "pandoc.exe" } else { "pandoc" };
    // 1. PATH
    if let Some(found) = find_in_path(exe) {
        return Some(found);
    }
    // 2. Emplacements connus.
    let mut candidates: Vec<PathBuf> = vec![
        PathBuf::from(r"C:\Program Files\Pandoc").join(exe),
        PathBuf::from(r"C:\Program Files (x86)\Pandoc").join(exe),
    ];
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        candidates.push(PathBuf::from(&local).join(r"Programs\Pandoc").join(exe));
    }
    candidates
        .into_iter()
        .find(|c| c.is_file())
        .map(|c| c.to_string_lossy().to_string())
}

fn find_in_path(exe: &str) -> Option<String> {
    let path_var = std::env::var("PATH").ok()?;
    for dir in path_var.split(';') {
        if dir.is_empty() {
            continue;
        }
        let candidate = Path::new(dir).join(exe);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

/** Dossier temporaire unique par import (nettoyé par `cleanup_temp_dir`). */
fn fresh_temp_dir() -> Result<PathBuf, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("pagina-import-{}", nanos));
    fs::create_dir_all(&dir).map_err(|e| format!("Impossible de créer le dossier temporaire : {}", e))?;
    Ok(dir)
}

/** Liste les fichiers médias extraits (tout sauf le `out.md` produit), en
 *  chemins relatifs avec séparateurs `/` (comme dans le Markdown). */
fn list_media(temp_dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![temp_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if entry.file_name().to_string_lossy() != "out.md" {
                if let Ok(rel) = path.strip_prefix(temp_dir) {
                    out.push(rel.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
    out
}

#[tauri::command]
pub async fn pandoc_path() -> Option<String> {
    find_pandoc()
}

/// Convertit un `.docx`/`.odt` en Markdown : images extraites dans un dossier
/// temporaire, Markdown en dialecte GFM (tableaux à tubes, compatibles avec
/// le parseur de Pagina). Le fichier d'origine n'est JAMAIS touché.
#[tauri::command]
pub async fn convert_import(input_path: String) -> Result<ConvertImportResult, String> {
    let pandoc = find_pandoc().ok_or_else(|| {
        "Pandoc n'est pas installé (ou introuvable). Installez-le depuis https://pandoc.org — \
         puis rouvrez ce fichier."
            .to_string()
    })?;
    if !Path::new(&input_path).is_file() {
        return Err(format!("Fichier introuvable : {}", input_path));
    }
    let temp = fresh_temp_dir()?;
    let out_md = temp.join("out.md");
    let output = Command::new(&pandoc)
        .arg(&input_path)
        .args(["-t", "gfm", "--wrap=none", "--extract-media"])
        .arg(&temp)
        .arg("-o")
        .arg(&out_md)
        .output()
        .map_err(|e| format!("Impossible de lancer Pandoc : {}", e))?;
    if !output.status.success() {
        return Err(format!(
            "Pandoc a échoué : {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let markdown = fs::read_to_string(&out_md)
        .map_err(|e| format!("Impossible de lire le Markdown produit : {}", e))?;
    let media = list_media(&temp);
    Ok(ConvertImportResult {
        markdown,
        temp_dir: temp.to_string_lossy().to_string(),
        media,
    })
}

/// Une image à embarquer dans le document exporté : chemin RELATIF dans le
/// conteneur (`images/plan-3fa9c1d2.png`) + octets.
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMedia {
    pub name: String,
    pub bytes: Vec<u8>,
}

/// Demande d'export : Markdown (sans le commentaire de config Pagina) +
/// images + fichier de sortie (`.docx`/`.odt`, l'extension décide).
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub markdown: String,
    pub media: Vec<ExportMedia>,
    pub output_path: String,
}

/// Convertit du Markdown en `.docx`/`.odt`. Tout le temporaire vit ICI :
/// le Markdown et les images (`images/…`) sont écrits dans un dossier
/// temporaire, Pandoc y est lancé (les chemins relatifs se résolvent), puis
/// le dossier est supprimé — le frontend n'a RIEN à nettoyer.
#[tauri::command]
pub async fn convert_export(request: ExportRequest) -> Result<(), String> {
    let pandoc = find_pandoc().ok_or_else(|| {
        "Pandoc n'est pas installé (ou introuvable). Installez-le depuis https://pandoc.org — \
         puis relancez l'export."
            .to_string()
    })?;
    let temp = fresh_temp_dir()?;
    let out_md = temp.join("out.md");
    fs::write(&out_md, &request.markdown)
        .map_err(|e| format!("Impossible d'écrire le Markdown temporaire : {}", e))?;
    for media in &request.media {
        // Le nom vient du conteneur Pagina (`images/…`) : on ne garde que la
        // partie après `images/` et on interdit tout remontée de dossier.
        let file_name = media
            .name
            .trim_start_matches("images/")
            .trim_start_matches("images\\");
        if file_name.contains("..") || file_name.contains('\\') || file_name.contains('/') {
            return Err(format!("Nom d'image refusé : {}", media.name));
        }
        let target = temp.join("images").join(file_name);
        fs::create_dir_all(target.parent().unwrap_or(&temp))
            .map_err(|e| format!("Impossible de créer le dossier d'images temporaire : {}", e))?;
        fs::write(&target, &media.bytes)
            .map_err(|e| format!("Impossible d'écrire l'image temporaire {} : {}", media.name, e))?;
    }
    let output = Command::new(&pandoc)
        .arg(&out_md)
        .arg("-o")
        .arg(&request.output_path)
        .current_dir(&temp)
        .output()
        .map_err(|e| format!("Impossible de lancer Pandoc : {}", e))?;
    let _ = fs::remove_dir_all(&temp);
    if !output.status.success() {
        return Err(format!(
            "Pandoc a échoué : {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

/// Supprime le dossier temporaire d'un import (appelé par le frontend après
/// lecture des images). Tolérant : un dossier déjà disparu n'est pas une erreur.
#[tauri::command]
pub async fn cleanup_temp_dir(path: String) -> Result<(), String> {
    let dir = Path::new(&path);
    if dir.is_dir() {
        let name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("");
        // Garde-fou : ne supprimer QUE nos dossiers temporaires.
        if !name.starts_with("pagina-import-") {
            return Err("Refus de supprimer : ce dossier n'est pas un dossier temporaire Pagina.".to_string());
        }
        fs::remove_dir_all(dir).map_err(|e| format!("Impossible de nettoyer le dossier temporaire : {}", e))?;
    }
    Ok(())
}
