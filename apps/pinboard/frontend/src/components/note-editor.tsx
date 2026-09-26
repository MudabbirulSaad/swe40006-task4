import { useState } from 'react'
import type { FormEvent } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './ui/dialog'
import { colors } from '@/lib/notes'
import type { Note } from '@/lib/notes'

export type Draft = Pick<Note, 'title' | 'body' | 'color' | 'pinned'>
type Props = {
  note: Note | null
  onClose: () => void
  onSave: (draft: Draft) => Promise<void>
  onDelete: () => Promise<void>
}

export function NoteEditor({ note, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<Draft>(
    note || { title: '', body: '', color: 'butter', pinned: false },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft.title.trim() && !draft.body.trim()) {
      setError('Write a title or a note.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSave(draft)
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save this note.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await onDelete()
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not delete this note.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        className={`editor note-${draft.color}`}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle>{note ? 'Edit note' : 'New note'}</DialogTitle>
        <DialogDescription className="sr-only">
          Add a title, write your note, and choose a colour.
        </DialogDescription>
        <form onSubmit={submit}>
          <label htmlFor="note-title">Title</label>
          <input
            id="note-title"
            autoFocus
            value={draft.title}
            maxLength={120}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
          <label htmlFor="note-body">Note</label>
          <textarea
            id="note-body"
            rows={7}
            value={draft.body}
            maxLength={10000}
            onChange={(event) =>
              setDraft({ ...draft, body: event.target.value })
            }
          />
          <fieldset className="colour-picker">
            <legend>Colour</legend>
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={color}
                aria-pressed={draft.color === color}
                className={`colour-swatch note-${color}`}
                onClick={() => setDraft({ ...draft, color })}
              >
                {draft.color === color && <Check size={16} />}
              </button>
            ))}
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {confirmDelete ? (
            <div className="delete-confirm">
              <span>Delete this note?</span>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={remove}
              >
                Delete
              </Button>
            </div>
          ) : (
            <div className="dialog-actions">
              {note && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Delete note"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={18} />
                </Button>
              )}
              <span className="spacer" />
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
