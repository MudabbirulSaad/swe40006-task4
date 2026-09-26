import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  GripHorizontal,
  Pin,
} from 'lucide-react'
import { Button } from './ui/button'
import type { Note } from '@/lib/notes'

type Props = {
  note: Note
  disabled: boolean
  onEdit: () => void
  onMove: (x: number, y: number) => void
  onPin: () => void
}

export function NoteCard({ note, disabled, onEdit, onMove, onPin }: Props) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    isDragging,
    transform,
  } = useDraggable({ id: note.id, disabled })
  const [moving, setMoving] = useState(false)
  const directions = [
    { Icon: ArrowLeft, dx: -24, dy: 0, label: 'left' },
    { Icon: ArrowUp, dx: 0, dy: -24, label: 'up' },
    { Icon: ArrowDown, dx: 0, dy: 24, label: 'down' },
    { Icon: ArrowRight, dx: 24, dy: 0, label: 'right' },
  ]

  return (
    <article
      ref={setNodeRef}
      className={`note note-${note.color} ${isDragging ? 'is-dragging' : ''}`}
      style={{
        left: note.x,
        top: note.y,
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
      }}
      aria-label={note.title || 'Untitled note'}
      data-testid="note-card"
    >
      <div className="note-toolbar">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={disabled}
          className="drag-handle"
          aria-label={`Move ${note.title || 'note'}`}
        >
          <GripHorizontal size={20} />
        </button>
        <button
          className={`note-pin ${note.pinned ? 'is-pinned' : ''}`}
          aria-pressed={note.pinned}
          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
          onClick={onPin}
          disabled={disabled}
        >
          <Pin size={15} />
        </button>
      </div>
      <button
        className="note-content"
        onClick={onEdit}
        disabled={disabled}
        aria-label={`Edit ${note.title || 'note'}`}
      >
        {note.title && <h2>{note.title}</h2>}
        <p>{note.body}</p>
      </button>
      <div className="note-footer">
        <span>
          {new Date(note.updated_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
        </span>
        <button
          className="move-toggle"
          onClick={() => setMoving(!moving)}
          aria-expanded={moving}
        >
          Move
        </button>
      </div>
      {moving && (
        <div className="move-controls" aria-label="Move note">
          {directions.map(({ Icon, dx, dy, label }) => (
            <Button
              key={label}
              variant="ghost"
              size="icon"
              aria-label={`Move ${label}`}
              disabled={disabled}
              onClick={() =>
                onMove(Math.max(0, note.x + dx), Math.max(0, note.y + dy))
              }
            >
              <Icon size={16} />
            </Button>
          ))}
        </div>
      )}
    </article>
  )
}
