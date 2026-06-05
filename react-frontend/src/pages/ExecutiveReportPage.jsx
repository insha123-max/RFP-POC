import { useNavigate } from 'react-router-dom'
import { useEvaluation } from '../context/EvaluationContext'
import { exportWord } from '../api'
import { useState } from 'react'

const STATIC_REPORT = {
  title: 'Railway Signaling System — Metro Phase 3',
  preparedBy: 'BidEval AI Platform',
  date: 'June 5, 2026',
  summary: 'Siemens Mobility India is the recommended vendor with an overall score of 94/100. The evaluation covers 3 bidders across technical, commercial, and compliance dimensions. Siemens leads in both technical capability and compliance adherence with the lowest risk profile.',
  sections: [
    {
      heading: 'Evaluation Overview',
      content: 'This report summarizes the findings of the AI-assisted procurement evaluation for the Railway Signaling System — Metro Phase 3 tender. Three vendors submitted bids which were evaluated against 18 criteria across Technical, Commercial, and Compliance categories.',
    },
    {
      heading: 'Vendor Rankings',
      content: '1st place: Siemens Mobility India (94/100) — Recommended\n2nd place: Alstom Transportation (88/100) — Qualified\n3rd place: Bombardier Transit (82/100) — Qualified with conditions',
    },
    {
      heading: 'Key Findings',
      content: 'Siemens scored highest on technical specifications (96/100) and compliance (95/100), meeting all mandatory requirements. Alstom is competitive but has partial maintenance SLA coverage. Bombardier lacks local manufacturing capability, which is flagged as a high-risk gap.',
    },
    {
      heading: 'Risk Summary',
      content: "2 high-risk items identified: Bombardier's absence of local manufacturing capability and incomplete safety certifications. 1 medium-risk item: Alstom's partial SLA coverage. These issues should be resolved through negotiation or by disqualifying the affected bids.",
    },
    {
      heading: 'Recommendation',
      content: 'Award the contract to Siemens Mobility India at a bid value of $24.5M. Conditions: (1) Confirmation of local subcontractor arrangement within 30 days, (2) Final compliance audit before contract signing.',
    },
  ],
  metrics: [
    { label: 'Vendors Evaluated', value: '3' },
    { label: 'Criteria Assessed', value: '18' },
    { label: 'Top Score',         value: '94%' },
    { label: 'Risk Items',        value: '3' },
  ],
}

export default function ExecutiveReportPage() {
  const { report, rfpName } = useEvaluation()
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

  const title = report && rfpName ? rfpName.replace(/\.[^.]+$/, '') : STATIC_REPORT.title

  return (
    <div className="page-content">
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
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1E1B4B', marginBottom: 6 }}>{title}</h2>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                <span style={{ fontWeight: 600 }}>Prepared by:</span> {STATIC_REPORT.preparedBy}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                <span style={{ fontWeight: 600 }}>Date:</span> {STATIC_REPORT.date}
              </div>
            </div>
          </div>
          <span className="badge badge-inprog" style={{ fontSize: '0.75rem', padding: '4px 12px' }}>Confidential</span>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #DDD6FE' }}>
          {(report
            ? [
                { label: 'Overall Score', value: `${Math.round((report.total_score / report.max_score) * 100)}%` },
                { label: 'Categories',   value: report.category_results.length },
                { label: 'Criteria',     value: report.category_results.flatMap(c => c.criteria).length },
                { label: 'Risk Items',   value: report.risk_items.length },
              ]
            : STATIC_REPORT.metrics
          ).map(m => (
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
        <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.75 }}>
          {report ? report.executive_summary : STATIC_REPORT.summary}
        </p>
      </div>

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {STATIC_REPORT.sections.map((s, i) => (
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

      {/* Footer note */}
      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, fontSize: '0.78rem', color: '#6B7280', textAlign: 'center' }}>
        This report was generated by BidEval AI. Data is based on AI analysis of submitted documents. Human review and final approval required before contract award.
      </div>
    </div>
  )
}
