mod config;
#[cfg(windows)]
mod desktop;

use config::{AppConfig, Geometry, Mode};
use std::{path::PathBuf, sync::Mutex};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry,
};

const PET: &str = "pet";
const SETTINGS: &str = "settings";
const TRAY: &str = "main";

struct AppState {
    config: Mutex<AppConfig>,
    path: PathBuf,
}

impl AppState {
    fn snapshot(&self) -> AppConfig {
        self.config.lock().expect("config lock").clone()
    }

    /// Mutates the config; `persist` writes it to disk.
    fn update(&self, persist: bool, f: impl FnOnce(&mut AppConfig)) -> AppConfig {
        let mut cfg = self.config.lock().expect("config lock");
        f(&mut cfg);
        if persist {
            if let Err(e) = cfg.save(&self.path) {
                eprintln!("[clawd] could not save config: {e}");
            }
        }
        cfg.clone()
    }
}

fn state(app: &AppHandle) -> tauri::State<'_, AppState> {
    app.state::<AppState>()
}

// --- Tray -------------------------------------------------------------------------------------

struct Labels {
    toggle: &'static str,
    overlay: &'static str,
    terrarium: &'static str,
    wallpaper: &'static str,
    settings: &'static str,
    quit: &'static str,
}

fn labels(lang: &str) -> Labels {
    if lang == "pt" {
        Labels {
            toggle: "Mostrar / esconder o Clawd",
            overlay: "Pet solto",
            terrarium: "Terrário",
            wallpaper: "Papel de parede",
            settings: "Configurações…",
            quit: "Sair",
        }
    } else {
        Labels {
            toggle: "Show / hide Clawd",
            overlay: "Free-roaming pet",
            terrarium: "Terrarium",
            wallpaper: "Wallpaper",
            settings: "Settings…",
            quit: "Quit",
        }
    }
}

fn build_menu(app: &AppHandle, cfg: &AppConfig) -> tauri::Result<Menu<Wry>> {
    let l = labels(&cfg.lang);
    let mode_item = |id: &str, text: &str, mode: Mode| CheckMenuItem::with_id(app, id, text, true, cfg.mode == mode, None::<&str>);
    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "toggle", l.toggle, true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &mode_item("mode-overlay", l.overlay, Mode::Overlay)?,
            &mode_item("mode-terrarium", l.terrarium, Mode::Terrarium)?,
            &mode_item("mode-wallpaper", l.wallpaper, Mode::Wallpaper)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "settings", l.settings, true, None::<&str>)?,
            &MenuItem::with_id(app, "quit", l.quit, true, None::<&str>)?,
        ],
    )
}

fn refresh_tray(app: &AppHandle) {
    let cfg = state(app).snapshot();
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY), build_menu(app, &cfg)) {
        let _ = tray.set_menu(Some(menu));
    }
}

/// Window creation must not run on the main thread's event handlers on Windows (WebView2
/// deadlock), so menu actions hop onto the async runtime.
fn spawn_task(app: &AppHandle, f: impl FnOnce(&AppHandle) -> Result<(), String> + Send + 'static) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = f(&app) {
            eprintln!("[clawd] {e}");
        }
    });
}

fn on_menu(app: &AppHandle, event: MenuEvent) {
    match event.id.as_ref() {
        "toggle" => spawn_task(app, toggle_pet),
        "mode-overlay" => spawn_task(app, |a| apply_mode(a, Mode::Overlay)),
        "mode-terrarium" => spawn_task(app, |a| apply_mode(a, Mode::Terrarium)),
        "mode-wallpaper" => spawn_task(app, |a| apply_mode(a, Mode::Wallpaper)),
        "settings" => spawn_task(app, open_settings),
        "quit" => {
            remember_terrarium(app);
            state(app).update(true, |_| {});
            app.exit(0);
        }
        _ => {}
    }
}

