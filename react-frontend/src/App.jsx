import { useState, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { registerServiceWorker } from './utils/notifications'
import { EvaluationProvider } from './context/EvaluationContext'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import LoginPage             from './pages/LoginPage'
import SignupPage            from './pages/SignupPage'
import DashboardPage        from './pages/DashboardPage'
import EvaluatePage         from './pages/EvaluatePage'
import ActiveEvaluationPage from './pages/ActiveEvaluationPage'
import VendorAnalysisPage   from './pages/VendorAnalysisPage'
import ExecutiveReportPage  from './pages/ExecutiveReportPage'
import AnalyticsPage        from './pages/AnalyticsPage'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

// Register service worker once on app load for reliable notifications
registerServiceWorker()

function AppShell() {
  const { pathname } = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  if (pathname === '/login' || pathname === '/signup') {
    return (
      <Routes>
        <Route path="/login"  element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Routes>
    )
  }

  return (
    <EvaluationProvider>
      <div className={`app-shell${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
        <TopBar sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
        <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
        <div className="main-area">
          <ScrollToTop />
          <Routes>
            <Route path="/login"  element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/"                  element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/evaluate"          element={<ProtectedRoute><EvaluatePage /></ProtectedRoute>} />
            <Route path="/active-evaluation" element={<ProtectedRoute><ActiveEvaluationPage /></ProtectedRoute>} />
            <Route path="/vendor-analysis"   element={<ProtectedRoute><VendorAnalysisPage /></ProtectedRoute>} />
            <Route path="/executive-report"  element={<ProtectedRoute><ExecutiveReportPage /></ProtectedRoute>} />
            <Route path="/analytics"         element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
          </Routes>
        </div>
      </div>
    </EvaluationProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}
