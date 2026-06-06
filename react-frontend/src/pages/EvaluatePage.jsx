import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { runEvaluation } from '../api'
import { useEvaluation } from '../context/EvaluationContext'

const STEPS = [
  { id: 1, label: 'Document Ingestion',     sub: 'Extracting text from documents' },
  { id: 2, label: 'Criteria Extraction',    sub: 'Identifying scoring rules from RFP' },
  { id: 3, label: 'Bid Evaluation',         sub: 'Mapping bid content to each criterion' },
  { id: 4, label: 'Score Calculation',      sub: 'Applying weighted scoring rules' },
  { id: 5, label: 'Gap Analysis',           sub: 'Identifying risks and gaps' },
  { id: 6, label: 'Report Generation',      sub: 'Compiling final evaluation report' },
]

function UploadZone({ label, sub, file, onFile, accent }) {
  const ref  = useRef()
  const [over, setOver] = useState(false)

  const set = f => { if (f) onFile(f) }

  return (
    <div
      onClick={() => ref.current.click()}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); set(e.dataTransfer.files[0]) }}
      style={{
        border: `2px dashed ${file ? '#22C55E' : over ? accent : '#CBD5E1'}`,
        borderRadius: 12, padding: '2.5rem 2rem', textAlign: 'center',
        cursor: 'pointer', background: file ? '#F0FDF4' : over ? '#F5F3FF' : '#FAFAFA',
        transition: 'all .2s', flex: 1,
      }}
    >
      <input ref={ref} type="file" accept=".pdf,.doc,.docx" hidden
        onChange={e => set(e.target.files[0])} />
      <div style={{
        width: 52, height: 52, borderRadius: 12, margin: '0 auto 1rem',
        background: file ? '#DCFCE7' : '#EEF2FF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
          stroke={file ? '#16A34A' : accent} strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      </div>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '1rem' }}>{sub}</div>
      {file
        ? <div style={{ fontSize: '0.82rem', color: '#16A34A', fontWeight: 600 }}>✓ {file.name}</div>
        : <>
            <div style={{
              display: 'inline-block', background: accent, color: '#fff',
              padding: '0.45rem 1.1rem', borderRadius: 8, fontSize: '0.82rem',
              fontWeight: 700, marginBottom: 8,
            }}>Choose File</div>
            <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>PDF · DOC · DOCX</div>
          </>}
    </div>
  )
}

function StepItem({ step, state }) {
  const colors = {
    pending: { bg: '#F8FAFC', border: '#E2E8F0', num: '#94A3B8', badge: '#F1F5F9', badgeText: '#64748B', label: 'Pending' },
    active:  { bg: '#EEF2FF', border: '#6366F1', num: '#6366F1', badge: '#E0E7FF', badgeText: '#4338CA', label: 'Running…' },
    done:    { bg: '#F0FDF4', border: '#22C55E', num: '#22C55E', badge: '#DCFCE7', badgeText: '#15803D', label: '✓ Done' },
  }
  const c = colors[state]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '0.85rem 1.1rem',
      border: `1.5px solid ${c.border}`, borderRadius: 10, background: c.bg, transition: 'all .3s',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: state === 'pending' ? '#E2E8F0' : c.num,
        color: state === 'pending' ? c.num : '#fff', fontSize: '0.72rem', fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>{state === 'done' ? '✓' : step.id}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1E293B' }}>{step.label}</div>
        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{step.sub}</div>
      </div>
      <span style={{
        background: c.badge, color: c.badgeText, padding: '2px 10px',
        borderRadius: 999, fontSize: '0.7rem', fontWeight: 700,
      }}>{c.label}</span>
    </div>
  )
}

