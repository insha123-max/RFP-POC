import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [remember, setRemember]   = useState(false)
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(false)
  const [mounted, setMounted]     = useState(false)

  useEffect(() => { const t = setTimeout(() => setMounted(true), 20); return () => clearTimeout(t) }, [])
  useEffect(() => { if (user) navigate('/', { replace: true }) }, [user, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const err = await login(email.trim(), password)
    setLoading(false)
    if (err) setError(err)
    else navigate('/', { replace: true })
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.7rem 0.9rem',
    border: '1.5px solid #E2E8F0', borderRadius: 8,
    fontSize: '0.9rem', color: '#1A1A2E',
    outline: 'none', fontFamily: 'inherit',
    background: '#fff', transition: 'border-color .15s, box-shadow .15s',
  }

  const labelStyle = {
    display: 'block', fontSize: '0.85rem',
    fontWeight: 600, color: '#1A1A2E', marginBottom: 6,
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F3F4F6',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '1.5rem 1rem',
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity .4s ease, transform .4s ease',
      }}>
        <div style={{
          background: '#fff', borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          padding: '2.25rem 2rem',
        }}>
          {/* Logo + Title */}
          <div style={{ marginBottom: '1.75rem', textAlign: 'center' }}>
            <img
              src="/logo.png"
              alt="BidEval AI"
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', marginBottom: '1rem' }}
            />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
              Welcome back
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: 0 }}>
              Sign in to your BidEval AI workspace.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: '1.25rem', padding: '0.7rem 1rem',
              background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 8, color: '#DC2626',
              fontSize: '0.82rem', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Email */}
            <div>
              <label style={labelStyle}>Work email</label>
              <input
                type="email"
                placeholder="you@globallogic.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required autoFocus
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#F26522'; e.target.style.boxShadow = '0 0 0 3px rgba(242,101,34,0.12)' }}
                onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{ ...inputStyle, paddingRight: '2.75rem' }}
                  onFocus={e => { e.target.style.borderColor = '#F26522'; e.target.style.boxShadow = '0 0 0 3px rgba(242,101,34,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                    color: '#94A3B8', display: 'flex', alignItems: 'center',
                  }}
                  tabIndex={-1}
                >
                  {showPass ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Remember me + Forgot password */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.85rem', color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: '#F26522', cursor: 'pointer' }}
                />
                Remember me
              </label>
              <span style={{ fontSize: '0.85rem', color: '#F26522', fontWeight: 500, cursor: 'pointer' }}>
                Forgot password?
              </span>
            </div>

            {/* Sign in button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '0.8rem',
                background: loading ? '#f59a6b' : '#F26522',
                color: '#fff', border: 'none', borderRadius: 8,
                fontSize: '0.95rem', fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background .15s',
                marginTop: 4,
              }}
              onMouseEnter={e => { if (!loading) e.target.style.background = '#D4541A' }}
              onMouseLeave={e => { if (!loading) e.target.style.background = '#F26522' }}
            >
              {loading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Signing in…
                </>
              ) : 'Sign in'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '1.5rem 0' }}>
            <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
            <span style={{ fontSize: '0.8rem', color: '#9CA3AF', whiteSpace: 'nowrap' }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
          </div>

          {/* SSO button */}
          <button style={{
            width: '100%', padding: '0.75rem',
            background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 8,
            fontSize: '0.9rem', fontWeight: 500, color: '#1A1A2E',
            cursor: 'pointer', transition: 'border-color .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#D1D5DB'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#E2E8F0'}
          >
            Single sign-on (SSO)
          </button>

          {/* Footer */}
          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: '#6B7280' }}>
            Don't have access?{' '}
            <Link to="/signup" style={{ color: '#F26522', fontWeight: 600, textDecoration: 'none' }}>
              Create an account
            </Link>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
