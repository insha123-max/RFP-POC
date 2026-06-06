import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEvaluation } from '../context/EvaluationContext'

function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    const n = typeof target === 'string' ? parseInt(target) : target
    if (!n || isNaN(n)) { setVal(0); return }
    let start = null
    const raf = ts => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * n))
      if (p < 1) requestAnimationFrame(raf)
    }
    requestAnimationFrame(raf)
  }, [target])
  return val
}

function stripExt(name) {
  return name ? name.replace(/\.[^.]+$/, '') : '—'
}

function getMonthlyData(history) {
  const now = new Date()
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { label: d.toLocaleDateString('en-US', { month: 'short' }), year: d.getFullYear(), month: d.getMonth(), count: 0 }
  })
  for (const entry of history) {
    const d = new Date(entry.timestamp)
    const m = months.find(m => m.year === d.getFullYear() && m.month === d.getMonth())
    if (m) m.count++
  }
  return months
}

function BarChart({ data }) {
  const maxVal = Math.max(...data.map(m => m.count), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: 160, padding: '0 0.5rem' }}>
      {data.map((m, i) => {
        const barH = Math.max((m.count / maxVal) * 120, m.count > 0 ? 10 : 8)
        return (
          <div key={`${m.label}-${m.year}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: m.count > 0 ? '#4F46E5' : '#D1D5DB', minHeight: 16 }}>
              {m.count > 0 ? m.count : ''}
            </div>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 120 }}>
              <div
                className="anim-bar"
                style={{
                  width: '100%', borderRadius: '6px 6px 0 0',
                  height: barH,
                  background: m.count > 0
                    ? 'linear-gradient(180deg, #818CF8 0%, #4F46E5 100%)'
                    : '#F1F5F9',
                  animationDelay: `${i * 0.08}s`,
                  boxShadow: m.count > 0 ? '0 -2px 8px rgba(99,102,241,.3)' : 'none',
                  transition: 'height .3s ease',
                  cursor: m.count > 0 ? 'pointer' : 'default',
                }}
              />
            </div>
            <div style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 500 }}>{m.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function PassFailChart({ passed, failed }) {
  const total = passed + failed
  if (total === 0) return <div style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '0.875rem', padding: '2rem' }}>No data yet</div>

  const r = 50, cx = 70, cy = 70
  const passDeg = (passed / total) * 360

  const arc = (startDeg, endDeg, color) => {
    if (Math.abs(endDeg - startDeg) >= 359.9) return <circle key={color} cx={cx} cy={cy} r={r} fill={color} opacity={0.9} />
    const toRad = d => (d - 90) * (Math.PI / 180)
    const x1 = cx + r * Math.cos(toRad(startDeg)), y1 = cy + r * Math.sin(toRad(startDeg))
    const x2 = cx + r * Math.cos(toRad(endDeg)),   y2 = cy + r * Math.sin(toRad(endDeg))
    return <path key={color} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${endDeg - startDeg > 180 ? 1 : 0} 1 ${x2} ${y2} Z`} fill={color} opacity={0.9} />
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
      <svg width={140} height={140} viewBox="0 0 140 140">
        {arc(0, passDeg, '#22C55E')}
        {passDeg < 360 && arc(passDeg, 360, '#EF4444')}
        <circle cx={cx} cy={cy} r={r - 22} fill="#fff" />
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize="12" fontWeight="800" fill="#111827">{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#6B7280">Evals</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[{ label: 'Passed', count: passed, color: '#22C55E' }, { label: 'Failed', count: failed, color: '#EF4444' }].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: '0.78rem', color: '#374151' }}>{item.label}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', marginLeft: 'auto', paddingLeft: 8 }}>{item.count}</span>
          </div>
        ))}
        <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: 4 }}>
          {Math.round((passed / total) * 100)}% pass rate
        </div>
      </div>
    </div>
  )
}

