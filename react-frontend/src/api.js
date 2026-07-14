const BASE = '/api'

function authHeaders() {
  const token = localStorage.getItem('bideval_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function handleResponse(res) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function apiSignup(name, email, password, role = 'evaluator') {
  return handleResponse(await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password, role }),
  }))
}

export async function apiLogin(email, password) {
  return handleResponse(await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }))
}

export async function apiMe() {
  return handleResponse(await fetch(`${BASE}/auth/me`, {
    headers: authHeaders(),
  }))
}

// ---------------------------------------------------------------------------
// Evaluation history
// ---------------------------------------------------------------------------

export async function fetchEvaluations() {
  return handleResponse(await fetch(`${BASE}/evaluations`, {
    headers: authHeaders(),
  }))
}

export async function deleteEvaluationApi(id) {
  const res = await fetch(`${BASE}/evaluations/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Delete failed')
}

export async function clearAllEvaluationsApi() {
  const res = await fetch(`${BASE}/evaluations`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Clear failed')
}

export async function fetchEvaluationDocuments(evaluationId) {
  return handleResponse(await fetch(`${BASE}/evaluations/${evaluationId}/documents`, {
    headers: authHeaders(),
  }))
}

export async function downloadDocument(documentId, filename) {
  const res = await fetch(`${BASE}/documents/${documentId}/download`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || 'document'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Evaluation runs — these enqueue a background job and return {job_id, status}
// immediately (202 Accepted). Use fetchJob()/pollJobUntilDone() to learn when
// the job finishes, since the LLM pipeline can take several minutes.
// ---------------------------------------------------------------------------

export async function runEvaluation(rfpFiles, bidFiles, readinessRules = null, customThreshold = null) {
  const form = new FormData()
  const rfps = Array.isArray(rfpFiles) ? rfpFiles : [rfpFiles]
  rfps.forEach(f => form.append('rfp_files', f))
  const files = Array.isArray(bidFiles) ? bidFiles : [bidFiles]
  files.forEach(f => form.append('bid_files', f))
  if (readinessRules) form.append('readiness_rules_json', JSON.stringify(readinessRules))
  if (customThreshold !== null) form.append('custom_threshold', String(customThreshold))
  return handleResponse(await fetch(`${BASE}/evaluate`, { method: 'POST', headers: authHeaders(), body: form }))
}

export async function runCustomEvaluation(bidFiles, criteriaData) {
  const form = new FormData()
  const files = Array.isArray(bidFiles) ? bidFiles : [bidFiles]
  files.forEach(f => form.append('bid_files', f))
  form.append('criteria_json', JSON.stringify(criteriaData))
  return handleResponse(await fetch(`${BASE}/evaluate-custom`, { method: 'POST', headers: authHeaders(), body: form }))
}

export async function runPQTQEvaluation(rfpFile, bidFiles, extraRfpFiles = [], readinessRules = null, customThreshold = null) {
  const form = new FormData()
  form.append('rfp_file', rfpFile)
  const files = Array.isArray(bidFiles) ? bidFiles : [bidFiles]
  files.forEach(f => form.append('bid_files', f))
  const extras = Array.isArray(extraRfpFiles) ? extraRfpFiles : [extraRfpFiles]
  extras.forEach(f => form.append('extra_rfp_files', f))
  if (readinessRules) form.append('readiness_rules_json', JSON.stringify(readinessRules))
  if (customThreshold !== null) form.append('custom_threshold', String(customThreshold))
  return handleResponse(await fetch(`${BASE}/evaluate-pqtq`, { method: 'POST', headers: authHeaders(), body: form }))
}

export async function fetchBidReadiness(rfpFile, additionalFile = null) {
  const form = new FormData()
  form.append('rfp_file', rfpFile)
  if (additionalFile) form.append('additional_file', additionalFile)
  return handleResponse(await fetch(`${BASE}/bid-readiness`, { method: 'POST', headers: authHeaders(), body: form }))
}

// ---------------------------------------------------------------------------
// Job polling
// ---------------------------------------------------------------------------

export async function fetchJob(jobId) {
  return handleResponse(await fetch(`${BASE}/jobs/${jobId}`, {
    headers: authHeaders(),
  }))
}

export async function fetchJobs(status = null) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  return handleResponse(await fetch(`${BASE}/jobs${qs}`, {
    headers: authHeaders(),
  }))
}

// Polls a job until it reaches a terminal state. Resolves with the job
// (status 'completed' or 'failed') — callers check job.status themselves so
// a failed job doesn't need to be distinguished via a thrown exception.
export async function pollJobUntilDone(jobId, { intervalMs = 3000, signal } = {}) {
  while (true) {
    if (signal?.aborted) throw new DOMException('Polling aborted', 'AbortError')
    const job = await fetchJob(jobId)
    if (job.status === 'completed' || job.status === 'failed') return job
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

export async function applyOverride(report, overrides) {
  return handleResponse(await fetch(`${BASE}/override`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ report, overrides }),
  }))
}

export async function exportWord(report) {
  const res = await fetch(`${BASE}/export/word`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(report),
  })
  if (!res.ok) throw new Error('Export failed')
  return res.blob()
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function fetchAllEvaluations() {
  return handleResponse(await fetch(`${BASE}/evaluations/all`, {
    headers: authHeaders(),
  }))
}
