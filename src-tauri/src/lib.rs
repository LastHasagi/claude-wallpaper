mod belly;
mod config;
mod cursors;
#[cfg(windows)]
mod desktop;

use config::{AppConfig, Geometry, Mode, PxRect};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent, Wry,
};

const SETTINGS: &str = "settings";
const TRAY: &str = "main";

struct AppState {
    config: Mutex<AppConfig>,
    path: PathBuf,
    /// Label of the current pet window. Each recreation gets a fresh label ("pet-N"): a destroyed
    /// window keeps its label registered for a moment, so reusing it races.
    pet_label: Mutex<Option<(String, String)>>,
    pet_seq: AtomicU32,
    /// Serialises pet window (re)creation when mode switches arrive back to back.
    pet_lock: Mutex<()>,
    /// Newer release found by the update check (the pet window runs it).
    update: Mutex<Option<UpdateInfo>>,
    /// An update is being downloaded / installed.
    updating: AtomicBool,
    /// Set by the monitor watcher: rebuild the pet even if its signature did not change.
    force_rebuild: AtomicBool,
    /// Clawd's mouse pointers (Windows): stored files and "swapped" marker.
    cursors: cursors::Cursors,
    /// Desktop items he ate (hidden, never moved or deleted).
    belly: belly::Belly,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct UpdateInfo {
    version: String,
    url: String,
}

/// `update-progress` event: "download" (with a percent once the size is known), "install", "failed".
#[derive(Clone, Debug, serde::Serialize)]
struct UpdateProgress {
    phase: &'static str,
    percent: Option<u8>,
}

/// Only release pages of this project may be opened from update notices.
const RELEASES_URL: &str = "https://github.com/LastHasagi/claude-wallpaper/releases";
const MONITOR_POLL: Duration = Duration::from_secs(3);

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorInfo {
    id: String,
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    primary: bool,
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

/// What the current pet window was built for; a different signature means "rebuild".
fn pet_signature(cfg: &AppConfig) -> String {
    match cfg.mode {
        Mode::Wallpaper => format!(
            "wallpaper|{}",
            cfg.wallpaper_monitor.as_deref().unwrap_or("primary")
        ),
        m => m.as_str().to_string(),
    }
}

fn current_pet(app: &AppHandle) -> Option<WebviewWindow> {
    let (label, _) = state(app)
        .pet_label
        .lock()
        .expect("pet label lock")
        .clone()?;
    app.get_webview_window(&label)
}

// --- Tray -------------------------------------------------------------------------------------

struct Labels {
    toggle: &'static str,
    overlay: &'static str,
    terrarium: &'static str,
    wallpaper: &'static str,
    settings: &'static str,
    quit: &'static str,
    steal_cursor: &'static str,
    return_cursor: &'static str,
    spit_icons: &'static str,
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
            steal_cursor: "🖱 Clawd, pega meu cursor!",
            return_cursor: "↩ Devolver meu cursor",
            spit_icons: "↩ Devolver meus ícones",
        }
    } else {
        Labels {
            toggle: "Show / hide Clawd",
            overlay: "Free-roaming pet",
            terrarium: "Terrarium",
            wallpaper: "Wallpaper",
            settings: "Settings…",
            quit: "Quit",
            steal_cursor: "🖱 Clawd, take my pointer!",
            return_cursor: "↩ Give my pointer back",
            spit_icons: "↩ Give my icons back",
        }
    }
}

