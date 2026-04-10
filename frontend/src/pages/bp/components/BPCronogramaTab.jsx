import { useState, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Users,
  AlertTriangle, Loader2, Flag, CheckSquare, MessageSquare,
  Link2, Calendar, BarChart2,
} from 'lucide-react'
import clsx from 'clsx'
import { bpAPI } from '../../../services/api'
import BPMilestoneModal from './BPMilestoneModal'
import BPActivityDetailDrawer from './BPActivityDetailDrawer'

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS = {
  critica: { bar: '#ef4444', barDark: '#b91c1c', text: 'text-red-400' },
  alta: { bar: '#f97316', barDark: '#c2410c', text: 'text-orange-400' },
  media: { bar: '#6366f1', barDark: '#4338ca', text: 'text-indigo-400' },
  baja: { bar: '#64748b', barDark: '#475569', text: 'text-slate-400' },
}

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'text-slate-400' },
  en_progreso: { label: 'En Progreso', color: 'text-blue-400' },
  completada: { label: 'Completada', color: 'text-green-400' },
  cancelada: { label: 'Cancelada', color: 'text-slate-500' },
  vencida: { label: 'Vencida', color: 'text-red-400' },
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MONTHS_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const ZOOM_OPTIONS = [
  { value: 12, label: '12 meses' },
  { value: 6, label: '6 meses' },
  { value: 3, label: '3 meses' },
  { value: 1, label: '1 mes' },
]

const GROUP_OPTIONS = [
  { value: 'none', label: 'Sin agrupar' },
  { value: 'owner', label: 'Responsable' },
  { value: 'category', label: 'Categoría' },
  { value: 'priority', label: 'Prioridad' },
]

const CATEGORY_LABELS = {
  comercial: 'Comercial',
  operativo: 'Operativo',
  financiero: 'Financiero',
  estrategico: 'Estratégico',
  regulatorio: 'Regulatorio',
  tecnologia: 'Tecnología',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ name, size = 6 }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const colors = ['bg-indigo-500', 'bg-violet-500', 'bg-cyan-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600']
  const idx = (name || '').charCodeAt(0) % colors.length
  return (
    <div className={clsx(
      `w-${size} h-${size} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0 text-xs`,
      colors[idx],
    )}>
      {initials}
    </div>
  )
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000)
}

function formatDateShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function parseLocalDate(str) {
  if (!str) return null
  return new Date(str + 'T00:00:00')
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function GanttTooltip({ activity }) {
  const pColors = PRIORITY_COLORS[activity.priority] || PRIORITY_COLORS.media
  const statusCfg = STATUS_CONFIG[activity.status] || STATUS_CONFIG.pendiente
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3 w-64 text-xs space-y-2 pointer-events-none">
      <p className="font-semibold text-slate-100 text-sm leading-snug">{activity.title}</p>
      <div className="flex items-center gap-2">
        <span className={clsx('font-medium', pColors.text)}>{activity.priority}</span>
        <span className={clsx(statusCfg.color)}>{statusCfg.label}</span>
      </div>
      {activity.owner_name && (
        <div className="flex items-center gap-1.5 text-slate-400">
          <Users size={11} />
          <span>{activity.owner_name}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 text-slate-400">
        <Calendar size={11} />
        <span>
          {formatDateShort(activity.start_date)}
          {activity.due_date ? ` → ${formatDateShort(activity.due_date)}` : ' (sin fecha límite)'}
        </span>
      </div>
      {/* Progress */}
      <div className="space-y-0.5">
        <div className="flex justify-between text-slate-400">
          <span>Avance</span>
          <span>{activity.progress}%</span>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${activity.progress}%`, backgroundColor: pColors.bar }}
          />
        </div>
      </div>
      {/* Checklist */}
      {activity.checklist_total > 0 && (
        <div className="flex items-center gap-1.5 text-slate-400">
          <CheckSquare size={11} />
          <span>{activity.checklist_done}/{activity.checklist_total} ítems</span>
        </div>
      )}
      {activity.is_overdue && (
        <div className="flex items-center gap-1.5 text-red-400">
          <AlertTriangle size={11} />
          <span>Actividad vencida</span>
        </div>
      )}
      {(activity.tags?.list || []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(activity.tags?.list || []).map((t) => (
            <span key={t} className="badge text-xs bg-slate-700/50 text-slate-400">{t}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Gantt Bar ────────────────────────────────────────────────────────────────

function GanttBar({ activity, viewStart, viewEnd, totalDays, onClickBar, onHover }) {
  const pColors = PRIORITY_COLORS[activity.priority] || PRIORITY_COLORS.media
  const startDate = parseLocalDate(activity.start_date)
  const endDate = activity.due_date ? parseLocalDate(activity.due_date) : null

  if (!startDate) return null

  const viewStartDate = parseLocalDate(viewStart)
  const viewEndDate = parseLocalDate(viewEnd)

  // Clamp to view
  const barStart = startDate < viewStartDate ? viewStartDate : startDate
  const barEnd = endDate
    ? (endDate > viewEndDate ? viewEndDate : endDate)
    : viewEndDate

  const leftPct = (daysBetween(viewStartDate, barStart) / totalDays) * 100
  const widthDays = daysBetween(barStart, barEnd)
  const widthPct = Math.max((widthDays / totalDays) * 100, 0.5) // min 0.5% to be visible

  const isOverdue = activity.is_overdue
  const isCompleted = activity.status === 'completada'

  const progressWidth = Math.min(activity.progress, 100)

  return (
    <div
      className="absolute top-1 bottom-1 rounded-md cursor-pointer group/bar transition-transform hover:scale-y-105 overflow-hidden"
      style={{
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        minWidth: '4px',
        backgroundColor: isOverdue ? '#7f1d1d' : (isCompleted ? '#166534' : pColors.bar),
        backgroundImage: isOverdue
          ? 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.3) 4px, rgba(0,0,0,0.3) 8px)'
          : 'none',
        opacity: activity.status === 'cancelada' ? 0.4 : 1,
      }}
      onClick={() => onClickBar?.(activity)}
      onMouseEnter={(e) => onHover?.(activity, e)}
      onMouseLeave={() => onHover?.(null)}
    >
      {/* Progress fill */}
      {progressWidth > 0 && !isOverdue && (
        <div
          className="absolute inset-y-0 left-0 opacity-60"
          style={{
            width: `${progressWidth}%`,
            backgroundColor: pColors.barDark,
          }}
        />
      )}
      {/* Label inside bar */}
      <span className="absolute inset-0 flex items-center px-1.5 text-white text-xs font-medium truncate opacity-90 select-none">
        {widthPct > 8 && activity.title}
      </span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BPCronogramaTab({ bpId, canWrite }) {
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())
  const [zoom, setZoom] = useState(6)
  const [groupBy, setGroupBy] = useState('none')
  const [tooltipData, setTooltipData] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [milestoneModal, setMilestoneModal] = useState(null)
  const ganttRef = useRef(null)

  const { data: timeline, isLoading, error } = useQuery({
    queryKey: ['bp-timeline', bpId],
    queryFn: () => bpAPI.getTimeline(bpId).then((r) => r.data),
    enabled: !!bpId,
  })

  const { data: milestones = [] } = useQuery({
    queryKey: ['bp-milestones', String(bpId)],
    queryFn: () => bpAPI.getMilestones(bpId).then((r) => r.data),
    enabled: !!bpId,
  })

  // Compute view window
  const viewStart = useMemo(() => {
    const d = new Date(viewYear, viewMonth, 1)
    return d.toISOString().split('T')[0]
  }, [viewYear, viewMonth])

  const viewEnd = useMemo(() => {
    const endMonth = viewMonth + zoom
    const year = viewYear + Math.floor(endMonth / 12)
    const month = endMonth % 12
    const d = new Date(year, month, 0) // last day of prev month
    return d.toISOString().split('T')[0]
  }, [viewYear, viewMonth, zoom])

  const totalDays = useMemo(() => daysBetween(viewStart, viewEnd) + 1, [viewStart, viewEnd])

  // Build months header
  const months = useMemo(() => {
    const result = []
    let y = viewYear
    let m = viewMonth
    for (let i = 0; i < zoom; i++) {
      result.push({ year: y, month: m, label: MONTHS_ES[m] })
      m++
      if (m > 11) { m = 0; y++ }
    }
    return result
  }, [viewYear, viewMonth, zoom])

  // Today position
  const today = new Date().toISOString().split('T')[0]
  const todayLeft = useMemo(() => {
    const d = daysBetween(viewStart, today)
    if (d < 0 || d > totalDays) return null
    return (d / totalDays) * 100
  }, [viewStart, today, totalDays])

  const activities = timeline?.activities || []
  const stats = timeline?.stats || {}

  // Filter activities in view (have at least start_date in range or due_date in range)
  const visibleActivities = useMemo(() => {
    return activities.filter((a) => {
      const start = a.start_date
      const end = a.due_date
      if (!start) return false
      // Show if activity overlaps with view window
      const afterViewEnd = start > viewEnd
      const beforeViewStart = end && end < viewStart
      return !afterViewEnd && !beforeViewStart
    })
  }, [activities, viewStart, viewEnd])

  // Group activities
  const groupedActivities = useMemo(() => {
    if (groupBy === 'none') return [{ key: null, label: null, items: visibleActivities }]
    if (groupBy === 'owner') {
      const groups = {}
      visibleActivities.forEach((a) => {
        const key = a.owner_name || 'Sin asignar'
        groups[key] = groups[key] || []
        groups[key].push(a)
      })
      return Object.entries(groups).map(([key, items]) => ({ key, label: key, items }))
    }
    if (groupBy === 'category') {
      const groups = {}
      visibleActivities.forEach((a) => {
        const key = a.category || 'otro'
        groups[key] = groups[key] || []
        groups[key].push(a)
      })
      return Object.entries(groups).map(([key, items]) => ({ key, label: CATEGORY_LABELS[key] || key, items }))
    }
    if (groupBy === 'priority') {
      const order = ['critica', 'alta', 'media', 'baja']
      const groups = {}
      visibleActivities.forEach((a) => {
        const key = a.priority || 'media'
        groups[key] = groups[key] || []
        groups[key].push(a)
      })
      return order
        .filter((k) => groups[k])
        .map((key) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1), items: groups[key] }))
    }
    return [{ key: null, label: null, items: visibleActivities }]
  }, [visibleActivities, groupBy])

  // Navigation
  const navigate = (dir) => {
    let m = viewMonth + dir * Math.max(1, Math.floor(zoom / 2))
    let y = viewYear
    while (m < 0) { m += 12; y-- }
    while (m > 11) { m -= 12; y++ }
    setViewMonth(m)
    setViewYear(y)
  }

  const handleHover = (activity, e) => {
    if (!activity) { setTooltipData(null); return }
    setTooltipData(activity)
    setTooltipPos({ x: e.clientX, y: e.clientY })
  }

  const handleBarClick = (activity) => {
    setSelectedActivity(activity)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-brand-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <AlertTriangle size={32} className="text-red-400 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">Error al cargar el cronograma</p>
      </div>
    )
  }

  const ROW_HEIGHT = 44

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-slate-200 min-w-[140px] text-center">
            {MONTHS_FULL[viewMonth]} {viewYear}
            {zoom > 1 && ` — ${MONTHS_FULL[(viewMonth + zoom - 1) % 12]} ${viewYear + Math.floor((viewMonth + zoom - 1) / 12)}`}
          </span>
          <button
            onClick={() => navigate(1)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => {
              const now = new Date()
              setViewYear(now.getFullYear())
              setViewMonth(now.getMonth())
            }}
            className="btn-ghost text-xs px-2.5 py-1.5"
          >
            Hoy
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Zoom */}
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
            {ZOOM_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setZoom(opt.value)}
                className={clsx(
                  'px-2.5 py-1 text-xs rounded-md transition-colors',
                  zoom === opt.value
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-400 hover:text-slate-100',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Group by */}
          <div className="flex items-center gap-1.5">
            <Users size={13} className="text-slate-500" />
            <select
              className="input py-1 text-xs"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
            >
              {GROUP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Add milestone button */}
          {canWrite && (
            <button
              onClick={() => setMilestoneModal({})}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5"
            >
              <Flag size={12} />
              Hito
            </button>
          )}
        </div>
      </div>

      {/* Gantt container */}
      <div className="card border border-slate-700/50 overflow-hidden">
        <div className="flex">
          {/* Left panel */}
          <div className="flex-shrink-0 w-56 border-r border-slate-700/50">
            {/* Header */}
            <div className="h-10 bg-slate-800/60 border-b border-slate-700/50 flex items-center px-3">
              <span className="text-xs text-slate-500 font-semibold">ACTIVIDAD</span>
            </div>

            {/* Rows */}
            {groupedActivities.map(({ key, label, items }) => (
              <div key={key || '__all'}>
                {label && (
                  <div className="bg-slate-800/80 px-3 py-1.5 border-b border-slate-700/30">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">{label}</span>
                  </div>
                )}
                {items.map((act) => {
                  const pColors = PRIORITY_COLORS[act.priority] || PRIORITY_COLORS.media
                  const statusCfg = STATUS_CONFIG[act.status] || STATUS_CONFIG.pendiente
                  return (
                    <div
                      key={act.id}
                      className="flex items-center gap-2 px-2 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer"
                      style={{ height: ROW_HEIGHT }}
                      onClick={() => handleBarClick(act)}
                    >
                      {/* Priority dot */}
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: pColors.bar }}
                      />
                      {/* Owner avatar */}
                      {act.owner_name && groupBy !== 'owner' && (
                        <Avatar name={act.owner_name} size={5} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={clsx(
                          'text-xs font-medium truncate leading-tight',
                          act.status === 'cancelada' ? 'line-through text-slate-500' : 'text-slate-200',
                        )}>
                          {act.is_milestone && <span className="text-amber-400 mr-1">◆</span>}
                          {act.title.length > 26 ? act.title.slice(0, 26) + '…' : act.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={clsx('text-xs', statusCfg.color)}>{statusCfg.label}</span>
                          {act.checklist_total > 0 && (
                            <span className="text-xs text-slate-600 flex items-center gap-0.5">
                              <CheckSquare size={9} />
                              {act.checklist_done}/{act.checklist_total}
                            </span>
                          )}
                          {act.comment_count > 0 && (
                            <span className="text-xs text-slate-600 flex items-center gap-0.5">
                              <MessageSquare size={9} />
                              {act.comment_count}
                            </span>
                          )}
                          {act.depends_on_id && <Link2 size={9} className="text-slate-600" />}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            {/* Milestones section in left panel */}
            {milestones.length > 0 && (
              <div>
                <div className="bg-slate-800/80 px-3 py-1.5 border-b border-slate-700/30">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Hitos</span>
                </div>
                {milestones.map((ms) => (
                  <div
                    key={ms.id}
                    className="flex items-center gap-2 px-2 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer"
                    style={{ height: ROW_HEIGHT }}
                    onClick={() => setMilestoneModal(ms)}
                  >
                    <div className="w-3 h-3 rotate-45 flex-shrink-0" style={{ backgroundColor: ms.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">{ms.title}</p>
                      <p className="text-xs text-slate-600">{ms.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Gantt panel */}
          <div className="flex-1 overflow-x-auto" ref={ganttRef}>
            {/* Month headers */}
            <div className="h-10 bg-slate-800/60 border-b border-slate-700/50 flex sticky top-0 z-10">
              {months.map(({ year, month, label }, idx) => (
                <div
                  key={idx}
                  className="flex-shrink-0 border-r border-slate-700/30 flex items-center justify-center"
                  style={{ width: `${100 / zoom}%`, minWidth: 60 }}
                >
                  <span className="text-xs text-slate-400 font-semibold">
                    {label} {zoom > 6 ? String(year).slice(2) : year}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid + bars */}
            <div className="relative">
              {groupedActivities.map(({ key, label, items }) => (
                <div key={key || '__all'}>
                  {label && (
                    <div
                      className="bg-slate-800/80 border-b border-slate-700/30"
                      style={{ height: 28 }}
                    />
                  )}
                  {items.map((act) => (
                    <div
                      key={act.id}
                      className="relative border-b border-slate-800/50"
                      style={{ height: ROW_HEIGHT }}
                    >
                      {/* Month column lines */}
                      {months.map((_, idx) => (
                        <div
                          key={idx}
                          className="absolute top-0 bottom-0 border-r border-slate-700/20"
                          style={{ left: `${((idx + 1) / zoom) * 100}%` }}
                        />
                      ))}

                      {/* Gantt bar */}
                      <GanttBar
                        activity={act}
                        viewStart={viewStart}
                        viewEnd={viewEnd}
                        totalDays={totalDays}
                        onClickBar={handleBarClick}
                        onHover={handleHover}
                      />
                    </div>
                  ))}
                </div>
              ))}

              {/* Milestone rows */}
              {milestones.length > 0 && (
                <>
                  {/* group header spacer */}
                  <div className="bg-slate-800/80 border-b border-slate-700/30" style={{ height: 28 }} />
                  {milestones.map((ms) => {
                    const msDate = parseLocalDate(ms.target_date)
                    const viewStartDate = parseLocalDate(viewStart)
                    const viewEndDate = parseLocalDate(viewEnd)
                    const inRange = msDate >= viewStartDate && msDate <= viewEndDate
                    const leftPct = inRange
                      ? (daysBetween(viewStartDate, msDate) / totalDays) * 100
                      : null
                    const isPast = ms.target_date < today
                    const isAchieved = ms.status === 'alcanzado'
                    const diamondColor = isAchieved ? '#10b981' : (isPast && ms.status !== 'alcanzado' ? '#ef4444' : ms.color)

                    return (
                      <div
                        key={ms.id}
                        className="relative border-b border-slate-800/50"
                        style={{ height: ROW_HEIGHT }}
                      >
                        {months.map((_, idx) => (
                          <div
                            key={idx}
                            className="absolute top-0 bottom-0 border-r border-slate-700/20"
                            style={{ left: `${((idx + 1) / zoom) * 100}%` }}
                          />
                        ))}
                        {inRange && leftPct != null && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rotate-45 cursor-pointer hover:scale-125 transition-transform"
                            style={{
                              left: `${leftPct}%`,
                              backgroundColor: diamondColor,
                              boxShadow: `0 0 6px ${diamondColor}80`,
                            }}
                            title={ms.title}
                            onClick={() => setMilestoneModal(ms)}
                          />
                        )}
                      </div>
                    )
                  })}
                </>
              )}

              {/* Today line */}
              {todayLeft != null && (
                <div
                  className="absolute top-0 bottom-0 border-l-2 border-red-400/70 border-dashed z-20 pointer-events-none"
                  style={{ left: `${todayLeft}%` }}
                >
                  <span className="absolute -top-0 left-1 text-xs text-red-400 bg-slate-900 px-0.5 leading-none font-semibold">
                    Hoy
                  </span>
                </div>
              )}

              {/* Empty state */}
              {visibleActivities.length === 0 && (
                <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
                  No hay actividades con fechas en este período
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 flex-wrap px-1">
        <div className="flex items-center gap-1.5 text-sm">
          <BarChart2 size={14} className="text-slate-500" />
          <span className="text-slate-400">{stats.total || 0} actividades</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-green-400">{stats.completed || 0} completadas</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-blue-400">{stats.in_progress || 0} en progreso</span>
        </div>
        {stats.overdue > 0 && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-red-400">{stats.overdue} vencidas</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span className="text-slate-400">{stats.on_track || 0} en camino</span>
        </div>

        {/* Color legend */}
        <div className="ml-auto flex items-center gap-3">
          {Object.entries(PRIORITY_COLORS).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cfg.bar }} />
              <span className="text-xs text-slate-500 capitalize">{key}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm"
              style={{
                backgroundColor: '#7f1d1d',
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)',
              }}
            />
            <span className="text-xs text-slate-500">Vencida</span>
          </div>
        </div>
      </div>

      {/* Activity detail drawer */}
      {selectedActivity && (
        <BPActivityDetailDrawer
          bpId={bpId}
          activity={selectedActivity}
          onClose={() => setSelectedActivity(null)}
          onUpdated={() => setSelectedActivity(null)}
        />
      )}

      {/* Milestone modal */}
      {milestoneModal !== null && (
        <BPMilestoneModal
          bpId={bpId}
          milestone={milestoneModal?.id ? milestoneModal : null}
          onClose={() => setMilestoneModal(null)}
          onSaved={() => setMilestoneModal(null)}
        />
      )}

      {/* Tooltip */}
      {tooltipData && (
        <div
          className="fixed z-[60] pointer-events-none"
          style={{
            left: Math.min(tooltipPos.x + 12, window.innerWidth - 280),
            top: Math.min(tooltipPos.y - 20, window.innerHeight - 250),
          }}
        >
          <GanttTooltip activity={tooltipData} />
        </div>
      )}
    </div>
  )
}
