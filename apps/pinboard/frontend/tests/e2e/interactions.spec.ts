import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function capture(page: Page, info: TestInfo, name: string) {
  const directory = process.env.SCREENSHOT_DIR
  if (!directory) return
  await mkdir(directory, { recursive: true })
  await page.screenshot({
    path: join(directory, `${info.project.name}-${name}.png`),
    fullPage: true,
  })
}

async function addNote(
  page: Page,
  title: string,
  body: string,
  color = 'butter',
) {
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill(title)
  await page.getByLabel('Note', { exact: true }).fill(body)
  await page.getByRole('button', { name: color, exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
}

async function browserNotes(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('pinboard.guest.v1') || '{"notes":[]}')
        .notes,
  )
}

test('notes support pointer, keyboard and touch movement, filters and export', async ({
  page,
  isMobile,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(
    page.getByRole('button', { name: 'New note', exact: true }),
  ).toBeEnabled()
  await capture(page, info, 'empty')
  await addNote(
    page,
    'Before the demo',
    'Check the public link. Keep the export as a backup.',
    'sage',
  )
  const card = page.getByTestId('note-card')
  const handle = page.getByRole('button', {
    name: 'Move Before the demo',
    exact: true,
  })
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  const x = box!.x + box!.width / 2
  const y = box!.y + box!.height / 2
  if (isMobile) {
    const input = await page.context().newCDPSession(page)
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    })
    for (const delta of [8, 16, 24]) {
      await input.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + delta, y: y + delta }],
      })
    }
    await input.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await input.detach()
  } else {
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 24, y + 24, { steps: 6 })
    await page.mouse.up()
  }
  await expect
    .poll(async () => (await browserNotes(page))[0].x)
    .toBeGreaterThan(24)
  const movedX = (await browserNotes(page))[0].x
  await handle.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  await expect
    .poll(async () => (await browserNotes(page))[0].x)
    .toBeGreaterThan(movedX)
  await card.getByRole('button', { name: 'Move', exact: true }).click()
  await card.getByRole('button', { name: 'Move down', exact: true }).click()
  await card.getByRole('button', { name: 'Move', exact: true }).click()
  const saved = await browserNotes(page)
  await page.reload()
  await expect(card).toHaveCSS('left', `${saved[0].x}px`)
  await expect(card).toHaveCSS('top', `${saved[0].y}px`)
  await card.getByRole('button', { name: 'Pin note', exact: true }).click()
  await addNote(
    page,
    'Saturday',
    'Library, groceries, then a walk by the river.',
    'butter',
  )
  await addNote(
    page,
    'A small idea',
    'Keep one quiet hour for reading each morning.',
    'rose',
  )
  await page.getByRole('button', { name: 'Arrange notes' }).click()
  await capture(page, info, 'board')
  const width = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }))
  expect(width.page).toBeLessThanOrEqual(width.viewport)
  await page.getByRole('button', { name: 'Pinned', exact: true }).click()
  await expect(card).toHaveCount(1)
  await page.getByRole('button', { name: /All notes/ }).click()
  await page.getByLabel('Search notes').fill('river')
  await expect(card).toHaveCount(1)
  await page.getByLabel('Search notes').fill('')
  await page
    .getByRole('button', { name: 'Edit Before the demo', exact: true })
    .click()
  await capture(page, info, 'editor')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export notes' }).click()
  const download = await downloadPromise
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(exported.schema_version).toBe(1)
  expect(exported.notes).toHaveLength(3)
  expect(
    exported.notes.filter((note: { pinned: boolean }) => note.pinned),
  ).toHaveLength(1)
  expect(errors).toEqual([])
})

test('a lost transfer response retains guest notes and retry does not duplicate them', async ({
  page,
}, info) => {
  const username = `retry_${Date.now()}_${info.project.name}`
  const password = 'Browser-test-password-123'
  await page.goto('/')
  await addNote(
    page,
    'Transfer check',
    'Keep this note even when the response is interrupted.',
  )
  await page.route('**/api/notes/import', async (route) => {
    const response = await route.fetch()
    expect(response.status()).toBe(200)
    await route.fulfill({
      status: 503,
      json: { error: 'Transfer interrupted. Your browser notes are safe.' },
    })
  })
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
  await page.getByRole('button', { name: 'New here? Create account' }).click()
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page
    .getByLabel('Email', { exact: true })
    .fill(`${username}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('Transfer interrupted.')
  expect(await browserNotes(page)).toHaveLength(1)
  expect(
    (await (await page.request.get('/api/notes')).json()).notes,
  ).toHaveLength(1)
  await capture(page, info, 'transfer-retry')
  await page.unroute('**/api/notes/import')
  await page.getByRole('button', { name: 'Retry transfer' }).click()
  await expect(page.getByTestId('note-card')).toHaveCount(1)
  await expect.poll(async () => (await browserNotes(page)).length).toBe(0)
  for (const identifier of [username, `${username}@example.com`]) {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByTestId('note-card')).toHaveCount(0)
    await page.getByRole('button', { name: 'Sign in', exact: false }).click()
    await page.getByLabel('Username or email').fill(identifier)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Sign in', exact: true })
      .click()
    await expect(page.getByTestId('note-card')).toHaveCount(1)
  }
  await page.reload()
  await expect(page.getByTestId('note-card')).toHaveCount(1)
})
