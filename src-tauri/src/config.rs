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

/// A monitor (or a group of them) in physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PxRect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// Bounding box of several monitors (the wallpaper window covers it).
pub fn span(rects: &[PxRect]) -> Option<PxRect> {
    let x0 = rects.iter().map(|r| r.x).min()?;
    let y0 = rects.iter().map(|r| r.y).min()?;
    let x1 = rects.iter().map(|r| r.x + r.w).max()?;
    let y1 = rects.iter().map(|r| r.y + r.h).max()?;
    Some(PxRect {
        x: x0,
        y: y0,
        w: x1 - x0,
        h: y1 - y0,
    })
}

/// `segments` URL parameter for the engine: each monitor relative to the span, "x,y,w,h;…".
pub fn segments_param(rects: &[PxRect], span: &PxRect) -> String {
    let mut sorted = rects.to_vec();
    sorted.sort_by_key(|r| (r.x, r.y));
    sorted
        .iter()
        .map(|r| format!("{},{},{},{}", r.x - span.x, r.y - span.y, r.w, r.h))
        .collect::<Vec<_>>()
        .join(";")
}

/// Parses `--mode <overlay|terrarium|wallpaper>` (or `--mode=<…>`) from command-line arguments.
pub fn mode_from_args(args: &[String]) -> Option<Mode> {
    let value = arg_value(args, "--mode")?;
    serde_json::from_value(serde_json::Value::String(value.to_lowercase())).ok()
}

/// `--cursor steal` / `--cursor return`: asks Clawd to take the mouse pointer or give it back.
pub fn cursor_from_args(args: &[String]) -> Option<&'static str> {
    match arg_value(args, "--cursor")?.to_lowercase().as_str() {
        "steal" => Some("steal"),
        "return" => Some("return"),
        _ => None,
    }
}

/// Value of `--name value` or `--name=value`.
fn arg_value(args: &[String], name: &str) -> Option<String> {
    let prefix = format!("{name}=");
    args.iter().enumerate().find_map(|(i, a)| {
        if a == name {
            args.get(i + 1).cloned()
        } else {
            a.strip_prefix(&prefix).map(str::to_string)
        }
    })
}

/// A saved terrarium is reused only if it is a reasonable size and still on screen
/// (monitors and resolutions change).
pub fn fits_inside(g: &Geometry, area: &Geometry) -> bool {
    g.w >= 200.0
        && g.h >= 150.0
        && g.w <= area.w * 0.9
        && g.h <= area.h * 0.9
        && g.x >= area.x - g.w * 0.5
        && g.y >= area.y
        && g.x + g.w * 0.5 <= area.x + area.w
        && g.y + 40.0 <= area.y + area.h
}

/// 520×300 in the bottom-right corner of the work area.
pub fn default_terrarium(area: &Geometry) -> Geometry {
    let (w, h) = (520.0_f64.min(area.w * 0.8), 300.0_f64.min(area.h * 0.8));
    Geometry {
        x: area.x + area.w - w - 24.0,
        y: area.y + area.h - h - 24.0,
        w,
        h,
    }
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
    /// Wallpaper target: a monitor name, "all", or None while the user hasn't been asked yet.
    pub wallpaper_monitor: Option<String>,
    /// Look for new releases on GitHub.
    pub check_updates: bool,
}

