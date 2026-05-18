/**
 * NavConfigManager — Admin UI to configure which nav modules are visible per role.
 *
 * Stores config via PUT /admin/nav-config as { role: [list_of_route_paths] }
 * Reads config via GET /admin/nav-config
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  LayoutDashboard, Plane, ListTodo, FolderKanban, Landmark, Radio,
  TrendingUp, Crown, Zap, LayoutGrid, FileText, BarChart3, Newspaper,
  BookOpen, AlertTriangle, Timer, Mic2, Volume2, Save, RotateCcw,
  Loader2, CheckCircle2, Users2,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { adminAPI } from '../../services/api'

// ─── All navigable modules ────────────────────────────────────────────────────

export const ALL_NAV_MODULES = [
  { to: '/dashboard',          label: 'Dashboard',             icon: LayoutDashboard, group: 'core' },
  { to: '/torre-control',      label: 'Torre de Control',      icon: Plane,            group: 'core' },
  { to: '/quick-tasks',        label: 'Tareas Rápidas',        icon: ListTodo,         group: 'core' },
  { to: '/projects',           label: 'Proyectos',             icon: FolderKanban,     group: 'core' },
  { to: '/premisas',           label: 'Premisas',              icon: Landmark,         group: 'core' },
  { to: '/novedades',          label: 'Novedades Operativas',  icon: Radio,            group: 'core' },
  { to: '/bp',                 label: 'Plan de Negocio',       icon: TrendingUp,       group: 'core' },
  { to: '/executive',          label: 'Vista Directiva',       icon: Crown,            group: 'executive' },
  { to: '/lean-pro',           label: 'Lean Pro',              icon: Zap,              group: 'tools' },
  { to: '/centro-info',        label: 'Centro Info',           icon: LayoutGrid,       group: 'tools' },
  { to: '/demands',            label: 'Demandas',              icon: FileText,         group: 'tools' },
  { to: '/demands/dashboard',  label: 'Dashboard Demandas',    icon: BarChart3,        group: 'tools' },
  { to: '/hechos',             label: 'Hechos Relevantes',     icon: Newspaper,        group: 'tools' },
  { to: '/epics',              label: 'Épicas',                icon: BookOpen,         group: 'tools' },
  { to: '/incidents',          label: 'Incidentes',            icon: AlertTriangle,    group: 'tools' },
  { to: '/pomodoro',           label: 'Pomodoro',              icon: Timer,            group: 'tools' },
  { to: '/meetings',           label: 'Reuniones',             icon: Mic2,             group: 'tools' },
  { to: '/voice-notes',        label: 'Notas de Voz',          icon: Volume2,          group: 'tools' },
]

// ─── Role definitions ─────────────────────────────────────────────────────────

const ROLES = [
  { key: 'member',         label: 'Miembro',         color: '#64748b', badge: 'bg-slate-700 text-slate-200' },
  { key: 'negocio',        label: 'Negocio',          color: '#0ea5e9', badge: 'bg-sky-900/40 text-sky-300' },
  { key: 'project_leader', label: 'Project Leader',   color: '#a78bfa', badge: 'bg-violet-900/40 text-violet-300' },
  { key: 'herramientas',   label: 'Herramientas',     color: '#34d399', badge: 'bg-emerald-900/40 text-emerald-300' },
  { key: 'directivo',      label: 'Directivo',        color: '#f59e0b', badge: 'bg-amber-900/40 text-amber-300' },
  { key: 'leader',         label: 'Líder',            color: '#6366f1', badge: 'bg-indigo-900/40 text-indigo-300' },
  { key: 'lider_sr',       label: 'Líder Sr',         color: '#8b5cf6', badge: 'bg-purple-900/40 text-purple-300 border border-purple-600/30' },
  { key: 'admin',          label: 'Admin',            color: '#ef4444', badge: 'bg-red-900/40 text-red-300' },
]

const GROUP_LABELS = {
  core:      { label: 'Módulos Core',     color: 'text-brand-400' },
  executive: { label: 'Vista Ejecutiva',  color: 'text-amber-400' },
  tools:     { label: 'Herramientas',     color: 'text-emerald-400' },
}

// ─── ModuleToggle ─────────────────────────────────────────────────────────────

function ModuleToggle({ module, enabled, onChange }) {
  const Icon = module.icon
  return (
    <button
      type="button"
      onClick={() => onChange(module.to, !enabled)}
      className={clsx(
        'flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all',
        enabled
          ? 'bg-brand-600/20 border-brand-500/40 text-brand-300'
          : 'bg-slate-800/60 border-slate-700/50 text-slate-500 hover:border-slate-600 hover:text-slate-400'
      )}
    >
      <Icon size={12} className="flex-shrink-0" />
      <span className="truncate">{module.label}</span>
      <div className={clsx(
        'ml-auto w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 transition-colors',
        enabled ? 'bg-brand-500 border-brand-400' : 'bg-transparent border-slate-600'
      )} />
    </button>
  )
}

// ─── RolePanel ────────────────────────────────────────────────────────────────

function RolePanel({ role, paths, onPathsChange }) {
  const groups = ['core', 'executive', 'tools']

  const toggleAll = (group) => {
    const groupModules = ALL_NAV_MODULES.filter(m => m.group === group)
    const groupPaths = groupModules.map(m => m.to)
    const allEnabled = groupPaths.every(p => paths.includes(p))
    if (allEnabled) {
      // Disable all in group
      onPathsChange(paths.filter(p => !groupPaths.includes(p)))
    } else {
      // Enable all in group
      const newPaths = [...new Set([...paths, ...groupPaths])]
      onPathsChange(newPaths)
    }
  }

  const handleModuleToggle = (path, enabled) => {
    if (enabled) {
      onPathsChange([...new Set([...paths, path])])
    } else {
      onPathsChange(paths.filter(p => p !== path))
    }
  }

  return (
    <div className="space-y-3">
      {groups.map(group => {
        const mods = ALL_NAV_MODULES.filter(m => m.group === group)
        const groupCfg = GROUP_LABELS[group]
        const enabledCount = mods.filter(m => paths.includes(m.to)).length

        return (
          <div key={group}>
            <div className="flex items-center justify-between mb-1.5">
              <span className={clsx('text-[11px] font-semibold uppercase tracking-wider', groupCfg.color)}>
                {groupCfg.label}
              </span>
              <button
                onClick={() => toggleAll(group)}
                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                {enabledCount === mods.length ? 'Quitar todos' : 'Activar todos'}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {mods.map(mod => (
                <ModuleToggle
                  key={mod.to}
                  module={mod}
                  enabled={paths.includes(mod.to)}
                  onChange={handleModuleToggle}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* Stats */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-800 text-xs text-slate-500">
        <CheckCircle2 size={12} className="text-brand-400" />
        <span>{paths.length} de {ALL_NAV_MODULES.length} módulos activos</span>
      </div>
    </div>
  )
}

