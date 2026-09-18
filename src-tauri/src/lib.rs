use std::io::Write;

/// Whether the QA selftest flow is enabled for this process, via
/// `WC3GYM_SELFTEST=1`. The frontend has no other way to see an env var, so
/// it asks Rust instead of trying to parse `process.env` in the webview.
#[tauri::command]
fn selftest_enabled() -> bool {
    std::env::var("WC3GYM_SELFTEST").as_deref() == Ok("1")
}

/// Optional single-shortcut override for the QA selftest, e.g.
/// `WC3GYM_SELFTEST_SHORTCUT_OVERRIDE=toggle_overlay=F9` makes the selftest
/// register `toggle_overlay` as the standalone `F9` key instead of its
/// default combo — lets a native selftest run assert a standalone
/// function-key shortcut registers without seeding the webview's
/// localStorage from the launcher.
#[tauri::command]
fn selftest_shortcut_override() -> Option<String> {
    std::env::var("WC3GYM_SELFTEST_SHORTCUT_OVERRIDE").ok()
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
            selftest_shortcut_override,
            selftest_log,
            selftest_done
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
