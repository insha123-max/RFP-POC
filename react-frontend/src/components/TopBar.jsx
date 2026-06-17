import { useState, useRef, useEffect } from 'react'
import { useLocation, NavLink, useNavigate } from 'react-router-dom'
import { useEvaluation } from '../context/EvaluationContext'

const PAGE_LABELS = {
  '/':                   'Dashboard',
  '/evaluate':           'New Evaluation',
  '/pqtq-evaluation':    'PQTQ Evaluation',
  '/active-evaluation':  'Active Evaluation',
  '/vendor-analysis':    'Vendor Analysis',
  '/executive-report':   'Executive Report',
  '/analytics':          'Analytics',
}

function IconBtn({ children, title, badge, onClick }) {
  return (
    <button className="topbar-icon-btn" title={title} onClick={onClick} style={{ position: 'relative' }}>
      {children}
      {badge > 0 && (
        <span style={{
          position: 'absolute', top: 2, right: 2,
          width: 16, height: 16, borderRadius: '50%',
          background: '#EF4444', color: '#fff',
          fontSize: '0.6rem', fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}>{badge > 9 ? '9+' : badge}</span>
      )}
    </button>
  )
}

export default function TopBar({ sidebarOpen }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { history, setCurrentEvaluation } = useEvaluation()
  const label = PAGE_LABELS[pathname] ?? 'BidEval AI'
  const [searchVal, setSearchVal] = useState('')
  const [showDrop, setShowDrop] = useState(false)
  const searchRef = useRef(null)

  const passedCount = history.filter(e => e.passed).length
  const failedCount = history.filter(e => !e.passed).length
  const [showNotif, setShowNotif] = useState(false)
  const notifRef = useRef(null)

  const results = searchVal.trim().length === 0 ? [] : history.filter(e => {
    const q = searchVal.toLowerCase()
    return (e.rfpName || '').toLowerCase().includes(q) || (e.bidName || '').toLowerCase().includes(q)
  }).slice(0, 8)

  const pickResult = entry => {
    setCurrentEvaluation(entry)
    setSearchVal('')
    setShowDrop(false)
    navigate('/active-evaluation')
  }

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = e => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowDrop(false)
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <header className="topbar">
      {/* Left: logo strip */}
      <NavLink to="/" className={`topbar-logo${sidebarOpen ? '' : ' topbar-logo--collapsed'}`} style={{ textDecoration: 'none' }}>
        <img
          src="/logo.png"
          alt="BidEval AI"
          style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
        <div className="topbar-logo-text-wrap">
          <div className="topbar-logo-text">BidEval AI</div>
          <div className="topbar-logo-sub">Procurement Platform</div>
        </div>
      </NavLink>

      {/* Right: header actions */}
      <div className="topbar-right">
        {/* Page label */}
        <div className="topbar-page-label">{label}</div>

        {/* Right-side controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>

          {/* Search */}
          <div ref={searchRef} style={{ position: 'relative' }}>
            <div className="topbar-search">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="topbar-search-input"
                placeholder="Search evaluations…"
                value={searchVal}
                onChange={e => { setSearchVal(e.target.value); setShowDrop(true) }}
                onFocus={() => setShowDrop(true)}
              />
              {searchVal && (
                <button onClick={() => { setSearchVal(''); setShowDrop(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: '#9CA3AF' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>

            {/* Dropdown results */}
            {showDrop && searchVal.trim().length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
                boxShadow: '0 8px 24px rgba(0,0,0,.1)', zIndex: 9999, overflow: 'hidden',
                minWidth: 320,
              }}>
                {results.length === 0 ? (
                  <div style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#9CA3AF', textAlign: 'center' }}>
                    No evaluations match "{searchVal}"
                  </div>
                ) : results.map(entry => (
                  <button key={entry.id} onClick={() => pickResult(entry)} style={{
                    width: '100%', textAlign: 'left', background: 'none', border: 'none',
                    borderBottom: '1px solid #F3F4F6', padding: '10px 14px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    transition: 'background .12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: entry.passed ? '#DCFCE7' : '#FEE2E2',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.65rem', fontWeight: 800,
                      color: entry.passed ? '#15803D' : '#DC2626',
                    }}>{entry.score ?? '?'}%</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.rfpName || 'Untitled RFP'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.bidName || '—'} · {entry.evaluationType || 'General'} · {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : ''}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                      background: entry.passed ? '#DCFCE7' : '#FEE2E2',
                      color: entry.passed ? '#15803D' : '#DC2626', flexShrink: 0,
                    }}>{entry.passed ? 'Passed' : 'Failed'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="topbar-divider" />

          {/* Notifications */}
          <div ref={notifRef} style={{ position: 'relative' }}>
            <IconBtn title="Notifications" badge={history.length} onClick={() => setShowNotif(v => !v)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </IconBtn>

            {showNotif && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                width: 340, background: '#fff', borderRadius: 12,
                border: '1px solid #E5E7EB', boxShadow: '0 8px 28px rgba(0,0,0,.12)',
                zIndex: 9999, overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#111827', marginBottom: 10 }}>Evaluation Summary</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8,
                      background: '#DCFCE7', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#15803D', lineHeight: 1 }}>{passedCount}</div>
                      <div style={{ fontSize: '0.68rem', color: '#166534', fontWeight: 600, marginTop: 3 }}>Bids Passed</div>
                    </div>
                    <div style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8,
                      background: '#FEE2E2', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#DC2626', lineHeight: 1 }}>{failedCount}</div>
                      <div style={{ fontSize: '0.68rem', color: '#991B1B', fontWeight: 600, marginTop: 3 }}>Bids Failed</div>
                    </div>
                    <div style={{
                      flex: 1, padding: '10px 12px', borderRadius: 8,
                      background: '#EEF2FF', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#4F46E5', lineHeight: 1 }}>{history.length}</div>
                      <div style={{ fontSize: '0.68rem', color: '#3730A3', fontWeight: 600, marginTop: 3 }}>Total Evals</div>
                    </div>
                  </div>
                </div>

                {/* Recent evaluations list */}
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {history.length === 0 ? (
                    <div style={{ padding: '20px 16px', textAlign: 'center', fontSize: '0.8rem', color: '#9CA3AF' }}>
                      No evaluations yet
                    </div>
                  ) : history.slice(0, 10).map(entry => (
                    <button key={entry.id} onClick={() => { pickResult(entry); setShowNotif(false) }} style={{
                      width: '100%', textAlign: 'left', background: 'none', border: 'none',
                      borderBottom: '1px solid #F9FAFB', padding: '9px 14px',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: entry.passed ? '#22C55E' : '#EF4444',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.rfpName || 'Untitled RFP'}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#9CA3AF' }}>
                          {entry.timestamp ? new Date(entry.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} · {entry.evaluationType || 'General'}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                        background: entry.passed ? '#DCFCE7' : '#FEE2E2',
                        color: entry.passed ? '#15803D' : '#DC2626',
                      }}>{entry.score ?? '?'}%</span>
                    </button>
                  ))}
                </div>

                {/* Footer */}
                {history.length > 0 && (
                  <div style={{ padding: '10px 14px', borderTop: '1px solid #F3F4F6', textAlign: 'center' }}>
                    <button onClick={() => { navigate('/analytics'); setShowNotif(false) }} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: '0.75rem', color: '#4F46E5', fontWeight: 600,
                    }}>View all in Analytics →</button>
                  </div>
                )}
              </div>
            )}
          </div>


          {/* Settings */}
          <IconBtn title="Settings">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </IconBtn>

          <div className="topbar-divider" />

          {/* Login */}
          <button className="topbar-btn-login" onClick={() => {}}>
            Log In
          </button>

          {/* Sign Up */}
          <button className="topbar-btn-signup" onClick={() => navigate('/evaluate')}>
            Get Started
          </button>
        </div>
      </div>
    </header>
  )
}