export default function AnalyticsPage() {
  const navigate  = useNavigate()
  const { history } = useEvaluation()

  const totalEvals = history.length
  const passCount  = history.filter(e => e.passed).length
  const failCount  = totalEvals - passCount
  const passRate   = totalEvals > 0 ? Math.round((passCount / totalEvals) * 100) : 0
  const avgScore   = totalEvals > 0 ? Math.round(history.reduce((s, e) => s + e.score, 0) / totalEvals) : 0
  const highRisks  = history.reduce((s, e) => s + (e.report?.risk_items?.filter(r => r.severity === 'High').length || 0), 0)

  const monthlyData = getMonthlyData(history)
  const topBids     = [...history].sort((a, b) => b.score - a.score).slice(0, 5)

  if (totalEvals === 0) {
    return (
      <div className="page-content">
        <div style={{ marginBottom: '1.75rem' }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', marginBottom: 4 }}>Analytics</h1>
          <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>Platform performance and evaluation insights</p>
        </div>
        <div className="card" style={{ padding: '4rem', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.8">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <h2 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>No analytics data yet</h2>
          <p style={{ color: '#6B7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Run your first evaluation to start seeing performance insights and trends.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/evaluate')}>+ Start Your First Evaluation</button>
        </div>
      </div>
    )
  }

  const kpis = [
    { label: 'Total Evaluations', note: 'all time' },
    { label: 'Avg Score',         note: 'across all evaluations', suffix: '%' },
    { label: 'Pass Rate',         note: `${passCount} of ${totalEvals} passed`, suffix: '%' },
    { label: 'High Risk Items',   note: 'across all evaluations' },
  ]

  const cTotalEvals = useCountUp(totalEvals)
  const cAvgScore   = useCountUp(avgScore)
  const cPassRate   = useCountUp(passRate)
  const cHighRisks  = useCountUp(highRisks)
  const kpiCounted  = [cTotalEvals, cAvgScore, cPassRate, cHighRisks]

  return (
    <div className="page-content fade-in">
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 className="gradient-title" style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 4 }}>Analytics</h1>
        <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>Platform performance and evaluation insights</p>
      </div>

      {/* KPIs */}
      <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
        {kpis.map((k, i) => (
          <div key={k.label} className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '0.5rem' }}>{k.label}</div>
            <div className="count-up" style={{ fontSize: '1.65rem', fontWeight: 800, color: '#111827', lineHeight: 1, marginBottom: '0.4rem' }}>
              {kpiCounted[i]}{k.suffix || ''}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{k.note}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title">Monthly Evaluation Activity</div>
          <BarChart data={monthlyData} />
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid #F3F4F6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: '#4F46E5' }} />
              <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>Evaluations Completed</span>
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title">Pass / Fail Distribution</div>
          <PassFailChart passed={passCount} failed={failCount} />
        </div>
      </div>

      {/* Top Scoring Evaluations */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div className="card-title">Top Scoring Evaluations</div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Rank</th>
              <th>RFP Document</th>
              <th>Vendor Bid</th>
              <th>Score</th>
              <th>Result</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {topBids.map((e, i) => (
              <tr key={e.id}>
                <td>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: i === 0 ? '#4F46E5' : i === 1 ? '#8B5CF6' : '#E5E7EB', color: i < 2 ? '#fff' : '#374151', fontSize: '0.78rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    #{i + 1}
                  </div>
                </td>
                <td style={{ fontWeight: 600, color: '#111827' }}>{stripExt(e.rfpName)}</td>
                <td style={{ color: '#6B7280' }}>{stripExt(e.bidName)}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 6, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden', maxWidth: 80 }}>
                      <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#4F46E5,#6366F1)', width: `${e.score}%` }} />
                    </div>
                    <span style={{ fontWeight: 700, color: '#4F46E5', fontSize: '0.85rem' }}>{e.score}%</span>
                  </div>
                </td>
                <td><span className={`badge ${e.passed ? 'badge-low' : 'badge-high'}`}>{e.passed ? 'Passed' : 'Failed'}</span></td>
                <td style={{ color: '#9CA3AF', fontSize: '0.78rem' }}>
                  {new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
