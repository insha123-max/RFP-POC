import { createContext, useContext, useState } from 'react'

const Ctx = createContext(null)

function loadLS(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback }
  catch { return fallback }
}

export function EvaluationProvider({ children }) {
  const [report, setReportState]   = useState(() => loadLS('eval_report', null))
  const [rfpName, setRfpNameState] = useState(() => loadLS('eval_rfpName', ''))
  const [bidName, setBidNameState] = useState(() => loadLS('eval_bidName', ''))
  const [history, setHistory]      = useState(() => loadLS('eval_history', []))

  const setReport  = r => { setReportState(r);  localStorage.setItem('eval_report',  JSON.stringify(r)) }
  const setRfpName = n => { setRfpNameState(n); localStorage.setItem('eval_rfpName', JSON.stringify(n)) }
  const setBidName = n => { setBidNameState(n); localStorage.setItem('eval_bidName', JSON.stringify(n)) }

  const addToHistory = entry => {
    setHistory(prev => {
      const next = [entry, ...prev].slice(0, 50)
      localStorage.setItem('eval_history', JSON.stringify(next))
      return next
    })
  }

  const deleteFromHistory = id => {
    setHistory(prev => {
      const next = prev.filter(e => e.id !== id)
      localStorage.setItem('eval_history', JSON.stringify(next))
      // If the deleted entry is the currently loaded report, clear it
      const deleted = prev.find(e => e.id === id)
      if (deleted && deleted.report === JSON.parse(localStorage.getItem('eval_report') || 'null')) {
        setReport(next[0]?.report ?? null)
        setRfpName(next[0]?.rfpName ?? '')
        setBidName(next[0]?.bidName ?? '')
      }
      return next
    })
  }

  const setCurrentEvaluation = entry => {
    setReport(entry.report)
    setRfpName(entry.rfpName)
    setBidName(entry.bidName)
  }

  return (
    <Ctx.Provider value={{ report, setReport, rfpName, setRfpName, bidName, setBidName, history, addToHistory, deleteFromHistory, setCurrentEvaluation }}>
      {children}
    </Ctx.Provider>
  )
}

export const useEvaluation = () => useContext(Ctx)
