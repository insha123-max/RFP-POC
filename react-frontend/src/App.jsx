import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { EvaluationProvider } from './context/EvaluationContext'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import DashboardPage        from './pages/DashboardPage'
import EvaluatePage         from './pages/EvaluatePage'
import ActiveEvaluationPage from './pages/ActiveEvaluationPage'
import VendorAnalysisPage   from './pages/VendorAnalysisPage'
import ExecutiveReportPage  from './pages/ExecutiveReportPage'
import AnalyticsPage        from './pages/AnalyticsPage'
import PQTQEvaluatePage     from './pages/PQTQEvaluatePage'

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <EvaluationProvider>
      <div className={`app-shell${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
        <TopBar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
        <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
        <div className="main-area">
          <Routes>
            <Route path="/"                  element={<DashboardPage />} />
            <Route path="/evaluate"          element={<EvaluatePage />} />
            <Route path="/pqtq-evaluation"   element={<PQTQEvaluatePage />} />
            <Route path="/active-evaluation" element={<ActiveEvaluationPage />} />
            <Route path="/vendor-analysis"   element={<VendorAnalysisPage />} />
            <Route path="/executive-report"  element={<ExecutiveReportPage />} />
            <Route path="/analytics"         element={<AnalyticsPage />} />
          </Routes>
        </div>
      </div>
    </EvaluationProvider>
  )
}
