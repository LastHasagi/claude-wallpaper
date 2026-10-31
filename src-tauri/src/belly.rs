//! Clawd's belly: desktop items the user drags onto him.
//!
//! Eating only sets the Windows *hidden* attribute; nothing is ever moved, deleted or changed.
//! Spitting clears it again, and only on items this app hid. The list of eaten items is saved
//! *before* hiding anything, so a crash never loses track; the app gives everything back when it
//! quits, when it starts, when the pet window is rebuilt and when it is uninstalled.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// He is full after this many items.
pub const CAPACITY: usize = 20;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Refusal {
    /// Not directly on the user's desktop (another folder, drive, the desktop itself…).
    NotOnDesktop,
    Missing,
    AlreadyHidden,
    /// System files (desktop.ini) and links (junctions, symbolic links).
    Untouchable,
    Full,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EatReport {
    /// Names of the items now in his belly.
    pub eaten: Vec<String>,
    pub refused: Vec<(String, Refusal)>,
    /// Items in his belly after this meal.
    pub total: usize,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct Ledger {
    items: Vec<PathBuf>,
}

pub struct Belly {
    ledger: PathBuf,
    desktop: Option<PathBuf>,
}

fn name_of(p: &Path) -> String {
    p.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| p.to_string_lossy().into_owned())
}

/// Same folder? Compares canonical paths, ignoring case (Windows paths are case-insensitive).
fn same_dir(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase(),
        _ => false,
    }
}

impl Belly {
    pub fn new(ledger: PathBuf, desktop: Option<PathBuf>) -> Self {
        Self { ledger, desktop }
    }

    fn load(&self) -> Ledger {
        std::fs::read_to_string(&self.ledger)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn save(&self, l: &Ledger) -> Result<(), String> {
        if l.items.is_empty() {
            return match std::fs::remove_file(&self.ledger) {
                Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
                _ => Ok(()),
            };
        }
        if let Some(dir) = self.ledger.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let tmp = self.ledger.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(l).map_err(|e| e.to_string())?;
        std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &self.ledger).map_err(|e| e.to_string())
    }

    pub fn count(&self) -> usize {
        self.load().items.len()
    }

    /// Whether `path` may be eaten: an existing, visible, ordinary item directly on the desktop.
    fn check(&self, path: &Path) -> Result<(), Refusal> {
        let desktop = self.desktop.as_deref().ok_or(Refusal::NotOnDesktop)?;
        let parent = path.parent().ok_or(Refusal::NotOnDesktop)?;
        if path.file_name().is_none() || !same_dir(parent, desktop) {
            return Err(Refusal::NotOnDesktop);
        }
        let meta = std::fs::symlink_metadata(path).map_err(|_| Refusal::Missing)?;
        if meta.file_type().is_symlink() {
            return Err(Refusal::Untouchable);
        }
        attrs::check(path)
    }

    pub fn eat(&self, paths: &[String]) -> Result<EatReport, String> {
        let mut ledger = self.load();
        let mut report = EatReport::default();
        for raw in paths {
            let path = PathBuf::from(raw);
            let name = name_of(&path);
            if let Err(why) = self.check(&path) {
                report.refused.push((name, why));
                continue;
            }
            if ledger.items.len() >= CAPACITY {
                report.refused.push((name, Refusal::Full));
                continue;
            }
            // Written down before hiding: if anything goes wrong from here on, it gets given back.
            ledger.items.push(path.clone());
            self.save(&ledger)?;
            if let Err(e) = attrs::set_hidden(&path, true) {
                eprintln!("[clawd] could not eat {name}: {e}");
                ledger.items.pop();
                self.save(&ledger)?;
                report.refused.push((name, Refusal::Untouchable));
                continue;
            }
            report.eaten.push(name);
        }
        if !report.eaten.is_empty() {
            attrs::refresh(self.desktop.as_deref());
        }
        report.total = ledger.items.len();
        Ok(report)
    }