fn build_menu(app: &AppHandle, cfg: &AppConfig) -> tauri::Result<Menu<Wry>> {
    let l = labels(&cfg.lang);
    let mode_item = |id: &str, text: &str, mode: Mode| {
        CheckMenuItem::with_id(app, id, text, true, cfg.mode == mode, None::<&str>)
    };
    let menu = Menu::new(app)?;
    if let Some(u) = state(app).update.lock().expect("update lock").clone() {
        let text = if cfg.lang == "pt" {
            format!("⬆ Nova versão {} disponível: baixar", u.version)
        } else {
            format!("⬆ Version {} is available: download", u.version)
        };
        menu.append(&MenuItem::with_id(app, "update", text, true, None::<&str>)?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    menu.append_items(&[
        &MenuItem::with_id(app, "toggle", l.toggle, true, None::<&str>)?,
        &PredefinedMenuItem::separator(app)?,
        &mode_item("mode-overlay", l.overlay, Mode::Overlay)?,
        &mode_item("mode-terrarium", l.terrarium, Mode::Terrarium)?,
        &mode_item("mode-wallpaper", l.wallpaper, Mode::Wallpaper)?,
        &PredefinedMenuItem::separator(app)?,
    ])?;
    // Only Windows lets Clawd swap the system pointer.
    if cfg!(windows) {
        let item = if state(app).cursors.swapped() {
            MenuItem::with_id(app, "cursor-return", l.return_cursor, true, None::<&str>)?
        } else {
            MenuItem::with_id(app, "cursor-steal", l.steal_cursor, true, None::<&str>)?
        };
        menu.append(&item)?;
        let eaten = state(app).belly.count();
        if eaten > 0 {
            let text = format!("{} ({eaten})", l.spit_icons);
            menu.append(&MenuItem::with_id(app, "belly-spit", text, true, None::<&str>)?)?;
        }
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    menu.append_items(&[
        &MenuItem::with_id(app, "settings", l.settings, true, None::<&str>)?,
        &MenuItem::with_id(app, "quit", l.quit, true, None::<&str>)?,
    ])?;
    Ok(menu)
}

fn refresh_tray(app: &AppHandle) {
    let cfg = state(app).snapshot();
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY), build_menu(app, &cfg)) {
        let _ = tray.set_menu(Some(menu));
    }
}

/// Monitors the wallpaper should cover (physical px) and their bounding box.
struct WallpaperArea {
    monitors: Vec<PxRect>,
    span: PxRect,
}

fn px_rect(m: &tauri::Monitor) -> PxRect {
    PxRect {
        x: m.position().x,
        y: m.position().y,
        w: m.size().width as i32,
        h: m.size().height as i32,
    }
}

/// Resolves the configured wallpaper target: every monitor ("all"), a named one, or the primary.
fn wallpaper_area(app: &AppHandle, cfg: &AppConfig) -> Result<WallpaperArea, String> {
    let primary = app
        .primary_monitor()
        .map_err(err)?
        .ok_or("no monitor found")?;
    let all = app.available_monitors().map_err(err)?;
    let monitors: Vec<PxRect> = match cfg.wallpaper_monitor.as_deref() {
        Some(config::ALL_MONITORS) if all.len() > 1 => all.iter().map(px_rect).collect(),
        Some(name) => all
            .iter()
            .filter(|m| m.name().map(String::as_str) == Some(name))
            .map(px_rect)
            .collect(),
        None => Vec::new(),
    };
    let monitors = if monitors.is_empty() {
        vec![px_rect(&primary)]
    } else {
        monitors
    };
    let span = config::span(&monitors).ok_or("no monitor found")?;
    Ok(WallpaperArea { monitors, span })
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
        "mode-wallpaper" => spawn_task(app, wallpaper_from_tray),
        "settings" => spawn_task(app, open_settings),
        "update" => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move { install_update(app).await });
        }
        "cursor-steal" => cursor_command(app, "steal"),
        "cursor-return" => cursor_command(app, "return"),
        "belly-spit" => spit_icons(app),
        "quit" => {
            remember_terrarium(app);
            state(app).update(true, |_| {});
            app.exit(0);
        }
        _ => {}
    }
}

/// Tray / command line → the pet window plays the scene. With no visible pet to do it, the
/// pointer is simply given back.
fn cursor_command(app: &AppHandle, cmd: &'static str) {
    let visible = current_pet(app)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    if cmd == "return" && !visible {
        let _ = state(app).cursors.restore();
        refresh_tray(app);
    }
    if visible {
        let _ = app.emit("cursor-command", cmd);
    }
}

/// Gives back every desktop item Clawd ate, natively (works even with the pet hidden), and
/// tells the engine so he can say "ptui!".
fn spit_icons(app: &AppHandle) {
    match state(app).belly.spit_all() {
        Ok(n) => {
            let _ = app.emit("belly-spat", n);
        }
        Err(e) => eprintln!("[clawd] could not give the icons back: {e}"),
    }
    refresh_tray(app);
}

