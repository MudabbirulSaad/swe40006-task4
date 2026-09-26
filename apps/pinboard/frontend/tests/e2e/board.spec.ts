import { expect, test } from '@playwright/test'

test('guest notes persist and can be arranged, edited and deleted', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Library')
  await page
    .getByLabel('Note', { exact: true })
    .fill('Return the books on Saturday.')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('note-card')).toHaveCount(1)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Library', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Arrange notes' }).click()
  await expect(page.getByTestId('note-card')).toHaveCSS('left', '24px')
  await page.getByRole('button', { name: 'Edit Library' }).click()
  await page
    .getByLabel('Note', { exact: true })
    .fill('Return the books on Sunday.')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Return the books on Sunday.')).toBeVisible()
  await page.getByLabel('Search notes').fill('unmatched')
  await expect(page.getByTestId('note-card')).toHaveCount(0)
  await page.getByLabel('Search notes').fill('')
  await page.getByRole('button', { name: 'Edit Library' }).click()
  await page.getByRole('button', { name: 'Delete note' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByTestId('note-card')).toHaveCount(0)
})

test('guest notes move to an account and remain private after logout', async ({
  page,
}) => {
  const username = `test_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  await page.goto('/')
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Account test')
  await page
    .getByLabel('Note', { exact: true })
    .fill('Keep this note after signing in.')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Sign in', exact: false }).click()
  await page.getByRole('button', { name: 'New here? Create account' }).click()
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page
    .getByLabel('Email', { exact: true })
    .fill(`${username}@example.com`)
  await page
    .getByLabel('Password', { exact: true })
    .fill('Browser-test-password-123')
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.getByTestId('note-card')).toHaveCount(1)
  await page.reload()
  await expect(page.getByTestId('note-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByTestId('note-card')).toHaveCount(0)
})

test('failed account saves retain the draft and show an error', async ({
  page,
}) => {
  const username = `failure_${Date.now()}`
  const session = await (await page.request.get('/api/auth/session')).json()
  const account = await page.request.post('/api/auth/register', {
    headers: { 'X-CSRFToken': session.csrf_token },
    data: {
      username,
      email: `${username}@example.com`,
      password: 'Browser-test-password-123',
    },
  })
  expect(account.status()).toBe(201)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await page.getByRole('button', { name: 'New note', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Draft')
  await page.getByLabel('Note', { exact: true }).fill('Do not lose this text.')
  await page.route('**/api/notes', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Temporarily unavailable.' }),
      })
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Temporarily unavailable.',
  )
  await expect(page.getByLabel('Note', { exact: true })).toHaveValue(
    'Do not lose this text.',
  )
  await page.unroute('**/api/notes')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('note-card')).toHaveCount(1)
})