    /// Gives back everything he ate. Returns how many items reappeared.
    pub fn spit_all(&self) -> Result<usize, String> {
        let ledger = self.load();
        if ledger.items.is_empty() {
            return Ok(0);
        }
        let mut back = 0;
        let mut stuck = Ledger::default();
        for path in ledger.items {
            match attrs::is_hidden(&path) {
                // Renamed, moved or deleted by the user meanwhile, or no longer hidden: forget it.
                None | Some(false) => {}
                Some(true) => match attrs::set_hidden(&path, false) {
                    Ok(()) => back += 1,
                    Err(e) => {
                        eprintln!("[clawd] could not give back {}: {e}", path.display());
                        stuck.items.push(path);
                    }
                },
            }
        }
        self.save(&stuck)?;
        attrs::refresh(self.desktop.as_deref());
        Ok(back)
    }
}

#[cfg(windows)]
mod attrs {
    use super::Refusal;
    use std::os::windows::{ffi::OsStrExt, fs::MetadataExt};
    use std::path::Path;
    use windows_sys::Win32::Storage::FileSystem::{
        SetFileAttributesW, FILE_ATTRIBUTE_HIDDEN, FILE_ATTRIBUTE_REPARSE_POINT,
        FILE_ATTRIBUTE_SYSTEM,
    };
    use windows_sys::Win32::UI::Shell::{SHChangeNotify, SHCNE_UPDATEDIR, SHCNF_FLUSH, SHCNF_PATHW};

    fn wide(p: &Path) -> Vec<u16> {
        p.as_os_str().encode_wide().chain([0]).collect()
    }

    fn get(p: &Path) -> Option<u32> {
        std::fs::symlink_metadata(p).ok().map(|m| m.file_attributes())
    }

    pub fn check(p: &Path) -> Result<(), Refusal> {
        let a = get(p).ok_or(Refusal::Missing)?;
        if a & (FILE_ATTRIBUTE_SYSTEM | FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
            return Err(Refusal::Untouchable);
        }
        if a & FILE_ATTRIBUTE_HIDDEN != 0 {
            return Err(Refusal::AlreadyHidden);
        }
        Ok(())
    }

    pub fn is_hidden(p: &Path) -> Option<bool> {
        get(p).map(|a| a & FILE_ATTRIBUTE_HIDDEN != 0)
    }

    /// Toggles only the hidden bit; every other attribute stays as it was.
    pub fn set_hidden(p: &Path, on: bool) -> Result<(), String> {
        let a = get(p).ok_or("item not found")?;
        let next = if on {
            a | FILE_ATTRIBUTE_HIDDEN
        } else {
            a & !FILE_ATTRIBUTE_HIDDEN
        };
        if unsafe { SetFileAttributesW(wide(p).as_ptr(), next) } == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }

    /// Makes the desktop redraw right away.
    pub fn refresh(desktop: Option<&Path>) {
        if let Some(d) = desktop {
            let w = wide(d);
            unsafe {
                SHChangeNotify(
                    SHCNE_UPDATEDIR as i32,
                    SHCNF_PATHW | SHCNF_FLUSH,
                    w.as_ptr().cast(),
                    std::ptr::null(),
                )
            };
        }
    }
}

#[cfg(not(windows))]
mod attrs {
    use super::Refusal;
    use std::path::Path;

    pub fn check(_: &Path) -> Result<(), Refusal> {
        Err(Refusal::Untouchable)
    }
    pub fn is_hidden(_: &Path) -> Option<bool> {
        None
    }
    pub fn set_hidden(_: &Path, _: bool) -> Result<(), String> {
        Err("only supported on Windows".into())
    }
    pub fn refresh(_: Option<&Path>) {}
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    struct Fixture {
        root: PathBuf,
        desktop: PathBuf,
        belly: Belly,
    }

