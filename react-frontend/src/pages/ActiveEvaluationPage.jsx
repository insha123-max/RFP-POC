import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEvaluation } from '../context/EvaluationContext'
import { exportWord } from '../api'

const COLORS = ['#4F46E5', '#8B5CF6', '#22C55E', '#F59E0B', '#EC4899', '#14B8A6']

function stripExt(name) {
  return name ? name.replace(/\.[^.]+$/, '') : 'Evaluated Vendor'
}

/* ── Badges ─────────────────────────────────────────────────────────────── */
function statusBadge(s) {
  if (s === 'Met') return <span className="badge badge-met"    style={{ fontSize: '0.7rem' }}>✓ Met</span>
  return                  <span className="badge badge-notmet" style={{ fontSize: '0.7rem' }}>✗ Not Met</span>
}

function logicBadge(logic) {
  const isCategoryMin    = logic && logic.startsWith('RFP Category')
  const isOverallFallback = logic && logic.startsWith('Overall Min')
  const bg     = isCategoryMin ? '#EEF2FF' : isOverallFallback ? '#FEF3C7' : '#F3F4F6'
  const color  = isCategoryMin ? '#4F46E5' : isOverallFallback ? '#D97706' : '#6B7280'
  const border = isCategoryMin ? '#C7D2FE' : isOverallFallback ? '#FCD34D' : '#E5E7EB'
  const icon   = isCategoryMin ? '📋 ' : '⚖ '
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '0.65rem', fontWeight: 600,
      padding: '2px 7px', borderRadius: 999,
      background: bg, color, border: `1px solid ${border}`,
      whiteSpace: 'nowrap',
    }}>
      {icon}{logic || '50% Fallback'}
    </span>
  )
}


function qualBadge(qt) {
  if (!qt) return null
  const isPQ = qt === 'PQ'
  return (
    <span style={{
      display: 'inline-block', fontSize: '0.6rem', fontWeight: 800,
      padding: '1px 6px', borderRadius: 4, marginLeft: 5,
      background: isPQ ? '#FEF3C7' : '#EDE9FE',
      color: isPQ ? '#92400E' : '#5B21B6',
      border: `1px solid ${isPQ ? '#FDE68A' : '#DDD6FE'}`,
      letterSpacing: '0.04em', verticalAlign: 'middle',
    }}>
      {qt}
    </span>
  )
}

