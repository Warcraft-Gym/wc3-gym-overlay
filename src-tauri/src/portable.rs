//! F002: tells the frontend whether this process is running from an
//! *installed* bundle (NSIS on Windows, a `.app` on macOS) or a *portable*
//! exe the user downloaded and ran directly. Portable builds have no
//! updater artifact to install in place, so the picker offers a manual
//! download link instead — see `host/tauri.ts`'s `isPortableBuild()`.

use std::path::Path;

/// Pure path-based check, kept separate from `is_installed_bundle()` so it
/// can be unit-tested on any host OS without actually installing anything.
///
/// - A sibling `uninstall.exe` or `unins*.exe` next to the exe (NSIS/Inno
///   Setup-style uninstaller) means "installed".
/// - A path running through `<Name>.app/Contents/MacOS/` means "installed"
///   (a macOS app bundle).
/// - Anything else — a bare exe sitting in Downloads, a temp dir, etc. —
///   means "portable".
pub fn is_installed_bundle_at(exe: &Path) -> bool {
    if let Some(parent) = exe.parent() {
        if parent.join("uninstall.exe").exists() {
            return true;
        }
        if let Ok(entries) = std::fs::read_dir(parent) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if name.starts_with("unins") && name.ends_with(".exe") {
                    return true;
                }
            }
        }
    }

    // Normalize backslashes so this check also matches a Windows-style path
    // string in tests, even though a real macOS path never contains one.
    let normalized = exe.to_string_lossy().replace('\\', "/");
    normalized.contains(".app/Contents/MacOS/")
}

/// Real command the frontend invokes. Linux (and any other target) has no
/// portable distribution of this app, so it always reports "installed" —
/// only Windows and macOS ever need the path-based check above.
#[tauri::command]
pub fn is_installed_bundle() -> bool {
    #[cfg(any(windows, target_os = "macos"))]
    {
        std::env::current_exe()
            .map(|exe| is_installed_bundle_at(&exe))
            // If we can't even resolve our own exe path, don't block the
            // update flow on a guess — default to "installed".
            .unwrap_or(true)
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::is_installed_bundle_at;
    use std::fs;
    use std::path::PathBuf;

    /// Unique, self-cleaning scratch dir per test — avoids both a new
    /// `tempfile` dependency and collisions between tests running in
    /// parallel (`cargo test` runs test fns concurrently by default).
    struct ScratchDir(PathBuf);

    impl ScratchDir {
        fn new(label: &str) -> Self {
            let dir = std::env::temp_dir().join(format!(
                "wc3gym-overlay-portable-test-{label}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .expect("system clock is after 1970")
                    .as_nanos()
            ));
            fs::create_dir_all(&dir).expect("create scratch dir");
            Self(dir)
        }
    }

    impl Drop for ScratchDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn is_installed_bundle_at_true_for_sibling_uninstall_exe() {
        let scratch = ScratchDir::new("nsis");
        fs::write(scratch.0.join("uninstall.exe"), b"").expect("write sibling uninstaller");
        let exe = scratch.0.join("Warcraft-3-Gym-Overlay.exe");
        fs::write(&exe, b"").expect("write exe");

        assert!(is_installed_bundle_at(&exe));
    }

    #[test]
    fn is_installed_bundle_at_true_for_sibling_unins_prefixed_exe() {
        let scratch = ScratchDir::new("inno");
        fs::write(scratch.0.join("unins000.exe"), b"").expect("write sibling uninstaller");
        let exe = scratch.0.join("Warcraft-3-Gym-Overlay.exe");
        fs::write(&exe, b"").expect("write exe");

        assert!(is_installed_bundle_at(&exe));
    }

    #[test]
    fn is_installed_bundle_at_true_for_macos_app_bundle_path() {
        let exe = PathBuf::from("/Applications/Warcraft 3 Gym.app/Contents/MacOS/wc3gym-overlay");

        assert!(is_installed_bundle_at(&exe));
    }

    #[test]
    fn is_installed_bundle_at_false_for_a_plain_temp_dir() {
        let scratch = ScratchDir::new("portable");
        let exe = scratch.0.join("Warcraft-3-Gym-Overlay-Portable.exe");
        fs::write(&exe, b"").expect("write exe");

        assert!(!is_installed_bundle_at(&exe));
    }
}