    impl Fixture {
        fn new(tag: &str) -> Self {
            let root = std::env::temp_dir().join(format!("clawd-belly-{tag}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&root);
            let desktop = root.join("Desktop");
            std::fs::create_dir_all(desktop.join("Projeto")).unwrap();
            std::fs::write(desktop.join("Projeto").join("main.rs"), "fn main() {}").unwrap();
            std::fs::write(desktop.join("notas.txt"), "oi").unwrap();
            std::fs::create_dir_all(root.join("Outra")).unwrap();
            std::fs::write(root.join("Outra").join("x.txt"), "x").unwrap();
            let belly = Belly::new(root.join("belly.json"), Some(desktop.clone()));
            Self { root, desktop, belly }
        }

        fn s(&self, p: &Path) -> String {
            p.to_string_lossy().into_owned()
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = self.belly.spit_all();
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn eats_desktop_items_by_hiding_them_and_gives_them_back_untouched() {
        let f = Fixture::new("eat");
        let (dir, file) = (f.desktop.join("Projeto"), f.desktop.join("notas.txt"));
        let r = f.belly.eat(&[f.s(&dir), f.s(&file)]).unwrap();
        assert_eq!(r.eaten, vec!["Projeto", "notas.txt"]);
        assert_eq!(r.total, 2);
        assert_eq!(attrs::is_hidden(&dir), Some(true));
        assert_eq!(attrs::is_hidden(&file), Some(true));
        // Nothing moved or changed: same paths, same contents.
        assert_eq!(std::fs::read_to_string(dir.join("main.rs")).unwrap(), "fn main() {}");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "oi");

        assert_eq!(f.belly.spit_all().unwrap(), 2);
        assert_eq!(attrs::is_hidden(&dir), Some(false));
        assert_eq!(attrs::is_hidden(&file), Some(false));
        assert_eq!(f.belly.count(), 0);
        assert!(!f.root.join("belly.json").exists());
    }

    #[test]
    fn refuses_anything_not_directly_on_the_desktop() {
        let f = Fixture::new("refuse");
        let outside = f.root.join("Outra").join("x.txt");
        let nested = f.desktop.join("Projeto").join("main.rs");
        let sneaky = f.desktop.join("..").join("Outra");
        let r = f
            .belly
            .eat(&[f.s(&outside), f.s(&nested), f.s(&sneaky), f.s(&f.desktop), "C:\\".into()])
            .unwrap();
        assert!(r.eaten.is_empty());
        assert!(r.refused.iter().all(|(_, why)| *why == Refusal::NotOnDesktop), "{:?}", r.refused);
        assert_eq!(attrs::is_hidden(&outside), Some(false));
        assert_eq!(attrs::is_hidden(&nested), Some(false));
    }

    #[test]
    fn refuses_hidden_system_and_missing_items() {
        let f = Fixture::new("special");
        let hidden = f.desktop.join("secreto.txt");
        std::fs::write(&hidden, "s").unwrap();
        attrs::set_hidden(&hidden, true).unwrap();
        let r = f
            .belly
            .eat(&[f.s(&hidden), f.s(&f.desktop.join("sumiu.txt"))])
            .unwrap();
        assert_eq!(
            r.refused.iter().map(|(_, w)| *w).collect::<Vec<_>>(),
            vec![Refusal::AlreadyHidden, Refusal::Missing]
        );
        // Spitting never un-hides what the user hid themselves.
        f.belly.spit_all().unwrap();
        assert_eq!(attrs::is_hidden(&hidden), Some(true));
        attrs::set_hidden(&hidden, false).unwrap();
    }

    #[test]
    fn stops_when_full_and_forgets_items_the_user_moved() {
        let f = Fixture::new("full");
        let names: Vec<String> = (0..CAPACITY + 2)
            .map(|i| {
                let p = f.desktop.join(format!("f{i}.txt"));
                std::fs::write(&p, "x").unwrap();
                f.s(&p)
            })
            .collect();
        let r = f.belly.eat(&names).unwrap();
        assert_eq!(r.eaten.len(), CAPACITY);
        assert_eq!(r.refused.iter().filter(|(_, w)| *w == Refusal::Full).count(), 2);
        // The user renames one meanwhile: it is simply forgotten (and stays as the user left it).
        let moved = f.desktop.join("f0.txt");
        std::fs::rename(&moved, f.desktop.join("renomeado.txt")).unwrap();
        assert_eq!(f.belly.spit_all().unwrap(), CAPACITY - 1);
        assert_eq!(f.belly.count(), 0);
        attrs::set_hidden(&f.desktop.join("renomeado.txt"), false).unwrap();
    }

    #[test]
    fn a_crash_after_writing_the_ledger_is_harmless() {
        let f = Fixture::new("crash");
        let file = f.desktop.join("notas.txt");
        // Ledger written, item never hidden (the app died in between).
        f.belly.save(&Ledger { items: vec![file.clone()] }).unwrap();
        assert_eq!(f.belly.spit_all().unwrap(), 0);
        assert_eq!(attrs::is_hidden(&file), Some(false));
        assert_eq!(f.belly.count(), 0);
    }
}
