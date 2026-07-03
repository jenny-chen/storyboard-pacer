use serde::Serialize;

#[derive(Serialize)]
struct Frame {
    name: String,
    path: String,
}

const IMAGE_EXTS: [&str; 7] = ["png", "jpg", "jpeg", "webp", "gif", "tif", "tiff"];

/// List image files (flat) inside a directory. Returns absolute paths so the
/// frontend can both display them (asset protocol) and reference them in the
/// exported XML without the user typing any path by hand.
#[tauri::command]
fn list_frames(dir: String) -> Result<Vec<Frame>, String> {
    let mut frames = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let is_image = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| IMAGE_EXTS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false);
        if !is_image {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        frames.push(Frame {
            name,
            path: path.to_string_lossy().to_string(),
        });
    }
    Ok(frames)
}

/// Write text (the generated XML) to an absolute path chosen via the native
/// save dialog.
#[tauri::command]
fn save_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// Hand the exported XML to Premiere Pro (macOS). Tries to open it with
/// Premiere; if Premiere isn't found, reveals the file in Finder instead so the
/// user can `File -> Import` it manually.
#[tauri::command]
fn open_in_premiere(path: String) -> Result<(), String> {
    use std::process::Command;
    let launched = Command::new("open")
        .args(["-a", "Adobe Premiere Pro", &path])
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !launched {
        Command::new("open").args(["-R", &path]).status().ok();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_frames,
            save_file,
            open_in_premiere
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
