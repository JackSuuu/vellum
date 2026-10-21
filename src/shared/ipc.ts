/** IPC channel names, shared by main + preload to avoid typos. */
export const IPC = {
  // notes
  notesList: 'notes:list',
  notesGet: 'notes:get',
  notesCreate: 'notes:create',
  notesUpdate: 'notes:update',
  notesDelete: 'notes:delete',
  notesSetCurrent: 'notes:set-current',
  notesCurrent: 'notes:current',

  // settings
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  // app / shell
  appLocation: 'app:location',
  appTemplate: 'app:template',
  appSetHotkey: 'app:set-hotkey',
  appMinimize: 'app:minimize',
  appSetAlwaysOnTop: 'app:set-always-on-top',
  appFocus: 'app:focus',
  appHide: 'app:hide',
  appQuit: 'app:quit',
  appOpenSettings: 'app:open-settings',
  appExportNote: 'app:export-note',
  appPickAttachment: 'app:pick-attachment',
  appWindowInfo: 'app:window-info',
  appChooseFolder: 'app:choose-folder',
  appRevealNote: 'app:reveal-note',
  appVaultStatus: 'app:vault-status',

  // main -> renderer events
  eventNewNote: 'event:new-note',
  eventOpenSettings: 'event:open-settings',
  eventNoteChanged: 'event:note-changed',
  eventSettingsChanged: 'event:settings-changed',
  eventLocationChanged: 'event:location-changed'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
