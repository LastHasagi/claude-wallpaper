use serde::{Deserialize, Serialize};
use std::{fs, io, path::Path};

/// How Clawd lives on the desktop.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// Transparent, click-through window above the taskbar.
    #[default]
    Overlay,
    /// Small movable window with the full ASCII scene.
    Terrarium,
    /// Full-screen scene behind the desktop icons.
    Wallpaper,
}

impl Mode {
    pub fn as_str(self) -> &'static str {
        match self {
            Mode::Overlay => "overlay",
            Mode::Terrarium => "terrarium",
            Mode::Wallpaper => "wallpaper",
        }
    }
}

/// Window geometry in logical pixels.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct Geometry {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// App-level state owned by the native side. Engine preferences (theme, language…) live in the
/// webview's storage instead.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub mode: Mode,
    pub onboarded: bool,
    pub terrarium: Option<Geometry>,
    pub terrarium_on_top: bool,
    /// Language for native labels (tray menu), mirrored from the engine.
    pub lang: String,
    pub hidden: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            mode: Mode::Overlay,
            onboarded: false,
            terrarium: None,
            terrarium_on_top: true,
            lang: "en".into(),
            hidden: false,
        }
    }
}

impl AppConfig {
    /// Reads the config; a missing or corrupt file yields the defaults.
    pub fn load(path: &Path) -> Self {
        fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    /// Writes atomically (temp file + rename) so a crash never leaves half a file.
    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_string_pretty(self).map_err(io::Error::other)?)?;
        fs::rename(tmp, path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("clawd-pet-test-{}-{name}", std::process::id())).join("config.json")
    }

    #[test]
    fn missing_file_gives_defaults() {
        assert_eq!(AppConfig::load(&temp_path("missing")), AppConfig::default());
    }

    #[test]
    fn corrupt_file_gives_defaults() {
        let p = temp_path("corrupt");
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, "{ not json").unwrap();
        assert_eq!(AppConfig::load(&p), AppConfig::default());
    }

    #[test]
    fn partial_file_fills_in_defaults_and_ignores_unknown_fields() {
        let p = temp_path("partial");
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, r#"{ "mode": "terrarium", "somethingNew": 1 }"#).unwrap();
        let c = AppConfig::load(&p);
        assert_eq!(c.mode, Mode::Terrarium);
        assert!(c.terrarium_on_top);
        assert!(!c.onboarded);
    }

    #[test]
    fn round_trips() {
        let p = temp_path("roundtrip");
        let c = AppConfig {
            mode: Mode::Wallpaper,
            onboarded: true,
            terrarium: Some(Geometry { x: 10.0, y: 20.0, w: 520.0, h: 300.0 }),
            terrarium_on_top: false,
            lang: "pt".into(),
            hidden: true,
        };
        c.save(&p).unwrap();
        assert_eq!(AppConfig::load(&p), c);
        assert!(!p.with_extension("json.tmp").exists());
    }

    #[test]
    fn modes_serialize_lowercase() {
        assert_eq!(serde_json::to_string(&Mode::Overlay).unwrap(), "\"overlay\"");
        assert_eq!(Mode::Wallpaper.as_str(), "wallpaper");
    }
}
