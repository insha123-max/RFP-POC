import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEvaluation } from '../context/EvaluationContext'
import { applyOverride, exportWord } from '../api'

const COLORS = ['#4F46E5', '#8B5CF6', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6']

function stripExt(name) {
  return name ? name.replace(/\.[^.]+$/, '') : 'Evaluated Vendor'
}

function deriveWeight(c) {
  if (c.is_mandatory) return 'Critical'
  return 'Low'
}

/* ── Badges ─────────────────────────────────────────────────────────────── */
function statusBadge(s) {
  if (s === 'Met') return <span className="badge badge-met"    style={{ fontSize: '0.7rem' }}>✓ Met</span>
  return                  <span className="badge badge-notmet" style={{ fontSize: '0.7rem' }}>✗ Not Met</span>
}

function weightBadge(w) {
  const map = { Critical: 'badge-weight-critical', Low: 'badge-weight-medium' }
  return <span className={`badge ${map[w] || 'badge-weight-medium'}`} style={{ fontSize: '0.7rem' }}>{w}</span>
}

/* ── Vendor Card ────────────────────────────────────────────────────────── */
function VendorCard({ vendor }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: '1.5rem',
      border: '2px solid #4F46E5', boxShadow: '0 0 0 4px rgba(79,70,229,.08)',
      maxWidth: 400, margin: '0 auto', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
        width: 28, height: 28, borderRadius: '50%', background: '#4F46E5', color: '#fff',
        fontSize: '0.72rem', fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>#1</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.875rem' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827', marginBottom: 2 }}>{vendor.name}</div>
          <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>Evaluated Vendor</div>
        </div>
        <span className={`badge ${vendor.riskClass}`} style={{ fontSize: '0.68rem' }}>
          {vendor.riskLevel === 'Low Risk' ? '✓ ' : '△ '}{vendor.riskLevel}
        </span>
      </div>

      <div style={{ textAlign: 'center', margin: '1rem 0' }}>
        <div style={{ fontSize: '3.25rem', fontWeight: 900, color: '#4F46E5', lineHeight: 1 }}>{vendor.score}</div>
        <div style={{ fontSize: '0.78rem', color: '#6B7280', marginTop: 4 }}>Overall Score</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
    </div>
  )
}

