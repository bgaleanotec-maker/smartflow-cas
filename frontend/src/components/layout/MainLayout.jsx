import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import ErrorBoundary from '../ErrorBoundary'
import {
  LayoutDashboard, FolderKanban, AlertTriangle, Timer,
  Users, Settings, LogOut, ChevronLeft, ChevronRight,
  Bell, Search, Menu, X, FileText, BarChart3, Newspaper, Landmark,
  Plane, LayoutGrid, Zap, TrendingUp, Crown, Mic2, MoreHorizontal,
  Mic,
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
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const { isRunning, formatTime, sessionType } = usePomodoroStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const filteredNavItems = navItems.filter(item => !item.roles || item.roles.includes(user?.role))

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
        {filteredNavItems.map(({ to, icon: Icon, label, cas, badge }) => (
          <NavLink
            key={to}
            to={to}
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
        {/* Collapse toggle */}
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
          <button className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors relative" aria-label="Notificaciones">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-500 rounded-full" />
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Desktop header */}
        <header className="hidden lg:flex items-center gap-4 px-4 py-3 bg-slate-900 border-b border-slate-800">
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
            <button className="btn-ghost p-2 relative" aria-label="Notificaciones">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand-500 rounded-full" />
            </button>
          </div>
        </header>

        {/* Page content — top padding for mobile topbar, bottom padding for mobile bottom nav */}
        <main className="flex-1 overflow-auto p-4 lg:p-6 pt-[72px] lg:pt-4 pb-[88px] lg:pb-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* ── Mobile bottom navigation ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 safe-bottom">
        <div className="flex items-center justify-around h-[60px]">
          {/* Dashboard */}
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              clsx('mobile-nav-item', isActive && 'active')
            }
          >
            <LayoutDashboard size={20} />
            <span>Inicio</span>
          </NavLink>

          {/* BP */}
          <NavLink
            to="/bp"
            className={({ isActive }) =>
              clsx('mobile-nav-item', isActive && 'active')
            }
          >
            <TrendingUp size={20} />
            <span>BP</span>
          </NavLink>

          {/* Center: ARIA mic button */}
          <button
            onClick={() => setVoicePanelOpen(true)}
            className="flex flex-col items-center justify-center -mt-5"
            aria-label="Abrir ARIA"
          >
            <div className="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-brand-500 to-purple-600 shadow-lg shadow-brand-600/40 flex items-center justify-center transition-transform active:scale-95">
              <Mic size={22} className="text-white" />
            </div>
            <span className="text-[10px] font-medium text-brand-400 mt-0.5">ARIA</span>
          </button>

          {/* Reuniones */}
          <NavLink
            to="/meetings"
            className={({ isActive }) =>
              clsx('mobile-nav-item', isActive && 'active')
            }
          >
            <Mic2 size={20} />
            <span>Reuniones</span>
          </NavLink>

          {/* Más */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={clsx('mobile-nav-item', drawerOpen && 'text-brand-400')}
          >
            <MoreHorizontal size={20} />
            <span>Más</span>
          </button>
        </div>
      </nav>

      {/* ── Mobile nav drawer (full nav) ── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer from bottom */}
          <div className="relative z-10 bg-slate-900 rounded-t-2xl border-t border-slate-700 max-h-[85vh] flex flex-col animate-slide-up">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-600 rounded-full" />
            </div>

            {/* Header */}
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

            {/* Search in drawer */}
            <div className="px-4 py-3 border-b border-slate-800">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  placeholder="Buscar..."
                  className="input pl-9 py-2"
                />
              </div>
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {filteredNavItems.map(({ to, icon: Icon, label, cas, badge }) => {
                const isActive = location.pathname === to || location.pathname.startsWith(to + '/')
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setDrawerOpen(false)}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors',
                      isActive
                        ? badge ? 'bg-amber-700/30 text-amber-200 border border-amber-700/40' : 'bg-brand-600 text-white'
                        : badge ? 'text-amber-400/80 hover:text-amber-200 hover:bg-amber-900/20' : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800'
                    )}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    <span className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="truncate">{label}</span>
                      {cas && (
                        <span className="text-[9px] font-bold px-1 py-0 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30 flex-shrink-0">CAS</span>
                      )}
                      {badge && (
                        <span className="text-[9px] font-bold px-1 py-0 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">{badge}</span>
                      )}
                    </span>
                  </NavLink>
                )
              })}

              {['admin', 'leader'].includes(user?.role) && (
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

            {/* User + logout */}
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

      {/* ── AI Chat Widget — position aware of mobile nav ── */}
      <AIChatWidget />

      {/* ── Voice AI Panel — position aware of mobile nav ── */}
      <VoiceAIPanel
        currentUser={user}
        externalOpen={voicePanelOpen}
        onExternalClose={() => setVoicePanelOpen(false)}
      />
    </div>
  )
}
