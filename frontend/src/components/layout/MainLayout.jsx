import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, FolderKanban, AlertTriangle, Timer,
  Users, Settings, LogOut, ChevronLeft, ChevronRight,
  Bell, Search, Menu, X, FileText, BarChart3, Newspaper, Landmark,
  Plane, LayoutGrid, Zap, TrendingUp, Crown, Mic2,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { usePomodoroStore } from '../../stores/pomodoroStore'
import clsx from 'clsx'
import AIChatWidget from '../AIChatWidget'
import VoiceAIPanel from '../voice/VoiceAIPanel'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/executive', icon: Crown, label: 'Vista Directiva', badge: 'VP', roles: ['admin', 'directivo'] },
  { to: '/torre-control', icon: Plane, label: 'Torre de Control' },
  { to: '/lean-pro', icon: Zap, label: 'Lean Pro' },
  { to: '/centro-info', icon: LayoutGrid, label: 'Centro Info' },
  { to: '/demands', icon: FileText, label: 'Demandas' },
  { to: '/demands/dashboard', icon: BarChart3, label: 'Dashboard Demandas', roles: ['admin', 'leader', 'herramientas'] },
  { to: '/hechos', icon: Newspaper, label: 'Hechos Relevantes' },
  { to: '/premisas', icon: Landmark, label: 'Premisas' },
  { to: '/bp', icon: TrendingUp, label: 'Plan de Negocio', cas: true },
  { to: '/projects', icon: FolderKanban, label: 'Proyectos' },
  { to: '/incidents', icon: AlertTriangle, label: 'Incidentes' },
  { to: '/pomodoro', icon: Timer, label: 'Pomodoro' },
  { to: '/meetings', icon: Mic2, label: 'Reuniones' },
]

const adminItems = [
  { to: '/admin/users', icon: Users, label: 'Usuarios' },
  { to: '/admin', icon: Settings, label: 'Configuración' },
]

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const { isRunning, formatTime, sessionType } = usePomodoroStore()
  const navigate = useNavigate()

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
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.filter(item => !item.roles || item.roles.includes(user?.role)).map(({ to, icon: Icon, label, cas, badge }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? badge ? 'bg-amber-700/30 text-amber-200 border border-amber-700/40' : 'bg-brand-600 text-white'
                  : badge ? 'text-amber-400/80 hover:text-amber-200 hover:bg-amber-900/20' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              )
            }
          >
            <Icon size={18} className="flex-shrink-0" />
            {!collapsed && (
              <span className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="truncate">{label}</span>
                {cas && (
                  <span className="text-[9px] font-bold px-1 py-0 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30 flex-shrink-0">
                    CAS
                  </span>
                )}
                {badge && (
                  <span className="text-[9px] font-bold px-1 py-0 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">
                    {badge}
                  </span>
                )}
              </span>
            )}
          </NavLink>
        ))}

        {['admin', 'leader'].includes(user?.role) && (
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
                onClick={() => setMobileOpen(false)}
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
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          'hidden lg:flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-200 flex-shrink-0',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute left-0 top-1/2 -translate-y-1/2 translate-x-full w-5 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-r-md flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors z-10"
          style={{ left: collapsed ? '3.5rem' : '15rem' }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-4 px-4 py-3 bg-slate-900 border-b border-slate-800">
          <button
            className="lg:hidden btn-ghost p-2"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                placeholder="Buscar proyectos, tareas, incidentes..."
                className="input pl-9 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost p-2 relative">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand-500 rounded-full" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* AI Chat Widget */}
      <AIChatWidget />

      {/* Voice AI Panel — persistent floating button on every page */}
      <VoiceAIPanel currentUser={user} />
    </div>
  )
}
