; Hooks for the NSIS installer (bundle > windows > nsis > installerHooks).

!macro NSIS_HOOK_PREUNINSTALL
  ; Before removing the app, Clawd gives back everything he holds: the desktop icons he "ate"
  ; (they were only hidden) and the user's own mouse pointer.
  ExecWait '"$INSTDIR\clawd-pet.exe" --restore-all'
!macroend
