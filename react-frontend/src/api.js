const BASE = '/api'

export async function runEvaluation(rfpFiles, bidFiles, readinessRules = null) {
  const form = new FormData()
  const rfps = Array.isArray(rfpFiles) ? rfpFiles : [rfpFiles]
  rfps.forEach(f => form.append('rfp_files', f))
  const files = Array.isArray(bidFiles) ? bidFiles : [bidFiles]
  files.forEach(f => form.append('bid_files', f))
  if (readinessRules) {
    form.append('readiness_rules_json', JSON.stringify(readinessRules))
  }
  const res = await fetch(`${BASE}/evaluate`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Evaluation failed')
  }
  return res.json()
}

export async function runCustomEvaluation(bidFiles, criteriaData) {
  const form = new FormData()
  const files = Array.isArray(bidFiles) ? bidFiles : [bidFiles]
  files.forEach(f => form.append('bid_files', f))
  form.append('criteria_json', JSON.stringify(criteriaData))
  const res = await fetch(`${BASE}/evaluate-custom`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Evaluation failed')
  }
  return res.json()
}

export async function runPQTQEvaluation(rfpFile, bidFiles, extraRfpFiles = [], readinessRules = null) {
  const form = new FormData()
  form.append('rfp_file', rfpFile)
  const files = Array.isArray(bidFiles) ? bidFiles : [bidFiles]
  files.forEach(f => form.append('bid_files', f))
  const extras = Array.isArray(extraRfpFiles) ? extraRfpFiles : [extraRfpFiles]
  extras.forEach(f => form.append('extra_rfp_files', f))
  if (readinessRules) {
    form.append('readiness_rules_json', JSON.stringify(readinessRules))
  }
  const res = await fetch(`${BASE}/evaluate-pqtq`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'PQTQ Evaluation failed')
  }
  return res.json()
}

export async function fetchBidReadiness(rfpFile, additionalFile = null) {
  const form = new FormData()
  form.append('rfp_file', rfpFile)
  if (additionalFile) form.append('additional_file', additionalFile)
  const res = await fetch(`${BASE}/bid-readiness`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Extraction failed')
  }
  return res.json()
}

export async function applyOverride(report, overrides) {
  const res = await fetch(`${BASE}/override`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report, overrides }),
  })
  if (!res.ok) throw new Error('Override failed')
  return res.json()
}

export async function exportWord(report) {
  const res = await fetch(`${BASE}/export/word`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  })
  if (!res.ok) throw new Error('Export failed')
  return res.blob()
}
