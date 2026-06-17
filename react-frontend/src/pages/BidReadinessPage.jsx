import { useState, useRef } from 'react'
import { fetchBidReadiness } from '../api'

const PQ_COLOR  = '#92400E'
const PQ_BG     = '#FFFBEB'
const PQ_BADGE  = '#FEF3C7'
const PQ_ACCENT = '#F59E0B'
const TQ_COLOR  = '#3730A3'
const TQ_BG     = '#EEF2FF'
const TQ_BADGE  = '#E0E7FF'
const TQ_ACCENT = '#4F46E5'

/* ── File drop zone ───────────────────────────────────────────────────────── */
function FileZone({ label, hint, file, onFile, required }) {
  const ref = useRef()
  return (
    <div
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
      onClick={() => ref.current.click()}
      style={{
        border: `2px dashed ${file ? '#4F46E5' : '#D1D5DB'}`,
        borderRadius: 10, padding: '1.1rem 1rem', cursor: 'pointer',
        background: file ? '#F5F3FF' : '#FAFAFA', textAlign: 'center', transition: 'all .15s',
      }}
    >
      <input ref={ref} type="file" accept=".pdf,.doc,.docx,.pptx" style={{ display: 'none' }}
        onChange={e => e.target.files[0] && onFile(e.target.files[0])} />
      <div style={{ fontSize: '1.3rem', marginBottom: 3 }}>{file ? '📄' : '📂'}</div>
      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: file ? '#4F46E5' : '#374151' }}>
        {file ? file.name : label}
      </div>
      <div style={{ fontSize: '0.7rem', color: '#9CA3AF', marginTop: 2 }}>
        {file ? `${(file.size / 1024).toFixed(0)} KB` : hint}
      </div>
      {required && !file && <span style={{ fontSize: '0.6rem', color: '#EF4444', fontWeight: 700 }}>Required</span>}
    </div>
  )
}

/* ── Single checklist row ─────────────────────────────────────────────────── */
function CheckRow({ item, checked, onChange }) {
  const isPQ = item.type === 'PQ'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 14px', borderBottom: '1px solid #F3F4F6',
      background: checked ? (isPQ ? '#FEFCE8' : '#F5F3FF') : '#fff',
      transition: 'background .12s',
    }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(item.id, e.target.checked)}
        style={{ marginTop: 3, width: 15, height: 15, accentColor: isPQ ? '#D97706' : '#4F46E5', flexShrink: 0, cursor: 'pointer' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#111827', marginBottom: 2, lineHeight: 1.4 }}>
          {item.criterion}
          {isPQ && (
            <span style={{ marginLeft: 5, fontSize: '0.58rem', fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: PQ_BADGE, color: PQ_COLOR, verticalAlign: 'middle' }}>
              MANDATORY
            </span>
          )}
        </div>
        {item.detail && (
          <div style={{ fontSize: '0.73rem', color: '#6B7280', lineHeight: 1.45 }}>{item.detail}</div>
        )}
      </div>
      <span style={{ fontSize: '0.68rem', fontWeight: 700, flexShrink: 0, marginTop: 2, whiteSpace: 'nowrap',
        color: checked ? '#15803D' : '#C4C9D4' }}>
        {checked ? '✓ Can meet' : '○'}
      </span>
    </div>
  )
}

