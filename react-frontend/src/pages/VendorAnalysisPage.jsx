import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEvaluation } from '../context/EvaluationContext'

const BAR_COLORS = ['#6366F1','#8B5CF6','#22C55E','#F59E0B','#EC4899','#14B8A6']

/* ── Radar / Spider Chart ──────────────────────────────────────────────── */
function RadarChart({ categories }) {
  if (!categories.length) return null
  const n = categories.length
  const R = 90, cx = 110, cy = 110
  const angle = i => (Math.PI * 2 * i) / n - Math.PI / 2

  const labelOffset = 22
  const point = (i, r) => {
    const a = angle(i)
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }

  const gridLevels = [0.25, 0.5, 0.75, 1]
  const gridPolygon = r =>
    categories.map((_, i) => { const p = point(i, r * R); return `${p.x},${p.y}` }).join(' ')

  const dataPolygon = categories.map((cat, i) => {
    const r = (cat.percent_achieved / 100) * R
    const p = point(i, r)
    return `${p.x},${p.y}`
  }).join(' ')

  return (
    <svg width={220} height={220} viewBox="0 0 220 220">
      {/* Grid */}
      {gridLevels.map(l => (
        <polygon key={l} points={gridPolygon(l)} fill="none" stroke="#E2E8F0" strokeWidth="1"/>
      ))}
      {/* Spokes */}
      {categories.map((_, i) => {
        const p = point(i, R)
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#E2E8F0" strokeWidth="1"/>
      })}
      {/* Data */}
      <polygon points={dataPolygon} fill="rgba(99,102,241,.2)" stroke="#6366F1" strokeWidth="2"/>
      {categories.map((cat, i) => {
        const r = (cat.percent_achieved / 100) * R
        const p = point(i, r)
        return <circle key={i} cx={p.x} cy={p.y} r={3} fill="#6366F1"/>
      })}
      {/* Labels */}
      {categories.map((cat, i) => {
        const p = point(i, R + labelOffset)
        return (
          <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
            fontSize="9" fontWeight="600" fill="#475569" fontFamily="Inter,sans-serif">
            {cat.category.length > 12 ? cat.category.slice(0, 10) + '…' : cat.category}
          </text>
        )
      })}
    </svg>
  )
}