/// Everything Clawd holds goes back to the user: desktop icons and the mouse pointer.
fn give_everything_back(st: &AppState) {
    st.cursors.restore_if_swapped();
    match st.belly.spit_all() {
        Ok(0) => {}
        Ok(n) => eprintln!("[clawd] gave back {n} desktop item(s)"),
        Err(e) => eprintln!("[clawd] could not give the icons back: {e}"),
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
    if let Some(win) = current_pet(app) {
        if let (Ok(pos), Ok(size), Ok(scale)) =
            (win.outer_position(), win.inner_size(), win.scale_factor())
        {
            let g = Geometry {
                x: pos.x as f64 / scale,
                y: pos.y as f64 / scale,
                w: size.width as f64 / scale,
                h: size.height as f64 / scale,
            };
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
    let st = state(app);
    let _serial = st.pet_lock.lock().expect("pet lock");
    // Read the mode only once we hold the lock: the last switch wins.
    let cfg = st.snapshot();
    // Switches queued behind us may already be satisfied by the window we just built.
    let built = st
        .pet_label
        .lock()
        .expect("pet label lock")
        .as_ref()
        .map(|(_, sig)| sig.clone());
    let forced = st.force_rebuild.swap(false, Ordering::Relaxed);
    if let (false, Some(win), Some(sig)) = (forced, current_pet(app), built) {
        if sig == pet_signature(&cfg) {
            if !cfg.hidden {
                win.show().map_err(err)?;
            }
            return Ok(());
        }
    }
    eprintln!("[clawd] opening pet window ({})", cfg.mode.as_str());
    // Geometry is remembered by the callers *before* the mode changes; doing it here would
    // record the old window (e.g. the full-screen overlay) as the terrarium's size.
    if let Some(old) = current_pet(app) {
        // Its engine (and whatever it was holding) goes away with it.
        give_everything_back(&st);
        old.destroy().map_err(err)?;
    }
    let label = format!("pet-{}", st.pet_seq.fetch_add(1, Ordering::Relaxed));
    let monitor = app
        .primary_monitor()
        .map_err(err)?
        .ok_or("no monitor found")?;
    let scale = monitor.scale_factor();
    // Wallpaper may cover several monitors: one window over their bounding box, and the engine
    // gets each monitor's rect so every one has its own scene and ground.
    let wall = wallpaper_area(app, &cfg)?;
    let mut query = format!("mode={}", cfg.mode.as_str());
    if cfg!(windows) {
        query += "&syscursor=1";
        // Dragging icons onto him: not as wallpaper (the desktop itself takes the drop there).
        if cfg.mode != Mode::Wallpaper {
            query += "&belly=1";
        }
    }
    if cfg.mode == Mode::Wallpaper && wall.monitors.len() > 1 {
        query += &format!(
            "&segments={}",
            config::segments_param(&wall.monitors, &wall.span)
        );
    }
    let url = WebviewUrl::App(format!("index.html?{query}").into());
    let builder = WebviewWindowBuilder::new(app, &label, url)
        .title("Clawd")
        .decorations(false)
        .shadow(false)
        .visible(false);

    let win: WebviewWindow = (|| -> Result<WebviewWindow, String> {
        Ok(match cfg.mode {
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
                let area = Geometry {
                    x: wa.position.x as f64 / scale,
                    y: wa.position.y as f64 / scale,
                    w: wa.size.width as f64 / scale,
                    h: wa.size.height as f64 / scale,
                };
                let g = cfg
                    .terrarium
                    .filter(|g| config::fits_inside(g, &area))
                    .unwrap_or_else(|| config::default_terrarium(&area));
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
                let s = wall.span;
                let builder = builder
                    .skip_taskbar(true)
                    .resizable(false)
                    .focused(false)
                    // Created on top: WebView2 stalls initialising a window that starts fully
                    // covered by other windows. Dropped right after, before going behind the icons.
                    .always_on_top(true)
                    .position(s.x as f64 / scale, s.y as f64 / scale)
                    .inner_size(s.w as f64 / scale, s.h as f64 / scale);
                #[cfg(not(windows))]
                let builder = builder.always_on_bottom(true);
                builder.build().map_err(err)?
            }
        })
    })()?;

    *st.pet_label.lock().expect("pet label lock") = Some((label.clone(), pet_signature(&cfg)));
    eprintln!("[clawd] pet window built ({label})");
    match cfg.mode {
        Mode::Overlay => win.set_ignore_cursor_events(true).map_err(err)?,
        Mode::Wallpaper => {
            // No click-through here: it makes the window layered, and a layered *child* window
            // is never drawn. The icons layer above already takes the mouse.
            // Physical px: with monitors at different scales (4K @150% + Full HD @100%) a logical
            // size converted with one monitor's scale is wrong for the whole span.
            let s = wall.span;
            win.set_position(tauri::PhysicalPosition::new(s.x, s.y))
                .map_err(err)?;
            win.set_size(tauri::PhysicalSize::new(s.w as u32, s.h as u32))
                .map_err(err)?;
            win.set_always_on_top(false).map_err(err)?;
            #[cfg(windows)]
            {
                let hwnd = win.hwnd().map_err(err)?.0 as windows_sys::Win32::Foundation::HWND;
                let s = wall.span;
                match desktop::attach_behind_icons(hwnd, s.x, s.y, s.w, s.h) {
                    Ok(how) => eprintln!("[clawd] wallpaper attached ({how})"),
                    Err(e) => {
                        eprintln!("[clawd] wallpaper attach failed: {e}; staying a normal window")
                    }
                }
            }
        }
        Mode::Terrarium => {}
    }
    if !cfg.hidden {
        win.show().map_err(err)?;
        #[cfg(windows)]
        if cfg.mode == Mode::Wallpaper {
            desktop::restack_below_icons(
                win.hwnd().map_err(err)?.0 as windows_sys::Win32::Foundation::HWND,
            );
        }
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
    let visible = current_pet(app)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    state(app).update(true, |c| c.hidden = visible);
    match current_pet(app) {
        Some(w) if visible => w.hide().map_err(err),
        Some(w) => w.show().map_err(err),
        None => open_pet(app),
    }
}

fn open_settings(app: &AppHandle) -> Result<(), String> {
    open_settings_asking(app, false)
}

/// Opens (or focuses) the settings window; `ask_monitor` highlights the "which monitor?" question.
fn open_settings_asking(app: &AppHandle, ask_monitor: bool) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(SETTINGS) {
        w.show().map_err(err)?;
        if ask_monitor {
            w.emit("ask-monitor", ()).map_err(err)?;
        }
        return w.set_focus().map_err(err);
    }
    let page = if ask_monitor {
        "settings.html?ask=monitor"
    } else {
        "settings.html"
    };
    let win = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App(page.into()))
        .title("Clawd")
        .inner_size(540.0, 820.0)
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

/// Tray → Wallpaper: switch right away; with several monitors and no choice yet, also ask which.
fn wallpaper_from_tray(app: &AppHandle) -> Result<(), String> {
    apply_mode(app, Mode::Wallpaper)?;
    let monitors = app.available_monitors().map_err(err)?.len();
    if monitors > 1 && state(app).snapshot().wallpaper_monitor.is_none() {
        open_settings_asking(app, true)?;
    }
    Ok(())
}

fn open_update(app: &AppHandle) {
    use tauri_plugin_opener::OpenerExt;
    let url = state(app)
        .update
        .lock()
        .expect("update lock")
        .as_ref()
        .map(|u| u.url.clone());
    if let Some(url) = url.filter(|u| u.starts_with(RELEASES_URL)) {
        if let Err(e) = app.opener().open_url(url, None::<&str>) {
            eprintln!("[clawd] could not open the release page: {e}");
        }
    }
}

/// Downloads the signed installer of the newest release, reports progress to the settings window
/// (opened so it shows) and installs it; the app then starts again on the new version. Anything
/// off (offline, a release without a signed build) falls back to the release page.
#[tauri::command]
async fn install_update(app: AppHandle) {
    if state(&app).updating.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Err(e) = open_settings(&app) {
        eprintln!("[clawd] {e}");
    }
    if let Err(e) = download_and_install(&app).await {
        eprintln!("[clawd] update failed: {e}");
        state(&app).updating.store(false, Ordering::SeqCst);
        let _ = app.emit("update-progress", UpdateProgress { phase: "failed", percent: None });
        open_update(&app);
    }
}

async fn download_and_install(app: &AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;
    // On Windows the installer takes over and the process exits without the usual exit event.
    let handle = app.clone();
    let updater = app
        .updater_builder()
        .on_before_exit(move || before_restart(&handle))
        .build()
        .map_err(err)?;
    let update = updater
        .check()
        .await
        .map_err(err)?
        .ok_or("no signed update published for this release")?;
    let (progress, done) = (app.clone(), app.clone());
    let (mut got, mut shown) = (0u64, None);
    update
        .download_and_install(
            move |chunk, total| {
                got += chunk as u64;
                let percent = total.map(|t| (got * 100 / t.max(1)).min(100) as u8);
                if percent != shown {
                    shown = percent;
                    let _ = progress.emit("update-progress", UpdateProgress { phase: "download", percent });
                }
            },
            move || {
                let _ = done.emit("update-progress", UpdateProgress { phase: "install", percent: None });
            },
        )
        .await
        .map_err(err)?;
    before_restart(app);
    app.restart();
}

/// Same as quitting: Clawd gives everything back and the config is saved.
fn before_restart(app: &AppHandle) {
    give_everything_back(&state(app));
    remember_terrarium(app);
    state(app).update(true, |_| {});
}

// --- Commands ---------------------------------------------------------------------------------

#[tauri::command]
fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    monitor_list(&app)
}

/// Every few seconds, notices monitors being plugged in/out (or Duplicate ↔ Extend): tells the
/// settings window, rebuilds the wallpaper for the new layout and asks "which monitor?" when a
/// second one shows up and no choice was made yet.
fn watch_monitors(app: AppHandle) {
    std::thread::spawn(move || {
        let layout = |list: &[MonitorInfo]| {
            list.iter()
                .map(|m| (m.x, m.y, m.width, m.height))
                .collect::<Vec<_>>()
        };
        let mut last = monitor_list(&app).map(|l| layout(&l)).unwrap_or_default();
        loop {
            std::thread::sleep(MONITOR_POLL);
            let Ok(list) = monitor_list(&app) else {
                continue;
            };
            let now = layout(&list);
            if now == last {
                continue;
            }
            eprintln!("[clawd] monitors changed: {} → {}", last.len(), now.len());
            let gained_one = now.len() > last.len();
            last = now;
            let _ = app.emit("monitors-changed", &list);
            let cfg = state(&app).snapshot();
            if !cfg.onboarded || cfg.mode != Mode::Wallpaper {
                continue;
            }
            state(&app).force_rebuild.store(true, Ordering::Relaxed);
            spawn_task(&app, open_pet);
            if gained_one && list.len() > 1 && cfg.wallpaper_monitor.is_none() {
                spawn_task(&app, |a| open_settings_asking(a, true));
            }
        }
    });
}

fn monitor_list(app: &AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let primary = app.primary_monitor().map_err(err)?.map(|m| px_rect(&m));
    let mut list: Vec<MonitorInfo> = app
        .available_monitors()
        .map_err(err)?
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let r = px_rect(m);
            MonitorInfo {
                id: m.name().cloned().unwrap_or_else(|| format!("monitor-{i}")),
                width: r.w as u32,
                height: r.h as u32,
                x: r.x,
                y: r.y,
                primary: Some(r) == primary,
            }
        })
        .collect();
    list.sort_by_key(|m| (m.x, m.y));
    Ok(list)
}

