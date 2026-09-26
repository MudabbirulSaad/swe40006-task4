import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  arrangeNotes,
  exportBoard,
  guestImportId,
  readGuestNotes,
  STORAGE_KEY,
  unconfirmedGuestNotes,
  writeGuestNotes,
} from '../../src/lib/notes.ts'
import type { Note } from '../../src/lib/notes.ts'

const sample: Note = {
  id: 'guest-one',
  title: 'Library',
  body: 'Return the books on Saturday.',
  color: 'butter',
  pinned: false,
  x: 60,
  y: 40,
  created_at: '2026-09-26T00:00:00.000Z',
  updated_at: '2026-09-26T00:00:00.000Z',
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

test('a new browser starts with an empty board', () => {
  assert.deepEqual(readGuestNotes(memoryStorage()), [])
})

test('guest notes survive a fresh read of browser storage', () => {
  const storage = memoryStorage()
  writeGuestNotes([sample], storage)
  assert.deepEqual(readGuestNotes(storage), [sample])
})

test('damaged browser data is retained rather than silently overwritten', () => {
  const storage = memoryStorage()
  storage.setItem(STORAGE_KEY, '{broken')
  assert.throws(() => readGuestNotes(storage))
  assert.equal(storage.getItem(STORAGE_KEY), '{broken')
})

test('an unsupported browser format is rejected', () => {
  const storage = memoryStorage()
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, notes: [] }))
  assert.throws(() => readGuestNotes(storage), /kept/)
})

test('failed browser writes propagate instead of reporting success', () => {
  assert.throws(
    () =>
      writeGuestNotes([sample], {
        setItem: () => {
          throw new Error('Quota exceeded')
        },
      }),
    /Quota/,
  )
})

test('Arrange makes one column on mobile and preserves content', () => {
  const notes = [sample, { ...sample, id: 'second' }]
  const result = arrangeNotes(notes, 343)
  assert.equal(result[0].x, result[1].x)
  assert.ok(result[1].y >= result[0].y + 246)
  assert.equal(result[0].body, sample.body)
  assert.equal(notes[0].x, 60)
})

test('Arrange places pinned notes first and uses multiple desktop columns', () => {
  const result = arrangeNotes(
    [sample, { ...sample, id: 'pinned', pinned: true }],
    1200,
  )
  assert.equal(result[0].id, 'pinned')
  assert.ok(result[1].x > result[0].x)
  assert.equal(result[1].y, result[0].y)
})

test('only confirmed versions are removed after transfer', () => {
  const changed = {
    ...sample,
    body: 'Return the books on Sunday.',
    updated_at: '2026-09-26T00:01:00.000Z',
  }
  assert.deepEqual(unconfirmedGuestNotes([changed], [guestImportId(sample)]), [
    changed,
  ])
  assert.deepEqual(unconfirmedGuestNotes([sample], [guestImportId(sample)]), [])
})

test('retry IDs are stable until the note changes', () => {
  assert.equal(guestImportId(sample), guestImportId({ ...sample }))
  assert.notEqual(
    guestImportId(sample),
    guestImportId({ ...sample, updated_at: 'later' }),
  )
})

test('exports have the schema consumed by the standalone CLI', () => {
  const result = exportBoard([sample])
  assert.equal(result.schema_version, 1)
  assert.deepEqual(result.notes, [sample])
  assert.ok(Date.parse(result.exported_at))
})
