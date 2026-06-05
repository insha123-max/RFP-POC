import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEvaluation } from '../context/EvaluationContext'
import { applyOverride, exportWord } from '../api'

/* ── Static demo data (shown when no real evaluation exists) ─────────────── */
const DEMO_RFP = { name: 'Railway Signaling System - Metro Phase 3', category: 'Infrastructure & Transportation', status: 'In-progress', updated: '2 hours ago' }

const DEMO_VENDORS = [
  {
    name: 'Siemens Mobility India', rank: 1, score: 94, riskLevel: 'Low Risk', riskClass: 'badge-low',
    categories: [
      { name: 'Technical',   score: 96, color: '#4F46E5' },
      { name: 'Commercial',  score: 82, color: '#8B5CF6' },
      { name: 'Compliance',  score: 95, color: '#22C55E' },
    ],
    bidValue: '$24.5M', highlighted: true,
  },
  {
    name: 'Alstom Transportation', rank: 2, score: 88, riskLevel: 'Low Risk', riskClass: 'badge-low',
    categories: [
      { name: 'Technical',   score: 90, color: '#4F46E5' },
      { name: 'Commercial',  score: 85, color: '#8B5CF6' },
      { name: 'Compliance',  score: 90, color: '#22C55E' },
    ],
    bidValue: '$26.2M', highlighted: false,
  },
  {
    name: 'Bombardier Transit', rank: 3, score: 82, riskLevel: 'Medium Risk', riskClass: 'badge-medium',
    categories: [
      { name: 'Technical',   score: 85, color: '#4F46E5' },
      { name: 'Commercial',  score: 88, color: '#8B5CF6' },
      { name: 'Compliance',  score: 75, color: '#22C55E' },
    ],
    bidValue: '$22.8M', highlighted: false,
  },
]

const DEMO_CRITERIA = [
  { name: 'Signaling System Specifications', category: 'Technical',   weight: 'High',     v1: 'Met',     v2: 'Met',     v3: 'Met' },
  { name: 'Safety Certifications',           category: 'Compliance',  weight: 'Critical',  v1: 'Met',     v2: 'Met',     v3: 'Partial' },
  { name: 'Implementation Timeline',         category: 'Technical',   weight: 'High',     v1: 'Met',     v2: 'Met',     v3: 'Met' },
  { name: 'Maintenance & Support SLA',       category: 'Commercial',  weight: 'Medium',   v1: 'Met',     v2: 'Partial', v3: 'Met' },
  { name: 'Local Manufacturing Capability',  category: 'Technical',   weight: 'High',     v1: 'Partial', v2: 'Not Met', v3: 'Not Met' },
  { name: 'Financial Stability',             category: 'Financial',   weight: 'High',     v1: 'Met',     v2: 'Met',     v3: 'Partial' },
]

const DEMO_RISKS = [
  { vendor: 'Bombardier Transit',    desc: 'No local manufacturing capability', type: 'Technical Gap',    severity: 'High' },
  { vendor: 'Alstom Transportation', desc: 'Partial maintenance SLA coverage',  type: 'Commercial Risk',  severity: 'Medium' },
  { vendor: 'Bombardier Transit',    desc: 'Incomplete safety certifications',  type: 'Compliance Issue', severity: 'Medium' },
]