pub const ALL_MONITORS: &str = "all";

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            mode: Mode::Overlay,
            onboarded: false,
            terrarium: None,
            terrarium_on_top: true,
            lang: "en".into(),
            hidden: false,
            wallpaper_monitor: None,
            check_updates: true,
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
        fs::write(
            &tmp,
            serde_json::to_string_pretty(self).map_err(io::Error::other)?,
        )?;
        fs::rename(tmp, path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir()
            .join(format!("clawd-pet-test-{}-{name}", std::process::id()))
            .join("config.json")
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
            terrarium: Some(Geometry {
                x: 10.0,
                y: 20.0,
                w: 520.0,
                h: 300.0,
            }),
            terrarium_on_top: false,
            lang: "pt".into(),
            hidden: true,
            wallpaper_monitor: Some(ALL_MONITORS.into()),
            check_updates: false,
        };
        c.save(&p).unwrap();
        assert_eq!(AppConfig::load(&p), c);
        assert!(!p.with_extension("json.tmp").exists());
    }

    #[test]
    fn rejects_full_screen_or_off_screen_terrarium_geometry() {
        let area = Geometry {
            x: 0.0,
            y: 0.0,
            w: 1536.0,
            h: 864.0,
        };
        // The real bug: the overlay's full-screen size saved as the terrarium.
        assert!(!fits_inside(
            &Geometry {
                x: 0.0,
                y: 0.0,
                w: 1536.0,
                h: 864.0
            },
            &area
        ));
        assert!(!fits_inside(
            &Geometry {
                x: 3000.0,
                y: 100.0,
                w: 520.0,
                h: 300.0
            },
            &area
        ));
        assert!(!fits_inside(
            &Geometry {
                x: 100.0,
                y: 100.0,
                w: 50.0,
                h: 40.0
            },
            &area
        ));
        assert!(fits_inside(
            &Geometry {
                x: 900.0,
                y: 500.0,
                w: 520.0,
                h: 300.0
            },
            &area
        ));
    }

    #[test]
    fn default_terrarium_sits_in_the_bottom_right_corner() {
        let area = Geometry {
            x: 0.0,
            y: 0.0,
            w: 1536.0,
            h: 864.0,
        };
        let g = default_terrarium(&area);
        assert_eq!((g.w, g.h), (520.0, 300.0));
        assert!(fits_inside(&g, &area));
        assert_eq!(g.x + g.w + 24.0, area.w);
    }

    #[test]
    fn spans_monitors_and_describes_each_relative_to_the_span() {
        // A 1280×720 monitor to the LEFT of a 1920×1080 primary, bottoms aligned.
        let primary = PxRect {
            x: 0,
            y: 0,
            w: 1920,
            h: 1080,
        };
        let left = PxRect {
            x: -1280,
            y: 360,
            w: 1280,
            h: 720,
        };
        let s = span(&[primary, left]).unwrap();
        assert_eq!(
            s,
            PxRect {
                x: -1280,
                y: 0,
                w: 3200,
                h: 1080
            }
        );
        assert_eq!(
            segments_param(&[primary, left], &s),
            "0,360,1280,720;1280,0,1920,1080"
        );
        assert_eq!(span(&[]), None);
        assert_eq!(span(&[primary]), Some(primary));
    }

    #[test]
    fn old_configs_without_new_fields_still_load() {
        let p = temp_path("old");
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, r#"{ "mode": "wallpaper", "onboarded": true }"#).unwrap();
        let c = AppConfig::load(&p);
        assert_eq!(c.wallpaper_monitor, None);
        assert!(c.check_updates);
    }

    #[test]
    fn parses_mode_arguments() {
        let args = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(
            mode_from_args(&args(&["app", "--mode", "terrarium"])),
            Some(Mode::Terrarium)
        );
        assert_eq!(
            mode_from_args(&args(&["app", "--mode=Wallpaper"])),
            Some(Mode::Wallpaper)
        );
        assert_eq!(mode_from_args(&args(&["app", "--mode", "nope"])), None);
        assert_eq!(mode_from_args(&args(&["app", "--autostart"])), None);
        assert_eq!(mode_from_args(&args(&["app", "--mode"])), None);
        assert_eq!(cursor_from_args(&args(&["app", "--cursor", "steal"])), Some("steal"));
        assert_eq!(cursor_from_args(&args(&["app", "--cursor=RETURN"])), Some("return"));
        assert_eq!(cursor_from_args(&args(&["app", "--cursor", "eat"])), None);
        assert_eq!(cursor_from_args(&args(&["app", "--mode", "overlay"])), None);
    }

    #[test]
    fn modes_serialize_lowercase() {
        assert_eq!(
            serde_json::to_string(&Mode::Overlay).unwrap(),
            "\"overlay\""
        );
        assert_eq!(Mode::Wallpaper.as_str(), "wallpaper");
    }
}