#[tauri::command]
async fn set_wallpaper_monitor(app: AppHandle, target: String) -> Result<(), String> {
    let cfg = state(&app).update(true, |c| c.wallpaper_monitor = Some(target));
    if cfg.mode == Mode::Wallpaper {
        open_pet(&app)?;
    }
    Ok(())
}

#[tauri::command]
fn set_check_updates(app: AppHandle, on: bool) {
    state(&app).update(true, |c| c.check_updates = on);
    if !on {
        *state(&app).update.lock().expect("update lock") = None;
        refresh_tray(&app);
    }
}

/// Called by the pet window's update check when GitHub has a newer release.
#[tauri::command]
fn set_update_available(app: AppHandle, version: String, url: String) -> Result<(), String> {
    if !url.starts_with(RELEASES_URL) {
        return Err("unexpected release URL".into());
    }
    let info = UpdateInfo { version, url };
    *state(&app).update.lock().expect("update lock") = Some(info.clone());
    refresh_tray(&app);
    app.emit("update-available", info).map_err(err)
}

#[tauri::command]
fn get_update(app: AppHandle) -> Option<UpdateInfo> {
    state(&app).update.lock().expect("update lock").clone()
}

#[tauri::command]
fn open_update_page(app: AppHandle) {
    open_update(&app);
}