// --- Windows ----------------------------------------------------------------------------------

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Saves the terrarium's current geometry (logical px) if that is what's open.
fn remember_terrarium(app: &AppHandle) {
    let st = state(app);
    if st.snapshot().mode != Mode::Terrarium {
        return;
    }
    if let Some(win) = app.get_webview_window(PET) {
        if let (Ok(pos), Ok(size), Ok(scale)) = (win.outer_position(), win.inner_size(), win.scale_factor()) {
            let g = Geometry { x: pos.x as f64 / scale, y: pos.y as f64 / scale, w: size.width as f64 / scale, h: size.height as f64 / scale };
            st.update(false, |c| c.terrarium = Some(g));
        }
    }
}

fn open_pet(app: &AppHandle) -> Result<(), String> {
    let result = build_pet(app);
    if let Err(e) = &result {
        eprintln!("[clawd] could not open the pet window: {e}");
    }
    result
}

fn build_pet(app: &AppHandle) -> Result<(), String> {
    let cfg = state(app).snapshot();
    eprintln!("[clawd] opening pet window ({})", cfg.mode.as_str());
    if let Some(old) = app.get_webview_window(PET) {
        remember_terrarium(app);
        old.destroy().map_err(err)?;
    }
    let monitor = app.primary_monitor().map_err(err)?.ok_or("no monitor found")?;
    let scale = monitor.scale_factor();
    let url = WebviewUrl::App(format!("index.html?mode={}", cfg.mode.as_str()).into());
    let builder = WebviewWindowBuilder::new(app, PET, url)
        .title("Clawd")
        .decorations(false)
        .shadow(false)
        .visible(false);

    let win: WebviewWindow = match cfg.mode {
        Mode::Overlay => {
            let wa = monitor.work_area();
            builder
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .focused(false)
                .visible_on_all_workspaces(true)
                .position(wa.position.x as f64 / scale, wa.position.y as f64 / scale)
                .inner_size(wa.size.width as f64 / scale, wa.size.height as f64 / scale)
                .build()
                .map_err(err)?
        }
        Mode::Terrarium => {
            let wa = monitor.work_area();
            let g = cfg.terrarium.unwrap_or_else(|| {
                let (w, h) = (520.0, 300.0);
                Geometry {
                    x: (wa.position.x as f64 + wa.size.width as f64) / scale - w - 24.0,
                    y: (wa.position.y as f64 + wa.size.height as f64) / scale - h - 24.0,
                    w,
                    h,
                }
            });
            builder
                .always_on_top(cfg.terrarium_on_top)
                .resizable(true)
                .min_inner_size(360.0, 220.0)
                .position(g.x, g.y)
                .inner_size(g.w, g.h)
                .build()
                .map_err(err)?
        }
        Mode::Wallpaper => {
            let (pos, size) = (monitor.position(), monitor.size());
            let builder = builder
                .skip_taskbar(true)
                .resizable(false)
                .focused(false)
                .position(pos.x as f64 / scale, pos.y as f64 / scale)
                .inner_size(size.width as f64 / scale, size.height as f64 / scale);
            #[cfg(not(windows))]
            let builder = builder.always_on_bottom(true);
            builder.build().map_err(err)?
        }
    };

    eprintln!("[clawd] pet window built");
    match cfg.mode {
        Mode::Overlay => win.set_ignore_cursor_events(true).map_err(err)?,
        Mode::Wallpaper => {
            win.set_ignore_cursor_events(true).map_err(err)?;
            #[cfg(windows)]
            {
                let hwnd = win.hwnd().map_err(err)?.0 as windows_sys::Win32::Foundation::HWND;
                let (pos, size) = (monitor.position(), monitor.size());
                match desktop::attach_behind_icons(hwnd, pos.x, pos.y, size.width as i32, size.height as i32) {
                    Ok(how) => eprintln!("[clawd] wallpaper attached ({how})"),
                    Err(e) => eprintln!("[clawd] wallpaper attach failed: {e}; staying a normal window"),
                }
            }
        }
        Mode::Terrarium => {}
    }
    if !cfg.hidden {
        win.show().map_err(err)?;
    }
    eprintln!("[clawd] pet window ready");
    Ok(())
}

