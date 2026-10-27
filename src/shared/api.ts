import type {
  AppSettings,
  HotkeyStatus,
  LocationInfo,
  Note,
  NoteTemplate,
  UseICloudResult,
  VaultStatus
} from './types'

export interface VellumApi {
  notes: {
    list(): Promise<Note[]>
    get(id: string): Promise<Note | null>
    current(): Promise<Note | null>
    create(input?: { templateId?: string }): Promise<Note>
    update(
      id: string,
      patch: Partial<Pick<Note, 'markdown' | 'title' | 'pinned' | 'endedAt' | 'createdAt'>>
    ): Promise<Note | null>
    remove(id: string): Promise<void>
    setCurrent(id: string): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  app: {
    location(): Promise<LocationInfo | null>
    template(id?: string): Promise<NoteTemplate>
    setHotkey(accelerator: string): Promise<HotkeyStatus>
    minimize(): Promise<void>
    setAlwaysOnTop(value: boolean): Promise<void>
    focus(): Promise<void>
    hide(): Promise<void>
    quit(): Promise<void>
    exportNote(id: string): Promise<string | null>
    pickAttachment(): Promise<string | null>
    openSettings(): Promise<void>
    chooseVaultFolder(): Promise<string | null>
    useICloudVault(): Promise<UseICloudResult>
    revealNote(id: string): Promise<void>
    vaultStatus(): Promise<VaultStatus>
    /** The appearance the operating system currently uses. */
    systemTheme(): Promise<{ isDark: boolean }>
  }
  on: {
    newNote(cb: (templateId?: string) => void): () => void
    openSettings(cb: () => void): () => void
    noteChanged(cb: (noteId: string | null) => void): () => void
    settingsChanged(cb: (settings: AppSettings) => void): () => void
    locationChanged(cb: (location: LocationInfo | null) => void): () => void
    systemTheme(cb: (isDark: boolean) => void): () => void
  }
}
