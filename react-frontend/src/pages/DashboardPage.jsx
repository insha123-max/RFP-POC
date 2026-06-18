import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEvaluation } from '../context/EvaluationContext'
import { PQTQReportModal } from '../components/PQTQReportModal'

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

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function stripExt(name) {
  return name ? name.replace(/\.[^.]+$/, '') : '—'
}

function getEvalType(entry) {
  if (entry.evaluationType) return entry.evaluationType
  const cats = entry.report?.category_results || []
  const hasPQTQ = cats.some(cr => cr.qualification_type === 'PQ' || cr.qualification_type === 'TQ')
  return hasPQTQ ? 'PQTQ' : 'General'
}

/* ── Sub-components ─────────────────────────────────────────────────────── */
function StatCard({ label, rawValue, suffix = '', sub, icon, valueColor }) {
  const counted = useCountUp(rawValue ?? 0)
  return (
    <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 500 }}>{label}</span>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
      </div>
      <div className="count-up" style={{ fontSize: '1.75rem', fontWeight: 800, color: valueColor || '#111827', lineHeight: 1, marginBottom: '0.4rem' }}>
        {counted}{suffix}
      </div>
      {sub && <div style={{ fontSize: '0.78rem', color: '#9CA3AF' }}>{sub}</div>}
    </div>
  )
}

