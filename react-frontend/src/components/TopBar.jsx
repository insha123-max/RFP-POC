import { useState } from 'react'
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
  const { history } = useEvaluation()
  const label = PAGE_LABELS[pathname] ?? 'BidEval AI'
  const [searchVal, setSearchVal] = useState('')

  const notifCount = history.filter(e => !e.passed).length

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
          <div className="topbar-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="topbar-search-input"
              placeholder="Search evaluations…"
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
            />
          </div>

          <div className="topbar-divider" />

          {/* Notifications */}
          <IconBtn title="Notifications" badge={notifCount}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </IconBtn>

          {/* Help */}
          <IconBtn title="Help & Documentation">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </IconBtn>

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
