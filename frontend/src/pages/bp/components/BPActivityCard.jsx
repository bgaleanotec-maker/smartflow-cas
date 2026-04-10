import { useState } from 'react'
import {
  Calendar, User, ChevronDown, ChevronUp, CheckCircle, XCircle,
  Clock, PlayCircle, AlertCircle, Edit2, MessageSquare, Link2,
  CheckSquare,
} from 'lucide-react'
import clsx from 'clsx'

const PRIORITY_CONFIG = {
  critica: { label: 'Crítica', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  alta: { label: 'Alta', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  media: { label: 'Media', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  baja: { label: 'Baja', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
}

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30', icon: Clock },
  en_progreso: { label: 'En Progreso', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', icon: PlayCircle },
  completada: { label: 'Completada', color: 'bg-green-500/15 text-green-400 border-green-500/30', icon: CheckCircle },
  cancelada: { label: 'Cancelada', color: 'bg-slate-600/15 text-slate-500 border-slate-600/30', icon: XCircle },
  vencida: { label: 'Vencida', color: 'bg-red-500/15 text-red-400 border-red-500/30', icon: AlertCircle },
}

const CATEGORY_LABELS = {
  comercial: 'Comercial',
  operativo: 'Operativo',
  financiero: 'Financiero',
  estrategico: 'Estratégico',
  regulatorio: 'Regulatorio',
  tecnologia: 'Tecnología',
}

const CATEGORY_COLORS = {
  comercial: 'bg-purple-500/15 text-purple-400',
  operativo: 'bg-cyan-500/15 text-cyan-400',
  financiero: 'bg-emerald-500/15 text-emerald-400',
  estrategico: 'bg-brand-500/15 text-brand-400',
  regulatorio: 'bg-orange-500/15 text-orange-400',
  tecnologia: 'bg-sky-500/15 text-sky-400',
}

const GRUPO_COLORS = {
  'Margen': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'Opex': 'bg-red-500/15 text-red-400 border-red-500/30',
  'Magnitud': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Juntas': 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  'Brookfield': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Vicepresidencia': 'bg-rose-500/15 text-rose-400 border-rose-500/30',
}

export default function BPActivityCard({ activity, onStatusChange, onEdit, onOpenDrawer }) {
  const [expanded, setExpanded] = useState(false)

  const priority = PRIORITY_CONFIG[activity.priority] || PRIORITY_CONFIG.media
  const status = STATUS_CONFIG[activity.status] || STATUS_CONFIG.pendiente
  const StatusIcon = status.icon
  const isOverdue = activity.is_overdue || activity.status === 'vencida'

  const formatDate = (dateStr) => {
    if (!dateStr) return null
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className={clsx(
      'card border transition-all duration-150',
      isOverdue ? 'border-red-500/40 bg-red-950/10' : 'border-slate-700/50',
    )}>
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Progress ring / status indicator */}
        <div className="flex-shrink-0 mt-0.5">
          <div className={clsx(
            'w-8 h-8 rounded-full flex items-center justify-center border',
            status.color,
          )}>
            <StatusIcon size={14} />
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={clsx(
              'text-sm font-medium leading-snug',
              activity.status === 'cancelada' ? 'line-through text-slate-500' : 'text-slate-100',
            )}>
              {activity.title}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {onOpenDrawer && (
                <button
                  onClick={() => onOpenDrawer?.(activity)}
                  className="p-1 rounded text-slate-500 hover:text-brand-400 hover:bg-slate-700 transition-colors"
                  title="Ver detalle completo"
                >
                  <CheckSquare size={13} />
                </button>
              )}
              <button
                onClick={() => onEdit?.(activity)}
                className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
                title="Editar"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
              >
                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className={clsx('badge text-xs border', priority.color)}>
              {priority.label}
            </span>
            <span className={clsx('badge text-xs', CATEGORY_COLORS[activity.category] || 'bg-slate-500/15 text-slate-400')}>
              {CATEGORY_LABELS[activity.category] || activity.category}
            </span>
            {activity.grupo && (
              <span className={clsx('badge text-xs border', GRUPO_COLORS[activity.grupo] || 'bg-slate-500/15 text-slate-400 border-slate-500/30')}>
                {activity.grupo}
              </span>
            )}
            {activity.due_date && (
              <span className={clsx(
                'flex items-center gap-1 text-xs',
                isOverdue ? 'text-red-400' : 'text-slate-500',
              )}>
                <Calendar size={11} />
                {formatDate(activity.due_date)}
              </span>
            )}
            {activity.owner_name && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <User size={11} />
                {activity.owner_name}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {activity.progress > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    activity.progress >= 100 ? 'bg-green-500' : 'bg-brand-500',
                  )}
                  style={{ width: `${Math.min(activity.progress, 100)}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 flex-shrink-0">{activity.progress}%</span>
            </div>
          )}

          {/* Enhanced indicators row */}
          {(activity.checklist_total > 0 || activity.comment_count > 0 || activity.depends_on_id || activity.is_milestone || activity.estimated_hours || (activity.tags?.list?.length > 0)) && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* Milestone badge */}
              {activity.is_milestone && (
                <span className="flex items-center gap-0.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5">
                  ◆ Hito
                </span>
              )}
              {/* Dependency */}
              {activity.depends_on_id && (
                <span className="flex items-center gap-0.5 text-xs text-slate-500" title="Depende de otra actividad">
                  <Link2 size={10} />
                </span>
              )}
              {/* Checklist progress */}
              {activity.checklist_total > 0 && (
                <span className={clsx(
                  'flex items-center gap-1 text-xs rounded-full px-1.5 py-0.5',
                  activity.checklist_done === activity.checklist_total
                    ? 'text-green-400 bg-green-500/10 border border-green-500/20'
                    : 'text-slate-400 bg-slate-700/30 border border-slate-700/50',
                )}>
                  <CheckSquare size={10} />
                  {activity.checklist_done}/{activity.checklist_total}
                </span>
              )}
              {/* Comments */}
              {activity.comment_count > 0 && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <MessageSquare size={10} />
                  {activity.comment_count}
                </span>
              )}
              {/* Hours */}
              {(activity.actual_hours != null || activity.estimated_hours != null) && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock size={10} />
                  {activity.actual_hours != null ? `${activity.actual_hours}h` : '—'}
                  {activity.estimated_hours != null ? ` / ${activity.estimated_hours}h est.` : ''}
                </span>
              )}
              {/* Tags */}
              {(activity.tags?.list || []).slice(0, 3).map((tag) => (
                <span key={tag} className="text-xs px-1.5 py-0.5 bg-brand-500/10 text-brand-400 border border-brand-500/20 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Checklist thin progress bar (below everything) */}
          {activity.checklist_total > 0 && (
            <div className="mt-1.5 h-1 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all',
                  activity.checklist_done === activity.checklist_total ? 'bg-green-500' : 'bg-brand-500/60',
                )}
                style={{ width: `${Math.round((activity.checklist_done / activity.checklist_total) * 100)}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2 pl-11">
          {activity.description && (
            <p className="text-xs text-slate-400 leading-relaxed">{activity.description}</p>
          )}
          {activity.notes && (
            <p className="text-xs text-slate-500 italic">Notas: {activity.notes}</p>
          )}
          {activity.evidence && (
            <p className="text-xs text-slate-500">Evidencia: <span className="text-brand-400">{activity.evidence}</span></p>
          )}
          {activity.completion_date && (
            <p className="text-xs text-green-400">Completada: {formatDate(activity.completion_date)}</p>
          )}

          {/* Quick status change */}
          {activity.status !== 'completada' && activity.status !== 'cancelada' && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {activity.status !== 'en_progreso' && (
                <button
                  onClick={() => onStatusChange?.(activity.id, 'en_progreso')}
                  className="px-2 py-0.5 text-xs rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
                >
                  Iniciar
                </button>
              )}
              <button
                onClick={() => onStatusChange?.(activity.id, 'completada')}
                className="px-2 py-0.5 text-xs rounded-md bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors"
              >
                Completar
              </button>
              <button
                onClick={() => onStatusChange?.(activity.id, 'cancelada')}
                className="px-2 py-0.5 text-xs rounded-md bg-slate-500/15 text-slate-400 border border-slate-500/30 hover:bg-slate-500/25 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