fn apply_mode(app: &AppHandle, mode: Mode) -> Result<(), String> {
    remember_terrarium(app);
    state(app).update(true, |c| {
        c.mode = mode;
        c.hidden = false;
    });
    refresh_tray(app);
    open_pet(app)
}

fn toggle_pet(app: &AppHandle) -> Result<(), String> {
    let visible = app.get_webview_window(PET).and_then(|w| w.is_visible().ok()).unwrap_or(false);
    state(app).update(true, |c| c.hidden = visible);
    match app.get_webview_window(PET) {
        Some(w) if visible => w.hide().map_err(err),
        Some(w) => w.show().map_err(err),
        None => open_pet(app),
    }
}

fn open_settings(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(SETTINGS) {
        w.show().map_err(err)?;
        return w.set_focus().map_err(err);
    }
    let win = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("settings.html".into()))
        .title("Clawd")
        .inner_size(540.0, 790.0)
        .min_inner_size(420.0, 520.0)
        .center()
        .build()
        .map_err(err)?;
    // Closing the welcome screen without choosing still starts the pet (default mode).
    let handle = app.clone();
    win.on_window_event(move |e| {
        if matches!(e, WindowEvent::Destroyed) && !state(&handle).snapshot().onboarded {
            state(&handle).update(true, |c| c.onboarded = true);
            spawn_task(&handle, open_pet);
        }
    });
    Ok(())
}

// --- Commands ---------------------------------------------------------------------------------

#[tauri::command]
fn get_config(app: AppHandle) -> AppConfig {
    state(&app).snapshot()
}

#[tauri::command]
async fn set_mode(app: AppHandle, mode: Mode) -> Result<(), String> {
    if state(&app).snapshot().mode == mode && app.get_webview_window(PET).is_some() {
        return Ok(());
    }
    apply_mode(&app, mode)
}

#[tauri::command]
async fn finish_onboarding(app: AppHandle, mode: Mode) -> Result<(), String> {
    state(&app).update(true, |c| {
        c.onboarded = true;
        c.mode = mode;
    });
    refresh_tray(&app);
    open_pet(&app)?;
    if let Some(w) = app.get_webview_window(SETTINGS) {
        w.close().map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
async fn set_terrarium_on_top(app: AppHandle, on: bool) -> Result<(), String> {
    let cfg = state(&app).update(true, |c| c.terrarium_on_top = on);
    if cfg.mode == Mode::Terrarium {
        if let Some(w) = app.get_webview_window(PET) {
            w.set_always_on_top(on).map_err(err)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn set_ui_lang(app: AppHandle, lang: String) {
    let lang = if lang == "pt" { "pt" } else { "en" }.to_string();
    if state(&app).snapshot().lang != lang {
        state(&app).update(true, |c| c.lang = lang);
        refresh_tray(&app);
    }
}

#[tauri::command]
async fn open_settings_window(app: AppHandle) -> Result<(), String> {
    open_settings(&app)
}

// --- Entry point ------------------------------------------------------------------------------

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| spawn_task(app, open_settings)))
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .setup(|app| {
            let path = app.path().app_config_dir()?.join("config.json");
            let cfg = AppConfig::load(&path);
            app.manage(AppState { config: Mutex::new(cfg.clone()), path });

            let handle = app.handle().clone();
            let menu = build_menu(&handle, &cfg)?;
            let mut tray = TrayIconBuilder::with_id(TRAY).tooltip("Clawd").menu(&menu).on_menu_event(on_menu).on_tray_icon_event(
                |tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        spawn_task(tray.app_handle(), open_settings);
                    }
                },
            );
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            if cfg.onboarded {
                open_pet(&handle)?;
            } else {
                open_settings(&handle)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_mode,
            finish_onboarding,
            set_terrarium_on_top,
            set_ui_lang,
            open_settings_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building Clawd Pet")
        .run(|app, event| match event {
            // Closing windows keeps Clawd alive in the tray; only "Quit" (an explicit exit code) ends the app.
            RunEvent::ExitRequested { api, code: None, .. } => api.prevent_exit(),
            RunEvent::Exit => {
                remember_terrarium(app);
                state(app).update(true, |_| {});
            }
            _ => {}
        });
}
