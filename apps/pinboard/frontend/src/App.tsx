import { Component, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  ArrowRight,
  Download,
  LayoutGrid,
  LogOut,
  NotebookPen,
  Pin,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthDialog } from '@/components/auth-dialog'
import { NoteCard } from '@/components/note-card'
import { NoteEditor } from '@/components/note-editor'
import { useBoard } from '@/hooks/use-board'
import {
  arrangeNotes,
  CARD_HEIGHT,
  CARD_WIDTH,
  downloadNotes,
} from '@/lib/notes'
import type { Note } from '@/lib/notes'

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <main className="recovery">
        <h1>Let’s try that again.</h1>
        <p>Your saved notes are still there.</p>
        <Button onClick={() => location.reload()}>Reload</Button>
      </main>
    ) : (
      this.props.children
    )
  }
}

function Board() {
  const board = useBoard()
  const [query, setQuery] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [editor, setEditor] = useState<Note | 'new' | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const canvas = useRef<HTMLDivElement>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const visible = board.notes.filter(
    (note) =>
      (!pinnedOnly || note.pinned) &&
      `${note.title} ${note.body}`.toLowerCase().includes(query.toLowerCase()),
  )

  function dragEnd(event: DragEndEvent) {
    const note = board.notes.find((item) => item.id === event.active.id)
    if (note)
      board.move(note.id, note.x + event.delta.x, note.y + event.delta.y)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="wordmark">
          <span className="logo-mark">
            <NotebookPen size={20} />
          </span>
          {board.title}
          <span className="wordmark-dot">.</span>
        </a>
        <div className="account-controls">
          {board.user ? (
            <>
              <span className="username">{board.user.username}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                disabled={board.busy}
                onClick={() =>
                  void board.perform(async () => {
                    await board.logout()
                    setQuery('')
                    setPinnedOnly(false)
                  })
                }
              >
                <LogOut size={18} />
              </Button>
            </>
          ) : (
            <>
              <span className="guest-label">Guest</span>
              <Button variant="outline" onClick={() => setAuthOpen(true)}>
                Sign in <ArrowRight size={15} />
              </Button>
            </>
          )}
        </div>
      </header>
      <main>
        <section className="board-heading">
          <div>
            <h1>
              Your board<span className="heading-dot">.</span>
            </h1>
            <p className="board-description">
              {board.user
                ? 'Your private notes.'
                : 'On this browser, until you sign in.'}
            </p>
          </div>
          <Button
            className="new-note"
            disabled={board.disabled}
            onClick={() => setEditor('new')}
          >
            <Plus size={18} /> New note
          </Button>
        </section>
        <div className="board-toolbar">
          <div className="board-tabs" role="group" aria-label="Filter notes">
            <button
              aria-pressed={!pinnedOnly}
              className={!pinnedOnly ? 'selected' : ''}
              onClick={() => setPinnedOnly(false)}
            >
              All notes <span>{board.notes.length}</span>
            </button>
            <button
              aria-pressed={pinnedOnly}
              className={pinnedOnly ? 'selected' : ''}
              onClick={() => setPinnedOnly(true)}
            >
              <Pin size={14} /> Pinned
            </button>
          </div>
          <div className="board-tools">
            <label className="search-box">
              <Search size={16} />
              <span className="sr-only">Search notes</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notes"
              />
            </label>
            <span className="toolbar-divider" />
            <Button
              variant="ghost"
              aria-label="Arrange notes"
              disabled={board.disabled || !board.notes.length}
              onClick={() =>
                void board.perform(() =>
                  board.layout(
                    arrangeNotes(
                      board.notes,
                      canvas.current?.clientWidth || 375,
                    ),
                  ),
                )
              }
            >
              <LayoutGrid size={17} />
              <span className="tool-label">Arrange</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Export notes"
              disabled={!board.notes.length || board.disabled}
              onClick={() => downloadNotes(board.notes)}
            >
              <Download size={17} />
            </Button>
          </div>
        </div>
        {board.error && (
          <div className="notice" role="alert">
            <span>{board.error}</span>
            {board.importPending && (
              <Button
                size="sm"
                variant="outline"
                disabled={board.busy}
                onClick={() => void board.perform(board.syncAccount)}
              >
                Retry transfer
              </Button>
            )}
            <button
              aria-label="Dismiss message"
              onClick={() => board.setError('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="canvas-viewport" ref={canvas}>
          <DndContext sensors={sensors} onDragEnd={dragEnd}>
            <div
              className="canvas"
              style={{
                minWidth: Math.max(
                  0,
                  ...visible.map((note) => note.x + CARD_WIDTH + 24),
                ),
                minHeight: Math.max(
                  490,
                  ...visible.map((note) => note.y + CARD_HEIGHT + 64),
                ),
              }}
            >
              {!board.ready ? (
                <div className="empty-board" role="status">
                  Opening your board…
                </div>
              ) : visible.length ? (
                visible.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    disabled={board.disabled}
                    onEdit={() => setEditor(note)}
                    onMove={(x, y) => board.move(note.id, x, y)}
                    onPin={() => board.togglePin(note)}
                  />
                ))
              ) : (
                <div className="empty-board">
                  <div className="empty-note" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <h2>
                    {query || pinnedOnly
                      ? 'Nothing here yet'
                      : 'Start with a thought'}
                  </h2>
                  <p>
                    {query
                      ? 'Try a different search.'
                      : pinnedOnly
                        ? 'Pin a note to keep it close.'
                        : 'Add a note to get started.'}
                  </p>
                  {!query && !pinnedOnly && (
                    <Button
                      variant="outline"
                      disabled={board.disabled}
                      onClick={() => setEditor('new')}
                    >
                      <Plus size={16} /> Add your first note
                    </Button>
                  )}
                </div>
              )}
            </div>
          </DndContext>
        </div>
        <footer className="board-footer">
          <span className="save-state" role="status">
            <span className={board.busy ? 'status-dot saving' : 'status-dot'} />
            {board.busy
              ? 'Saving…'
              : board.error
                ? 'Check the message above'
                : board.user
                  ? 'Saved to your account'
                  : 'Saved on this browser'}
          </span>
          <span className="footer-hint">Drag to move · Arrange to tidy up</span>
        </footer>
      </main>
      {editor && (
        <NoteEditor
          key={editor === 'new' ? 'new' : editor.id}
          note={editor === 'new' ? null : editor}
          onClose={() => setEditor(null)}
          onSave={(draft) =>
            board.saveNote(draft, editor === 'new' ? null : editor)
          }
          onDelete={() =>
            editor === 'new' ? Promise.resolve() : board.removeNote(editor)
          }
        />
      )}
      {authOpen && (
        <AuthDialog
          onClose={() => setAuthOpen(false)}
          onSession={board.applySession}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <Board />
    </ErrorBoundary>
  )
}