/// Stores one of Clawd's pointer files; the bytes come as the raw IPC body.
#[tauri::command]
fn cursor_store(app: AppHandle, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected the file as raw bytes".into());
    };
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string()
    };
    state(&app)
        .cursors
        .store(&header("x-cursor-kind"), &header("x-cursor-ext"), bytes)
}

#[tauri::command]
fn cursor_hide(app: AppHandle) -> Result<(), String> {
    let result = state(&app).cursors.hide();
    refresh_tray(&app);
    result
}

#[tauri::command]
fn cursor_apply(app: AppHandle, kinds: Vec<String>) -> Result<(), String> {
    let result = state(&app).cursors.apply(&kinds);
    refresh_tray(&app);
    result
}

#[tauri::command]
fn cursor_restore(app: AppHandle) -> Result<(), String> {
    let result = state(&app).cursors.restore();
    refresh_tray(&app);
    result
}

/// Items dropped on Clawd: only ones directly on the desktop get "eaten" (hidden).
#[tauri::command]
fn belly_eat(app: AppHandle, paths: Vec<String>) -> Result<belly::EatReport, String> {
    let report = state(&app).belly.eat(&paths);
    refresh_tray(&app);
    report
}

#[tauri::command]
fn belly_spit(app: AppHandle) -> Result<usize, String> {
    let back = state(&app).belly.spit_all();
    refresh_tray(&app);
    back
}