/* ── Requirements Table ─────────────────────────────────────────────────── */
function RequirementsTable({ criteria }) {
  const [filter, setFilter] = useState('all')
  const filtered = filter === 'all' ? criteria : criteria.filter(c => c.v1 === filter)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 700, fontSize: '1rem' }}>Requirements Assessment</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'Met', 'Not Met'].map(f => (
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
              <th style={{ width: '40%' }}>Requirement</th>
              <th>Category</th>
              <th>Weight</th>
              <th>Status</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={i}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{c.name}</div>
                  {c.justification && (
                    <div style={{ fontSize: '0.7rem', color: '#9CA3AF', marginTop: 2 }}>{c.justification.slice(0, 80)}{c.justification.length > 80 ? '…' : ''}</div>
                  )}
                </td>
                <td style={{ fontSize: '0.78rem', color: '#6B7280' }}>{c.category}</td>
                <td>{weightBadge(c.weight)}</td>
                <td>{statusBadge(c.v1)}</td>
                <td style={{ fontWeight: 700, color: '#4F46E5', fontSize: '0.85rem' }}>{c.marks_awarded}/{c.max_marks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Risk Item ──────────────────────────────────────────────────────────── */
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
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
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

/* ── Override Panel ─────────────────────────────────────────────────────── */
function OverridePanel({ report, onUpdate }) {
  const [cat, setCat]       = useState('')
  const [crit, setCrit]     = useState('')
  const [marks, setMarks]   = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const catObj  = report?.category_results?.find(c => c.category === cat)
  const critObj = catObj?.criteria?.find(c => c.criterion === crit)

  const addOverride = () => {
    if (!cat || !crit || marks === '') return
    const m = parseFloat(marks)
    if (isNaN(m) || m < 0 || (critObj && m > critObj.max_marks)) return alert('Invalid marks')
    setPending(p => [...p, { category: cat, criterion: crit, new_marks: m, reason }])
    setMarks(''); setReason('')
    setSuccess(false)
  }

  const recalculate = async () => {
    if (!pending.length) return
    setLoading(true)
    setSuccess(false)
    try {
      const updated = await applyOverride(report, pending)
      onUpdate(updated)
      setPending([])
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    } catch (e) { alert(e.message) }
    setLoading(false)
  }

  const sel = { padding: '0.55rem 0.75rem', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: '0.85rem', background: '#fff', width: '100%', outline: 'none' }

  return (
    <div>
      <div className="card-title" style={{ fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Committee Override
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
            {catObj?.criteria.map(c => <option key={c.criterion} value={c.criterion}>{c.criterion} (max {c.max_marks})</option>)}
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
      {success && (
        <div style={{ marginTop: '0.875rem', display: 'flex', alignItems: 'center', gap: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '0.6rem 0.875rem' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#15803D' }}>Scores successfully recalculated</span>
        </div>
      )}
    </div>
  )
}

/* ── Main Page ──────────────────────────────────────────────────────────── */
export default function ActiveEvaluationPage() {
  const { report: initialReport, setReport, rfpName, bidName } = useEvaluation()
  const [report, setLocalReport] = useState(initialReport)
  const [downloading, setDownloading] = useState(false)
  const navigate = useNavigate()

  const updateReport = r => { setLocalReport(r); setReport(r) }

  /* ── Empty state ──────────────────────────────────────────────────────── */
  if (!report) return (
    <div className="page-content">
      <div className="card" style={{ padding: '4rem', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.8">
            <path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/>
          </svg>
        </div>
        <h2 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>No evaluation loaded</h2>
        <p style={{ color: '#6B7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Run a new evaluation or select one from the Dashboard to view results here.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/evaluate')}>Start New Evaluation</button>
      </div>
    </div>
  )

  /* ── Derive display data ──────────────────────────────────────────────── */
  const score      = Math.round((report.total_score / report.max_score) * 100)
  const vendorName = stripExt(bidName)

  const vendor = {
    name: vendorName,
    score,
    riskLevel: report.disqualified ? 'High Risk' : report.passed ? 'Low Risk' : 'Medium Risk',
    riskClass: report.disqualified ? 'badge-high' : report.passed ? 'badge-low' : 'badge-medium',
    categories: report.category_results.map((cr, i) => ({
      name: cr.category,
      score: Math.round(cr.percent_achieved),
      color: COLORS[i % COLORS.length],
    })),
  }

  const criteria = report.category_results.flatMap(cr =>
    cr.criteria.map(c => ({
      name: c.criterion,
      category: cr.category,
      weight: deriveWeight(c),
      v1: c.compliance_status,
      justification: c.justification,
      marks_awarded: c.marks_awarded,
      max_marks: c.max_marks,
    }))
  )

  const risks = report.risk_items.map(r => ({
    vendor: vendorName,
    desc: r.description,
    type: r.risk_area,
    severity: r.severity,
  }))

  /* ── Export ─────────────────────────────────────────────────────────────── */
  const download = async () => {
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
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>
            {rfpName ? stripExt(rfpName) : 'Evaluation Results'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="badge badge-inprog">Evaluation Complete</span>
            <span style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>just now</span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={download} disabled={downloading}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          {downloading ? 'Generating…' : 'Generate Report'}
        </button>
      </div>

      {/* Disqualification alert */}
      {report.disqualified && (
        <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderLeft: '4px solid #DC2626', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ fontWeight: 700, color: '#BE123C', flexShrink: 0 }}>⚠ Automatic Disqualification:</div>
          <div style={{ color: '#9F1239', fontSize: '0.875rem' }}>
            {report.disqualification_reason}
            <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#BE123C', fontStyle: 'italic' }}>
              The overall score ({score}%) is above the {report.threshold}% threshold, but a mandatory eligibility requirement was not met — the vendor is disqualified regardless of score.
            </div>
          </div>
        </div>
      )}

      {/* Category minimum failure alert — shown when overall score passes but a category is below its minimum */}
      {!report.passed && !report.disqualified && (() => {
        const failedCats = report.category_results.filter(cr =>
          cr.minimum_required != null && Math.round(cr.percent_achieved) < cr.minimum_required
        )
        if (!failedCats.length) return null
        return (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderLeft: '4px solid #D97706', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ fontWeight: 700, color: '#B45309', marginBottom: 6 }}>⚠ Category Minimum Not Met</div>
            <div style={{ fontSize: '0.82rem', color: '#92400E', marginBottom: 8 }}>
              The overall score ({score}%) is above the {report.threshold}% threshold, but every individual category must also meet its minimum — the evaluation fails if any category falls short.
            </div>
            {failedCats.map(cr => (
              <div key={cr.category} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem 0.75rem', background: '#FEF3C7', borderRadius: 8, marginBottom: 4 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#92400E' }}>{cr.category}:</span>
                <span style={{ fontSize: '0.82rem', color: '#92400E' }}>
                  scored {Math.round(cr.percent_achieved)}% — requires {cr.minimum_required}% minimum
                </span>
                <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '0.78rem', color: '#DC2626' }}>
                  Short by {Math.round(cr.minimum_required - cr.percent_achieved)}%
                </span>
              </div>
            ))}
          </div>
        )
      })()}

      {/* AI Recommendation Banner */}
      <div style={{
        background: !report.passed ? 'linear-gradient(to right, #FFF1F2, #FFE4E6)' : 'linear-gradient(to right, #F0FDF4, #ECFDF5)',
        border: `1px solid ${!report.passed ? '#FECDD3' : '#A7F3D0'}`,
        borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flex: 1 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: !report.passed ? '#FCA5A5' : '#6EE7B7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                {!report.passed
                  ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                  : <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#065F46', marginBottom: 4 }}>
                AI Assessment: {vendorName}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#047857', marginBottom: '0.875rem' }}>
                {report.executive_summary}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
                {[
                  `${report.total_score}/${report.max_score} marks`,
                  `${report.category_results.length} categories evaluated`,
                  report.risk_items.length === 0 ? 'No risks identified' : `${report.risk_items.length} risk${report.risk_items.length > 1 ? 's' : ''} noted`,
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: '0.8rem', color: '#065F46' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Score vs Threshold */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '0.7rem', color: '#6B7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>Score</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: report.passed ? '#059669' : '#DC2626', lineHeight: 1 }}>{score}%</div>
            {report.threshold > 0 && score < report.threshold && (
              <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FFE4E6', borderRadius: 6, padding: '3px 8px' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <line x1="12" y1="5" x2="12" y2="19"/>
                </svg>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#BE123C' }}>Need {report.threshold}%</span>
              </div>
            )}
            {report.threshold > 0 && score >= report.threshold && !report.passed && (
              <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#FEF3C7', borderRadius: 6, padding: '3px 8px' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#B45309' }}>
                  {report.disqualified ? 'Disqualified' : 'Category failed'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vendor Card */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111827', marginBottom: '1.25rem' }}>Vendor Evaluation</h2>
        <VendorCard vendor={vendor} />
      </div>

      {/* Pass Criteria Breakdown */}
      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Pass Criteria
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Overall threshold row */}
          {report.threshold > 0 && (() => {
            const passed = score >= report.threshold
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.875rem 1rem', borderRadius: 10, background: passed ? '#F0FDF4' : '#FFF1F2', border: `1px solid ${passed ? '#BBF7D0' : '#FECDD3'}` }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: passed ? '#22C55E' : '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                    {passed ? <polyline points="20 6 9 17 4 12"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>Overall Score</div>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>
                    Minimum required: {report.threshold}% to pass
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: passed ? '#16A34A' : '#DC2626' }}>{score}%</div>
                  <div style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>Need {report.threshold}%</div>
                </div>
                {/* Progress bar */}
                <div style={{ width: 120, flexShrink: 0 }}>
                  <div style={{ height: 8, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', borderRadius: 999, background: passed ? '#22C55E' : '#EF4444', width: `${Math.min(score, 100)}%`, transition: 'width .8s' }} />
                    {/* Threshold marker */}
                    <div style={{ position: 'absolute', top: -2, bottom: -2, width: 2, background: '#374151', left: `${report.threshold}%`, borderRadius: 1 }} />
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#9CA3AF', marginTop: 3, textAlign: 'right' }}>▲ {report.threshold}% threshold</div>
                </div>
              </div>
            )
          })()}

          {/* Per-category rows */}
          {report.category_results.filter(cr => cr.minimum_required != null).map(cr => {
            const catPct   = Math.round(cr.percent_achieved)
            const required = cr.minimum_required
            const catPass  = catPct >= required
            return (
              <div key={cr.category} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.875rem 1rem', borderRadius: 10, background: catPass ? '#F0FDF4' : '#FFF1F2', border: `1px solid ${catPass ? '#BBF7D0' : '#FECDD3'}` }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: catPass ? '#22C55E' : '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                    {catPass ? <polyline points="20 6 9 17 4 12"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>{cr.category}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>
                    {Math.round(cr.marks_awarded)}/{cr.max_marks} marks · Minimum: {required}% required
                    {!catPass && <span style={{ color: '#DC2626', fontWeight: 700 }}> · Short by {Math.round(required - catPct)}%</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: catPass ? '#16A34A' : '#DC2626' }}>{catPct}%</div>
                  <div style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>Need {required}%</div>
                </div>
                <div style={{ width: 120, flexShrink: 0 }}>
                  <div style={{ height: 8, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ height: '100%', borderRadius: 999, background: catPass ? '#22C55E' : '#EF4444', width: `${Math.min(catPct, 100)}%`, transition: 'width .8s' }} />
                    <div style={{ position: 'absolute', top: -2, bottom: -2, width: 2, background: '#374151', left: `${required}%`, borderRadius: 1 }} />
                  </div>
                  <div style={{ fontSize: '0.62rem', color: '#9CA3AF', marginTop: 3, textAlign: 'right' }}>▲ {required}% threshold</div>
                </div>
              </div>
            )
          })}

          {/* Disqualifiers */}
          {report.disqualifier_checks?.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Mandatory Requirements</div>
              {report.disqualifier_checks.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.65rem 1rem', borderRadius: 8, background: d.met ? '#F0FDF4' : '#FFF1F2', border: `1px solid ${d.met ? '#BBF7D0' : '#FECDD3'}`, marginBottom: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1, background: d.met ? '#22C55E' : '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                      {d.met ? <polyline points="20 6 9 17 4 12"/> : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827' }}>{d.condition}</div>
                    {d.note && <div style={{ fontSize: '0.72rem', color: '#6B7280', marginTop: 2 }}>{d.note}</div>}
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, flexShrink: 0, color: d.met ? '#16A34A' : '#DC2626' }}>
                    {d.met ? 'Met' : 'NOT MET'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Requirements Assessment */}
      <RequirementsTable criteria={criteria} />

      {/* Risk & Gap Analysis + Override */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title">Risk &amp; Gap Analysis</div>
          {risks.length === 0
            ? <div style={{ color: '#6B7280', fontSize: '0.875rem' }}>No risks identified.</div>
            : risks.map((r, i) => <RiskItem key={i} {...r} />)}
        </div>
        <div className="card" style={{ padding: '1.5rem' }}>
          <OverridePanel report={report} onUpdate={updateReport} />
        </div>
      </div>
    </div>
  )
}
