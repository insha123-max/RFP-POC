import { useNavigate } from 'react-router-dom'
import { useEvaluation } from '../context/EvaluationContext'
import { exportWord } from '../api'
import { useState } from 'react'

function stripExt(name) {
  return name ? name.replace(/\.[^.]+$/, '') : '—'
}

function buildSections(report, rfpName, bidName) {
  const vendorName = stripExt(bidName)
  const pct        = Math.round((report.total_score / report.max_score) * 100)
  const allCrit    = report.category_results.flatMap(c => c.criteria)
  const metCount   = allCrit.filter(c => c.compliance_status === 'Met').length
  const missCount  = allCrit.filter(c => c.compliance_status === 'Not Met').length

  const categoryBreakdown = report.category_results
    .map(c => `• ${c.category}: ${Math.round(c.marks_awarded)}/${c.max_marks} marks (${Math.round(c.percent_achieved)}%)`)
    .join('\n')

  const riskSummaryText = report.risk_items.length === 0
    ? 'No significant risks were identified in this evaluation.'
    : report.risk_items.map(r => `• [${r.severity}] ${r.risk_area}: ${r.description}`).join('\n')

  const topStrengths = allCrit
    .filter(c => c.compliance_status === 'Met' && c.confidence === 'High')
    .slice(0, 3)
    .map(c => `• ${c.criterion}`)
    .join('\n')

  const gaps = allCrit
    .filter(c => c.compliance_status === 'Not Met')
    .slice(0, 3)
    .map(c => `• ${c.criterion}`)
    .join('\n')

  return [
    {
      heading: 'Evaluation Overview',
      content: `This report summarizes the AI-assisted procurement evaluation for "${stripExt(rfpName)}". The vendor bid submitted by ${vendorName} was evaluated against ${allCrit.length} criteria across ${report.category_results.length} categories: ${report.category_results.map(c => c.category).join(', ')}.`,
    },
    {
      heading: 'Vendor Assessment',
      content: `${vendorName} achieved an overall score of ${report.total_score}/${report.max_score} (${pct}%), resulting in a ${report.passed ? 'PASS' : 'FAIL'} verdict.\n\n${categoryBreakdown}${report.disqualified ? `\n\n⚠ Disqualified: ${report.disqualification_reason}` : ''}`,
    },
    {
      heading: 'Key Findings',
      content: `${metCount} of ${allCrit.length} criteria were fully met. ${missCount} criteria were not met.\n\n${topStrengths ? `Strengths:\n${topStrengths}` : ''}${gaps ? `\n\nGaps:\n${gaps}` : ''}`,
    },
    {
      heading: 'Risk Summary',
      content: riskSummaryText,
    },
    {
      heading: 'Recommendation',
      content: report.executive_summary,
    },
  ]
}

export default function ExecutiveReportPage() {
  const { report, rfpName, bidName } = useEvaluation()
  const [downloading, setDownloading] = useState(false)
  const navigate = useNavigate()

  const download = async () => {
    if (!report) return
    setDownloading(true)
    try {
      const blob = await exportWord(report)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `Executive_Report.docx`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e) { alert(e.message) }
    setDownloading(false)
  }

  return (
    <div className="page-content fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#111827', marginBottom: 4 }}>Executive Report</h1>
          <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>Committee-ready summary of procurement evaluation</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={report ? download : () => navigate('/evaluate')}
          disabled={downloading}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {downloading ? 'Generating…' : report ? 'Download Report' : 'Run Evaluation First'}
        </button>
      </div>

      {!report ? (
        /* Empty state */
        <div className="card" style={{ padding: '4rem', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
          </div>
          <h2 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 8 }}>No report available</h2>
          <p style={{ color: '#6B7280', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            Run an evaluation first to generate a committee-ready executive report.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/evaluate')}>Start New Evaluation</button>
        </div>
      ) : (
        <>
          {/* Report Header Card */}
          <div className="card" style={{ padding: '2rem', marginBottom: '1.5rem', background: 'linear-gradient(135deg, #F5F3FF 0%, #EEF2FF 100%)', border: '1px solid #DDD6FE' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem' }}>
              <div style={{ width: 52, height: 52, borderRadius: 12, background: '#4F46E5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1E1B4B', marginBottom: 6 }}>
                  {stripExt(rfpName) || 'Procurement Evaluation'}
                </h2>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                    <span style={{ fontWeight: 600 }}>Vendor:</span> {stripExt(bidName)}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                    <span style={{ fontWeight: 600 }}>Prepared by:</span> BidEval AI Platform
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                    <span style={{ fontWeight: 600 }}>Date:</span> {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              </div>
              <span className="badge badge-inprog" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>Confidential</span>
            </div>

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #DDD6FE' }}>
              {[
                { label: 'Overall Score', value: `${Math.round((report.total_score / report.max_score) * 100)}%` },
                { label: 'Categories',   value: report.category_results.length },
                { label: 'Criteria',     value: report.category_results.flatMap(c => c.criteria).length },
                { label: 'Risk Items',   value: report.risk_items.length },
              ].map(m => (
                <div key={m.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#4F46E5' }}>{m.value}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Executive Summary */}
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="card-title">Executive Summary</div>
            <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.75 }}>{report.executive_summary}</p>
          </div>

          {/* Dynamic Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {buildSections(report, rfpName, bidName).map((s, i) => (
              <div key={i} className="card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.875rem' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: '#EEF2FF', color: '#4F46E5', fontSize: '0.78rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: '0.95rem', color: '#111827' }}>{s.heading}</h3>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{s.content}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, fontSize: '0.78rem', color: '#6B7280', textAlign: 'center' }}>
            This report was generated by BidEval AI. Data is based on AI analysis of submitted documents. Human review and final approval required before contract award.
            {report.metadata && (
              <div style={{ marginTop: 6, fontSize: '0.7rem', color: '#9CA3AF' }}>
                Model: {report.metadata.llm_model} · Temperature: {report.metadata.temperature} · Seed: {report.metadata.seed} · Prompt v{report.metadata.prompt_version}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
