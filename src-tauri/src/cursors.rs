//! Clawd's mouse pointers. Windows is the only platform that lets an app swap the system
//! pointers (`SetSystemCursor`); elsewhere the engine never asks.
//!
//! The pointer files (`.cur` / `.ani`) are built by the engine and stored in the app's data
//! folder. Restoring reloads the user's own pointer scheme (`SPI_SETCURSORS`), so nothing of
//! theirs is ever overwritten. A marker file remembers "pointers swapped" across a crash: the app
//! restores them when it starts, when the pet window is rebuilt and when it quits.

use std::path::PathBuf;

/// Pointers the engine may replace and the Windows pointer each one stands in for.
pub const KINDS: [(&str, u32); 6] = [
    ("arrow", 32512),   // OCR_NORMAL
    ("text", 32513),    // OCR_IBEAM
    ("busy", 32514),    // OCR_WAIT
    ("no", 32648),      // OCR_NO
    ("hand", 32649),    // OCR_HAND
    ("working", 32650), // OCR_APPSTARTING
];

/// Upper bound for one pointer file (the engine's are ~200 KB).
pub const MAX_FILE: usize = 8 * 1024 * 1024;

const MARKER: &str = "swapped";

pub fn id_for(kind: &str) -> Option<u32> {
    KINDS.iter().find(|(k, _)| *k == kind).map(|(_, id)| *id)
}

/// The stored file name for a pointer, or an error for anything not on the list.
pub fn file_name(kind: &str, ext: &str) -> Result<String, String> {
    if id_for(kind).is_none() {
        return Err(format!("unknown pointer kind {kind:?}"));
    }
    if ext != "cur" && ext != "ani" {
        return Err(format!("unknown pointer file type {ext:?}"));
    }
    Ok(format!("{kind}.{ext}"))
}

/// Cheap sanity check of the bytes: right size and the right magic for the file type.
pub fn check_bytes(ext: &str, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_FILE {
        return Err("pointer file too large".into());
    }
    let ok = match ext {
        "ani" => bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"ACON",
        _ => bytes.len() > 6 && bytes[0..4] == [0, 0, 2, 0],
    };
    if ok {
        Ok(())
    } else {
        Err(format!("not a .{ext} file"))
    }
}

pub struct Cursors {
    dir: PathBuf,
}

impl Cursors {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    pub fn store(&self, kind: &str, ext: &str, bytes: &[u8]) -> Result<(), String> {
        let name = file_name(kind, ext)?;
        check_bytes(ext, bytes)?;
        std::fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
        // Only one file per kind: a stale .cur must not shadow a fresh .ani.
        for other in ["cur", "ani"] {
            let _ = std::fs::remove_file(self.dir.join(format!("{kind}.{other}")));
        }
        std::fs::write(self.dir.join(name), bytes).map_err(|e| e.to_string())
    }

    #[cfg_attr(not(windows), allow(dead_code))]
    fn stored(&self, kind: &str) -> Option<PathBuf> {
        ["ani", "cur"]
            .iter()
            .map(|ext| self.dir.join(format!("{kind}.{ext}")))
            .find(|p| p.is_file())
    }

    /// True while the system pointers are Clawd's (or hidden in his mouth).
    pub fn swapped(&self) -> bool {
        self.dir.join(MARKER).exists()
    }

    fn mark(&self, on: bool) {
        let marker = self.dir.join(MARKER);
        let _ = if on {
            std::fs::create_dir_all(&self.dir).and_then(|_| std::fs::write(marker, b"1"))
        } else {
            std::fs::remove_file(marker)
        };
    }

    /// Restores the user's pointers if a previous run (or window) left Clawd's on.
    pub fn restore_if_swapped(&self) {
        if self.swapped() {
            if let Err(e) = self.restore() {
                eprintln!("[clawd] could not restore the pointers: {e}");
            }
        }
    }
}

#[cfg(windows)]
mod native {
    use super::{id_for, Cursors};
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{HWND, POINT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateCursor, GetAncestor, GetClassNameW, GetCursorPos, LoadCursorFromFileW,
        SetSystemCursor, SystemParametersInfoW, WindowFromPoint, GA_ROOT, SPI_SETCURSORS,
    };

    /// Every standard pointer (arrow, text, busy, resize, hand, pin, person…); includes all of KINDS.
    const ALL_IDS: [u32; 16] = [
        32512, 32513, 32514, 32515, 32516, 32642, 32643, 32644, 32645, 32646, 32648, 32649, 32650,
        32651, 32671, 32672,
    ];