export default function EvaluatePage() {
  const [rfpFile, setRfpFile]     = useState(null)
  const [bidFile, setBidFile]     = useState(null)
  const [phase, setPhase]         = useState('upload')   // upload | progress | error
  const [stepStates, setStepStates] = useState(STEPS.map(() => 'pending'))
  const [error, setError]         = useState('')
  const { setReport, setRfpName, setBidName, addToHistory } = useEvaluation()
  const navigate = useNavigate()

  const advance = (idx, state) =>
    setStepStates(s => s.map((v, i) => (i === idx ? state : v)))

  async function handleEvaluate() {
    setPhase('progress')
    setStepStates(STEPS.map(() => 'pending'))
    setError('')

    const timers = [
      setTimeout(() => advance(0, 'active'), 100),
      setTimeout(() => { advance(0, 'done'); advance(1, 'active') }, 1200),
      setTimeout(() => { advance(1, 'done'); advance(2, 'active') }, 6000),
      setTimeout(() => { advance(2, 'done'); advance(3, 'active') }, 22000),
      setTimeout(() => { advance(3, 'done'); advance(4, 'active') }, 28000),
      setTimeout(() => { advance(4, 'done'); advance(5, 'active') }, 38000),
    ]

    try {
      const report = await runEvaluation(rfpFile, bidFile)
      timers.forEach(clearTimeout)
      setStepStates(STEPS.map(() => 'done'))
      setReport(report)
      setRfpName(rfpFile.name)
      setBidName(bidFile.name)
      addToHistory({
        id: Date.now(),
        rfpName: rfpFile.name,
        bidName: bidFile.name,
        report,
        timestamp: new Date().toISOString(),
        score: Math.round((report.total_score / report.max_score) * 100),
        passed: report.passed,
      })
      setTimeout(() => navigate('/active-evaluation'), 500)
    } catch (e) {
      timers.forEach(clearTimeout)
      setError(e.message)
      setPhase('error')
    }
  }

  if (phase === 'progress') return (
    <div className="page-content" style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4 }}>Evaluation in Progress</h1>
        <p style={{ color: '#64748B' }}>AI pipeline analyzing your documents — this takes 30–90 seconds</p>
      </div>
      <div className="card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.75rem' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '3px solid #E2E8F0', borderTop: '3px solid #6366F1',
            animation: 'spin 1s linear infinite', flexShrink: 0,
          }}/>
          <div>
            <div style={{ fontWeight: 700 }}>Processing Documents</div>
            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Do not close this window</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {STEPS.map((s, i) => <StepItem key={s.id} step={s} state={stepStates[i]} />)}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div className="page-content">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 4 }}>New Evaluation</h1>
        <p style={{ color: '#64748B' }}>Upload the RFP and vendor bid to start AI-powered scoring</p>
      </div>

      {phase === 'error' && (
        <div style={{
          background: '#FFF1F2', border: '1px solid #FECDD3', borderLeft: '4px solid #EF4444',
          borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.5rem',
        }}>
          <div style={{ fontWeight: 700, color: '#BE123C', marginBottom: 4 }}>Evaluation Failed</div>
          <div style={{ fontSize: '0.875rem', color: '#9F1239' }}>{error}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left column — upload + run */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '2rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem', color: '#1E293B' }}>
              Upload Documents
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem', alignItems: 'stretch' }}>
              <UploadZone
                label="RFP / Tender Document"
                sub="Contains evaluation criteria and scoring rules"
                file={rfpFile} onFile={setRfpFile} accent="#6366F1"
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: '#F1F5F9',
                  border: '2px solid #E2E8F0', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '0.78rem', fontWeight: 800, color: '#94A3B8',
                }}>VS</div>
              </div>
              <UploadZone
                label="Vendor Bid Document"
                sub="The vendor's response to be evaluated"
                file={bidFile} onFile={setBidFile} accent="#8B5CF6"
              />
            </div>

            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1.5rem', textAlign: 'center' }}>
              <button
                className="btn btn-primary"
                style={{ padding: '0.75rem 2.5rem', fontSize: '1rem' }}
                disabled={!rfpFile || !bidFile}
                onClick={handleEvaluate}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Run Evaluation
              </button>
              <p style={{ marginTop: 10, fontSize: '0.78rem', color: '#94A3B8' }}>
                Powered by Groq LLaMA — results in 30–90 seconds
              </p>
            </div>
          </div>

          {/* Upload status summary */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.875rem', color: '#1E293B' }}>
              Upload Status
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'RFP / Tender Document', file: rfpFile },
                { label: 'Vendor Bid Document',   file: bidFile },
              ].map(({ label, file }) => (
                <div key={label} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '0.7rem 1rem', borderRadius: 8,
                  background: file ? '#F0FDF4' : '#F8FAFC',
                  border: `1px solid ${file ? '#BBF7D0' : '#E2E8F0'}`,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: file ? '#DCFCE7' : '#E2E8F0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke={file ? '#16A34A' : '#94A3B8'} strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1E293B' }}>{label}</div>
                    <div style={{ fontSize: '0.72rem', color: file ? '#16A34A' : '#94A3B8',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {file ? file.name : 'No file selected'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                    background: file ? '#DCFCE7' : '#F1F5F9',
                    color: file ? '#15803D' : '#64748B',
                  }}>{file ? 'Ready' : 'Pending'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column — how it works + tips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '1.25rem', color: '#1E293B' }}>How it works</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[
                { n: '01', t: 'Upload Documents',  d: 'Upload the RFP and vendor bid in PDF or Word format', color: '#6366F1' },
                { n: '02', t: 'AI Extracts Rules', d: 'AI reads the RFP and extracts all scoring criteria and weights', color: '#8B5CF6' },
                { n: '03', t: 'Get Results',       d: 'Receive detailed scores, gap analysis, and PASS/FAIL verdict', color: '#22C55E' },
              ].map(s => (
                <div key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: s.color + '18',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.68rem', fontWeight: 800, color: s.color,
                  }}>{s.n}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 2 }}>{s.t}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: 1.5 }}>{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '1rem', color: '#1E293B' }}>Tips for best results</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {[
                { icon: '📄', tip: 'Use text-based PDFs rather than scanned images for faster extraction.' },
                { icon: '✅', tip: 'Ensure the RFP clearly lists scoring criteria and weightings.' },
                { icon: '📋', tip: 'The vendor bid should directly address all requirements in the RFP.' },
                { icon: '⚡', tip: 'Files under 10 MB process significantly faster.' },
              ].map(({ icon, tip }) => (
                <div key={tip} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.9rem', flexShrink: 0, marginTop: 1 }}>{icon}</span>
                  <span style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: 1.5 }}>{tip}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{
            padding: '1.25rem', background: 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)',
            border: '1px solid #C7D2FE',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#4338CA' }}>AI Confidence</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#4338CA', margin: 0, lineHeight: 1.5 }}>
              Our AI pipeline typically achieves <strong>90–97% confidence</strong> on well-structured RFP documents with clear scoring criteria.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
