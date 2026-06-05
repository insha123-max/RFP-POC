/* Static analytics dashboard */

const MONTHLY = [
  { month: 'Jan', rfps: 3, vendors: 12 },
  { month: 'Feb', rfps: 5, vendors: 18 },
  { month: 'Mar', rfps: 4, vendors: 15 },
  { month: 'Apr', rfps: 7, vendors: 28 },
  { month: 'May', rfps: 6, vendors: 22 },
  { month: 'Jun', rfps: 8, vendors: 31 },
]

const CATEGORY_DIST = [
  { label: 'Infrastructure', pct: 35, color: '#4F46E5' },
  { label: 'Energy',         pct: 25, color: '#8B5CF6' },
  { label: 'Healthcare',     pct: 20, color: '#22C55E' },
  { label: 'Technology',     pct: 12, color: '#F59E0B' },
  { label: 'Other',          pct: 8,  color: '#EC4899' },
]

const TOP_VENDORS = [
  { name: 'Siemens Mobility India',   score: 94, wins: 3, badge: 'badge-low' },
  { name: 'Alstom Transportation',    score: 88, wins: 2, badge: 'badge-low' },
  { name: 'ABB Power Grids',          score: 85, wins: 2, badge: 'badge-low' },
  { name: 'Bombardier Transit',       score: 82, wins: 1, badge: 'badge-medium' },
  { name: 'GE Healthcare Systems',    score: 79, wins: 1, badge: 'badge-medium' },
]

const TRENDS = [
  { label: 'Avg. Evaluation Time', value: '4.2 days', change: '-15%', up: false, note: 'vs. last quarter' },
  { label: 'AI Accuracy Rate',     value: '96.3%',    change: '+2.1%', up: true, note: 'vs. last quarter' },
  { label: 'Override Rate',        value: '8.4%',     change: '-3.2%', up: false, note: 'vs. last quarter' },
  { label: 'Pass Rate',            value: '72%',      change: '+5%',  up: true, note: 'vs. last quarter' },
]

function BarChart() {
  const maxRfps = Math.max(...MONTHLY.map(m => m.rfps))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: 140, padding: '0 0.5rem' }}>
      {MONTHLY.map(m => (
        <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#4F46E5' }}>{m.rfps}</div>
          <div style={{
            width: '100%', borderRadius: '4px 4px 0 0',
            height: `${(m.rfps / maxRfps) * 100}px`,
            background: 'linear-gradient(180deg, #6366F1, #4F46E5)',
            minHeight: 8,
          }} />
          <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{m.month}</div>
        </div>
      ))}
    </div>
  )
}

function DonutChart() {
  const total = 360
  let offset = 0
  const r = 50, cx = 70, cy = 70, stroke = 22

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
      <svg width={140} height={140} viewBox="0 0 140 140">
        {CATEGORY_DIST.map(item => {
          const deg = (item.pct / 100) * total
          const start = offset
          offset += deg
          const startRad = (start - 90) * (Math.PI / 180)
          const endRad   = (start + deg - 90) * (Math.PI / 180)
          const large = deg > 180 ? 1 : 0
          const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad)
          const x2 = cx + r * Math.cos(endRad),   y2 = cy + r * Math.sin(endRad)
          return (
            <path key={item.label}
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
              fill={item.color} opacity={0.9}
            />
          )
        })}
        <circle cx={cx} cy={cy} r={r - stroke} fill="#fff" />
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize="11" fontWeight="800" fill="#111827">47</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#6B7280">Vendors</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {CATEGORY_DIST.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.78rem', color: '#374151' }}>{item.label}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', marginLeft: 'auto' }}>{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', marginBottom: 4 }}>Analytics</h1>
        <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>Platform performance and evaluation insights</p>
      </div>

      {/* Trend KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
        {TRENDS.map(t => (
          <div key={t.label} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '0.5rem' }}>{t.label}</div>
            <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#111827', lineHeight: 1, marginBottom: '0.4rem' }}>{t.value}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={t.up ? '#16A34A' : '#DC2626'} strokeWidth="2.5">
                {t.up
                  ? <><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></>
                  : <><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></>}
              </svg>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: t.up ? '#16A34A' : '#DC2626' }}>{t.change}</span>
              <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{t.note}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>

        {/* RFP Activity */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title">Monthly RFP Activity</div>
          <BarChart />
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid #F3F4F6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: '#4F46E5' }} />
              <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>RFPs Processed</span>
            </div>
          </div>
        </div>

        {/* Category Distribution */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title">Category Distribution</div>
          <DonutChart />
        </div>
      </div>

      {/* Top Vendors */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div className="card-title">Top Performing Vendors</div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Vendor</th>
              <th>Avg. Score</th>
              <th>Contract Wins</th>
              <th>Risk Profile</th>
            </tr>
          </thead>
          <tbody>
            {TOP_VENDORS.map((v, i) => (
              <tr key={v.name}>
                <td>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: i === 0 ? '#4F46E5' : i === 1 ? '#8B5CF6' : '#E5E7EB',
                    color: i < 2 ? '#fff' : '#374151',
                    fontSize: '0.78rem', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>#{i + 1}</div>
                </td>
                <td style={{ fontWeight: 600, color: '#111827' }}>{v.name}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 6, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden', maxWidth: 80 }}>
                      <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#4F46E5,#6366F1)', width: `${v.score}%` }} />
                    </div>
                    <span style={{ fontWeight: 700, color: '#4F46E5', fontSize: '0.85rem' }}>{v.score}%</span>
                  </div>
                </td>
                <td style={{ fontWeight: 700, color: '#111827' }}>{v.wins}</td>
                <td><span className={`badge ${v.badge}`}>{v.badge === 'badge-low' ? 'Low Risk' : 'Medium Risk'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