    impl Cursors {
        /// Every pointer becomes invisible: Clawd has it in his mouth.
        pub fn hide(&self) -> Result<(), String> {
            self.mark(true);
            let and = [0xffu8; 32 * 32 / 8];
            let xor = [0u8; 32 * 32 / 8];
            for id in ALL_IDS {
                // SetSystemCursor takes ownership of the handle, so each id gets its own.
                let blank = unsafe {
                    CreateCursor(
                        std::ptr::null_mut(),
                        0,
                        0,
                        32,
                        32,
                        and.as_ptr().cast(),
                        xor.as_ptr().cast(),
                    )
                };
                if blank.is_null() || unsafe { SetSystemCursor(blank, id) } == 0 {
                    return Err(format!("could not hide pointer {id}"));
                }
            }
            Ok(())
        }

        /// The user's pointers come back first, then the listed ones become Clawd's.
        pub fn apply(&self, kinds: &[String]) -> Result<(), String> {
            self.restore()?;
            self.mark(true);
            for kind in kinds {
                let id = id_for(kind).ok_or_else(|| format!("unknown pointer kind {kind:?}"))?;
                let path = self
                    .stored(kind)
                    .ok_or_else(|| format!("pointer {kind} was not stored"))?;
                let wide: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
                let cursor = unsafe { LoadCursorFromFileW(wide.as_ptr()) };
                if cursor.is_null() || unsafe { SetSystemCursor(cursor, id) } == 0 {
                    let _ = self.restore();
                    return Err(format!("could not load pointer {kind}"));
                }
            }
            Ok(())
        }

        /// Reloads the user's own pointer scheme.
        pub fn restore(&self) -> Result<(), String> {
            let ok = unsafe { SystemParametersInfoW(SPI_SETCURSORS, 0, std::ptr::null_mut(), 0) };
            if ok == 0 {
                return Err("SPI_SETCURSORS failed".into());
            }
            self.mark(false);
            Ok(())
        }
    }

    /// Whether the pointer is over the desktop itself (icons / wallpaper), not over a window.
    pub fn pointer_on_desktop() -> bool {
        unsafe {
            let mut p = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut p) == 0 {
                return false;
            }
            let hwnd: HWND = WindowFromPoint(p);
            if hwnd.is_null() {
                return false;
            }
            let root = GetAncestor(hwnd, GA_ROOT);
            let mut buf = [0u16; 64];
            let n = GetClassNameW(root, buf.as_mut_ptr(), buf.len() as i32);
            let class = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
            matches!(class.as_str(), "Progman" | "WorkerW")
        }
    }
}

#[cfg(windows)]
pub use native::pointer_on_desktop;

#[cfg(not(windows))]
impl Cursors {
    pub fn hide(&self) -> Result<(), String> {
        Err("swapping the system pointer is only supported on Windows".into())
    }

    pub fn apply(&self, _kinds: &[String]) -> Result<(), String> {
        self.hide()
    }

    pub fn restore(&self) -> Result<(), String> {
        self.mark(false);
        Ok(())
    }
}

#[cfg(not(windows))]
pub fn pointer_on_desktop() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_listed_pointers_and_types() {
        assert_eq!(file_name("arrow", "ani").unwrap(), "arrow.ani");
        assert!(file_name("../evil", "ani").is_err());
        assert!(file_name("arrow", "exe").is_err());
        assert!(file_name("ARROW", "cur").is_err());
    }

    #[test]
    fn checks_magic_and_size() {
        let mut ani = b"RIFF\0\0\0\0ACONanih".to_vec();
        assert!(check_bytes("ani", &ani).is_ok());
        ani[8] = b'X';
        assert!(check_bytes("ani", &ani).is_err());
        assert!(check_bytes("cur", &[0, 0, 2, 0, 1, 0, 0]).is_ok());
        assert!(check_bytes("cur", &[0, 0, 1, 0, 1, 0, 0]).is_err()); // an icon, not a cursor
        assert!(check_bytes("cur", &vec![0u8; MAX_FILE + 1]).is_err());
    }

    #[test]
    fn stores_one_file_per_kind_and_tracks_the_marker() {
        let dir = std::env::temp_dir().join(format!("clawd-cursors-test-{}", std::process::id()));
        let c = Cursors::new(dir.clone());
        c.store("hand", "cur", &[0, 0, 2, 0, 1, 0, 0]).unwrap();
        c.store("hand", "ani", b"RIFF\0\0\0\0ACONanih").unwrap();
        assert!(!dir.join("hand.cur").exists());
        assert_eq!(c.stored("hand"), Some(dir.join("hand.ani")));
        assert!(c.store("nope", "ani", b"RIFF\0\0\0\0ACONanih").is_err());
        assert!(!c.swapped());
        c.mark(true);
        assert!(c.swapped());
        c.mark(false);
        assert!(!c.swapped());
        let _ = std::fs::remove_dir_all(dir);
    }
}
