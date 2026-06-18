import { NavLink } from 'react-router-dom'
import { useEvaluation } from '../context/EvaluationContext'

const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}>
    <path d={d} />
  </svg>
)

const NAV = [
  { to: '/', end: true, label: 'Dashboard',       icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { to: '/evaluate',           label: 'New Evaluation',    icon: 'M12 5v14M5 12h14' },
  { to: '/bid-readiness',       label: 'PQTQ',               icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { to: '/active-evaluation',  label: 'Active Evaluation', icon: 'M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z' },
  { to: '/vendor-analysis',    label: 'Vendor Analysis',   icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14-2l-2 2-2-2' },
  { to: '/executive-report',   label: 'Executive Report',  icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
  { to: '/analytics',          label: 'Analytics',         icon: 'M18 20V10M12 20V4M6 20v-6' },
]

export default function Sidebar({ open, onToggle }) {
  const { report } = useEvaluation()

  const navCls = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`

  return (
    <aside className="sidebar">
      {/* Circular collapse/expand button on the right edge */}
      <button className="sidebar-edge-btn" onClick={onToggle} title={open ? 'Collapse sidebar' : 'Expand sidebar'}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform .25s ease' }}>
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <nav className="sidebar-nav">
        {NAV.map(({ to, end, label, icon }) => (
          <NavLink key={to} to={to} end={end} className={navCls} title={!open ? label : undefined}>
            <Icon d={icon} />
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'rgba(255,255,255,.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
            </svg>
          </div>
          <div className="nav-label">
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,.75)', lineHeight: 1.2 }}>BidEval AI</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,.3)', marginTop: 1 }}>v1.0 · Powered by Groq</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
