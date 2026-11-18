'use client'

import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { BrandLogo } from '@/app/brand-logo'

type RequestedRole = 'guru' | 'sarpras' | 'kepsek'

function translateAuthError(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'Email atau kata sandi salah.'
  if (normalized.includes('user already registered')) return 'Email ini sudah terdaftar.'
  if (normalized.includes('email not confirmed')) return 'Email belum dikonfirmasi.'
  if (normalized.includes('email rate limit exceeded')) return 'Batas pengiriman email tercapai. Coba lagi nanti.'
  if (normalized.includes('invalid email') || normalized.includes('email address is invalid')) return 'Format email tidak valid.'
  if (normalized.includes('password') && normalized.includes('at least')) return 'Kata sandi terlalu pendek. Gunakan minimal 8 karakter.'
  return message
}

export function AuthView({ configurationError }: { configurationError: string }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage('')
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim().toLowerCase()
    const password = String(form.get('password') ?? '')
    let error: string | null = null

    if (mode === 'signup') {
      const fullName = String(form.get('fullName') ?? '').trim()
      const requestedRole = String(form.get('requestedRole') ?? 'guru') as RequestedRole
      const result = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, requested_role: requestedRole } },
      })
      error = result.error?.message ?? null
      if (!error) {
        setMessage(result.data.session
          ? 'Pendaftaran tersimpan. Akun menunggu persetujuan Admin sebelum dapat digunakan.'
          : 'Periksa email untuk konfirmasi. Setelah itu, akun menunggu persetujuan Admin.')
      }
    } else {
      const result = await supabase.auth.signInWithPassword({ email, password })
      error = result.error?.message ?? null
    }

    if (error) setMessage(translateAuthError(error))
    setBusy(false)
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-heading">
        <div className="auth-brand"><BrandLogo className="brand-logo auth-brand-logo" /><div><strong>SIRANA</strong><span>Habibi Bina Cendikia</span></div></div>
        <p className="eyebrow">LAYANAN SARANA DAN PRASARANA</p>
        <h1 id="auth-heading">{mode === 'login' ? 'Masuk ke SIRANA' : 'Daftar akun'}</h1>
        <p className="auth-description">{mode === 'login'
          ? 'Gunakan akun sekolah yang sudah terdaftar untuk mengakses layanan.'
          : 'Pendaftaran akan ditinjau Admin sebelum akun dapat digunakan.'}</p>
        {configurationError && <p className="auth-message auth-error" role="alert">{configurationError}</p>}
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && <>
            <label className="field"><span>Nama lengkap</span><input name="fullName" autoComplete="name" required /></label>
            <label className="field"><span>Daftar sebagai</span><select name="requestedRole" defaultValue="guru"><option value="guru">Guru / Wali Kelas</option><option value="sarpras">Wakasek Sarpras</option><option value="kepsek">Kepala Sekolah</option></select></label>
          </>}
          <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
          <label className="field"><span>Kata sandi</span><input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required /></label>
          {message && <p className="auth-message" role="status">{message}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={busy || !supabase}>{busy ? 'Memproses…' : mode === 'login' ? 'Masuk' : 'Kirim pendaftaran'}</button>
        </form>
        <p className="auth-switch">{mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
          <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>{mode === 'login' ? 'Daftar' : 'Masuk'}</button>
        </p>
      </section>
    </main>
  )
}
