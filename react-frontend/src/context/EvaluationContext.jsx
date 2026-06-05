import { createContext, useContext, useState } from 'react'

const Ctx = createContext(null)

export function EvaluationProvider({ children }) {
  const [report, setReport]     = useState(null)
  const [rfpName, setRfpName]   = useState('')
  const [bidName, setBidName]   = useState('')

  return (
    <Ctx.Provider value={{ report, setReport, rfpName, setRfpName, bidName, setBidName }}>
      {children}
    </Ctx.Provider>
  )
}

export const useEvaluation = () => useContext(Ctx)
