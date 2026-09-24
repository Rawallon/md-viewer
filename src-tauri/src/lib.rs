use std::fs;

/// Path passed on the command line (e.g. double-clicking a .md file).
#[tauri::command]
fn startup_file() -> Option<String> {
    std::env::args().skip(1).find(|a| !a.starts_with('-'))
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| format!("{path}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![startup_file, read_file, write_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
