export const colors = [
  'butter',
  'sage',
  'rose',
  'sky',
  'lavender',
  'paper',
] as const
export type NoteColor = (typeof colors)[number]
export type Note = {
  id: string
  title: string
  body: string
  color: NoteColor
  pinned: boolean
  x: number
  y: number
  created_at: string
  updated_at: string
}
export type User = { id: number; username: string; email: string }
export const STORAGE_KEY = 'pinboard.guest.v1'
export const CARD_WIDTH = 264
export const CARD_HEIGHT = 246

export function readGuestNotes(
  storage: Pick<Storage, 'getItem'> = localStorage,
): Note[] {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return []
  const data = JSON.parse(raw)
  if (data.version !== 1 || !Array.isArray(data.notes))
    throw new Error(
      'Browser notes could not be read. They have been kept on this device.',
    )
  for (const note of data.notes) {
    if (
      !note ||
      typeof note.id !== 'string' ||
      typeof note.title !== 'string' ||
      typeof note.body !== 'string' ||
      !colors.includes(note.color) ||
      typeof note.pinned !== 'boolean' ||
      !Number.isFinite(note.x) ||
      !Number.isFinite(note.y)
    ) {
      throw new Error(
        'Browser notes could not be read. They have been kept on this device.',
      )
    }
  }
  return data.notes
}

export function writeGuestNotes(
  notes: Note[],
  storage: Pick<Storage, 'setItem'> = localStorage,
) {
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, notes }))
}

export function guestImportId(note: Note) {
  return `${note.id}:${note.updated_at}`
}

export function unconfirmedGuestNotes(notes: Note[], confirmedIds: string[]) {
  const confirmed = new Set(confirmedIds)
  return notes.filter((note) => !confirmed.has(guestImportId(note)))
}

export function arrangeNotes(notes: Note[], width: number): Note[] {
  const columns = Math.max(1, Math.floor((width - 48 + 24) / (CARD_WIDTH + 24)))
  const sorted = [...notes].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  )
  return sorted.map((note, index) => ({
    ...note,
    x: 24 + (index % columns) * (CARD_WIDTH + 24),
    y: 24 + Math.floor(index / columns) * (CARD_HEIGHT + 24),
  }))
}

export function exportBoard(notes: Note[]) {
  return { schema_version: 1, exported_at: new Date().toISOString(), notes }
}

export function downloadNotes(notes: Note[]) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(exportBoard(notes), null, 2)], {
      type: 'application/json',
    }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'pinboard-notes.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
