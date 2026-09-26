import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './ui/dialog'
import { api, setCsrf } from '@/lib/api'
import type { User } from '@/lib/notes'

export type Session = { user: User | null; csrf_token: string; title: string }

export function AuthDialog({
  onClose,
  onSession,
}: {
  onClose: () => void
  onSession: (session: Session) => Promise<void>
}) {
  const [register, setRegister] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const data = Object.fromEntries(new FormData(event.currentTarget))
    try {
      const bootstrap = await api<Session>('/api/auth/session')
      setCsrf(bootstrap.csrf_token)
      const session = await api<Session>(
        `/api/auth/${register ? 'register' : 'login'}`,
        'POST',
        data,
      )
      setCsrf(session.csrf_token)
      await onSession(session)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.')
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
      <DialogContent>
        <DialogTitle>
          {register ? 'Create account' : 'Welcome back'}
        </DialogTitle>
        <DialogDescription>
          Your browser notes will move with you.
        </DialogDescription>
        <form onSubmit={submit} className="auth-form">
          {register ? (
            <>
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_-]+"
                autoComplete="username"
              />
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
              />
            </>
          ) : (
            <>
              <label htmlFor="identifier">Username or email</label>
              <input
                id="identifier"
                name="identifier"
                required
                autoComplete="username"
              />
            </>
          )}
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={register ? 12 : 1}
            maxLength={128}
            autoComplete={register ? 'new-password' : 'current-password'}
          />
          {register && <p className="field-hint">At least 12 characters.</p>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button className="auth-submit" disabled={busy}>
            {busy ? 'One moment…' : register ? 'Create account' : 'Sign in'}
          </Button>
        </form>
        <button
          className="auth-switch"
          disabled={busy}
          onClick={() => {
            setRegister(!register)
            setError('')
          }}
        >
          {register
            ? 'Already have an account? Sign in'
            : 'New here? Create account'}
        </button>
      </DialogContent>
    </Dialog>
  )
}
