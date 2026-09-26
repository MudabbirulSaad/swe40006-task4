let csrfToken = ''

export function setCsrf(token: string) {
  csrfToken = token
}

export async function api<T>(
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(method !== 'GET' ? { 'X-CSRFToken': csrfToken } : {}),
      },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    })
  } catch {
    throw new Error('Could not connect. Your changes have not been saved.')
  }
  if (response.status === 204) return undefined as T
  const result = await response
    .json()
    .catch(() => ({ error: 'The server could not complete that request.' }))
  if (!response.ok)
    throw new Error(result.error || 'Something went wrong. Try again.')
  return result as T
}
