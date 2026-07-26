import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import MainLayout from './components/layout/MainLayout'
import LoginPage from './pages/auth/LoginPage'
import ChangePasswordPage from './pages/auth/ChangePasswordPage'

// ── Módulos core (simplificación 2026-07-26) ─────────────────────────────────
import DashboardPage from './pages/dashboard/DashboardPage'
import MiEspacioPage from './pages/mi-espacio/MiEspacioPage'
import TorreControlPage from './pages/torre-control/TorreControlPage'
import QuickTasksPage from './pages/quick-tasks/QuickTasksPage'
import ProjectsPage from './pages/projects/ProjectsPage'
import ProjectDetailPage from './pages/projects/ProjectDetailPage'
import ProjectDocsPage from './pages/projects/ProjectDocsPage'
import FlowsListPage from './pages/flows/FlowsListPage'
import FlowEditorPage from './pages/flows/FlowEditorPage'
import RetosPage from './pages/retos/RetosPage'
import PlantaPage from './pages/planta/PlantaPage'
import PomodoroPage from './pages/pomodoro/PomodoroPage'
import UsersPage from './pages/admin/UsersPage'
import AdminPage from './pages/admin/AdminPage'

function ProtectedRoute({ children, requireAdmin = false, requireLeader = false }) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.must_change_password) return <Navigate to="/change-password" replace />
  if (requireAdmin && user?.role !== 'admin') return <Navigate to="/dashboard" replace />
  if (requireLeader && !['admin', 'leader', 'herramientas'].includes(user?.role))
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
          <Route path="mi-espacio" element={<MiEspacioPage />} />
          <Route path="torre-control" element={<TorreControlPage />} />
          <Route path="quick-tasks" element={<QuickTasksPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="projects/:id/docs" element={<ProjectDocsPage />} />
          <Route path="flujos" element={<FlowsListPage />} />
          <Route path="flujos/:id" element={<FlowEditorPage />} />
          <Route path="retos" element={<RetosPage />} />
          <Route path="planta" element={<PlantaPage />} />
          {/* Pomodoro: accesible como timer, fuera del menú principal */}
          <Route path="pomodoro" element={<PomodoroPage />} />
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
