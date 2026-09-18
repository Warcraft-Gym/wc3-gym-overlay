use std::io::Write;
use tauri::Manager;

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

/// Ends the process immediately. Backs the "Quit app" button in Settings
/// and the picker window's native close button (see the `CloseRequested`
/// handling in `run()` below): this app has no tray icon or dock presence
/// once the picker is gone, so leaving the hidden overlay window (and the
/// process behind it) running invisibly is never useful — it only invites
/// a second, duplicate launch whose global shortcuts silently fail to
/// register because the first process still holds them.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Registered first per the plugin's own README: a second launch's
    // args/cwd are forwarded here instead of opening a second window set,
    // so we just re-show and focus the picker that's already running.
    //
    // macOS-only exclusion (bisected 2026-09-18): registering this plugin
    // renders the picker window permanently blank/white on macOS debug
    // builds — even a Windows-only-looking failure like "everything is a
    // blank WebView" traced back to this one `.plugin(...)` call. macOS
    // `.app` bundles are already single-instance via Launch Services, so
    // the guard is redundant there anyway. Do not re-enable this on macOS
    // without re-verifying the WebView renders.
    #[cfg(not(target_os = "macos"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        if let Some(window) = app.get_webview_window("picker") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            selftest_enabled,
            selftest_shortcut_override,
            selftest_log,
            selftest_done,
            quit_app
        ])
        .setup(|app| {
            // QA-only: simulate a user clicking "Quit app" one second after
            // launch, so the quit-on-close contract can be verified without
            // driving real OS window-close UI (AppleScript, etc.) in CI.
            if std::env::var("WC3GYM_SELFTEST_QUIT").as_deref() == Ok("1") {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(1));
                    handle.exit(0);
                });
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the picker window quits the whole app. Without this,
            // the hidden overlay window (visible: false, skipTaskbar: true)
            // keeps the process alive invisibly after the picker closes, so
            // the next launch starts as a second, duplicate process instead
            // of being caught by the single-instance guard above.
            if window.label() == "picker" {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
