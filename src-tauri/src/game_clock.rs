//! Polls the header of Warcraft III's observer shared-memory block
//! (`War3StatsObserverSharedMemory`) and emits it to the webview as the
//! `wc3gym:game-clock` event. The block is the game's own observer API;
//! players and observers get the same bytes. This reads 13 header bytes
//! (in_game flag, game clock) and writes only the refresh interval.

use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub const EVENT: &str = "wc3gym:game-clock";
/// How often the app reads the block, and the refresh interval it asks the game for.
const POLL_MS: u64 = 250;
#[cfg(windows)]
const REFRESH_MS: u32 = 250;
const HEADER_LEN: usize = 13;

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GameClock {
    pub in_game: bool,
    pub clock_ms: u32,
    pub refresh_ms: u32,
}

/// Decodes the header bytes. `None` when the slice is too short.
pub fn parse_header(bytes: &[u8]) -> Option<GameClock> {
    if bytes.len() < HEADER_LEN {
        return None;
    }
    Some(GameClock {
        refresh_ms: u32::from_le_bytes(bytes[4..8].try_into().ok()?),
        in_game: bytes[8] != 0,
        clock_ms: u32::from_le_bytes(bytes[9..13].try_into().ok()?),
    })
}

/// Starts the poll thread. Emits `None` while the game is not running.
pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || loop {
        let sample = read_header().and_then(|bytes| parse_header(&bytes));
        let _ = app.emit(EVENT, sample);
        std::thread::sleep(Duration::from_millis(POLL_MS));
    });
}

#[cfg(windows)]
fn read_header() -> Option<[u8; HEADER_LEN]> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Memory::{
        MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, FILE_MAP_READ, FILE_MAP_WRITE,
    };

    // Opens and closes the mapping on every poll, so a game that exits
    // makes the name disappear and the next poll reports None.
    // Tries read+write first (to set refresh_rate), then read-only.
    let name: Vec<u16> = "War3StatsObserverSharedMemory\0".encode_utf16().collect();
    // SAFETY: `name` is NUL-terminated UTF-16. The view maps at least
    // HEADER_LEN bytes, and the code unmaps it and closes the handle on every path.
    unsafe {
        let mut access = FILE_MAP_READ | FILE_MAP_WRITE;
        let mut handle = OpenFileMappingW(access, 0, name.as_ptr());
        if handle.is_null() {
            access = FILE_MAP_READ;
            handle = OpenFileMappingW(access, 0, name.as_ptr());
        }
        if handle.is_null() {
            return None;
        }
        let view = MapViewOfFile(handle, access, 0, 0, HEADER_LEN);
        if view.Value.is_null() {
            CloseHandle(handle);
            return None;
        }
        let base = view.Value as *mut u8;
        let mut bytes = [0u8; HEADER_LEN];
        for (i, byte) in bytes.iter_mut().enumerate() {
            *byte = std::ptr::read_volatile(base.add(i));
        }
        // Offset 4 of a page-aligned view is 4-byte aligned.
        let refresh = u32::from_le_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]);
        if access & FILE_MAP_WRITE != 0 && refresh != REFRESH_MS {
            std::ptr::write_volatile(base.add(4) as *mut u32, REFRESH_MS);
        }
        UnmapViewOfFile(view);
        CloseHandle(handle);
        Some(bytes)
    }
}

#[cfg(not(windows))]
fn read_header() -> Option<[u8; HEADER_LEN]> {
    // ponytail: no known copy of the block on macOS or Linux; see docs/overlay.md.
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_header() {
        let mut bytes = [0u8; HEADER_LEN];
        bytes[4..8].copy_from_slice(&250u32.to_le_bytes());
        bytes[8] = 1;
        bytes[9..13].copy_from_slice(&8550u32.to_le_bytes());
        assert_eq!(
            parse_header(&bytes),
            Some(GameClock { in_game: true, clock_ms: 8550, refresh_ms: 250 })
        );
        assert_eq!(parse_header(&bytes[..12]), None);
    }
}
