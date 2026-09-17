use std::io::Write;

/// Whether the QA selftest flow is enabled for this process, via
/// `WC3GYM_SELFTEST=1`. The frontend has no other way to see an env var, so
/// it asks Rust instead of trying to parse `process.env` in the webview.
#[tauri::command]
fn selftest_enabled() -> bool {
    std::env::var("WC3GYM_SELFTEST").as_deref() == Ok("1")
}

/// Forwards a line of webview console output to the process's real stdout,
/// so a launcher capturing the binary's stdout sees the selftest JSON lines
/// without needing to scrape the webview devtools console.
#[tauri::command]
fn selftest_log(line: String) {
    println!("{line}");
}

/// Ends the selftest run: flush stdout so every `selftest_log` line has
/// actually been written, then exit the process. A no-op app that never
/// exits would hang whatever launched it with `WC3GYM_SELFTEST=1`.
#[tauri::command]
fn selftest_done(app: tauri::AppHandle) {
    if selftest_enabled() {
        let _ = std::io::stdout().flush();
        app.exit(0);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            selftest_enabled,
            selftest_log,
            selftest_done
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
