import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import MainLayout from './components/layout/MainLayout'
import LoginPage from './pages/auth/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import ProjectsPage from './pages/projects/ProjectsPage'
import ProjectDetailPage from './pages/projects/ProjectDetailPage'
import IncidentsPage from './pages/incidents/IncidentsPage'
import IncidentDetailPage from './pages/incidents/IncidentDetailPage'
import PomodoroPage from './pages/pomodoro/PomodoroPage'
import UsersPage from './pages/admin/UsersPage'
import AdminPage from './pages/admin/AdminPage'
import ChangePasswordPage from './pages/auth/ChangePasswordPage'
import DemandsPage from './pages/demands/DemandsPage'
import DemandFormPage from './pages/demands/DemandFormPage'
import DemandDetailPage from './pages/demands/DemandDetailPage'
import DemandDashboardPage from './pages/demands/DemandDashboardPage'
import HechosPage from './pages/hechos/HechosPage'
import PremisasPage from './pages/premisas/PremisasPage'
import TorreControlPage from './pages/torre-control/TorreControlPage'
import CentroInfoPage from './pages/centro-info/CentroInfoPage'
import LeanProPage from './pages/lean-pro/LeanProPage'
import BPPage from './pages/bp/BPPage'
import BPDetailPage from './pages/bp/BPDetailPage'
import ExecutiveDashboard from './pages/executive/ExecutiveDashboard'
import MeetingsPage from './pages/voice/MeetingsPage'
import MobileHomePage from './pages/mobile/MobileHomePage'

function ProtectedRoute({ children, requireAdmin = false, requireLeader = false, requireDirectivo = false }) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.must_change_password) return <Navigate to="/change-password" replace />
  if (requireAdmin && user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  if (requireLeader && !['admin', 'leader', 'herramientas'].includes(user?.role))
    return <Navigate to="/dashboard" replace />
  if (requireDirectivo && !['admin', 'directivo'].includes(user?.role))
    return <Navigate to="/dashboard" replace />

  return children
}

export default function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
        />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        {/* Protected */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="incidents/:id" element={<IncidentDetailPage />} />
          <Route path="pomodoro" element={<PomodoroPage />} />
          <Route path="demands" element={<DemandsPage />} />
          <Route path="demands/new" element={<DemandFormPage />} />
          <Route path="demands/dashboard" element={
            <ProtectedRoute requireLeader>
              <DemandDashboardPage />
            </ProtectedRoute>
          } />
          <Route path="demands/:id" element={<DemandDetailPage />} />
          <Route path="hechos" element={<HechosPage />} />
          <Route path="premisas" element={<PremisasPage />} />
          <Route path="torre-control" element={<TorreControlPage />} />
          <Route path="centro-info" element={<CentroInfoPage />} />
          <Route path="lean-pro" element={<LeanProPage />} />
          <Route path="bp" element={<BPPage />} />
          <Route path="bp/:bpId" element={<BPDetailPage />} />
          <Route path="meetings" element={<MeetingsPage />} />
          <Route path="mobile" element={<MobileHomePage />} />
          <Route
            path="executive"
            element={
              <ProtectedRoute requireDirectivo>
                <ExecutiveDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin"
            element={
              <ProtectedRoute requireLeader>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/users"
            element={
              <ProtectedRoute requireLeader>
                <UsersPage />
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
