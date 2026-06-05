import { useNavigate } from 'react-router-dom'

/* ── Static Data ─────────────────────────────────────────────────────────── */
const STATS = [
  {
    label: 'Active RFPs', value: '8', trend: '+12%', trendUp: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    ),
  },
  {
    label: 'Vendors Evaluated', value: '47', trend: '+8%', trendUp: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    label: 'Evaluations in Progress', value: '3', trend: null,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
  {
    label: 'Avg. Evaluation Time', value: '4.2 days', trend: '-15%', trendUp: false,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
  },
]

const RFPS = [
  { id: 1, title: 'Railway Signaling System - Metro Phase 3', category: 'Infrastructure & Transportation', status: 'In-progress', dueDate: 'June 15, 2026', vendors: 5, progress: 78 },
  { id: 2, title: 'Power Plant Turbine Procurement',          category: 'Energy & Power',                 status: 'In-progress', dueDate: 'June 20, 2026', vendors: 4, progress: 92 },
  { id: 3, title: 'Hospital Equipment & Supplies',           category: 'Healthcare',                     status: 'Pending',     dueDate: 'June 8, 2026',  vendors: 8, progress: 45 },
]

const AI_INSIGHTS = [
  { type: 'warning', text: '3 RFPs require attention due to vendor non-compliance' },
  { type: 'success', text: 'Railway RFP: Siemens leads with 94% technical score' },
  { type: 'info',    text: '2 vendors have unusually low commercial scores' },
]

const RISK_ITEMS = [
  { level: 'High',   label: 'High Risk Vendors',  count: 2 },
  { level: 'Medium', label: 'Missing Documents',  count: 5 },
  { level: 'Medium', label: 'Compliance Issues',  count: 3 },
  { level: 'Low',    label: 'Pending Reviews',    count: 1 },
]

const ACTIVITY = [
  { dot: 'dot-green',  label: 'Vendor scored',         sub: 'Siemens Mobility India — Technical evaluation completed',   time: '2 hours ago' },
  { dot: 'dot-blue',   label: 'Requirement extracted',  sub: 'Power Plant RFP — 45 requirements parsed by AI',            time: '4 hours ago' },
  { dot: 'dot-green',  label: 'Report generated',       sub: 'Healthcare RFP — Executive summary ready for review',        time: '5 hours ago' },
  { dot: 'dot-amber',  label: 'Committee override',     sub: 'Railway RFP — Technical score adjusted for Vendor B',        time: '1 day ago' },
]

/* ── Sub-components ─────────────────────────────────────────────────────── */
function StatCard({ label, value, trend, trendUp, icon }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
      padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 500 }}>{label}</span>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111827', lineHeight: 1, marginBottom: '0.5rem' }}>
        {value}
      </div>
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={trendUp ? '#16A34A' : '#DC2626'} strokeWidth="2.5">
            {trendUp
              ? <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>
              : <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>}
          </svg>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: trendUp ? '#16A34A' : '#DC2626' }}>{trend}</span>
        </div>
      )}
    </div>
  )
}

function RFPCard({ rfp, onContinue, onViewReport }) {
  const isInprogress = rfp.status === 'In-progress'
  return (
    <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, padding: '1.25rem', background: '#fff', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>{rfp.title}</h3>
        <span className={`badge ${isInprogress ? 'badge-inprog' : 'badge-pending'}`} style={{ flexShrink: 0, marginLeft: 12 }}>
          {rfp.status}
        </span>
      </div>
      <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '1rem' }}>{rfp.category}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.875rem' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 500, marginBottom: 2 }}>Due Date</div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{rfp.dueDate}</div>
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 500, marginBottom: 2 }}>Vendors</div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{rfp.vendors} bidders</div>
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>Evaluation Progress</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4F46E5' }}>{rfp.progress}%</span>
        </div>
        <div className="rfp-progress-bar">
          <div className="rfp-progress-fill" style={{ width: `${rfp.progress}%` }} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button
          className="btn btn-primary"
          style={{ flex: 1, justifyContent: 'center', fontSize: '0.82rem', padding: '0.55rem 1rem' }}
          onClick={onContinue}
        >
          Continue Evaluation →
        </button>
        <button
          className="btn-ghost"
          style={{ flexShrink: 0, fontSize: '0.82rem', color: '#6B7280', fontWeight: 600 }}
          onClick={onViewReport}
        >
          View Report
        </button>
      </div>
    </div>
  )
}

function InsightItem({ type, text }) {
  const cfg = {
    warning: { bg: '#FFFBEB', border: '#FDE68A', dot: '#F59E0B' },
    success: { bg: '#F0FDF4', border: '#BBF7D0', dot: '#22C55E' },
    info:    { bg: '#F5F3FF', border: '#DDD6FE', dot: '#8B5CF6' },
  }[type]
  return (
    <div style={{
      background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8,
      padding: '0.65rem 0.875rem', marginBottom: '0.5rem',
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0, marginTop: 4 }} />
      <span style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.45 }}>{text}</span>
    </div>
  )
}

function RiskRow({ level, label, count }) {
  const cfg = {
    High:   { badgeBg: '#FFE4E6', badgeColor: '#BE123C', text: 'High Risk' },
    Medium: { badgeBg: '#FEF3C7', badgeColor: '#92400E', text: 'Medium Risk' },
    Low:    { badgeBg: '#DCFCE7', badgeColor: '#15803D', text: 'Low Risk' },
  }[level]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid #F3F4F6' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: cfg.badgeBg, color: cfg.badgeColor }}>
          {cfg.text}
        </span>
        <span style={{ fontSize: '0.82rem', color: '#374151' }}>{label}</span>
      </div>
      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{count}</span>
    </div>
  )
}

/* ── Main Page ─────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const navigate = useNavigate()

  return (
    <div className="page-content">
      {/* Page Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', marginBottom: 4 }}>Procurement Dashboard</h1>
        <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>Overview of active RFP evaluations and AI insights</p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
        {STATS.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', marginBottom: '1.5rem' }}>

        {/* Left: Active RFP Evaluations */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title">Active RFP Evaluations</div>
          {RFPS.map(rfp => (
            <RFPCard
              key={rfp.id}
              rfp={rfp}
              onContinue={() => navigate('/evaluate')}
              onViewReport={() => navigate('/active-evaluation')}
            />
          ))}
        </div>

        {/* Right: AI Insights + Risk Monitoring */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* AI Insights */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div className="card-title" style={{ marginBottom: '0.875rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              AI Insights
            </div>
            {AI_INSIGHTS.map((ins, i) => <InsightItem key={i} {...ins} />)}
          </div>

          {/* Risk Monitoring */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div className="card-title" style={{ marginBottom: '0.875rem' }}>Risk Monitoring</div>
            <div>
              {RISK_ITEMS.map((r, i) => (
                <RiskRow key={i} {...r} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div className="card-title">Recent Activity</div>
        {ACTIVITY.map((a, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '0.85rem 0',
            borderBottom: i < ACTIVITY.length - 1 ? '1px solid #F3F4F6' : 'none',
          }}>
            <div style={{ marginTop: 5 }}><span className={`dot ${a.dot}`} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{a.label}</div>
              <div style={{ fontSize: '0.78rem', color: '#6B7280' }}>{a.sub}</div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9CA3AF', flexShrink: 0 }}>{a.time}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
