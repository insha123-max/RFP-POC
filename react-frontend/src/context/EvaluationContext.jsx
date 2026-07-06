import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { fetchEvaluations, saveEvaluation, deleteEvaluationApi, clearAllEvaluationsApi } from '../api'

const Ctx = createContext(null)

function loadLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback }
  catch { return fallback }
}

export function EvaluationProvider({ children }) {
  const [report, setReportState]         = useState(() => loadLS('eval_report', null))
  const [rfpName, setRfpNameState]       = useState(() => loadLS('eval_rfpName', ''))
  const [bidName, setBidNameState]       = useState(() => loadLS('eval_bidName', ''))
  const [history, setHistory]            = useState([])
  const [pqtqCheckHistory, setPQTQChecks] = useState([])
  const [activePQTQ, setActivePQTQState] = useState(() => loadLS('active_pqtq', null))
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [evalRunning, setEvalRunning]     = useState(false)
  const [evalType, setEvalType]           = useState(null) // 'general' | 'pqtq'
  const [toast, setToast]                 = useState(null) // { title, body, score, passed }

  const showToast = useCallback((title, body, score, passed) => {
    setToast({ title, body, score, passed })
    setTimeout(() => setToast(null), 8000)
  }, [])

  // Load history from DB on mount
  useEffect(() => {
    fetchEvaluations()
      .then(rows => {
        const general = rows.filter(r => r.evaluation_type !== 'PQTQ')
        const pqtq    = rows.filter(r => r.evaluation_type === 'PQTQ')
        setHistory(general.map(r => ({
          id: r.id,
          rfpName: r.rfp_name,
          bidName: r.bid_name,
          evaluationType: r.evaluation_type,
          score: r.score,
          passed: r.passed,
          report: r.report,
          timestamp: r.timestamp,
        })))
        setPQTQChecks(pqtq.map(r => ({
          id: r.id,
          rfpName: r.rfp_name,
          bidName: r.bid_name,
          evaluationType: r.evaluation_type,
          score: r.score,
          passed: r.passed,
          report: r.report,
          timestamp: r.timestamp,
        })))
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true))
  }, [])

  const setReport  = r => { setReportState(r);  localStorage.setItem('eval_report',  JSON.stringify(r)) }
  const setRfpName = n => { setRfpNameState(n); localStorage.setItem('eval_rfpName', JSON.stringify(n)) }
  const setBidName = n => { setBidNameState(n); localStorage.setItem('eval_bidName', JSON.stringify(n)) }

  const setActivePQTQ = data => {
    setActivePQTQState(data)
    if (data) localStorage.setItem('active_pqtq', JSON.stringify(data))
    else localStorage.removeItem('active_pqtq')
  }

  const addToHistory = async entry => {
    try {
      const saved = await saveEvaluation({
        rfp_name: entry.rfpName,
        bid_name: entry.bidName,
        evaluation_type: entry.evaluationType || 'General',
        score: entry.score,
        passed: entry.passed,
        report: entry.report,
      })
      const withId = { ...entry, id: saved.id }
      setHistory(prev => [withId, ...prev].slice(0, 100))
    } catch {
      // fallback: add with local id so UI doesn't break
      setHistory(prev => [entry, ...prev].slice(0, 100))
    }
  }

  const deleteFromHistory = async id => {
    setHistory(prev => prev.filter(e => e.id !== id))
    try { await deleteEvaluationApi(id) } catch {}
  }

  const clearAllHistory = async () => {
    setHistory([])
    try { await clearAllEvaluationsApi() } catch {}
  }

  const setCurrentEvaluation = entry => {
    setReport(entry.report)
    setRfpName(entry.rfpName)
    setBidName(entry.bidName)
  }

  const addPQTQCheck = async entry => {
    // Backend now auto-saves PQTQ checks to handle navigation aborts,
    // so we skip hitting the save API here to avoid duplicate DB entries.
    const withId = { ...entry, id: entry.id || Date.now() }
    setPQTQChecks(prev => [withId, ...prev].slice(0, 100))
  }

  const deletePQTQCheck = async id => {
    setPQTQChecks(prev => prev.filter(e => e.id !== id))
    try { await deleteEvaluationApi(id) } catch {}
  }

  const clearAllPQTQChecks = async () => {
    setPQTQChecks([])
    // only delete PQTQ entries — general history untouched
    try {
      await Promise.all(pqtqCheckHistory.map(e => deleteEvaluationApi(e.id)))
    } catch {}
  }

  return (
    <>
    {toast && (
      <div onClick={() => setToast(null)} style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        background: '#fff', border: '1px solid #E2E8F0',
        borderLeft: `4px solid ${toast.passed === false ? '#EF4444' : '#22C55E'}`,
        borderRadius: 12, padding: '14px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        maxWidth: 340, cursor: 'pointer', animation: 'slideUp .3s ease',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.1rem' }}>{toast.passed === false ? '❌' : '✅'}</span>
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1E293B' }}>{toast.title}</span>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#64748B', paddingLeft: 28 }}>{toast.body}</div>
        <div style={{ fontSize: '0.68rem', color: '#94A3B8', paddingLeft: 28, marginTop: 2 }}>Click to dismiss</div>
      </div>
    )}
    <Ctx.Provider value={{
      report, setReport, rfpName, setRfpName, bidName, setBidName,
      history, addToHistory, deleteFromHistory, clearAllHistory, setCurrentEvaluation,
      pqtqCheckHistory, addPQTQCheck, deletePQTQCheck, clearAllPQTQChecks,
      activePQTQ, setActivePQTQ,
      historyLoaded,
      evalRunning, setEvalRunning, evalType, setEvalType,
      showToast,
    }}>
      {children}
    </Ctx.Provider>
    </>
  )
}

export const useEvaluation = () => useContext(Ctx)
