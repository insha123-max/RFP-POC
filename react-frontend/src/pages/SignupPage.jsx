import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function SignupPage() {
  const { user, signup } = useAuth()
  const navigate = useNavigate()

  const [name, setName]           = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [showConf, setShowConf]   = useState(false)
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  const passwordStrength = (() => {
    if (!password) return null
    if (password.length < 8) return { level: 0, label: 'Too short', color: '#EF4444' }
    let score = 0
    if (password.length >= 10) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    if (score <= 1) return { level: 1, label: 'Weak', color: '#F97316' }
    if (score === 2) return { level: 2, label: 'Fair', color: '#EAB308' }
    if (score === 3) return { level: 3, label: 'Good', color: '#22C55E' }
    return { level: 4, label: 'Strong', color: '#16A34A' }
  })()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length > 72) { setError('Password must be 72 characters or fewer.'); return }
    setLoading(true)
    const err = await signup(name, email, password)
    setLoading(false)
    if (err) { setError(err); return }
    navigate('/', { replace: true })
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
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #0F2557 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '1.5rem 1rem',
    }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(59,111,232,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,111,232,0.06) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 440 }}>
        <div style={{ background: 'rgba(255,255,255,0.97)', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{ background: 'linear-gradient(135deg, #1E3A8A 0%, #3B6FE8 100%)', padding: '1.75rem 2rem', textAlign: 'center' }}>
            <img src="/logo.png" alt="BidEval AI" style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.25)', marginBottom: '0.75rem' }} />
            <div style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Create your account</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', marginTop: 3 }}>BidEval AI · GlobalLogic</div>
          </div>

          {/* Form */}
          <div style={{ padding: '2rem' }}>
            {error && (
              <div style={{ marginBottom: '1.25rem', padding: '0.7rem 1rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, color: '#DC2626', fontSize: '0.82rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* Full name */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Full name</label>
                <input
                  type="text"
                  placeholder="Jane Smith"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  autoFocus
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#3B6FE8'}
                  onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                />
              </div>

              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Email address</label>
                <input
                  type="email"
                  placeholder="you@globallogic.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = '#3B6FE8'}
                  onBlur={e => {
                    e.target.style.borderColor = '#E2E8F0'
                    if (email && !email.toLowerCase().endsWith('@globallogic.com')) {
                      setError('Only @globallogic.com email addresses are allowed.')
                    } else {
                      setError(null)
                    }
                  }}
                />
                {email && !email.toLowerCase().endsWith('@globallogic.com') && (
                  <div style={{ marginTop: 5, fontSize: '0.72rem', color: '#F97316', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    Must be a @globallogic.com address
                  </div>
                )}
              </div>

              {/* Password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={{ ...inputStyle, paddingRight: '2.75rem' }}
                    onFocus={e => e.target.style.borderColor = '#3B6FE8'}
                    onBlur={e => e.target.style.borderColor = '#E2E8F0'}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} tabIndex={-1} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8', display: 'flex', alignItems: 'center' }}>
                    {showPass
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
                {/* Strength bar */}
                {passwordStrength && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                      {[1,2,3,4].map(i => (
                        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= passwordStrength.level ? passwordStrength.color : '#E2E8F0', transition: 'background .2s' }} />
                      ))}
                    </div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: passwordStrength.color }}>{passwordStrength.label}</span>
                  </div>
                )}
              </div>

              {/* Confirm password */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: 6 }}>Confirm password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConf ? 'text' : 'password'}
                    placeholder="Re-enter password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    style={{ ...inputStyle, paddingRight: '2.75rem', borderColor: confirm && confirm !== password ? '#FECACA' : '#E2E8F0' }}
                    onFocus={e => e.target.style.borderColor = confirm && confirm !== password ? '#FECACA' : '#3B6FE8'}
                    onBlur={e => e.target.style.borderColor = confirm && confirm !== password ? '#FECACA' : '#E2E8F0'}
                  />
                  <button type="button" onClick={() => setShowConf(v => !v)} tabIndex={-1} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#94A3B8', display: 'flex', alignItems: 'center' }}>
                    {showConf
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
                {confirm && confirm !== password && (
                  <div style={{ marginTop: 5, fontSize: '0.72rem', color: '#EF4444', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    Passwords do not match
                  </div>
                )}
                {confirm && confirm === password && password.length >= 8 && (
                  <div style={{ marginTop: 5, fontSize: '0.72rem', color: '#22C55E', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Passwords match
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{ marginTop: 4, width: '100%', padding: '0.75rem', background: loading ? '#93AEED' : '#3B6FE8', color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.9rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background .15s' }}
              >
                {loading ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Creating account…
                  </>
                ) : 'Create Account'}
              </button>
            </form>

            {/* Link to login */}
            <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.82rem', color: '#64748B' }}>
              Already have an account?{' '}
              <Link to="/login" style={{ color: '#3B6FE8', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
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
