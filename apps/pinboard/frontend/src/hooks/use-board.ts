import { useEffect, useState } from 'react'
import { api, setCsrf } from '@/lib/api'
import {
  guestImportId,
  readGuestNotes,
  STORAGE_KEY,
  unconfirmedGuestNotes,
  writeGuestNotes,
} from '@/lib/notes'
import type { Note, User } from '@/lib/notes'
import type { Draft } from '@/components/note-editor'
import type { Session } from '@/components/auth-dialog'

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong.'

export function useBoard() {
  const [notes, setNotes] = useState<Note[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [title, setTitle] = useState('Pinboard')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [storageBlocked, setStorageBlocked] = useState(false)
  const [importPending, setImportPending] = useState(false)

  async function syncAccount() {
    setNotes((await api<{ notes: Note[] }>('/api/notes')).notes)
    const guests = readGuestNotes()
    if (!guests.length) {
      setImportPending(false)
      return
    }
    const result = await api<{ notes: Note[]; confirmed_ids: string[] }>(
      '/api/notes/import',
      'POST',
      {
        notes: guests.map((note) => ({ ...note, id: guestImportId(note) })),
      },
    )
    // Re-read storage: another tab may have edited a guest note during the request.
    const remaining = unconfirmedGuestNotes(
      readGuestNotes(),
      result.confirmed_ids,
    )
    writeGuestNotes(remaining)
    setNotes(result.notes)
    setImportPending(remaining.length > 0)
    if (remaining.length)
      setError(
        'Some browser notes changed during transfer. Retry to save them.',
      )
  }

  async function applySession(session: Session) {
    setCsrf(session.csrf_token)
    setUser(session.user)
    setTitle(session.title)
    setError('')
    if (session.user) {
      setNotes([])
      try {
        await syncAccount()
      } catch (cause) {
        setImportPending(true)
        setError(errorMessage(cause))
      }
    }
  }

  useEffect(() => {
    let active = true
    async function start() {
      try {
        setNotes(readGuestNotes())
      } catch (cause) {
        setStorageBlocked(true)
        setError(errorMessage(cause))
      }
      try {
        const session = await api<Session>('/api/auth/session')
        if (active) await applySession(session)
      } catch {
        if (active)
          setError(
            'Accounts are unavailable. Guest notes stay on this browser.',
          )
      } finally {
        if (active) setReady(true)
      }
    }
    void start()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || user) return
      try {
        setNotes(readGuestNotes())
      } catch (cause) {
        setStorageBlocked(true)
        setError(errorMessage(cause))
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [user])

  function saveGuest(next: Note[]) {
    if (storageBlocked)
      throw new Error(
        'Browser storage is unavailable. Existing notes have been kept.',
      )
    try {
      writeGuestNotes(next)
    } catch {
      throw new Error(
        'This browser could not save your notes. Free some storage and try again.',
      )
    }
    setNotes(next)
  }

  async function saveNote(draft: Draft, existing: Note | null) {
    if (user) {
      const response = await api<{ note: Note }>(
        existing ? `/api/notes/${existing.id}` : '/api/notes',
        existing ? 'PATCH' : 'POST',
        {
          ...draft,
          ...(existing
            ? {}
            : {
                x: 24 + (notes.length % 5) * 30,
                y: 24 + (notes.length % 5) * 30,
              }),
        },
      )
      setNotes((current) =>
        existing
          ? current.map((note) =>
              note.id === existing.id ? response.note : note,
            )
          : [...current, response.note],
      )
    } else {
      const timestamp = new Date().toISOString()
      const note: Note = {
        id: crypto.randomUUID(),
        x: 24 + (notes.length % 5) * 30,
        y: 24 + (notes.length % 5) * 30,
        created_at: timestamp,
        ...(existing || {}),
        ...draft,
        title: draft.title.trim(),
        updated_at: timestamp,
      }
      saveGuest(
        existing
          ? notes.map((item) => (item.id === existing.id ? note : item))
          : [...notes, note],
      )
    }
    setError('')
  }

  async function removeNote(note: Note) {
    if (user) {
      await api(`/api/notes/${note.id}`, 'DELETE')
      setNotes(notes.filter((item) => item.id !== note.id))
    } else saveGuest(notes.filter((item) => item.id !== note.id))
  }

  async function perform(operation: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await operation()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function layout(next: Note[]) {
    if (user) {
      const result = await api<{ notes: Note[] }>(
        '/api/notes/layout',
        'PATCH',
        {
          positions: next.map(({ id, x, y }) => ({ id, x, y })),
        },
      )
      setNotes(result.notes)
    } else
      saveGuest(
        next.map((note) => ({ ...note, updated_at: new Date().toISOString() })),
      )
  }

  function move(id: string, x: number, y: number) {
    void perform(() =>
      layout(
        notes.map((note) =>
          note.id === id
            ? {
                ...note,
                x: Math.min(100000, Math.max(0, x)),
                y: Math.min(100000, Math.max(0, y)),
              }
            : note,
        ),
      ),
    )
  }

  function togglePin(note: Note) {
    void perform(async () => {
      if (user) {
        const result = await api<{ note: Note }>(
          `/api/notes/${note.id}`,
          'PATCH',
          { pinned: !note.pinned },
        )
        setNotes(
          notes.map((item) => (item.id === note.id ? result.note : item)),
        )
      } else
        saveGuest(
          notes.map((item) =>
            item.id === note.id
              ? {
                  ...item,
                  pinned: !item.pinned,
                  updated_at: new Date().toISOString(),
                }
              : item,
          ),
        )
    })
  }

  async function logout() {
    const session = await api<Session>('/api/auth/logout', 'POST')
    setCsrf(session.csrf_token)
    setUser(null)
    setNotes([])
    setImportPending(false)
    setNotes(readGuestNotes())
  }

  return {
    notes,
    user,
    title,
    ready,
    busy,
    error,
    setError,
    importPending,
    disabled: busy || !ready || (!user && storageBlocked),
    applySession,
    syncAccount,
    saveNote,
    removeNote,
    perform,
    layout,
    move,
    togglePin,
    logout,
  }
}