// ─── Main NavConfigManager ────────────────────────────────────────────────────

export default function NavConfigManager() {
  const qc = useQueryClient()
  const [localConfig, setLocalConfig] = useState({})
  const [activeRole, setActiveRole] = useState('member')
  const [dirty, setDirty] = useState(false)

  const { data: savedConfig, isLoading } = useQuery({
    queryKey: ['nav-config'],
    queryFn: () => adminAPI.getNavConfig().then(r => r.data),
    staleTime: 60_000,
  })

  // Initialize local state when data arrives
  useEffect(() => {
    if (savedConfig && Object.keys(localConfig).length === 0) {
      setLocalConfig(savedConfig)
    }
  }, [savedConfig])

  const saveMutation = useMutation({
    mutationFn: (config) => adminAPI.saveNavConfig(config),
    onSuccess: () => {
      qc.invalidateQueries(['nav-config'])
      toast.success('Configuración de vistas guardada')
      setDirty(false)
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al guardar'),
  })

  const handlePathsChange = (role, paths) => {
    setLocalConfig(prev => ({ ...prev, [role]: paths }))
    setDirty(true)
  }

  const handleReset = (role) => {
    if (savedConfig?.[role]) {
      setLocalConfig(prev => ({ ...prev, [role]: savedConfig[role] }))
      setDirty(true)
    }
  }

  const handleSaveAll = () => {
    saveMutation.mutate(localConfig)
  }

  const currentRole = ROLES.find(r => r.key === activeRole)
  const currentPaths = localConfig[activeRole] || []

  if (isLoading) return (
    <div className="flex items-center justify-center py-8 text-slate-500">
      <Loader2 size={18} className="animate-spin mr-2" /> Cargando...
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-400">
          Elige qué módulos puede ver cada rol. Los cambios se aplican en el próximo inicio de sesión o al recargar.
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              ● Sin guardar
            </span>
          )}
          <button
            onClick={handleSaveAll}
            disabled={saveMutation.isPending || !dirty}
            className="btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
          >
            {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Guardar todo
          </button>
        </div>
      </div>

      {/* Role tabs */}
      <div className="flex flex-wrap gap-1.5">
        {ROLES.map(role => {
          const count = (localConfig[role.key] || []).length
          return (
            <button
              key={role.key}
              onClick={() => setActiveRole(role.key)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                activeRole === role.key
                  ? 'bg-slate-700 border-slate-500 text-white'
                  : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              )}
            >
              <Users2 size={11} />
              <span>{role.label}</span>
              <span className={clsx(
                'text-[9px] px-1.5 py-0 rounded-full font-semibold',
                activeRole === role.key ? 'bg-brand-600 text-white' : 'bg-slate-700 text-slate-400'
              )}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Active role panel */}
      {currentRole && (
        <div className="rounded-xl bg-slate-800/40 border border-slate-700/60 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users2 size={15} className="text-brand-400" />
              <h3 className="font-semibold text-white text-sm">
                Rol: <span className={clsx('px-2 py-0.5 rounded text-xs ml-1', currentRole.badge)}>
                  {currentRole.label}
                </span>
              </h3>
            </div>
            <button
              onClick={() => handleReset(activeRole)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              title="Revertir a valores guardados"
            >
              <RotateCcw size={11} /> Revertir
            </button>
          </div>

          <RolePanel
            role={activeRole}
            paths={currentPaths}
            onPathsChange={(paths) => handlePathsChange(activeRole, paths)}
          />
        </div>
      )}

      {/* Quick summary table */}
      <div className="rounded-lg overflow-hidden border border-slate-700/50">
        <div className="px-3 py-2 bg-slate-800/80 border-b border-slate-700/50">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resumen de acceso</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-3 py-2 text-slate-500 font-medium w-36">Módulo</th>
                {ROLES.map(r => (
                  <th key={r.key} className="px-2 py-2 text-center">
                    <span className={clsx('px-1.5 py-0.5 rounded text-[9px] font-semibold whitespace-nowrap', r.badge)}>
                      {r.label.split(' ')[0]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_NAV_MODULES.map((mod, idx) => {
                const Icon = mod.icon
                return (
                  <tr
                    key={mod.to}
                    className={clsx(
                      'border-b border-slate-800/60 last:border-0',
                      idx % 2 === 0 ? 'bg-slate-900/20' : 'bg-slate-800/10'
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Icon size={11} className="flex-shrink-0 text-slate-500" />
                        <span className="truncate max-w-[110px]">{mod.label}</span>
                      </div>
                    </td>
                    {ROLES.map(role => {
                      const enabled = (localConfig[role.key] || []).includes(mod.to)
                      return (
                        <td key={role.key} className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => {
                              const paths = localConfig[role.key] || []
                              const newPaths = enabled
                                ? paths.filter(p => p !== mod.to)
                                : [...paths, mod.to]
                              handlePathsChange(role.key, newPaths)
                            }}
                            className={clsx(
                              'w-5 h-5 rounded flex items-center justify-center mx-auto transition-all',
                              enabled
                                ? 'bg-brand-600/30 text-brand-400 hover:bg-brand-600/50'
                                : 'bg-slate-800 text-slate-700 hover:bg-slate-700 hover:text-slate-500'
                            )}
                            title={`${enabled ? 'Desactivar' : 'Activar'} ${mod.label} para ${role.label}`}
                          >
                            {enabled ? '✓' : '·'}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
