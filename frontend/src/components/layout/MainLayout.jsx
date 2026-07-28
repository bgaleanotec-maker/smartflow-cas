import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import ErrorBoundary from '../ErrorBoundary'
import {
  LayoutDashboard, FolderKanban, Users, Settings, LogOut,
  ChevronLeft, ChevronRight, Menu, X, ListTodo, Plus,
  Plane, Workflow, UserCircle2, Trophy, Factory, SquareKanban,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { usePomodoroStore } from '../../stores/pomodoroStore'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { quickTasksAPI, adminAPI, usersAPI, challengesAPI } from '../../services/api'

// ─── QuickTaskCreateModal ─────────────────────────────────────────────────────

function QuickTaskCreateModal({ onClose }) {
  const [form, setForm] = useState({
    title: '', business_id: '', priority: 'media', due_date: '',
    assigned_to_id: '', estimated_minutes: '',
  })
  const [businesses, setBusinesses] = useState([])
  const [users, setUsers] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminAPI.businesses().then(r => {
      const data = Array.isArray(r.data) ? r.data : r.data?.items || []
      setBusinesses(data)
    }).catch(() => {})
    usersAPI.list({ is_active: true, limit: 100 }).then(r => {
      setUsers(Array.isArray(r.data) ? r.data : r.data?.items || [])
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('El título es obligatorio')
    setSaving(true)
    try {
      await quickTasksAPI.create({
        title: form.title.trim(),
        business_id: form.business_id ? parseInt(form.business_id) : null,
        assigned_to_id: form.assigned_to_id ? parseInt(form.assigned_to_id) : null,
        priority: form.priority,
        estimated_minutes: form.estimated_minutes ? parseInt(form.estimated_minutes) : null,
        due_date: form.due_date || null,
      })
      toast.success('⚡ Tarea creada — ¡a por ella!')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear tarea')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <ListTodo size={15} className="text-amber-400" /> Tarea rápida
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="label">Título *</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="input"
              placeholder="¿Qué hay que hacer?"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Prioridad</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="input">
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <div>
              <label className="label">Vencimiento</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input" />
            </div>
          </div>
          {businesses.length > 0 && (
            <div>
              <label className="label">Empresa</label>
              <select value={form.business_id} onChange={e => setForm(f => ({ ...f, business_id: e.target.value }))} className="input">
                <option value="">Sin empresa</option>
                {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          {users.length > 0 && (
            <div>
              <label className="label">Asignar a</label>
              <select value={form.assigned_to_id} onChange={e => setForm(f => ({ ...f, assigned_to_id: e.target.value }))} className="input">
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Tiempo estimado (min)</label>
            <input
              type="number" min="1"
              value={form.estimated_minutes}
              onChange={e => setForm(f => ({ ...f, estimated_minutes: e.target.value }))}
              className="input" placeholder="Ej: 30"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Creando...' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Nav — módulos core ───────────────────────────────────────────────────────
// roles: si se define, el ítem solo aparece para esos roles.
// VIEW_ALL = visión global del equipo (admin / leader / lider_sr / directivo).

export const VIEW_ALL_ROLES = ['admin', 'leader', 'lider_sr', 'directivo']

const navItems = [
  { to: '/dashboard',     icon: LayoutDashboard, label: 'Gestión Diaria', roles: VIEW_ALL_ROLES },
  { to: '/planta',        icon: Factory,         label: 'Planta',         roles: VIEW_ALL_ROLES },
  { to: '/mi-espacio',    icon: UserCircle2,     label: 'Mi Espacio' },
  { to: '/tablero',       icon: SquareKanban,    label: 'Mi Tablero' },
  { to: '/torre-control', icon: Plane,           label: 'Recurrentes' },
  { to: '/quick-tasks',   icon: ListTodo,        label: 'Tareas Rápidas' },
  { to: '/projects',      icon: FolderKanban,    label: 'Backlog / Proyectos' },
  { to: '/flujos',        icon: Workflow,        label: 'Flujos' },
  { to: '/retos',         icon: Trophy,          label: 'Retos' },
]

const adminItems = [
  { to: '/admin/users', icon: Users, label: 'Usuarios' },
  { to: '/admin', icon: Settings, label: 'Configuración' },
]

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const { isRunning, formatTime, sessionType } = usePomodoroStore()
  const visibleNavItems = navItems.filter(i => !i.roles || i.roles.includes(user?.role))
  const hasViewAll = VIEW_ALL_ROLES.includes(user?.role)
  const navigate = useNavigate()
  const location = useLocation()

  // Tracking ligero de uso (estadísticas de la app — fire and forget)
  useEffect(() => {
    const path = '/' + (location.pathname.split('/')[1] || 'dashboard')
    challengesAPI.track({ event_type: 'page_view', path }).catch(() => {})
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={clsx('flex items-center gap-3 px-4 py-5 border-b border-slate-800', collapsed && 'justify-center')}>
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0">
          SF
        </div>
        {!collapsed && <span className="font-bold text-lg text-white">SmartFlow</span>}
      </div>

      {/* Pomodoro indicator */}
      {isRunning && (
        <div className={clsx(
          'mx-3 mt-3 rounded-lg p-2 flex items-center gap-2 text-xs',
          sessionType === 'trabajo' ? 'bg-brand-900/50 border border-brand-700 text-brand-300' : 'bg-green-900/50 border border-green-700 text-green-300'
        )}>
          <div className="w-2 h-2 rounded-full bg-current animate-pulse flex-shrink-0" />
          {!collapsed && (
            <span className="font-mono font-semibold">{formatTime()}</span>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNavItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              )
            }
          >
            <Icon size={18} className="flex-shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}

        {['admin', 'leader', 'lider_sr'].includes(user?.role) && (
          <>
            <div className={clsx('px-3 pt-4 pb-1', collapsed && 'hidden')}>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Admin
              </span>
            </div>
            {adminItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  )
                }
              >
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User area */}
      <div className="px-3 pb-4 border-t border-slate-800 pt-3">
        <div className={clsx('flex items-center gap-3 px-2 py-2 rounded-lg', collapsed && 'justify-center')}>
          <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user?.full_name?.slice(0, 2).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-100 truncate">{user?.full_name}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-colors mt-1',
            collapsed && 'justify-center'
          )}
        >
          <LogOut size={16} />
          {!collapsed && 'Cerrar sesión'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-[100dvh] bg-slate-950 overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <aside
        className={clsx(
          'hidden lg:flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-200 flex-shrink-0 relative',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-1/2 -translate-y-1/2 translate-x-full w-5 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-r-md flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors z-10"
          style={{ left: collapsed ? '3.5rem' : '15rem' }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-slate-900/95 backdrop-blur-lg border-b border-slate-800 flex items-center justify-between px-4 safe-top">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-brand-600 rounded-md flex items-center justify-center font-bold text-[10px]">
            SF
          </div>
          <span className="font-bold text-white text-sm">SmartFlow</span>
        </div>

        <div className="flex items-center gap-1">
          {isRunning && (
            <span className={clsx(
              'text-xs font-mono font-semibold px-2 py-0.5 rounded-md border',
              sessionType === 'trabajo' ? 'bg-brand-900/50 border-brand-700 text-brand-300' : 'bg-green-900/50 border-green-700 text-green-300'
            )}>
              {formatTime()}
            </span>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto p-4 lg:p-6 pt-[72px] lg:pt-4 pb-[88px] lg:pb-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* ── Mobile bottom navigation ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 safe-bottom">
        <div className="flex items-center justify-around h-[60px]">
          <NavLink to={hasViewAll ? '/dashboard' : '/tablero'} className={({ isActive }) => clsx('mobile-nav-item', isActive && 'active')}>
            {hasViewAll ? <LayoutDashboard size={20} /> : <SquareKanban size={20} />}
            <span>{hasViewAll ? 'Gestión' : 'Tablero'}</span>
          </NavLink>

          <NavLink to="/mi-espacio" className={({ isActive }) => clsx('mobile-nav-item', isActive && 'active')}>
            <UserCircle2 size={20} />
            <span>Mi Espacio</span>
          </NavLink>

          {/* Center: nueva tarea rápida */}
          <button
            onClick={() => setQuickTaskOpen(true)}
            className="flex flex-col items-center justify-center -mt-5"
            aria-label="Nueva tarea rápida"
          >
            <div className="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-600/40 flex items-center justify-center transition-transform active:scale-95">
              <Plus size={24} className="text-white" />
            </div>
            <span className="text-[10px] font-medium text-amber-400 mt-0.5">Nueva</span>
          </button>

          <NavLink to="/quick-tasks" className={({ isActive }) => clsx('mobile-nav-item', isActive && 'active')}>
            <ListTodo size={20} />
            <span>Tareas</span>
          </NavLink>

          <button
            onClick={() => setDrawerOpen(true)}
            className={clsx('mobile-nav-item', drawerOpen && 'text-brand-400')}
          >
            <Menu size={20} />
            <span>Más</span>
          </button>
        </div>
      </nav>

      {/* ── Mobile nav drawer ── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />

          <div className="relative z-10 bg-slate-900 rounded-t-2xl border-t border-slate-700 max-h-[85vh] flex flex-col animate-slide-up">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-600 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-brand-600 rounded-md flex items-center justify-center font-bold text-xs">SF</div>
                <span className="font-bold text-white">SmartFlow</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {visibleNavItems.map(({ to, icon: Icon, label }) => {
                const isActive = location.pathname === to || location.pathname.startsWith(to + '/')
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setDrawerOpen(false)}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors',
                      isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800'
                    )}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    <span className="truncate">{label}</span>
                  </NavLink>
                )
              })}

              {['admin', 'leader', 'lider_sr'].includes(user?.role) && (
                <>
                  <div className="px-3 pt-3 pb-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</span>
                  </div>
                  {adminItems.map(({ to, icon: Icon, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => setDrawerOpen(false)}
                      className={({ isActive }) =>
                        clsx(
                          'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors',
                          isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800'
                        )
                      }
                    >
                      <Icon size={18} className="flex-shrink-0" />
                      {label}
                    </NavLink>
                  ))}
                </>
              )}
            </div>

            <div className="px-4 py-4 border-t border-slate-800 safe-bottom">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-brand-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {user?.full_name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">{user?.full_name}</p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
                </div>
              </div>
              <button
                onClick={() => { setDrawerOpen(false); handleLogout() }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-900/20 border border-slate-700 transition-colors"
              >
                <LogOut size={15} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FAB desktop: nueva tarea rápida ── */}
      <div className="hidden lg:block fixed bottom-8 right-6 z-40">
        <button
          onClick={() => setQuickTaskOpen(true)}
          className="w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all active:scale-95 bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/30 hover:scale-105"
          aria-label="Nueva tarea rápida"
        >
          <Plus size={22} className="text-white" />
        </button>
      </div>

      {quickTaskOpen && (
        <QuickTaskCreateModal onClose={() => setQuickTaskOpen(false)} />
      )}
    </div>
  )
}
