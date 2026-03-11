use serde::Serialize;
use std::path::PathBuf;
use walkdir::WalkDir;

#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub extension: String,
}

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "txt", "md", "json", "csv", "tsx", "ts", "js", "py", "html", "css",
    "yml", "yaml", "toml", "xml", "svg",
    "png", "jpg", "jpeg", "gif", "webp", "bmp",
    "mp3", "wav", "ogg", "flac", "m4a",
    "mp4", "mov", "webm", "avi",
    "pdf",
];

#[tauri::command]
fn scan_directory(path: String) -> Result<Vec<FileInfo>, String> {
    let dir = PathBuf::from(&path);
    if !dir.exists() {
        return Err(format!("Directory not found: {}", path));
    }

    let mut files = Vec::new();

    for entry in WalkDir::new(&dir)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let ext = entry
            .path()
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !SUPPORTED_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }

        if let Ok(metadata) = entry.metadata() {
            files.push(FileInfo {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                size: metadata.len(),
                extension: ext,
            });
        }
    }

    Ok(files)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![scan_directory])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