#[tauri::command]
fn cursor_on_desktop() -> bool {
    cursors::pointer_on_desktop()
}

#[tauri::command]
fn get_config(app: AppHandle) -> AppConfig {
    state(&app).snapshot()
}

#[tauri::command]
async fn set_mode(app: AppHandle, mode: Mode) -> Result<(), String> {
    if state(&app).snapshot().mode == mode && current_pet(&app).is_some() {
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
        if let Some(w) = current_pet(&app) {
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
        // Opens the author's links (GitHub, LinkedIn) from the settings window; scoped in capabilities.
        .plugin(tauri_plugin_opener::init())
        // Installs new versions from inside the app (signed installers from the GitHub release).
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Launching again either switches mode (`--mode terrarium`) or brings up the settings.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if argv.iter().any(|a| a == config::RESTORE_ALL) {
                give_everything_back(&state(app));
                refresh_tray(app);
            } else if let Some(cmd) = config::cursor_from_args(&argv) {
                cursor_command(app, cmd);
            } else if let Some(mode) = config::mode_from_args(&argv) {
                spawn_task(app, move |a| apply_mode(a, mode));
            } else {
                spawn_task(app, open_settings);
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .setup(|app| {
            let path = app.path().app_config_dir()?.join("config.json");
            let data = app.path().app_local_data_dir()?;
            let cursors = cursors::Cursors::new(data.join("cursors"));
            let belly = belly::Belly::new(data.join("belly.json"), app.path().desktop_dir().ok());
            let mut cfg = AppConfig::load(&path);
            if let Some(mode) = config::mode_from_args(&std::env::args().collect::<Vec<_>>()) {
                cfg.mode = mode;
                cfg.onboarded = true;
            }
            app.manage(AppState {
                config: Mutex::new(cfg.clone()),
                path,
                pet_label: Mutex::new(None),
                pet_seq: AtomicU32::new(1),
                pet_lock: Mutex::new(()),
                update: Mutex::new(None),
                updating: AtomicBool::new(false),
                force_rebuild: AtomicBool::new(false),
                cursors,
                belly,
            });
            // A crash (or a kill) may have left icons eaten or Clawd's pointers on.
            give_everything_back(&state(app.handle()));
            // The uninstaller runs `clawd-pet --restore-all`: give everything back and leave.
            if std::env::args().any(|a| a == config::RESTORE_ALL) {
                std::process::exit(0);
            }

            let handle = app.handle().clone();
            let menu = build_menu(&handle, &cfg)?;
            let mut tray = TrayIconBuilder::with_id(TRAY)
                .tooltip("Clawd")
                .menu(&menu)
                .on_menu_event(on_menu)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        spawn_task(tray.app_handle(), open_settings);
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            watch_monitors(handle.clone());

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
            open_settings_window,
            list_monitors,
            set_wallpaper_monitor,
            set_check_updates,
            set_update_available,
            get_update,
            open_update_page,
            install_update,
            cursor_store,
            cursor_hide,
            cursor_apply,
            cursor_restore,
            cursor_on_desktop,
            belly_eat,
            belly_spit
        ])
        .build(tauri::generate_context!())
        .expect("error while building Clawd Pet")
        .run(|app, event| match event {
            // Closing windows keeps Clawd alive in the tray; only "Quit" (an explicit exit code) ends the app.
            RunEvent::ExitRequested {
                api, code: None, ..
            } => api.prevent_exit(),
            RunEvent::Exit => {
                give_everything_back(&state(app));
                remember_terrarium(app);
                state(app).update(true, |_| {});
            }
            _ => {}
        });
}
