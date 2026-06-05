import { NavLink } from 'react-router-dom'
import { useEvaluation } from '../context/EvaluationContext'

const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)

const NAV = [
  { to: '/', end: true, label: 'Dashboard',       icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { to: '/evaluate',           label: 'New Evaluation',    icon: 'M12 5v14M5 12h14' },
  { to: '/active-evaluation',  label: 'Active Evaluation', icon: 'M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z' },
  { to: '/vendor-analysis',    label: 'Vendor Analysis',   icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm14-2l-2 2-2-2' },
  { to: '/executive-report',   label: 'Executive Report',  icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8' },
  { to: '/analytics',          label: 'Analytics',         icon: 'M18 20V10M12 20V4M6 20v-6' },
]

export default function Sidebar() {
  const { report } = useEvaluation()
  const score = report ? Math.round((report.total_score / report.max_score) * 100) : 94

  const navCls = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <div>
          <div className="sidebar-logo-text">BidEval AI</div>
          <div className="sidebar-logo-sub">Procurement Platform</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(({ to, end, label, icon }) => (
          <NavLink key={to} to={to} end={end} className={navCls}>
            <Icon d={icon} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="ai-confidence-label">AI Confidence</div>
        <div className="ai-confidence-row">
          <span className="ai-confidence-val">{score}%</span>
          <span className="ai-confidence-sub">Avg. Score</span>
        </div>
      </div>
    </aside>
  )
}