/* ── Collapsible category block for TQ ───────────────────────────────────── */
function TQCategory({ label, items, checked, onToggle, onCheckAll }) {
  const [open, setOpen] = useState(true)
  const allChecked = items.every(i => checked[i.id])
  const checkedCount = items.filter(i => checked[i.id]).length

  return (
    <div>
      {/* Category header row */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '7px 14px', background: TQ_BG, borderBottom: `1px solid ${TQ_BADGE}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            color: '#C4C9D4', fontSize: '0.65rem', display: 'inline-block',
            transition: 'transform .15s', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}>▼</span>
          <span style={{ fontWeight: 700, fontSize: '0.72rem', color: TQ_COLOR, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
          <span style={{ fontSize: '0.65rem', color: '#9CA3AF' }}>{items.length} criteria</span>
          {checkedCount > 0 && checkedCount < items.length && (
            <span style={{ fontSize: '0.6rem', color: TQ_COLOR, background: TQ_BADGE, padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>
              {checkedCount}/{items.length}
            </span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onCheckAll(items, !allChecked) }}
          style={{
            fontSize: '0.65rem', fontWeight: 700,
            background: allChecked ? '#FEE2E2' : TQ_BADGE,
            color: allChecked ? '#DC2626' : TQ_COLOR,
            border: 'none', borderRadius: 5, padding: '2px 8px',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >{allChecked ? '✕ Uncheck All' : '✓ Check All'}</button>
      </div>

      {/* Items */}
      {open && items.map(item => (
        <CheckRow key={item.id} item={item} checked={!!checked[item.id]} onChange={onToggle} />
      ))}
    </div>
  )
}

/* ── Top summary strip ────────────────────────────────────────────────────── */
function SummaryStrip({ pqItems, tqItems, checked }) {
  const pqTotal  = pqItems.length
  const pqMet    = pqItems.filter(i => checked[i.id]).length
  const pqPct    = pqTotal > 0 ? Math.round((pqMet / pqTotal) * 100) : 0
  const pqAllMet = pqMet === pqTotal && pqTotal > 0

  const tqTotal  = tqItems.reduce((s, i) => s + i.max_score, 0)
  const tqAchiev = tqItems.filter(i => checked[i.id]).reduce((s, i) => s + i.max_score, 0)
  const tqPct    = tqTotal > 0 ? Math.round((tqAchiev / tqTotal) * 100) : 0

  const Stat = ({ label, value, sub, color, pct, barColor }) => (
    <div style={{ flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 5 }}>
        <span style={{ fontSize: '1.6rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</span>
        <span style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>{sub}</span>
      </div>
      <div style={{ height: 4, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', background: barColor, borderRadius: 999, width: `${pct}%`, transition: 'width .5s' }} />
      </div>
    </div>
  )

  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
      padding: '1rem 1.5rem', marginBottom: '1.25rem',
      display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap',
    }}>
      <Stat label="PQ Eligibility" value={`${pqMet}/${pqTotal}`} sub="criteria confirmed"
        color={pqAllMet ? '#16A34A' : '#D97706'} pct={pqPct} barColor={pqAllMet ? '#22C55E' : PQ_ACCENT} />
      <div style={{ width: 1, height: 40, background: '#E5E7EB', flexShrink: 0 }} />
      <Stat label="TQ Achievable Score" value={`${tqPct}%`} sub={`${tqItems.filter(i => checked[i.id]).length} / ${tqItems.length} criteria confirmed`}
        color={TQ_ACCENT} pct={tqPct} barColor={TQ_ACCENT} />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function BidReadinessPage() {
  const [rfpFile,     setRfpFile]     = useState(null)
  const [addFile,     setAddFile]     = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [result,      setResult]      = useState(null)
  const [checked,     setChecked]     = useState({})
  const [pqOpen,      setPqOpen]      = useState(true)
  const [tqOpen,      setTqOpen]      = useState(true)
  const [scoreResult, setScoreResult] = useState(null)
  const scoreRef = useRef(null)

  const toggle = (id, val) => { setChecked(p => ({ ...p, [id]: val })); setScoreResult(null) }
  const reset  = () => { setResult(null); setRfpFile(null); setAddFile(null); setChecked({}); setError(''); setScoreResult(null) }

  const handleAnalyze = async () => {
    if (!rfpFile) { setError('Please upload the RFP document.'); return }
    setError(''); setLoading(true); setResult(null); setChecked({})
    try {
      setResult(await fetchBidReadiness(rfpFile, addFile || null))
    } catch (e) {
      setError(e.message || 'Extraction failed. Please try again.')
    } finally { setLoading(false) }
  }

  const calculateScore = () => {
    const pqTotal  = result.pq_items.length
    const pqMet    = result.pq_items.filter(i => checked[i.id]).length
    const pqPct    = pqTotal > 0 ? Math.round((pqMet / pqTotal) * 100) : 0
    const pqPass   = pqMet === pqTotal && pqTotal > 0
    const tqTotal      = result.tq_items.reduce((s, i) => s + i.max_score, 0)
    const tqAchiev     = result.tq_items.filter(i => checked[i.id]).reduce((s, i) => s + i.max_score, 0)
    const tqPct        = tqTotal > 0 ? Math.round((tqAchiev / tqTotal) * 100) : 0
    const tqCriteriaMet   = result.tq_items.filter(i => checked[i.id]).length
    const tqCriteriaTotal = result.tq_items.length
    const missed   = result.tq_items.filter(i => !checked[i.id])
    const overall  = pqTotal > 0 ? Math.round((pqPct * 0.3) + (tqPct * 0.7)) : tqPct

    let recommendation, recColor
    if (!pqPass && pqTotal > 0) {
      recommendation = `${pqTotal - pqMet} mandatory PQ criteria not confirmed — you risk disqualification before TQ scoring begins.`
      recColor = '#DC2626'
    } else if (tqPct >= 70) {
      recommendation = 'Strong score — you are likely competitive. Ensure all supporting documents and certificates are ready before submission.'
      recColor = '#16A34A'
    } else if (tqPct >= 50) {
      recommendation = `Moderate TQ score. Strengthening the ${missed.length} unchecked criteria could improve your chances significantly.`
      recColor = '#D97706'
    } else {
      recommendation = `Low TQ score — ${missed.length} TQ criteria are unchecked. Review them carefully before deciding to bid.`
      recColor = '#DC2626'
    }

    setScoreResult({ pqMet, pqTotal, pqPct, pqPass, tqCriteriaMet, tqCriteriaTotal, tqPct, overall, missed, recommendation, recColor })
    setTimeout(() => scoreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  const tqByCategory = result ? result.tq_items.reduce((acc, item) => {
    ;(acc[item.category] = acc[item.category] || []).push(item); return acc
  }, {}) : {}

  /* ── Upload phase ─────────────────────────────────────────────────────── */
  if (!result) {
    return (
      <div style={{ minHeight: '100%', background: '#F9FAFB', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3rem 1rem' }}>
        <div style={{ width: '100%', maxWidth: 560 }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'inline-flex', width: 52, height: 52, borderRadius: 14, background: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', marginBottom: 6 }}>Bid Readiness Check</div>
            <div style={{ fontSize: '0.85rem', color: '#6B7280', lineHeight: 1.65, maxWidth: 420, margin: '0 auto' }}>
              Upload your RFP and we'll extract every PQ eligibility requirement and TQ scoring criterion in plain English — then check what your company can fulfil.
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', padding: '1.5rem', boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: '1.25rem' }}>
              <FileZone label="Upload RFP / Tender Document" hint="PDF, DOC, DOCX · Required" file={rfpFile} onFile={setRfpFile} required />
              <div style={{ position: 'relative' }}>
                <FileZone label="Additional Document (optional)" hint="Annexures, corrigendum, scoring matrix" file={addFile} onFile={setAddFile} required={false} />
                {addFile && (
                  <button onClick={e => { e.stopPropagation(); setAddFile(null) }} style={{
                    position: 'absolute', top: 8, right: 10, background: '#FEE2E2', border: 'none',
                    borderRadius: '50%', width: 18, height: 18, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#DC2626', fontWeight: 700,
                  }}>✕</button>
                )}
              </div>
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 12px', marginBottom: 12, fontSize: '0.8rem', color: '#DC2626' }}>
                {error}
              </div>
            )}

            <button onClick={handleAnalyze} disabled={loading || !rfpFile} style={{
              width: '100%', padding: '0.825rem', borderRadius: 10, border: 'none',
              background: rfpFile ? 'linear-gradient(135deg,#4F46E5,#7C3AED)' : '#E5E7EB',
              color: rfpFile ? '#fff' : '#9CA3AF', fontWeight: 700, fontSize: '0.92rem',
              cursor: rfpFile ? 'pointer' : 'not-allowed', transition: 'all .15s',
              boxShadow: rfpFile ? '0 4px 14px rgba(79,70,229,.3)' : 'none',
            }}>
              {loading ? 'Analysing RFP…' : 'Analyse & Generate Checklist'}
            </button>

            {loading && (
              <div style={{ marginTop: '1.25rem', textAlign: 'center', color: '#6B7280', fontSize: '0.8rem' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round"
                  style={{ animation: 'spin 1s linear infinite', display: 'block', margin: '0 auto 8px' }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Extracting PQ &amp; TQ criteria… usually 15–30 seconds.
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ── Checklist phase (full-width two-column) ─────────────────────────── */
  return (
    <div style={{ padding: '1.25rem 1.5rem', minHeight: '100%' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#111827' }}>PQTQ Checklist</div>
          <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: 2 }}>
            {rfpFile?.name} &nbsp;·&nbsp; {result.pq_items.length} PQ criteria &nbsp;·&nbsp; {result.tq_items.length} TQ criteria
          </div>
        </div>
        <button onClick={reset} style={{
          padding: '6px 14px', borderRadius: 8, border: '1px solid #E5E7EB',
          background: '#fff', color: '#374151', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
        }}>← New Analysis</button>
      </div>

      {/* ── Live summary strip ── */}
      <SummaryStrip pqItems={result.pq_items} tqItems={result.tq_items} checked={checked} />

      {/* ── Two-column checklist ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', alignItems: 'start' }}>

        {/* LEFT — PQ */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          {/* PQ header */}
          <button onClick={() => setPqOpen(v => !v)} style={{
            width: '100%', textAlign: 'left', background: PQ_BG, border: 'none',
            borderBottom: `2px solid ${PQ_ACCENT}30`, padding: '11px 14px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: PQ_BADGE, color: PQ_COLOR }}>PQ</span>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: PQ_COLOR }}>Pre-Qualification Eligibility</span>
              <span style={{ fontSize: '0.7rem', color: '#9CA3AF', background: '#fff', padding: '1px 7px', borderRadius: 10 }}>{result.pq_items.length}</span>
            </div>
            <span style={{ color: '#C4C9D4', fontSize: '0.75rem' }}>{pqOpen ? '▲' : '▼'}</span>
          </button>

          {pqOpen && (() => {
            const pqMet      = result.pq_items.filter(i => checked[i.id]).length
            const pqTotal    = result.pq_items.length
            const pqAllMet   = pqMet === pqTotal && pqTotal > 0
            const allPQChecked = pqAllMet
            const toggleAllPQ = () => {
              const next = {}
              result.pq_items.forEach(i => { next[i.id] = !pqAllMet })
              setChecked(prev => ({ ...prev, ...next }))
              setScoreResult(null)
            }
            return (
              <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                <div style={{ padding: '7px 14px', background: '#FFFDF5', borderBottom: '1px solid #FDE68A', fontSize: '0.7rem', color: '#92400E', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{
                    fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                    background: pqAllMet ? '#DCFCE7' : '#FEF3C7',
                    color: pqAllMet ? '#15803D' : '#92400E',
                  }}>{pqAllMet ? '✓ PQ Eligible' : `${pqTotal - pqMet} criteria pending`}</span>
                  <button onClick={toggleAllPQ} style={{
                    fontSize: '0.68rem', fontWeight: 700, background: pqAllMet ? '#FEE2E2' : '#FEF3C7',
                    color: pqAllMet ? '#DC2626' : '#92400E', border: 'none', borderRadius: 6,
                    padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>{pqAllMet ? '✕ Uncheck All' : '✓ Check All'}</button>
                </div>
                {result.pq_items.map(item => (
                  <CheckRow key={item.id} item={item} checked={!!checked[item.id]} onChange={toggle} />
                ))}
              </div>
            )
          })()}
        </div>

        {/* RIGHT — TQ */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          {/* TQ header */}
          <button onClick={() => setTqOpen(v => !v)} style={{
            width: '100%', textAlign: 'left', background: TQ_BG, border: 'none',
            borderBottom: `2px solid ${TQ_ACCENT}30`, padding: '11px 14px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: TQ_BADGE, color: TQ_COLOR }}>TQ</span>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: TQ_COLOR }}>Technical Qualification Scoring</span>
              <span style={{ fontSize: '0.7rem', color: '#9CA3AF', background: '#fff', padding: '1px 7px', borderRadius: 10 }}>{result.tq_items.length}</span>
            </div>
            <span style={{ color: '#C4C9D4', fontSize: '0.75rem' }}>{tqOpen ? '▲' : '▼'}</span>
          </button>

          {tqOpen && (() => {
            const allTQChecked = result.tq_items.every(i => checked[i.id])
            const toggleAllTQ = () => {
              const next = {}
              result.tq_items.forEach(i => { next[i.id] = !allTQChecked })
              setChecked(prev => ({ ...prev, ...next }))
              setScoreResult(null)
            }
            return (
              <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                <div style={{ padding: '7px 14px', background: '#F8F7FF', borderBottom: '1px solid #C7D2FE', fontSize: '0.7rem', color: '#3730A3', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Check each criterion your proposal will demonstrate</span>
                  <button onClick={toggleAllTQ} style={{
                    fontSize: '0.68rem', fontWeight: 700, background: allTQChecked ? '#FEE2E2' : TQ_BADGE,
                    color: allTQChecked ? '#DC2626' : TQ_COLOR, border: 'none', borderRadius: 6,
                    padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>{allTQChecked ? '✕ Uncheck All' : '✓ Check All'}</button>
                </div>
                {Object.entries(tqByCategory).map(([cat, items]) => (
                  <TQCategory
                    key={cat}
                    label={cat}
                    items={items}
                    checked={checked}
                    onToggle={toggle}
                    onCheckAll={(catItems, val) => {
                      const next = {}
                      catItems.forEach(i => { next[i.id] = val })
                      setChecked(p => ({ ...p, ...next }))
                      setScoreResult(null)
                    }}
                  />
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Calculate button ── */}
      <div style={{ marginTop: '1.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <button onClick={calculateScore} style={{
          padding: '0.85rem 3rem', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', color: '#fff',
          fontWeight: 700, fontSize: '1rem', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(79,70,229,.35)', transition: 'transform .1s,box-shadow .1s',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 22px rgba(79,70,229,.45)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 16px rgba(79,70,229,.35)' }}
        >
          Calculate My Bid Readiness Score
        </button>
        <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>Check all criteria your company can fulfil, then click to see your score</div>
      </div>

      {/* ── Score result card (full width) ── */}
      {scoreResult && (
        <div ref={scoreRef} style={{
          marginTop: '1.75rem', background: '#fff', borderRadius: 14,
          border: '2px solid #4F46E5', boxShadow: '0 8px 32px rgba(79,70,229,.13)', overflow: 'hidden',
        }}>
          {/* gradient header */}
          <div style={{ background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>Bid Readiness Score</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,.65)', marginTop: 2 }}>{rfpFile?.name}</div>
            </div>
            <span style={{
              padding: '4px 12px', borderRadius: 999, fontWeight: 700, fontSize: '0.78rem',
              background: scoreResult.pqPass ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)',
              color: scoreResult.pqPass ? '#86EFAC' : '#FCA5A5',
              border: `1px solid ${scoreResult.pqPass ? 'rgba(34,197,94,.4)' : 'rgba(239,68,68,.4)'}`,
            }}>{scoreResult.pqPass ? '✓ PQ Eligible' : '✗ PQ Not Met'}</span>
          </div>

          {/* stats row — 3 equal cols */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #E5E7EB' }}>
            {[
              { label: 'PQ Eligibility', value: `${scoreResult.pqPct}%`, sub: `${scoreResult.pqMet}/${scoreResult.pqTotal} criteria confirmed`, color: scoreResult.pqPass ? '#16A34A' : '#DC2626', bar: scoreResult.pqPct, barColor: scoreResult.pqPass ? '#22C55E' : '#EF4444' },
              { label: 'TQ Score', value: `${scoreResult.tqPct}%`, sub: `${scoreResult.tqCriteriaMet} / ${scoreResult.tqCriteriaTotal} criteria confirmed`, color: '#4F46E5', bar: scoreResult.tqPct, barColor: scoreResult.tqPct >= 70 ? '#22C55E' : scoreResult.tqPct >= 50 ? '#F59E0B' : '#EF4444' },
              { label: 'Overall Readiness', value: `${scoreResult.overall}%`, sub: 'weighted (PQ 30% + TQ 70%)', color: (scoreResult.pqPass && scoreResult.tqPct >= 70) ? '#16A34A' : scoreResult.tqPct >= 50 ? '#D97706' : '#DC2626', bar: scoreResult.overall, barColor: scoreResult.overall >= 70 ? '#22C55E' : scoreResult.overall >= 50 ? '#F59E0B' : '#EF4444' },
            ].map((s, i) => (
              <div key={i} style={{ padding: '1.25rem 1.5rem', borderRight: i < 2 ? '1px solid #E5E7EB' : 'none', textAlign: 'center' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontSize: '2.75rem', fontWeight: 900, color: s.color, lineHeight: 1, marginBottom: 6 }}>{s.value}</div>
                <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginBottom: 10 }}>{s.sub}</div>
                <div style={{ height: 5, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden', maxWidth: 140, margin: '0 auto' }}>
                  <div style={{ height: '100%', borderRadius: 999, background: s.barColor, width: `${s.bar}%`, transition: 'width .8s' }} />
                </div>
              </div>
            ))}
          </div>

          {/* recommendation */}
          <div style={{ padding: '1rem 1.5rem', borderBottom: scoreResult.missed.length > 0 ? '1px solid #F3F4F6' : 'none', display: 'flex', gap: 10, alignItems: 'flex-start', background: '#FAFAFA' }}>
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{scoreResult.recColor === '#16A34A' ? '✅' : scoreResult.recColor === '#D97706' ? '⚠️' : '❌'}</span>
            <div style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.6, fontWeight: 500 }}>{scoreResult.recommendation}</div>
          </div>

          {/* missed marks tags */}
          {scoreResult.missed.length > 0 && (
            <div style={{ padding: '1rem 1.5rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Unchecked criteria ({scoreResult.missed.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {scoreResult.missed.slice(0, 10).map(i => (
                  <span key={i.id} style={{ fontSize: '0.7rem', padding: '3px 9px', borderRadius: 6, background: '#F3F4F6', color: '#374151' }}>
                    {i.criterion.slice(0, 55)}{i.criterion.length > 55 ? '…' : ''}
                  </span>
                ))}
                {scoreResult.missed.length > 10 && <span style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>+{scoreResult.missed.length - 10} more</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