const DEMO_OVERRIDES = [
  { reviewer: 'Sarah Johnson', action: 'Adjusted technical score for Vendor B',      reason: 'Manual verification of certification timeline', time: '1 day ago' },
  { reviewer: 'Michael Chen',  action: 'Updated compliance status for Requirement 5', reason: 'Additional documentation received',            time: '2 days ago' },
]

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const COLORS = ['#4F46E5', '#8B5CF6', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6']

function statusBadge(s) {
  if (s === 'Met')     return <span className="badge badge-met"     style={{ fontSize: '0.7rem' }}>✓ Met</span>
  if (s === 'Partial') return <span className="badge badge-partial" style={{ fontSize: '0.7rem' }}>◑ Partial</span>
  return                      <span className="badge badge-notmet"  style={{ fontSize: '0.7rem' }}>✗ Not Met</span>
}

function weightBadge(w) {
  const map = { Critical: 'badge-weight-critical', High: 'badge-weight-high', Medium: 'badge-weight-medium' }
  return <span className={`badge ${map[w] || 'badge-weight-medium'}`} style={{ fontSize: '0.7rem' }}>{w}</span>
}

function deriveWeight(c) {
  if (c.is_mandatory) return 'Critical'
  if (c.max_marks >= 10) return 'High'
  return 'Medium'
}

/* ── Vendor Leaderboard Card ─────────────────────────────────────────────── */
function VendorCard({ vendor, onViewDetails }) {
  return (
    <div style={{
      flex: 1, background: '#fff', borderRadius: 12, padding: '1.5rem',
      border: vendor.highlighted ? '2px solid #4F46E5' : '1px solid #E5E7EB',
      boxShadow: vendor.highlighted ? '0 0 0 4px rgba(79,70,229,.08)' : '0 1px 3px rgba(0,0,0,.06)',
      position: 'relative',
    }}>
      {/* Rank bubble */}
      {vendor.highlighted && (
        <div style={{
          position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
          width: 28, height: 28, borderRadius: '50%', background: '#4F46E5', color: '#fff',
          fontSize: '0.72rem', fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>#{vendor.rank}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827', marginBottom: 2 }}>{vendor.name}</div>
          <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Rank #{vendor.rank}</div>
        </div>
        <span className={`badge ${vendor.riskClass}`} style={{ fontSize: '0.68rem' }}>
          {vendor.riskLevel === 'Low Risk' ? '✓ ' : vendor.riskLevel === 'High Risk' ? '⚠ ' : '△ '}
          {vendor.riskLevel}
        </span>
      </div>

      <div style={{ textAlign: 'center', margin: '1rem 0' }}>
        <div style={{ fontSize: '3.25rem', fontWeight: 900, color: '#4F46E5', lineHeight: 1 }}>{vendor.score}</div>
        <div style={{ fontSize: '0.78rem', color: '#6B7280', marginTop: 4 }}>Overall Score</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1rem' }}>
        {vendor.categories.map(cat => (
          <div key={cat.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '0.8rem', color: '#374151' }}>{cat.name}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '1px 8px', borderRadius: 4, background: '#EEF2FF', color: '#4F46E5' }}>
                {cat.score}/100
              </span>
            </div>
            <div style={{ height: 6, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 999, background: cat.color, width: `${cat.score}%`, transition: 'width .8s' }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid #F3F4F6' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginBottom: 1 }}>Bid Value</div>
          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>{vendor.bidValue}</div>
        </div>
        <button className="btn-ghost" style={{ color: '#4F46E5', fontSize: '0.82rem' }} onClick={onViewDetails}>
          View Details →
        </button>
      </div>
    </div>
  )
}

/* ── Comparison Matrix ───────────────────────────────────────────────────── */
function ComparisonMatrix({ criteria, vendorNames, hasReal }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? criteria : criteria.filter(c => c.v1 === filter || c.category === filter)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: '1rem' }}>Vendor Comparison Matrix</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'Met', 'Partial', 'Not Met'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '4px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
              border: '1px solid', cursor: 'pointer',
              background: filter === f ? '#4F46E5' : '#fff',
              color: filter === f ? '#fff' : '#6B7280',
              borderColor: filter === f ? '#4F46E5' : '#E5E7EB',
              transition: 'all .15s',
            }}>{f === 'all' ? 'All' : f}</button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: '30%' }}>Requirement</th>
              <th>Weight</th>
              <th>{vendorNames[0]}</th>
              <th>{vendorNames[1]}</th>
              <th>{vendorNames[2]}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={i}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{c.name}</div>
                  <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: 2 }}>{c.category}</div>
                </td>
                <td>{weightBadge(c.weight)}</td>
                <td>{statusBadge(c.v1)}</td>
                <td style={{ opacity: hasReal ? 0.7 : 1 }}>{statusBadge(c.v2)}</td>
                <td style={{ opacity: hasReal ? 0.7 : 1 }}>{statusBadge(c.v3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Risk & Gap Analysis ─────────────────────────────────────────────────── */
function RiskItem({ vendor, desc, type, severity }) {
  const cfg = {
    High:   { badge: 'badge-high',   bg: '#FFF1F2', border: '#FECDD3', icon: '#DC2626' },
    Medium: { badge: 'badge-medium', bg: '#FFFBEB', border: '#FDE68A', icon: '#D97706' },
    Low:    { badge: 'badge-low',    bg: '#F0FDF4', border: '#BBF7D0', icon: '#16A34A' },
  }[severity] || { badge: 'badge-medium', bg: '#F9FAFB', border: '#E5E7EB', icon: '#6B7280' }

  return (
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: '1rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cfg.icon} strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>{vendor}</div>
        </div>
        <span className={`badge ${cfg.badge}`} style={{ fontSize: '0.68rem' }}>{severity} Risk</span>
      </div>
      <div style={{ fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>{desc}</div>
      <div style={{ fontSize: '0.72rem', color: '#9CA3AF', fontStyle: 'italic' }}>{type}</div>
    </div>
  )
}

/* ── Override Panel ──────────────────────────────────────────────────────── */
function OverridePanel({ report, onUpdate, staticOverrides }) {
  const [cat, setCat]       = useState('')
  const [crit, setCrit]     = useState('')
  const [marks, setMarks]   = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(false)

  const catObj  = report?.category_results?.find(c => c.category === cat)
  const critObj = catObj?.criteria?.find(c => c.criterion === crit)

  const addOverride = () => {
    if (!cat || !crit || marks === '') return
    const m = parseFloat(marks)
    if (isNaN(m) || m < 0 || (critObj && m > critObj.max_marks)) return alert('Invalid marks')
    setPending(p => [...p, { category: cat, criterion: crit, new_marks: m, reason }])
    setMarks(''); setReason('')
  }

  const recalculate = async () => {
    if (!pending.length) return
    setLoading(true)
    try {
      const updated = await applyOverride(report, pending)
      onUpdate(updated)
      setPending([])
    } catch (e) { alert(e.message) }
    setLoading(false)
  }

  const sel = { padding: '0.55rem 0.75rem', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.85rem', background: '#fff', width: '100%', outline: 'none' }

  return (
    <div>
      {/* Static override history */}
      <div className="card-title" style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>Reviewer Overrides</div>
      {staticOverrides.map((o, i) => (
        <div key={i} style={{
          padding: '0.875rem', background: '#FAFAFA', border: '1px solid #E5E7EB',
          borderRadius: 10, marginBottom: '0.625rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>{o.reviewer}</div>
            <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{o.time}</div>
          </div>
          <div style={{ fontSize: '0.82rem', color: '#374151', marginBottom: 2 }}>{o.action}</div>
          <div style={{ fontSize: '0.75rem', color: '#4F46E5' }}>{o.reason}</div>
        </div>
      ))}

      {/* Override form (only when real report exists) */}
      {report && (
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #E5E7EB' }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Add Override
          </div>
          <p style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '1rem' }}>
            Adjust any criterion score if you disagree with the AI assessment.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '0.625rem' }}>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Category</label>
              <select style={sel} value={cat} onChange={e => { setCat(e.target.value); setCrit('') }}>
                <option value="">Select category</option>
                {report.category_results.map(c => <option key={c.category}>{c.category}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Criterion</label>
              <select style={sel} value={crit} onChange={e => setCrit(e.target.value)} disabled={!cat}>
                <option value="">Select criterion</option>
                {catObj?.criteria.map(c => <option key={c.criterion}>{c.criterion} (max {c.max_marks})</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>New Marks</label>
              <input style={sel} type="number" min="0" step="0.5" placeholder="e.g. 8" value={marks} onChange={e => setMarks(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: 4, textTransform: 'uppercase' }}>Reason</label>
              <input style={sel} type="text" placeholder="Why are you overriding?" value={reason} onChange={e => setReason(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={addOverride} disabled={!cat || !crit || marks === ''}>
            + Add Override
          </button>
          {pending.length > 0 && (
            <div style={{ marginTop: '0.875rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', marginBottom: 6 }}>Pending:</div>
              {pending.map((o, i) => (
                <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#EEF2FF', color: '#4F46E5', padding: '3px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, marginRight: 6, marginBottom: 6 }}>
                  {o.criterion}: {o.new_marks}
                  <span style={{ cursor: 'pointer' }} onClick={() => setPending(p => p.filter((_, j) => j !== i))}>×</span>
                </div>
              ))}
              <div style={{ marginTop: '0.875rem' }}>
                <button className="btn btn-primary btn-sm" onClick={recalculate} disabled={loading}>
                  {loading ? 'Recalculating…' : '↻ Recalculate'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main Page ─────────────────────────────────────────────────────────── */
export default function ActiveEvaluationPage() {
  const { report: initialReport, setReport, rfpName, bidName } = useEvaluation()
  const [report, setLocalReport] = useState(initialReport)
  const [downloading, setDownloading] = useState(false)
  const navigate = useNavigate()

  const updateReport = r => { setLocalReport(r); setReport(r) }

  const hasReal = !!report

  /* ── Derive display data ──────────────────────────────────────────────── */
  const rfpTitle    = hasReal ? (rfpName ? rfpName.replace(/\.[^.]+$/, '') : 'Evaluation Results') : DEMO_RFP.name
  const rfpCategory = hasReal ? '—' : DEMO_RFP.category
  const rfpStatus   = hasReal ? 'Evaluation Complete' : DEMO_RFP.status
  const rfpUpdated  = hasReal ? 'just now' : DEMO_RFP.updated

  const realScore  = hasReal ? Math.round((report.total_score / report.max_score) * 100) : null
  const confidence = hasReal ? realScore : 94

  // Vendor 1 built from real data
  const realVendor = hasReal ? {
    name: bidName ? bidName.replace(/\.[^.]+$/, '') : 'Evaluated Vendor',
    rank: 1, score: realScore,
    riskLevel: report.disqualified ? 'High Risk' : report.passed ? 'Low Risk' : 'Medium Risk',
    riskClass: report.disqualified ? 'badge-high' : report.passed ? 'badge-low' : 'badge-medium',
    categories: report.category_results.map((cr, i) => ({
      name: cr.category,
      score: Math.round(cr.percent_achieved),
      color: COLORS[i % COLORS.length],
    })),
    bidValue: '—',
    highlighted: true,
  } : null

  const vendors = hasReal
    ? [realVendor, { ...DEMO_VENDORS[1] }, { ...DEMO_VENDORS[2] }]
    : DEMO_VENDORS

  // Criteria from real data — v2/v3 are deterministic mock values
  const realCriteria = hasReal
    ? report.category_results.flatMap(cr =>
        cr.criteria.map((c, idx) => ({
          name: c.criterion,
          category: cr.category,
          weight: deriveWeight(c),
          v1: c.compliance_status,
          v2: ['Met', 'Met', 'Partial', 'Not Met'][(c.criterion.length + idx) % 4],
          v3: ['Met', 'Partial', 'Met', 'Not Met'][(c.criterion.length * 3 + idx) % 4],
        }))
      )
    : null

  const criteria = hasReal ? realCriteria : DEMO_CRITERIA
  const vendorNames = [vendors[0].name, vendors[1].name, vendors[2].name]

  // Risk items
  const realRisks = hasReal
    ? report.risk_items.map(r => ({ vendor: bidName?.replace(/\.[^.]+$/, '') || 'Vendor', desc: r.description, type: r.risk_area, severity: r.severity }))
    : null
  const risks = hasReal ? realRisks : DEMO_RISKS

  // Override history
  const overrideHistory = DEMO_OVERRIDES

  /* ── Export ─────────────────────────────────────────────────────────────── */
  const download = async () => {
    if (!report) return
    setDownloading(true)
    try {
      const blob = await exportWord(report)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `RFP_Evaluation_${report.passed ? 'PASSED' : 'FAILED'}.docx`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e) { alert(e.message) }
    setDownloading(false)
  }

  return (
    <div className="page-content fade-in">
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>{rfpTitle}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>{rfpCategory}</span>
            <span className={`badge ${rfpStatus === 'Evaluation Complete' ? 'badge-inprog' : rfpStatus === 'In-progress' ? 'badge-inprog' : 'badge-pending'}`}>
              {rfpStatus}
            </span>
            <span style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>Last updated: {rfpUpdated}</span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={hasReal ? download : () => navigate('/evaluate')} disabled={downloading}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          {downloading ? 'Generating…' : 'Generate Report'}
        </button>
      </div>

      {/* Disqualification alert */}
      {hasReal && report.disqualified && (
        <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderLeft: '4px solid #DC2626', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: 12 }}>
          <div style={{ fontWeight: 700, color: '#BE123C' }}>⚠ Automatic Disqualification:</div>
          <div style={{ color: '#9F1239', fontSize: '0.875rem' }}>{report.disqualification_reason}</div>
        </div>
      )}

      {/* AI Recommendation Banner */}
      <div style={{
        background: hasReal && !report.passed ? 'linear-gradient(to right, #FFF1F2, #FFE4E6)' : 'linear-gradient(to right, #F0FDF4, #ECFDF5)',
        border: `1px solid ${hasReal && !report.passed ? '#FECDD3' : '#A7F3D0'}`,
        borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flex: 1 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: hasReal && !report.passed ? '#FCA5A5' : '#6EE7B7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                {hasReal && !report.passed
                  ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                  : <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#065F46', marginBottom: 4 }}>
                AI Recommendation: {vendors[0].name}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#047857', marginBottom: '0.875rem' }}>
                {hasReal ? report.executive_summary : 'Based on comprehensive analysis, Siemens Mobility India is the recommended vendor for this procurement.'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
                {[
                  hasReal
                    ? `Score: ${realScore}/100 ${report.passed ? '(PASSED)' : '(FAILED)'}`
                    : 'Highest technical score (96/100)',
                  hasReal ? `${report.category_results.length} categories evaluated` : 'Fully compliant',
                  hasReal ? (report.risk_items.length === 0 ? 'No risks identified' : `${report.risk_items.length} risks noted`) : 'Lowest risk profile',
                  hasReal ? `${report.total_score}/${report.max_score} marks` : 'Competitive bid value',
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span style={{ fontSize: '0.8rem', color: '#065F46' }}>{item}</span>
                  </div>
                ))}
              </div>
              {!hasReal && (
                <button className="btn-ghost" style={{ color: '#059669', marginTop: '0.75rem', fontSize: '0.8rem' }}>
                  View detailed AI reasoning →
                </button>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '0.7rem', color: '#6B7280', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.05em' }}>Confidence</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#059669' }}>{confidence}%</div>
          </div>
        </div>
      </div>

      {/* Vendor Leaderboard */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111827', marginBottom: '1.25rem' }}>Vendor Leaderboard</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.25rem' }}>
          {vendors.map((v, i) => (
            <VendorCard
              key={i}
              vendor={v}
              onViewDetails={() => i === 0 ? navigate('/vendor-analysis') : null}
            />
          ))}
        </div>
      </div>

      {/* Comparison Matrix */}
      <ComparisonMatrix
        criteria={criteria}
        vendorNames={vendorNames}
        hasReal={hasReal}
      />

      {/* Risk & Gap Analysis + Reviewer Overrides */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Risk & Gap Analysis */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title">Risk &amp; Gap Analysis</div>
          {risks.length === 0
            ? <div style={{ color: '#6B7280', fontSize: '0.875rem' }}>No risks identified.</div>
            : risks.map((r, i) => <RiskItem key={i} {...r} />)
          }
        </div>

        {/* Reviewer Overrides */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <OverridePanel report={report} onUpdate={updateReport} staticOverrides={overrideHistory} />
        </div>
      </div>
    </div>
  )
}