/* ── Vendor Card ────────────────────────────────────────────────────────── */
function VendorCard({ vendor, pqChecks = [], isPQTQ = false }) {
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

      {/* PQ eligibility summary — only shown in PQTQ mode */}
      {isPQTQ && pqChecks.length > 0 && (() => {
        const passed = pqChecks.filter(c => c.met).length
        const total  = pqChecks.length
        const pct    = Math.round((passed / total) * 100)
        const allPass = passed === total
        const barColor = allPass ? '#16A34A' : passed === 0 ? '#DC2626' : '#F59E0B'
        const labelColor = allPass ? '#15803D' : passed === 0 ? '#DC2626' : '#B45309'
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {qualBadge('PQ')} Pre-Qualification
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.8rem', color: '#374151' }}>Eligibility Criteria</span>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '1px 8px', borderRadius: 4, background: allPass ? '#DCFCE7' : '#FEF3C7', color: labelColor }}>
                  {passed}/{total} Met
                </span>
              </div>
              <div style={{ height: 6, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, background: barColor, width: `${pct}%`, transition: 'width .8s' }} />
              </div>
              <div style={{ fontSize: '0.68rem', color: '#9CA3AF', marginTop: 4 }}>
                {allPass ? 'All eligibility criteria met' : `${total - passed} not met — see Requirements Assessment`}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Scoring categories */}
      {vendor.categories.length > 0 && (
        <div>
          {isPQTQ && pqChecks.length > 0 && (
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#5B21B6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              {qualBadge('TQ')} Technical Qualification
            </div>
          )}
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
      )}
    </div>
  )
}

/* ── Requirements Table ─────────────────────────────────────────────────── */
function RequirementsTable({ criteria, pqChecks = [], title = 'Requirements Assessment', qualType = '' }) {
  const [filter, setFilter] = useState('all')

  const pqRows = pqChecks.map(chk => ({
    name: chk.criterion || chk.condition || '',
    category: 'Pre-Qualification',
    weight: 'Critical',
    v1: chk.status || (chk.met ? 'Met' : 'Not Met'),
    threshold_logic: 'PQ Pass/Fail',
    justification: chk.justification || chk.detail || chk.note || '',
    qualification_type: 'PQ',
    isPQ: true,
    met: chk.status === 'Met' || chk.met === true,
  }))

  const allRows = [...pqRows, ...criteria]
  const filtered = filter === 'all' ? allRows : allRows.filter(c => c.v1 === filter)
  const metCount    = allRows.filter(r => r.v1 === 'Met').length
  const notMetCount = allRows.filter(r => r.v1 === 'Not Met').length

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {qualType && qualBadge(qualType)}
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>{title}</span>
          <span style={{ fontSize: '0.7rem', color: '#6B7280', background: '#F1F5F9', borderRadius: 999, padding: '2px 8px', fontWeight: 600 }}>
            {allRows.length} criteria
          </span>
          {qualType && (
            <span style={{ display: 'flex', gap: 5 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#DCFCE7', color: '#15803D', borderRadius: 999, padding: '2px 8px' }}>
                ✓ {metCount} Met
              </span>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#FEE2E2', color: '#DC2626', borderRadius: 999, padding: '2px 8px' }}>
                ✗ {notMetCount} Not Met
              </span>
            </span>
          )}
        </div>
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
              <th style={{ width: '42%' }}>Requirement</th>
              <th>Category</th>
              <th>Status</th>
              <th>Logic</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => {
              const prevIsPQ = i > 0 && filtered[i - 1].isPQ
              const showTQDivider = !c.isPQ && prevIsPQ
              return (
              <React.Fragment key={i}>
                {showTQDivider && (
                  <tr key={`div-${i}`}>
                    <td colSpan={5} style={{ padding: '4px 12px', background: '#EDE9FE', fontSize: '0.68rem', fontWeight: 800, color: '#5B21B6', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {qualBadge('TQ')} Technical Qualification Criteria
                    </td>
                  </tr>
                )}
                {i === 0 && c.isPQ && (
                  <tr key={`pq-hdr-${i}`}>
                    <td colSpan={5} style={{ padding: '4px 12px', background: '#FEF3C7', fontSize: '0.68rem', fontWeight: 800, color: '#92400E', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {qualBadge('PQ')} Pre-Qualification / Eligibility Criteria
                    </td>
                  </tr>
                )}
              <tr key={i} style={{ background: c.isPQ ? (c.met ? '#FEFCE8' : '#FFF7F7') : c.isSynth ? '#FAFAFA' : undefined }}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: c.isSynth ? '#6B7280' : '#111827' }}>
                    {c.name}{qualBadge(c.qualification_type)}
                    {c.isSynth && <span style={{ fontSize: '0.6rem', color: '#9CA3AF', marginLeft: 6, fontWeight: 500 }}>not evaluated</span>}
                  </div>
                  {c.justification && (
                    <div style={{ fontSize: '0.73rem', color: '#6B7280', marginTop: 3, lineHeight: 1.45 }}>{c.justification}</div>
                  )}
                </td>
                <td style={{ fontSize: '0.78rem', color: '#6B7280' }}>{c.category}</td>
                <td>{statusBadge(c.v1)}</td>
                <td>{logicBadge(c.threshold_logic)}</td>
                <td style={{ fontWeight: 700, fontSize: '0.85rem', color: c.isPQ ? (c.met ? '#15803D' : '#DC2626') : '#4F46E5' }}>
                  {c.isPQ ? (c.met ? 'Pass' : 'Fail') : `${c.marks_awarded}/${c.max_marks}`}
                </td>
              </tr>
              </React.Fragment>
              )
            })}
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
    <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cfg.icon} strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#111827' }}>{type}</div>
        </div>
        <span className={`badge ${cfg.badge}`} style={{ fontSize: '0.68rem' }}>{severity} Risk</span>
      </div>
      <div style={{ fontSize: '0.8rem', color: '#374151', marginBottom: 4 }}>{desc}</div>
      <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{vendor}</div>
    </div>
  )
}


/* ── Root Cause Panel ───────────────────────────────────────────────────── */
function RootCausePanel({ report }) {
  if (!report.executive_summary) return null

  return (
    <div style={{
      background: '#FFFBEB', border: '1px solid #FDE68A',
      borderLeft: '4px solid #D97706', borderRadius: 10,
      padding: '1rem 1.25rem', marginBottom: '1.5rem',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#92400E', marginBottom: 4 }}>Root Cause</div>
        <p style={{ fontSize: '0.82rem', color: '#78350F', lineHeight: 1.65, margin: 0 }}>{report.executive_summary}</p>
      </div>
    </div>
  )
}


/* ── Main Page ──────────────────────────────────────────────────────────── */
export default function ActiveEvaluationPage() {
  const { report, rfpName, bidName } = useEvaluation()
  const [downloading, setDownloading] = useState(false)
  const navigate = useNavigate()

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

  // Separate PQ (pass/fail eligibility) from TQ (scored technical) category results
  const pqCats = report.category_results.filter(cr => cr.qualification_type === 'PQ')
  const tqCats = report.category_results.filter(cr => cr.qualification_type !== 'PQ')

  // PQ checks shown as pass/fail in the vendor card — derived from PQ category results only
  const pqChecks = pqCats.map(cr => ({
    condition: cr.category,
    met: cr.passed,
    note: `${Math.round(cr.marks_awarded)}/${cr.max_marks} marks`,
  }))

  const vendor = {
    name: vendorName,
    score,
    riskLevel: report.disqualified ? 'High Risk' : report.passed ? 'Low Risk' : 'Medium Risk',
    riskClass: report.disqualified ? 'badge-high' : report.passed ? 'badge-low' : 'badge-medium',
    categories: (() => {
      // Only show top-level categories in the summary card — exclude sub-criteria rows.
      // Sub-criteria are identified by names starting with "Sub-Criterion", "Criterion N:",
      // or being significantly smaller than the largest category (< 8% of max_score).
      const totalMax = report.max_score || 1
      const topLevel = tqCats.filter(cr => {
        const n = cr.category.toLowerCase()
        if (/^sub[-\s]?criterion/i.test(cr.category)) return false
        if (/^criterion\s+\d/i.test(cr.category)) return false
        if (cr.max_marks < totalMax * 0.08) return false
        return true
      })
      // Fallback: if filter removes everything, show all tqCats (capped at 8)
      const display = topLevel.length > 0 ? topLevel : tqCats
      return display.slice(0, 8).map((cr, i) => ({
        name: cr.category,
        score: Math.round(cr.percent_achieved),
        color: COLORS[i % COLORS.length],
        qualification_type: cr.qualification_type || '',
      }))
    })(),
  }

  const allRawCriteria = report.category_results.flatMap(cr => cr.criteria)

  // isPQTQ is true when every scoring category has an explicit PQ/TQ label.
  // Both run_full_evaluation and run_pqtq_evaluation now use stage2_extract_pqtq_rules,
  // so all evaluations produce qualified categories and isPQTQ=true by default.
  const isPQTQ = (report.rules?.scoring_categories?.length ?? 0) > 0 &&
    report.rules.scoring_categories.every(cat => cat.qualification_type === 'PQ' || cat.qualification_type === 'TQ')

  // Flat table rows: all evaluated criteria + synthesize any sub-criteria the LLM
  // skipped (categories that returned 0 individual criterion evals despite having
  // subcriteria in the rules — shown as Not Met / 0 marks with a note).
  const evaluatedKeys = new Set(allRawCriteria.map(c => c.criterion.trim().toLowerCase()))

  const synthRows = []
  const coveredCategories = new Set(allRawCriteria.map(c => {
    const cr = report.category_results.find(r => r.criteria.includes(c))
    return cr?.category ?? ''
  }))

  for (const ruleCat of (report.rules?.scoring_categories || [])) {
    const catResult = report.category_results.find(cr => cr.category === ruleCat.category)
    if (!catResult) continue

    if ((ruleCat.subcriteria || []).length > 0) {
      // Synthesize a row for every sub-criterion not already individually evaluated
      for (const sub of ruleCat.subcriteria) {
        const key = sub.criterion.trim().toLowerCase()
        const alreadyEvaluated = [...evaluatedKeys].some(ek =>
          ek.includes(key.slice(0, 28)) || key.includes(ek.slice(0, 28))
        )
        if (alreadyEvaluated) continue
        synthRows.push({
          name: sub.criterion,
          category: ruleCat.category,
          v1: 'Not Met',
          justification: 'Not individually evaluated — no supporting evidence found in bid document.',
          vendor_claim: 'Not found',
          marks_awarded: 0,
          max_marks: sub.max_marks,
          threshold_logic: '50% Fallback',
          qualification_type: ruleCat.qualification_type || 'TQ',
          isSynth: true,
        })
      }
    } else if (!coveredCategories.has(ruleCat.category) && catResult.criteria.length === 0) {
      // No subcriteria in rules and no individual evals — show the category as a single row
      synthRows.push({
        name: ruleCat.category,
        category: ruleCat.category,
        v1: catResult.passed ? 'Met' : 'Not Met',
        justification: catResult.criteria.length === 0
          ? 'Category-level result — no individual sub-criteria were evaluated.'
          : '',
        vendor_claim: 'Not found',
        marks_awarded: catResult.marks_awarded,
        max_marks: catResult.max_marks,
        threshold_logic: '50% Fallback',
        qualification_type: ruleCat.qualification_type || 'TQ',
        isSynth: true,
      })
    }
  }

  const criteria = [
    ...allRawCriteria.map(c => {
      const cr = report.category_results.find(r => r.criteria.includes(c))
      return {
        name: c.criterion,
        category: cr?.category ?? '',
        v1: c.compliance_status,
        justification: c.justification,
        vendor_claim: c.vendor_claim,
        source_reference: c.source_reference,
        confidence: c.confidence,
        marks_awarded: c.marks_awarded,
        max_marks: c.max_marks,
        threshold_logic: c.threshold_logic || '50% Fallback',
        qualification_type: c.qualification_type || 'TQ',
      }
    }),
    ...synthRows,
  ]

  // PQTQ mode: split evaluated criteria into separate PQ and TQ tables
  const tqTableRows = isPQTQ
    ? allRawCriteria.filter(c => c.qualification_type === 'TQ').map(c => {
        const cr = report.category_results.find(r => r.criteria.includes(c))
        return {
          name: c.criterion,
          category: cr?.category ?? '',
          v1: c.compliance_status,
          justification: c.justification,
          vendor_claim: c.vendor_claim,
          source_reference: c.source_reference,
          confidence: c.confidence,
          marks_awarded: c.marks_awarded,
          max_marks: c.max_marks,
          threshold_logic: c.threshold_logic || 'TQ Scoring',
          qualification_type: 'TQ',
        }
      })
    : []

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
            {report.prebid_applied && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#EDE9FE', color: '#5B21B6', fontSize: '0.68rem', fontWeight: 700,
                padding: '2px 10px', borderRadius: 999, border: '1px solid #DDD6FE',
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#5B21B6" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Pre-Bid Q&amp;A Applied
              </span>
            )}
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
        background: 'linear-gradient(to right, #EEF2FF, #E0E7FF)',
        border: '1px solid #C7D2FE',
        borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flex: 1 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: '#818CF8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                {!report.passed
                  ? <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>
                  : <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#3730A3', marginBottom: 4 }}>
                AI Assessment: {vendorName}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#4338CA', marginBottom: '0.875rem' }}>
                {report.executive_summary}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
                {[
                  `${report.total_score}/${report.max_score} marks`,
                  `${report.category_results.length} categories evaluated`,
                  report.risk_items.length === 0 ? 'No risks identified' : `${report.risk_items.length} risk${report.risk_items.length > 1 ? 's' : ''} noted`,
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style={{ fontSize: '0.8rem', color: '#3730A3' }}>{item}</span>
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

      {/* Root Cause Analysis — only for failing bids */}
      {!report.passed && (
        <RootCausePanel report={report} vendorName={vendorName} />
      )}

      {/* Vendor Card */}
      <div style={{ marginBottom: '1.75rem' }}>
        <h2 style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111827', marginBottom: '1.25rem' }}>Vendor Evaluation</h2>
        <VendorCard vendor={vendor} pqChecks={pqChecks} isPQTQ={isPQTQ} />
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

        </div>
      </div>

      {/* Requirements Assessment */}
      {isPQTQ ? (
        <>
          {pqChecks.length > 0 && (
            <RequirementsTable
              criteria={[]}
              pqChecks={pqChecks}
              title="Pre-Qualification Requirements"
              qualType="PQ"
            />
          )}
          {tqTableRows.length > 0 && (
            <RequirementsTable
              criteria={tqTableRows}
              title="Technical Qualification Criteria"
              qualType="TQ"
            />
          )}
        </>
      ) : (
        <RequirementsTable
          criteria={criteria}
          pqChecks={report.pq_checks || []}
          title="Requirements Assessment"
        />
      )}

      {/* Pre-Bid Q&A Clarifications */}
      {report.prebid_qa?.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Pre-Bid Q&amp;A Clarifications</div>
            <span style={{
              background: '#EDE9FE', color: '#5B21B6', fontSize: '0.68rem', fontWeight: 700,
              padding: '1px 9px', borderRadius: 999, border: '1px solid #DDD6FE',
            }}>{report.prebid_qa.length} Q&amp;As</span>
          </div>
          <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {report.prebid_qa.map((item, i) => (
              <div key={i} style={{ borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
                <div style={{
                  background: '#F8FAFC', padding: '0.65rem 1rem',
                  fontSize: '0.82rem', fontWeight: 600, color: '#1E293B',
                  borderBottom: '1px solid #E5E7EB', display: 'flex', gap: 8, alignItems: 'flex-start',
                }}>
                  <span style={{ color: '#7C3AED', fontWeight: 800, flexShrink: 0 }}>Q{i + 1}</span>
                  {item.question}
                </div>
                <div style={{ padding: '0.65rem 1rem', fontSize: '0.82rem', color: '#374151', background: '#fff', lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: '#16A34A', fontWeight: 800, flexShrink: 0 }}>A</span>
                  {item.answer}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk & Gap Analysis — only shown when there are actual risks/gaps AND score is not perfect */}
      {risks.length > 0 && score < 100 && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="card-title">Risk &amp; Gap Analysis</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
            {risks.map((r, i) => <RiskItem key={i} {...r} />)}
          </div>
        </div>
      )}
    </div>
  )
}
