import { useQuery } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import {
  FolderKanban, AlertTriangle, CheckSquare, Timer,
  TrendingUp, Users, Clock, Flame, BookOpen
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import { useAuthStore } from '../../stores/authStore'
import { tasksAPI, incidentsAPI, adminAPI, pomodoroAPI, dashboardAPI } from '../../services/api'
import { usePomodoroStore } from '../../stores/pomodoroStore'
import clsx from 'clsx'

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="card flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
      <div className={clsx('w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xl sm:text-2xl font-bold text-white">{value ?? '—'}</p>
        <p className="text-xs text-slate-400">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">{sub}</p>}
      </div>
    </div>
  )
}

function TaskRow({ task }) {
  const navigate = useNavigate()
  const priorityColors = {
    'Crítica': 'bg-red-500',
    'Alta': 'bg-orange-500',
    'Media': 'bg-yellow-500',
    'Baja': 'bg-green-500',
  }
  return (
    <div
      className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
      onClick={() => navigate(`/projects/${task.project_id}`)}
    >
      <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', priorityColors[task.priority?.name] || 'bg-slate-500')} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate">{task.title}</p>
        <p className="text-xs text-slate-500">{task.task_number}</p>
      </div>
      {task.due_date && (
        <span className="text-xs text-slate-500 flex-shrink-0">{task.due_date}</span>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const { isRunning, formatTime, pomodoroCount } = usePomodoroStore()
  const isAdmin = user?.role === 'admin'

  const { data: myTasks } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => tasksAPI.myTasks({ limit: 8 }).then(r => r.data),
  })

  const { data: incidents } = useQuery({
    queryKey: ['incidents-open'],
    queryFn: () => incidentsAPI.list({ status: 'abierto', limit: 5 }).then(r => r.data),
  })

  const { data: pomodoroStats } = useQuery({
    queryKey: ['pomodoro-stats'],
    queryFn: () => pomodoroAPI.stats().then(r => r.data),
  })

  const { data: adminStats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminAPI.stats().then(r => r.data),
    enabled: isAdmin,
  })

  const { data: attentionItems } = useQuery({
    queryKey: ['dashboard-attention'],
    queryFn: () => dashboardAPI.attention().then(r => r.data),
    staleTime: 60_000,
  })

  const allAttentionStories = attentionItems?.flatMap(g => g.stories) ?? []

  const severityColors = {
    critico: '#ef4444',
    alto: '#f97316',
    medio: '#eab308',
    bajo: '#22c55e',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">
          Hola, {user?.full_name?.split(' ')[0]} 👋
        </h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={CheckSquare}
          label="Mis tareas activas"
          value={myTasks?.length ?? 0}
          color="bg-brand-900 text-brand-400"
        />
        <StatCard
          icon={AlertTriangle}
          label="Incidentes abiertos"
          value={incidents?.length ?? 0}
          color="bg-red-900/50 text-red-400"
        />
        <StatCard
          icon={Timer}
          label="Pomodoros hoy"
          value={pomodoroStats?.pomodoros_today ?? 0}
          color="bg-orange-900/50 text-orange-400"
          sub={`${Math.floor((pomodoroStats?.minutes_focused_today ?? 0) / 60)}h ${(pomodoroStats?.minutes_focused_today ?? 0) % 60}m enfocado`}
        />
        {isAdmin ? (
          <StatCard
            icon={Users}
            label="Usuarios activos"
            value={adminStats?.active_users ?? 0}
            color="bg-green-900/50 text-green-400"
            sub={`${adminStats?.active_projects ?? 0} proyectos activos`}
          />
        ) : (
          <StatCard
            icon={Flame}
            label="Racha semanal"
            value={pomodoroStats?.pomodoros_this_week ?? 0}
            color="bg-purple-900/50 text-purple-400"
            sub="pomodoros esta semana"
          />
        )}
      </div>

      {/* Attention section */}
      {allAttentionStories.length > 0 && (
        <div className="card border border-amber-800/40 bg-amber-950/10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <span>⚠️</span> Requieren atención
            </h2>
            <Link to="/epics" className="text-xs text-brand-400 hover:underline">Ver todas →</Link>
          </div>
          <div className="space-y-2">
            {allAttentionStories.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                    {s.is_blocking && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/60 text-red-300 border border-red-700/40">🚫 Bloqueante</span>
                    )}
                    {s.epic_title && (
                      <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                        <BookOpen size={9} /> {s.epic_title}
                      </span>
                    )}
                    {s.due_date && (
                      <span className="text-[10px] text-amber-400">📅 {s.due_date}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-200 truncate">{s.title}</p>
                  {s.last_update && (
                    <p className="text-xs text-slate-500 truncate italic mt-0.5">{s.last_update}</p>
                  )}
                </div>
                {s.assigned_to && (
                  <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">{s.assigned_to.split(' ')[0]}</span>
                )}
                <Link
                  to={`/epics${s.project_id ? `?project_id=${s.project_id}` : ''}`}
                  className="flex-shrink-0 text-xs text-brand-400 hover:underline whitespace-nowrap"
                >
                  Ver →
                </Link>
              </div>
            ))}
          </div>
          {allAttentionStories.length > 5 && (
            <Link to="/epics" className="block text-center text-xs text-brand-400 hover:underline mt-3">
              + {allAttentionStories.length - 5} más — Ver todas
            </Link>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Tasks */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Mis tareas</h2>
            <span className="badge bg-slate-800 text-slate-400">{myTasks?.length ?? 0}</span>
          </div>
          {myTasks?.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <CheckSquare size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No tienes tareas asignadas</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {myTasks?.map(task => <TaskRow key={task.id} task={task} />)}
            </div>
          )}
        </div>

        {/* Pomodoro mini + incidents */}
        <div className="space-y-4">
          {/* Pomodoro status */}
          <div className="card bg-gradient-to-br from-brand-900/40 to-slate-900 border-brand-800/50">
            <div className="flex items-center gap-2 mb-3">
              <Timer size={16} className="text-brand-400" />
              <h3 className="font-medium text-white text-sm">Pomodoro</h3>
            </div>
            {isRunning ? (
              <div className="text-center">
                <p className="text-3xl font-mono font-bold text-brand-300">{formatTime()}</p>
                <p className="text-xs text-slate-500 mt-1">En progreso</p>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-sm text-slate-400">No hay sesión activa</p>
                <a href="/pomodoro" className="text-xs text-brand-400 hover:underline mt-1 block">
                  Iniciar sesión →
                </a>
              </div>
            )}
            <div className="flex justify-between text-xs text-slate-500 mt-3 pt-3 border-t border-slate-800">
              <span>Hoy: <strong className="text-slate-300">{pomodoroCount}</strong> 🍅</span>
              <span>Semana: <strong className="text-slate-300">{pomodoroStats?.pomodoros_this_week ?? 0}</strong></span>
            </div>
          </div>

          {/* Critical incidents */}
          <div className="card">
            <h3 className="font-medium text-white text-sm mb-3">Incidentes recientes</h3>
            {incidents?.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">Sin incidentes abiertos ✅</p>
            ) : (
              <div className="space-y-2">
                {incidents?.slice(0, 4).map(inc => (
                  <div key={inc.id} className="flex items-start gap-2">
                    <div
                      className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
                      style={{ background: severityColors[inc.severity] }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs text-slate-300 truncate">{inc.title}</p>
                      <p className="text-xs text-slate-500">{inc.incident_number}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin extra stats */}
          {isAdmin && adminStats && (
            <div className="card">
              <h3 className="font-medium text-white text-sm mb-3">Resumen admin</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Proyectos activos</span>
                  <span className="text-white font-medium">{adminStats.active_projects}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Incidentes críticos</span>
                  <span className="text-red-400 font-medium">{adminStats.critical_incidents}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total usuarios</span>
                  <span className="text-white font-medium">{adminStats.total_users}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
