import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function SignupPage() {
  const { user, signup } = useAuth()
  const navigate = useNavigate()

  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [role, setRole]         = useState('evaluator')
  const [showPass, setShowPass] = useState(false)
  const [showConf, setShowConf] = useState(false)
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [mounted, setMounted]   = useState(false)

  useEffect(() => { const t = setTimeout(() => setMounted(true), 20); return () => clearTimeout(t) }, [])
  useEffect(() => { if (user) navigate('/', { replace: true }) }, [user, navigate])

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
    const err = await signup(name, email, password, role)
    setLoading(false)
    if (err) { setError(err); return }
    navigate('/', { replace: true })
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

  const eyeBtn = (show, toggle) => (
    <button type="button" onClick={toggle} tabIndex={-1} style={{
      position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
      color: '#94A3B8', display: 'flex', alignItems: 'center',
    }}>
      {show
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      }
    </button>
  )

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
          {/* Title */}
          <div style={{ marginBottom: '1.75rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: '0 0 6px' }}>
              Create your account
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: 0 }}>
              Join BidEval AI · GlobalLogic employees only.
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

            {/* Full name */}
            <div>
              <label style={labelStyle}>Full name</label>
              <input
                type="text" placeholder="Jane Smith"
                value={name} onChange={e => setName(e.target.value)}
                required autoFocus style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#F26522'; e.target.style.boxShadow = '0 0 0 3px rgba(242,101,34,0.12)' }}
                onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none' }}
              />
            </div>

            {/* Email */}
            <div>
              <label style={labelStyle}>Work email</label>
              <input
                type="email" placeholder="you@globallogic.com"
                value={email} onChange={e => setEmail(e.target.value)}
                required style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#F26522'; e.target.style.boxShadow = '0 0 0 3px rgba(242,101,34,0.12)' }}
                onBlur={e => {
                  e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'
                  if (email && !email.toLowerCase().endsWith('@globallogic.com')) setError('Only @globallogic.com email addresses are allowed.')
                  else setError(null)
                }}
              />
              {email && !email.toLowerCase().endsWith('@globallogic.com') && (
                <div style={{ marginTop: 5, fontSize: '0.72rem', color: '#F97316', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Must be a @globallogic.com address
                </div>
              )}
            </div>

            {/* Role */}
            <div>
              <label style={labelStyle}>Role</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { value: 'evaluator', label: 'Evaluator', desc: 'Run evaluations, view your history', icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  )},
                  { value: 'admin', label: 'Admin', desc: 'Full access + team activity', icon: (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  )},
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    style={{
                      flex: 1, padding: '0.65rem 0.75rem', borderRadius: 8, cursor: 'pointer',
                      border: `1.5px solid ${role === opt.value ? '#F26522' : '#E2E8F0'}`,
                      background: role === opt.value ? '#FFF7F3' : '#fff',
                      textAlign: 'left', transition: 'all .15s',
                      display: 'flex', flexDirection: 'column', gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: role === opt.value ? '#F26522' : '#94A3B8' }}>{opt.icon}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: role === opt.value ? '#F26522' : '#1A1A2E' }}>{opt.label}</span>
                      {role === opt.value && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F26522" strokeWidth="3" style={{ marginLeft: 'auto' }}><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#94A3B8', paddingLeft: 22 }}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Password */}
            <div>
              <label style={labelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'} placeholder="Min. 8 characters"
                  value={password} onChange={e => setPassword(e.target.value)}
                  required style={{ ...inputStyle, paddingRight: '2.75rem' }}
                  onFocus={e => { e.target.style.borderColor = '#F26522'; e.target.style.boxShadow = '0 0 0 3px rgba(242,101,34,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none' }}
                />
                {eyeBtn(showPass, () => setShowPass(v => !v))}
              </div>
              {passwordStrength && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    {[1,2,3,4].map(i => (
                      <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= passwordStrength.level ? passwordStrength.color : '#E2E8F0', transition: 'background .3s' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: passwordStrength.color }}>{passwordStrength.label}</span>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label style={labelStyle}>Confirm password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConf ? 'text' : 'password'} placeholder="Re-enter password"
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  required style={{ ...inputStyle, paddingRight: '2.75rem', borderColor: confirm && confirm !== password ? '#FECACA' : '#E2E8F0' }}
                  onFocus={e => { e.target.style.borderColor = confirm && confirm !== password ? '#FECACA' : '#F26522'; e.target.style.boxShadow = '0 0 0 3px rgba(242,101,34,0.12)' }}
                  onBlur={e => { e.target.style.borderColor = confirm && confirm !== password ? '#FECACA' : '#E2E8F0'; e.target.style.boxShadow = 'none' }}
                />
                {eyeBtn(showConf, () => setShowConf(v => !v))}
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
              type="submit" disabled={loading}
              style={{
                marginTop: 4, width: '100%', padding: '0.8rem',
                background: loading ? '#f59a6b' : '#F26522',
                color: '#fff', border: 'none', borderRadius: 8,
                fontSize: '0.95rem', fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background .15s',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#D4541A' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#F26522' }}
            >
              {loading ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Creating account…
                </>
              ) : 'Create account'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '1.5rem 0' }}>
            <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
            <span style={{ fontSize: '0.8rem', color: '#9CA3AF', whiteSpace: 'nowrap' }}>or continue with</span>
            <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
          </div>

          {/* SSO */}
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
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#F26522', fontWeight: 600, textDecoration: 'none' }}>
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
