// Shared report modal used by both BidReadinessPage (live session) and DashboardPage (stored history).
// `entry` shape: { rfpName, timestamp, pqPct, pqMet, pqTotal, pqPass,
//                  tqPct, tqMet, tqTotal, overall, recommendation, recColor,
//                  pqItems: [{criterion, detail, met}], tqItems: [{criterion, detail, category, met}] }

export function PQTQReportModal({ entry, onClose }) {
  const tqByCat = (entry.tqItems || []).reduce((acc, item) => {
    ;(acc[item.category] = acc[item.category] || []).push(item); return acc
  }, {})

  const dateStr = new Date(entry.timestamp).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const handlePrint = () => {
    const content = document.getElementById('pqtq-rpt-area')
    if (!content) return
    const w = window.open('', '_blank', 'width=950,height=800')
    w.document.write(`<!DOCTYPE html><html><head>
      <title>PQTQ Report – ${entry.rfpName}</title>
      <meta charset="utf-8">
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; margin: 0; padding: 0; font-size: 14px; }
        @media print { @page { margin: 0.5cm; } }
      </style>
    </head><body>${content.innerHTML}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 600)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F3F4F6', zIndex: 2000, overflowY: 'auto' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.75rem 1.5rem 3rem' }}>
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,.08)' }}>

        {/* Everything below this div is captured for print */}
        <div id="pqtq-rpt-area">

          {/* ── Gradient header ── */}
          <div style={{ background: 'linear-gradient(135deg,#4F46E5,#7C3AED)', padding: '1.5rem', borderRadius: '16px 16px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fff' }}>PQTQ Checker Report</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,.65)', marginTop: 3 }}>
                  {entry.rfpName} · Generated {dateStr}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handlePrint}
                  style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,.4)', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                >🖨 Print / Save PDF</button>
                <button
                  onClick={onClose}
                  style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,.4)', background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                >✕ Close</button>
              </div>
            </div>

            {/* Score boxes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: 'PQ Eligibility',    value: `${entry.pqPct}%`,   sub: `${entry.pqMet}/${entry.pqTotal} criteria · ${entry.pqPass ? 'PASS' : 'FAIL'}` },
                { label: 'TQ Score',           value: `${entry.tqPct}%`,   sub: `${entry.tqMet}/${entry.tqTotal} criteria met` },
                { label: 'Overall Readiness',  value: `${entry.overall}%`, sub: 'PQ 30% + TQ 70% weighted' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,.12)', borderRadius: 10, padding: '0.875rem 1rem' }}>
                  <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,.6)', marginTop: 3 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Recommendation ── */}
          {entry.recommendation && (
            <div style={{ padding: '0.875rem 1.5rem', background: '#FAFAFA', borderBottom: '1px solid #E5E7EB', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1rem', flexShrink: 0 }}>
                {entry.recColor === '#16A34A' ? '✅' : entry.recColor === '#D97706' ? '⚠️' : '❌'}
              </span>
              <div style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.6 }}>{entry.recommendation}</div>
            </div>
          )}

          {/* ── Body ── */}
          <div style={{ padding: '1.5rem' }}>

            {/* PQ table */}
            {(entry.pqItems || []).length > 0 && (
              <div style={{ marginBottom: '1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>PQ</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>Pre-Qualification Requirements</span>
                  <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{entry.pqItems.length} criteria</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: '#FFFBEB' }}>
                      <th style={{ textAlign: 'left', padding: '7px 12px', fontWeight: 700, color: '#92400E', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #FDE68A' }}>Requirement</th>
                      <th style={{ textAlign: 'center', padding: '7px 12px', fontWeight: 700, color: '#92400E', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #FDE68A', width: 100 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.pqItems.map((item, i) => (
                      <tr key={item.id || i} style={{ background: i % 2 === 0 ? '#fff' : '#FFFDF5' }}>
                        <td style={{ padding: '8px 12px', color: '#374151', borderBottom: '1px solid #F3F4F6', lineHeight: 1.45 }}>
                          <div style={{ fontWeight: 600 }}>{item.criterion}</div>
                          {item.detail && <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: 2 }}>{item.detail}</div>}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '1px solid #F3F4F6' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: item.met ? '#DCFCE7' : '#F3F4F6', color: item.met ? '#15803D' : '#9CA3AF' }}>
                            {item.met ? '✓ Met' : '○ Not Met'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TQ table by category */}
            {(entry.tqItems || []).length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 800, padding: '2px 7px', borderRadius: 4, background: '#E0E7FF', color: '#3730A3' }}>TQ</span>
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>Technical Qualification Criteria</span>
                  <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{entry.tqItems.length} criteria</span>
                </div>
                {Object.entries(tqByCat).map(([cat, items]) => (
                  <div key={cat} style={{ marginBottom: '1rem' }}>
                    <div style={{ background: '#EEF2FF', padding: '6px 12px', borderRadius: '6px 6px 0 0', fontWeight: 700, fontSize: '0.72rem', color: '#3730A3', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cat}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={item.id || i} style={{ background: i % 2 === 0 ? '#fff' : '#F8F7FF' }}>
                            <td style={{ padding: '8px 12px', color: '#374151', borderBottom: '1px solid #F3F4F6', lineHeight: 1.45 }}>
                              <div style={{ fontWeight: 500 }}>{item.criterion}</div>
                              {item.detail && <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: 2 }}>{item.detail}</div>}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', borderBottom: '1px solid #F3F4F6', width: 100 }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: item.met ? '#DCFCE7' : '#F3F4F6', color: item.met ? '#15803D' : '#9CA3AF' }}>
                                {item.met ? '✓ Met' : '○ Not Met'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
