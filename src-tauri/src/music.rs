//! Windows only: is a media session (Spotify, a browser tab, a player) playing right now?

use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSessionManager as Manager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
};

/// Blocking (a few ms); called from the monitor watcher thread. Errors count as "not playing".
pub fn playing() -> bool {
    let check = || -> windows::core::Result<bool> {
        let sessions = Manager::RequestAsync()?.join()?.GetSessions()?;
        for session in sessions {
            if session.GetPlaybackInfo()?.PlaybackStatus()? == Status::Playing {
                return Ok(true);
            }
        }
        Ok(false)
    };
    check().unwrap_or(false)
}