/* ── AI Evaluation Card ─────────────────────────────────────────────────── */
function EvalCard({ entry, onView, onReport, onDelete }) {
  const [confirming, setConfirming] = useState(false)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? '#C7D2FE' : '#E5E7EB'}`,
        borderRadius: 10, padding: '1.25rem', background: '#fff', marginBottom: '0.75rem',
        transform: hovered ? 'translateX(4px)' : 'none',
        boxShadow: hovered ? '0 4px 16px rgba(99,102,241,.1)' : 'none',
        transition: 'all .22s cubic-bezier(.34,1.56,.64,1)',
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827', marginRight: 12, flex: 1 }}>{stripExt(entry.rfpName)}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {getEvalType(entry) === 'PQTQ' ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: '#EDE9FE', color: '#6D28D9', border: '1px solid #C4B5FD' }}>PQ/TQ</span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD' }}>General</span>
          )}
          <span className={`badge ${entry.passed ? 'badge-low' : 'badge-high'}`}>
            {entry.passed ? '✓ Passed' : '✗ Failed'}
          </span>
          {confirming ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => { onDelete(); setConfirming(false) }} style={{ padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Confirm</button>
              <button onClick={() => setConfirming(false)} style={{ padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: '#F1F5F9', color: '#374151', border: 'none', cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} title="Delete" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '0.875rem' }}>Vendor: {stripExt(entry.bidName)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.875rem' }}>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 500, marginBottom: 2 }}>Score</div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{entry.score}%</div>
        </div>
        <div>
          <div style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 500, marginBottom: 2 }}>Evaluated</div>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{formatDate(entry.timestamp)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button className="btn btn-primary" style={{ display: 'inline-flex', width: 'auto', fontSize: '0.78rem', padding: '0.45rem 0.9rem' }} onClick={onView}>View Results →</button>
        <button className="btn-ghost" style={{ flexShrink: 0, fontSize: '0.82rem', color: '#6B7280', fontWeight: 600 }} onClick={onReport}>View Report</button>
      </div>
    </div>
  )
}

/* ── PQTQ Check Card ─────────────────────────────────────────────────────── */
function PQTQCheckCard({ entry, onDelete, onViewReport }) {
  const [confirming, setConfirming] = useState(false)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? '#C7D2FE' : '#E5E7EB'}`,
        borderRadius: 10, padding: '1.25rem', background: '#fff', marginBottom: '0.75rem',
        transform: hovered ? 'translateX(4px)' : 'none',
        boxShadow: hovered ? '0 4px 16px rgba(99,102,241,.1)' : 'none',
        transition: 'all .22s cubic-bezier(.34,1.56,.64,1)',
        borderLeft: `3px solid #4F46E5`,
      }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827', marginRight: 12, flex: 1 }}>{stripExt(entry.rfpName)}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE' }}>
            PQTQ Check
          </span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999,
            fontSize: '0.68rem', fontWeight: 700,
            background: entry.pqPass ? '#DCFCE7' : '#FEE2E2',
            color: entry.pqPass ? '#15803D' : '#DC2626',
            border: `1px solid ${entry.pqPass ? '#BBF7D0' : '#FECACA'}`,
          }}>
            {entry.pqPass ? '✓ PQ Pass' : '✗ PQ Fail'}
          </span>
          {confirming ? (
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => { onDelete(); setConfirming(false) }} style={{ padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: '#EF4444', color: '#fff', border: 'none', cursor: 'pointer' }}>Confirm</button>
              <button onClick={() => setConfirming(false)} style={{ padding: '3px 10px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: '#F1F5F9', color: '#374151', border: 'none', cursor: 'pointer' }}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirming(true)} title="Delete" style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: '0.78rem', color: '#6B7280', marginBottom: '0.875rem' }}>
        Bid readiness check · {formatDate(entry.timestamp)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.5rem', marginBottom: '0.875rem' }}>
        {[
          { label: 'PQ Criteria', value: `${entry.pqMet}/${entry.pqTotal}`, color: '#111827' },
          { label: 'PQ Score',    value: `${entry.pqPct}%`,  color: entry.pqPass ? '#16A34A' : '#DC2626' },
          { label: 'TQ Score',    value: `${entry.tqPct}%`,  color: entry.tqPct >= 70 ? '#16A34A' : entry.tqPct >= 50 ? '#D97706' : '#DC2626' },
          { label: 'Overall',     value: `${entry.overall}%`, color: entry.overall >= 70 ? '#16A34A' : entry.overall >= 50 ? '#D97706' : '#DC2626' },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: '0.72rem', color: '#9CA3AF', fontWeight: 500, marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div>
        <button className="btn btn-primary" style={{ display: 'inline-flex', width: 'auto', fontSize: '0.78rem', padding: '0.45rem 0.9rem' }} onClick={onViewReport}>
          View Report →
        </button>
      </div>
    </div>
  )
}

/* ── Empty State ─────────────────────────────────────────────────────────── */
function EmptyState({ onStart }) {
  return (
    <div className="card" style={{ padding: '4rem', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <h2 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>No evaluations yet</h2>
      <p style={{ color: '#6B7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Run your first RFP evaluation to see insights, scores, and vendor analysis here.
      </p>
      <button className="btn btn-primary" onClick={onStart}>+ Start Your First Evaluation</button>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const navigate = useNavigate()
  const { history, setCurrentEvaluation, deleteFromHistory, clearAllHistory, pqtqCheckHistory, deletePQTQCheck, clearAllPQTQChecks } = useEvaluation()

  // Merge both lists, sorted by most recent first
  const combined = [
    ...history.map(e => ({ ...e, _entryType: 'eval' })),
    ...pqtqCheckHistory.map(e => ({ ...e, _entryType: 'check' })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const totalEvals    = history.length
  const passCount     = history.filter(e => e.passed).length
  const passRate      = totalEvals > 0 ? Math.round((passCount / totalEvals) * 100) : 0
  const avgScore      = totalEvals > 0 ? Math.round(history.reduce((s, e) => s + e.score, 0) / totalEvals) : 0
  const totalRisks    = history.reduce((s, e) => s + (e.report?.risk_items?.length || 0), 0)

  const PAGE_SIZE     = 5
  const [page, setPage]                           = useState(0)
  const [confirmDeleteAll, setConfirmDeleteAll]   = useState(false)
  const [selectedCheckReport, setSelectedCheckReport] = useState(null)
  const totalPages    = Math.ceil(combined.length / PAGE_SIZE)
  const recentCombined = combined.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const hasAnyData = combined.length > 0
  const latestEval = history[0]
  const insights   = latestEval ? [
    { type: 'success', text: `Latest evaluation: ${stripExt(latestEval.bidName)} scored ${latestEval.score}% on ${stripExt(latestEval.rfpName)}` },
    latestEval.report?.risk_items?.length > 0
      ? { type: 'warning', text: `${latestEval.report.risk_items.length} risk item${latestEval.report.risk_items.length > 1 ? 's' : ''} identified in the latest evaluation` }
      : { type: 'info', text: 'No risk items identified in the latest evaluation' },
    totalEvals > 1
      ? { type: 'info', text: `${passCount} of ${totalEvals} evaluations have passed (${passRate}% pass rate)` }
      : null,
  ].filter(Boolean).slice(0, 3) : []

  const riskRows = latestEval?.report?.risk_items?.slice(0, 4) || []

  const svgIcon = d => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )

  return (
    <div className="page-content fade-in">
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 className="gradient-title" style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 4 }}>Procurement Dashboard</h1>
        <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>Overview of RFP evaluations and AI insights</p>
      </div>

      {!hasAnyData ? (
        <EmptyState onStart={() => navigate('/evaluate')} />
      ) : (
        <>
          {/* Stat Cards */}
          <div className="stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
            <StatCard
              label="Total Evaluations" rawValue={totalEvals} sub="AI evaluations run"
              icon={svgIcon('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6')}
            />
            <StatCard
              label="Pass Rate" rawValue={passRate} suffix="%" sub={`${passCount} of ${totalEvals} passed`}
              icon={svgIcon('M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-2.99')}
              valueColor={passRate >= 70 ? '#16A34A' : passRate >= 40 ? '#D97706' : '#DC2626'}
            />
            <StatCard
              label="Avg Score" rawValue={avgScore} suffix="%" sub="Across all evaluations"
              icon={svgIcon('M18 20V10M12 20V4M6 20v-6')}
            />
            <StatCard
              label="Total Risk Items" rawValue={totalRisks} sub="Identified across all evals"
              icon={svgIcon('M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01')}
              valueColor={totalRisks > 5 ? '#DC2626' : '#111827'}
            />
            <StatCard
              label="PQTQ Checks" rawValue={pqtqCheckHistory.length} sub="Bid readiness checks run"
              icon={svgIcon('M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11')}
            />
          </div>

          {/* Main Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(280px, 26%)', gap: '1.5rem', marginBottom: '1.5rem' }}>

            {/* Left: Combined Recent Evaluations & Checks */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="card-title" style={{ marginBottom: 0 }}>Recent Evaluations</div>
                  {pqtqCheckHistory.length > 0 && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE' }}>
                      + {pqtqCheckHistory.length} PQTQ checks
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {(history.length > 0 || pqtqCheckHistory.length > 0) && (
                    confirmDeleteAll ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>Delete all evals?</span>
                        <button style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff', background: '#EF4444', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}
                          onClick={() => { clearAllHistory(); clearAllPQTQChecks(); setConfirmDeleteAll(false); setPage(0) }}>Confirm</button>
                        <button style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', background: '#F3F4F6', border: 'none', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}
                          onClick={() => setConfirmDeleteAll(false)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="btn-ghost" style={{ fontSize: '0.8rem', color: '#EF4444', fontWeight: 600 }} onClick={() => setConfirmDeleteAll(true)}>
                        Delete All
                      </button>
                    )
                  )}
                  <button className="btn-ghost" style={{ fontSize: '0.8rem', color: '#6366F1', fontWeight: 600 }} onClick={() => navigate('/evaluate')}>
                    + New Evaluation
                  </button>
                </div>
              </div>

              {recentCombined.map(entry =>
                entry._entryType === 'eval' ? (
                  <EvalCard
                    key={entry.id}
                    entry={entry}
                    onView={() => { setCurrentEvaluation(entry); navigate('/active-evaluation') }}
                    onReport={() => { setCurrentEvaluation(entry); navigate('/executive-report') }}
                    onDelete={() => deleteFromHistory(entry.id)}
                  />
                ) : (
                  <PQTQCheckCard
                    key={entry.id}
                    entry={entry}
                    onDelete={() => deletePQTQCheck(entry.id)}
                    onViewReport={() => setSelectedCheckReport(entry)}
                  />
                )
              )}

              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #F3F4F6' }}>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, border: '1px solid #E5E7EB', cursor: page === 0 ? 'not-allowed' : 'pointer', background: page === 0 ? '#F9FAFB' : '#fff', color: page === 0 ? '#D1D5DB' : '#374151' }}>← Previous</button>
                  <span style={{ fontSize: '0.78rem', color: '#6B7280' }}>Page {page + 1} of {totalPages} &nbsp;·&nbsp; {combined.length} total</span>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, border: '1px solid #E5E7EB', cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer', background: page === totalPages - 1 ? '#F9FAFB' : '#fff', color: page === totalPages - 1 ? '#D1D5DB' : '#374151' }}>Next →</button>
                </div>
              )}
            </div>

            {/* Right: AI Insights + Risk Monitoring */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card" style={{ padding: '1.25rem' }}>
                <div className="card-title" style={{ marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  AI Insights
                </div>
                {insights.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Run an evaluation to see insights.</div>
                ) : insights.map((ins, i) => {
                  const cfg = {
                    warning: { bg: '#FFFBEB', border: '#FDE68A', dot: '#F59E0B' },
                    success: { bg: '#F0FDF4', border: '#BBF7D0', dot: '#22C55E' },
                    info:    { bg: '#F5F3FF', border: '#DDD6FE', dot: '#8B5CF6' },
                  }[ins.type]
                  return (
                    <div key={i} style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '0.65rem 0.875rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0, marginTop: 4 }} />
                      <span style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.45 }}>{ins.text}</span>
                    </div>
                  )
                })}
              </div>

              <div className="card" style={{ padding: '1.25rem' }}>
                <div className="card-title" style={{ marginBottom: '0.875rem' }}>Risk Monitoring</div>
                {riskRows.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>No risks in the latest evaluation.</div>
                ) : riskRows.map((r, i) => {
                  const cfg = {
                    High:   { bg: '#FFE4E6', color: '#BE123C', text: 'High Risk' },
                    Medium: { bg: '#FEF3C7', color: '#92400E', text: 'Medium Risk' },
                    Low:    { bg: '#DCFCE7', color: '#15803D', text: 'Low Risk' },
                  }[r.severity] || { bg: '#F1F5F9', color: '#475569', text: r.severity }
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: i < riskRows.length - 1 ? '1px solid #F3F4F6' : 'none', gap: 8 }}>
                      <span style={{ fontSize: '0.78rem', color: '#374151', flex: 1 }}>{r.risk_area}</span>
                      <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, flexShrink: 0, background: cfg.bg, color: cfg.color }}>{cfg.text}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Recent Activity</div>
              <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Page {page + 1} of {totalPages}</span>
            </div>
            {recentCombined.map((entry, i) => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '0.85rem 0', borderBottom: i < recentCombined.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                <div style={{ marginTop: 5 }}>
                  {entry._entryType === 'eval'
                    ? <span className={`dot ${entry.passed ? 'dot-green' : 'dot-amber'}`} />
                    : <span className={`dot ${entry.pqPass ? 'dot-green' : 'dot-amber'}`} />
                  }
                </div>
                <div style={{ flex: 1 }}>
                  {entry._entryType === 'eval' ? (
                    <>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                        Evaluation {entry.passed ? 'passed' : 'failed'}
                        <span style={{ padding: '1px 6px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700, background: getEvalType(entry) === 'PQTQ' ? '#EDE9FE' : '#E0F2FE', color: getEvalType(entry) === 'PQTQ' ? '#6D28D9' : '#0369A1' }}>
                          {getEvalType(entry) === 'PQTQ' ? 'PQ/TQ' : 'General'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#6B7280' }}>{stripExt(entry.rfpName)} — {stripExt(entry.bidName)} scored {entry.score}%</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                        PQTQ check completed
                        <span style={{ padding: '1px 6px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700, background: '#EEF2FF', color: '#4F46E5' }}>Check</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#6B7280' }}>{stripExt(entry.rfpName)} — Overall {entry.overall}% · TQ {entry.tqPct}%</div>
                    </>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9CA3AF', flexShrink: 0 }}>{timeAgo(entry.timestamp)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {selectedCheckReport && (
        <PQTQReportModal
          entry={selectedCheckReport}
          onClose={() => setSelectedCheckReport(null)}
        />
      )}
    </div>
  )
}
