//! Windows only: puts a window behind the desktop icons, the way live-wallpaper apps do.

use std::ptr::{null, null_mut};
use windows_sys::Win32::Foundation::{HWND, LPARAM};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    EnumWindows, FindWindowExW, FindWindowW, GetSystemMetrics, GetWindowLongPtrW,
    SendMessageTimeoutW, SetParent, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, SMTO_NORMAL,
    SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
    WS_CHILD, WS_POPUP,
};

/// Undocumented Progman message that makes Explorer create the WorkerW wallpaper layer.
const SPAWN_WORKERW: u32 = 0x052C;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

/// Re-parents `hwnd` into the desktop's wallpaper layer and places it at screen rect
/// (`x`, `y`, `w`, `h`) in physical pixels. Returns which strategy worked.
pub fn attach_behind_icons(
    hwnd: HWND,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
) -> Result<&'static str, String> {
    let progman_class = wide("Progman");
    let defview_class = wide("SHELLDLL_DefView");
    let worker_class = wide("WorkerW");
    unsafe {
        let progman = FindWindowW(progman_class.as_ptr(), null());
        if progman.is_null() {
            return Err("Progman window not found".into());
        }
        let mut ignored: usize = 0;
        SendMessageTimeoutW(
            progman,
            SPAWN_WORKERW,
            0xD,
            0x1,
            SMTO_NORMAL,
            1000,
            &mut ignored,
        );

        // SetParent leaves WS_POPUP in place; a proper child window needs WS_CHILD instead.
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        SetWindowLongPtrW(
            hwnd,
            GWL_STYLE,
            (style & !(WS_POPUP as isize)) | WS_CHILD as isize,
        );

        // Child coordinates are relative to the virtual screen's origin.
        let (vx, vy) = (
            GetSystemMetrics(SM_XVIRTUALSCREEN),
            GetSystemMetrics(SM_YVIRTUALSCREEN),
        );
        let (cx, cy) = (x - vx, y - vy);

        // Windows 11 24H2+: the icons (SHELLDLL_DefView) and the WorkerW live inside Progman.
        // Sit between them: below the icons, above the static wallpaper.
        let defview = FindWindowExW(progman, null_mut(), defview_class.as_ptr(), null());
        if !defview.is_null() {
            let worker = FindWindowExW(progman, null_mut(), worker_class.as_ptr(), null());
            SetParent(hwnd, progman);
            SetWindowPos(hwnd, defview, cx, cy, w, h, SWP_NOACTIVATE);
            if !worker.is_null() {
                SetWindowPos(
                    worker,
                    hwnd,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
            return Ok("progman");
        }

        // Classic layout: a top-level WorkerW holds the icons; the WorkerW after it is the
        // wallpaper layer we draw into.
        let mut target: HWND = null_mut();
        EnumWindows(
            Some(find_wallpaper_worker),
            &mut target as *mut HWND as LPARAM,
        );
        if target.is_null() {
            return Err("WorkerW wallpaper layer not found".into());
        }
        SetParent(hwnd, target);
        SetWindowPos(
            hwnd,
            null_mut(),
            cx,
            cy,
            w,
            h,
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
        Ok("workerw")
    }
}

/// Puts `hwnd` back right below the icons layer (showing a window raises it among its siblings).
pub fn restack_below_icons(hwnd: HWND) {
    let progman_class = wide("Progman");
    let defview_class = wide("SHELLDLL_DefView");
    let worker_class = wide("WorkerW");
    let flags = SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE;
    unsafe {
        let progman = FindWindowW(progman_class.as_ptr(), null());
        if progman.is_null() {
            return;
        }
        let defview = FindWindowExW(progman, null_mut(), defview_class.as_ptr(), null());
        if defview.is_null() {
            return; // classic layout: our parent WorkerW is already below the icons
        }
        SetWindowPos(hwnd, defview, 0, 0, 0, 0, flags);
        let worker = FindWindowExW(progman, null_mut(), worker_class.as_ptr(), null());
        if !worker.is_null() {
            SetWindowPos(worker, hwnd, 0, 0, 0, 0, flags);
        }
    }
}

unsafe extern "system" fn find_wallpaper_worker(top: HWND, lparam: LPARAM) -> i32 {
    let defview_class = wide("SHELLDLL_DefView");
    let worker_class = wide("WorkerW");
    if !FindWindowExW(top, null_mut(), defview_class.as_ptr(), null()).is_null() {
        let next = FindWindowExW(null_mut(), top, worker_class.as_ptr(), null());
        *(lparam as *mut HWND) = next;
    }
    1 // keep enumerating
}
