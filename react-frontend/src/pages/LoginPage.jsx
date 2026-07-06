import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const err = await login(email.trim(), password)
    setLoading(false)
    if (err) {
      setError(err)
    } else {
      navigate('/', { replace: true })
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '0.7rem 0.875rem',
    border: '1.5px solid #E2E8F0', borderRadius: 10,
    fontSize: '0.9rem', color: '#1E293B',
    outline: 'none', transition: 'border-color .15s',
    fontFamily: 'inherit', background: '#fff',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #0F2557 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(59,111,232,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,111,232,0.06) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, margin: '0 1rem' }}>
        <div style={{
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 20,
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #1E3A8A 0%, #3B6FE8 100%)',
            padding: '2rem 2rem 1.75rem',
            textAlign: 'center',
          }}>
            <img
              src="/logo.png"
              alt="BidEval AI"
              style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.25)', marginBottom: '0.875rem' }}
            />
            <div style={{ color: '#fff', fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              BidEval AI
            </div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontWeight: 500, marginTop: 4 }}>
              Procurement Intelligence Platform
            </div>
          </div>

          {/* Form */}
          <div style={{ padding: '2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>
                Welcome back
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748B' }}>
                Sign in with your GlobalLogic credentials
              </div>
            </div>

            {error && (
              <div style={{
                marginBottom: '1.25rem',
                padding: '0.7rem 1rem',
                background: '#FEF2F2', border: '1px solid #FECACA',
                borderRadius: 10, color: '#DC2626',
                fontSize: '0.82rem', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                  Email address
                </label>
                <input
                  type="email"
                  placeholder="you@globallogic.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#3B6FE8'}
                  onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                />
              </div>

              {/* Password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Enter password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={{ ...inputStyle, paddingRight: '2.75rem' }}
                    onFocus={e => e.target.style.borderColor = '#3B6FE8'}
                    onBlur={e => e.target.style.borderColor = '#E2E8F0'}
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

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  marginTop: 4,
                  width: '100%', padding: '0.75rem',
                  background: loading ? '#93AEED' : '#3B6FE8',
                  color: '#fff', border: 'none', borderRadius: 10,
                  fontSize: '0.9rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'background .15s',
                }}
              >
                {loading ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Signing in…
                  </>
                ) : 'Sign In'}
              </button>
            </form>

            <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.82rem', color: '#64748B' }}>
              Don't have an account?{' '}
              <Link to="/signup" style={{ color: '#3B6FE8', fontWeight: 700, textDecoration: 'none' }}>Sign up</Link>
            </div>

            <div style={{
              marginTop: '1rem', paddingTop: '1rem',
              borderTop: '1px solid #F1F5F9',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                Access restricted to GlobalLogic employees
              </span>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem' }}>
          Powered by GlobalLogic · BidEval AI
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