/* ── Bar Chart (Requirement Coverage) ─────────────────────────────────── */
function CoverageChart({ categories }) {
  const maxVal = Math.max(...categories.map(c => c.criteria.length), 1)
  return (
    <svg width="100%" height={160} viewBox={`0 0 ${categories.length * 80 + 20} 160`} preserveAspectRatio="xMidYMid meet">
      {categories.map((cat, i) => {
        const barH = (cat.criteria.length / maxVal) * 110
        const x = i * 80 + 20
        return (
          <g key={cat.category}>
            <rect x={x} y={130 - barH} width={50} height={barH} rx={4} fill="#EF4444" opacity="0.85"/>
            <text x={x + 25} y={130 - barH - 5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#1E293B">{cat.criteria.length}</text>
            <text x={x + 25} y={148} textAnchor="middle" fontSize="8" fill="#64748B" fontFamily="Inter">
              {cat.category.slice(0, 10)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ── Strength / Weakness Cards ─────────────────────────────────────────── */
function StrengthItem({ text, sub }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '0.85rem 1rem', background: '#F0FDF4', borderRadius: 8, border: '1px solid #BBF7D0', marginBottom: 8 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#166534' }}>{text}</div>
        {sub && <div style={{ fontSize: '0.78rem', color: '#16A34A', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

function WeaknessItem({ text, sub }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '0.85rem 1rem', background: '#FFFBEB', borderRadius: 8, border: '1px solid #FEF08A', marginBottom: 8 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#92400E' }}>{text}</div>
        {sub && <div style={{ fontSize: '0.78rem', color: '#B45309', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

/* ── Evidence Card ─────────────────────────────────────────────────────── */
function EvidenceCard({ title, page, text }) {
  return (
    <div style={{ padding: '1rem', border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1E293B' }}>{title}</span>
      </div>
      {page && <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginBottom: 6 }}>{page}</div>}
      <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.55 }}>
        {text.length > 160 ? text.slice(0, 160) + '…' : text}
      </div>
    </div>
  )
}

/* ── Risk Card ─────────────────────────────────────────────────────────── */
function RiskCard({ area, severity, description }) {
  const cfg = {
    High:   { badge: 'badge-high',   icon: '🔴', bg: '#FFF1F2' },
    Medium: { badge: 'badge-medium', icon: '🟡', bg: '#FFFBEB' },
    Low:    { badge: 'badge-low',    icon: '🟢', bg: '#F0FDF4' },
  }[severity] || { badge: 'badge-medium', icon: '⚪', bg: '#F8FAFC' }

  return (
    <div style={{ padding: '1rem', background: cfg.bg, borderRadius: 10, border: '1px solid #E2E8F0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{area}</div>
        <span className={`badge ${cfg.badge}`}>{severity} Risk</span>
      </div>
      <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{description}</div>
    </div>
  )
}

/* ── Main Page ─────────────────────────────────────────────────────────── */
export default function VendorAnalysisPage() {
  const { report, bidName } = useEvaluation()
  const navigate = useNavigate()

  if (!report) return (
    <div className="page-content">
      <div className="card" style={{ textAlign: 'center', padding: '4rem' }}>
        <p style={{ marginBottom: '1rem' }}>No evaluation data. Run an evaluation first.</p>
        <button className="btn btn-primary" onClick={() => navigate('/evaluate')}>Start Evaluation</button>
      </div>
    </div>
  )

  const allCriteria = report.category_results.flatMap(c => c.criteria)
  const metCount    = allCriteria.filter(c => c.compliance_status === 'Met').length
  const partCount   = allCriteria.filter(c => c.compliance_status === 'Partial').length
  const missCount   = allCriteria.filter(c => c.compliance_status === 'Not Met').length
  const score       = Math.round((report.total_score / report.max_score) * 100)

  // Strengths = Met criteria with high confidence
  const strengths = allCriteria
    .filter(c => c.compliance_status === 'Met' && c.confidence === 'High')
    .slice(0, 4)

  // Weaknesses = from risk items (High/Medium) + Not Met criteria
  const weaknesses = [
    ...report.risk_items.filter(r => r.severity !== 'Low').slice(0, 3).map(r => ({ text: r.risk_area, sub: r.description })),
    ...allCriteria.filter(c => c.compliance_status === 'Not Met').slice(0, 2).map(c => ({ text: c.criterion, sub: 'Not found in document' })),
  ].slice(0, 4)

  // Supporting evidence = top Met criteria with non-trivial vendor_claim
  const evidence = allCriteria
    .filter(c => c.vendor_claim && c.vendor_claim !== 'Not found in document' && c.vendor_claim.length > 30)
    .slice(0, 4)

  return (
    <div className="page-content">
      {/* Vendor Header */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ width: 52, height: 52, borderRadius: 12, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.8">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: 4 }}>{bidName ? bidName.replace(/\.[^.]+$/, '') : 'Vendor Analysis'}</h1>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748B' }}>📄 Bid Document</span>
              <span style={{ fontSize: '0.8rem', color: '#64748B' }}>⚖️ {report.category_results.length} categories</span>
            </div>
          </div>
          <span className={`badge ${report.disqualified ? 'badge-notmet' : report.passed ? 'badge-low' : 'badge-medium'}`} style={{ fontSize: '0.82rem', padding: '6px 14px' }}>
            {report.disqualified ? '⚠ Disqualified' : report.passed ? '✓ Low Risk' : '⚡ Medium Risk'}
          </span>
        </div>

        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #F1F5F9' }}>
          {[
            { label: 'Overall Score', value: score, unit: '', sub: report.passed ? 'PASSED' : 'FAILED', color: report.passed ? '#22C55E' : '#EF4444' },
            { label: 'Total Marks',  value: `${report.total_score}/${report.max_score}`, unit: '', sub: 'Weighted', color: '#6366F1' },
            { label: 'Met Criteria', value: metCount, unit: '', sub: 'Fully satisfied', color: '#22C55E' },
            { label: 'Gaps Found',   value: missCount, unit: '', sub: 'Not met', color: '#F59E0B' },
          ].map(k => (
            <div key={k.label}>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Score Breakdown + Requirement Coverage */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Radar + bars */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title">Score Breakdown</div>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <RadarChart categories={report.category_results} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {report.category_results.map((cat, i) => (
              <div key={cat.category}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>{cat.category}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '1px 8px', borderRadius: 4, background: '#EEF2FF', color: '#6366F1' }}>
                    {Math.round(cat.marks_awarded)}/{cat.max_marks}
                  </span>
                </div>
                <div style={{ height: 6, background: '#E2E8F0', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, background: BAR_COLORS[i % BAR_COLORS.length], width: `${cat.percent_achieved}%`, transition: 'width .8s' }}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coverage chart */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title">Requirement Coverage</div>
          <CoverageChart categories={report.category_results} />
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '1rem', padding: '1rem', background: '#F8FAFC', borderRadius: 8 }}>
            {[
              { val: metCount,  label: 'Covered', color: '#22C55E' },
              { val: partCount, label: 'Partial',  color: '#F59E0B' },
              { val: missCount, label: 'Missing',  color: '#EF4444' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strengths & Weaknesses */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title" style={{ color: '#166534' }}>↗ Strengths</div>
          {strengths.length > 0
            ? strengths.map((s, i) => <StrengthItem key={i} text={s.criterion} sub={s.justification} />)
            : <div style={{ color: '#64748B', fontSize: '0.875rem' }}>No strong positives identified.</div>}
        </div>
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title" style={{ color: '#92400E' }}>⚠ Weaknesses</div>
          {weaknesses.length > 0
            ? weaknesses.map((w, i) => <WeaknessItem key={i} text={w.text} sub={w.sub} />)
            : <div style={{ color: '#64748B', fontSize: '0.875rem' }}>No significant weaknesses identified.</div>}
        </div>
      </div>

      {/* Supporting Evidence */}
      {evidence.length > 0 && (
        <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div className="card-title">Supporting Evidence</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '1rem' }}>
            {evidence.map((e, i) => (
              <EvidenceCard key={i} title={e.criterion} page={e.source_reference !== 'Not found' ? e.source_reference : ''} text={e.vendor_claim} />
            ))}
          </div>
        </div>
      )}

      {/* Risk Assessment */}
      {report.risk_items.length > 0 && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title">Risk Assessment</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '1rem' }}>
            {report.risk_items.map((r, i) => (
              <RiskCard key={i} area={r.risk_area} severity={r.severity} description={r.description} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
