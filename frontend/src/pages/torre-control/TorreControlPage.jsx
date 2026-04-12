/**
 * Torre de Control — Actividades Recurrentes (reformulado 2026-04-12)
 *
 * Cada actividad aparece UNA VEZ con su estado calculado en tiempo real:
 *   🔴 Vencida       — debió cumplirse y no se registró
 *   🟡 Próx. Vencer  — dentro del período de aviso configurado
 *   🔵 En Proceso    — marcada como iniciada
 *   ✅ Completada    — cumplida en el período actual
 *   ⚪ Sin Iniciar   — no corresponde aún
 *
 * Acciones: Completar | Iniciar | Ver Log | Editar | Desactivar
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, AlertTriangle, Clock, CheckCircle, Circle, Zap,
  Loader2, X, ChevronDown, ChevronUp, RefreshCw,
  Plane, Shield, TrendingUp, Flame, BarChart3,
  Bell, Mail, MessageCircle, ArrowUpRight, Users,
  Calendar, Repeat, CheckCheck, Play, History,
  Edit3, Trash2, TriangleAlert,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { activitiesAPI, usersAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import clsx from 'clsx'

const PRIORITY_COLORS = {
  critica: '#ef4444', alta: '#f97316', media: '#eab308', baja: '#22c55e'
}
const FREQ_LABELS = {
  unica: 'Única', diaria: 'Diaria', semanal: 'Semanal',
  quincenal: 'Quincenal', mensual: 'Mensual',
  trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual'
}
const CHANNEL_ICONS = {
  sistema: Bell, email: Mail, whatsapp: MessageCircle, todos: Bell
}

const STATUS_CONFIG = {
  vencida:          { label: 'Vencida',          bg: 'bg-red-500/10',    border: 'border-red-500/30',    text: 'text-red-400',    icon: AlertTriangle },
  proxima_a_vencer: { label: 'Próx. Vencer',      bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  text: 'text-amber-400',  icon: Zap },
  en_proceso:       { label: 'En Proceso',         bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   text: 'text-blue-400',   icon: Play },
  completada:       { label: 'Completada',         bg: 'bg-green-500/10',  border: 'border-green-500/30',  text: 'text-green-400',  icon: CheckCircle },
  sin_iniciar:      { label: 'Sin Iniciar',        bg: 'bg-slate-800/60',  border: 'border-slate-700/50',  text: 'text-slate-400',  icon: Circle },
}

// ── Activity Card ─────────────────────────────────────────────────────────────
function ActivityCard({ activity, onComplete, onStart, onViewLog, onEdit, onDelete, completing }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = STATUS_CONFIG[activity.status] || STATUS_CONFIG.sin_iniciar
  const StatusIcon = cfg.icon
  const ChannelIcon = CHANNEL_ICONS[activity.notify_channel] || Bell
  const pColor = PRIORITY_COLORS[activity.priority] || '#6366f1'

  const isOverdue = activity.status === 'vencida'
  const isDone = activity.status === 'completada'

  return (
    <div className={clsx('rounded-xl border transition-all', cfg.bg, cfg.border)}>
      {/* Main row */}
      <div className="flex items-center gap-3 p-3">
        {/* Color bar + status icon */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="w-1 h-10 rounded-full" style={{ background: activity.color }} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={clsx('text-sm font-semibold', isDone ? 'text-slate-400 line-through' : 'text-white')}>
              {activity.title}
            </p>
            {activity.escalated && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-700/30 text-red-300 border border-red-600/30 font-bold">
                <TriangleAlert size={9} /> ESCALADO
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Frequency badge */}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-300 border border-brand-500/20 flex items-center gap-1">
              <Repeat size={9} /> {FREQ_LABELS[activity.frequency]}
            </span>
            {/* Category */}
            <span className="text-[10px] text-slate-500">{activity.category}</span>
            {/* Scope */}
            <span className="text-[10px] text-slate-600">{activity.scope}</span>
            {/* Priority */}
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
              style={{ background: pColor + '20', color: pColor }}>
              {activity.priority}
            </span>
            {/* Notify channel */}
            <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
              <ChannelIcon size={9} /> {activity.notify_before_value}{activity.notify_before_unit[0]} antes
            </span>
            {/* Streak */}
            {activity.streak > 1 && (
              <span className="text-[10px] text-orange-400 flex items-center gap-0.5">
                <Flame size={9} /> {activity.streak} seguidos
              </span>
            )}
          </div>

          {/* Due date info */}
          <div className="flex items-center gap-3 mt-1">
            {activity.current_due_date && (
              <span className={clsx('text-[11px] flex items-center gap-1', cfg.text)}>
                <StatusIcon size={10} />
                {isOverdue
                  ? `Vencida hace ${activity.days_overdue}d — debió ser ${activity.current_due_date}`
                  : isDone
                  ? `Cumplida ${activity.completed_at || activity.current_due_date}`
                  : `Vence: ${activity.current_due_date}${activity.due_time ? ' ' + activity.due_time : ''}`
                }
              </span>
            )}
            {activity.assigned_to && (
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Users size={9} /> {activity.assigned_to.full_name}
              </span>
            )}
            {activity.escalate_to && isOverdue && (
              <span className="text-[11px] text-red-400 flex items-center gap-1">
                <ArrowUpRight size={9} /> Escalar → {activity.escalate_to.full_name}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isDone && (
            <>
              {activity.status !== 'en_proceso' && (
                <button
                  onClick={() => onStart(activity.id)}
                  className="text-[11px] px-2 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-colors"
                  title="Marcar en proceso"
                >
                  <Play size={12} />
                </button>
              )}
              <button
                onClick={() => onComplete(activity.id)}
                disabled={completing === activity.id}
                className="text-[11px] px-2.5 py-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 transition-colors flex items-center gap-1 font-semibold"
              >
                {completing === activity.id
                  ? <Loader2 size={12} className="animate-spin" />
                  : <CheckCheck size={12} />
                }
                <span className="hidden sm:inline">Cumplida</span>
              </button>
            </>
          )}
          <button
            onClick={() => onViewLog(activity)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
            title="Ver historial"
          >
            <History size={14} />
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded: log + next due + edit */}
      {expanded && (
        <div className="px-4 pb-3 border-t border-slate-700/50 pt-3 space-y-2">
          {/* Next due */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Calendar size={11} /> Próxima: <span className="text-slate-300 font-medium">{activity.next_due_date || '—'}</span></span>
            <span className="flex items-center gap-1"><BarChart3 size={11} /> Streak: <span className="text-orange-400 font-bold">{activity.streak}</span></span>
            {activity.escalate_to && (
              <span className="flex items-center gap-1"><ArrowUpRight size={11} /> Escalar a: <span className="text-slate-300">{activity.escalate_to.full_name}</span> si no se completa en {activity.escalate_after_hours}h</span>
            )}
          </div>

          {/* Recent log */}
          {activity.log?.length > 0 && (
            <div>
              <p className="text-[11px] text-slate-500 font-semibold mb-1.5 uppercase tracking-wide">Historial reciente</p>
              <div className="space-y-1">
                {activity.log.slice(0, 5).map(entry => (
                  <div key={entry.id} className="flex items-center gap-2 text-[11px]">
                    {entry.status === 'completada'
                      ? <CheckCircle size={11} className="text-green-400 flex-shrink-0" />
                      : <AlertTriangle size={11} className="text-red-400 flex-shrink-0" />
                    }
                    <span className={entry.status === 'completada' ? 'text-slate-400' : 'text-red-400/80'}>
                      {entry.due_date}
                    </span>
                    {entry.status === 'completada' && (
                      <span className="text-slate-500">→ cumplida {entry.completed_date} {entry.completed_by ? `por ${entry.completed_by}` : ''}</span>
                    )}
                    {entry.status !== 'completada' && (
                      <span className="text-red-400/60">→ no cumplida</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button onClick={() => onEdit(activity)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-700 transition-colors">
              <Edit3 size={11} /> Editar
            </button>
            <button onClick={() => onDelete(activity.id)} className="flex items-center gap-1 text-xs text-red-500/70 hover:text-red-400 px-2 py-1 rounded hover:bg-red-900/20 transition-colors">
              <Trash2 size={11} /> Desactivar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Log Modal ─────────────────────────────────────────────────────────────────
function LogModal({ activity, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['activity-log', activity.id],
    queryFn: () => activitiesAPI.log(activity.id, 30).then(r => r.data),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h3 className="font-semibold text-white text-sm">{activity.title}</h3>
            <p className="text-xs text-slate-500">{FREQ_LABELS[activity.frequency]} · Historial de cumplimiento</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="text-slate-600 animate-spin" /></div>
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-white">{data?.streak || 0}</p>
                  <p className="text-[10px] text-orange-400 flex items-center justify-center gap-1 mt-0.5"><Flame size={9} /> Racha</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-green-400">{data?.compliance_rate || 0}%</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Cumplimiento</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-3 text-center">
                  <p className="text-sm font-semibold text-slate-200">{data?.next_due_date || '—'}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Próxima</p>
                </div>
              </div>

              {/* Notification config */}
              <div className="bg-slate-800/60 rounded-xl p-3 mb-4 text-xs text-slate-400 space-y-1">
                <p className="font-semibold text-slate-300 text-[11px] uppercase tracking-wide mb-2">Configuración de aviso</p>
                <p>🔔 Recordar <span className="text-white">{data?.activity?.notify_before_value} {data?.activity?.notify_before_unit}</span> antes</p>
                <p>📢 Canal: <span className="text-white capitalize">{data?.activity?.notify_channel}</span></p>
                {data?.activity?.escalate_to && (
                  <p>⚡ Escalar a <span className="text-red-400">{data.activity.escalate_to.full_name}</span> si no se completa en <span className="text-white">{data.activity.escalate_after_hours}h</span></p>
                )}
              </div>

              {/* Log list */}
              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wide mb-2">Registro</p>
              {data?.log?.length === 0 && (
                <p className="text-xs text-slate-600 text-center py-4">Sin registros aún — las completaciones aparecerán aquí</p>
              )}
              <div className="space-y-1.5">
                {data?.log?.map(entry => (
                  <div key={entry.id} className={clsx(
                    'flex items-center gap-3 p-2.5 rounded-lg border text-xs',
                    entry.status === 'completada'
                      ? 'bg-green-900/10 border-green-800/30'
                      : 'bg-red-900/10 border-red-800/30'
                  )}>
                    {entry.status === 'completada'
                      ? <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                      : <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                    }
                    <div className="flex-1">
                      <span className={entry.status === 'completada' ? 'text-slate-300' : 'text-red-400'}>
                        {entry.due_date}
                      </span>
                      {entry.status === 'completada' && (
                        <span className="text-slate-500"> → {entry.completed_date}{entry.completed_by ? ` · ${entry.completed_by}` : ''}</span>
                      )}
                      {entry.notes && <p className="text-slate-500 mt-0.5">{entry.notes}</p>}
                    </div>
                    {entry.escalation_sent && (
                      <span className="text-[10px] text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded">escalado</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Create/Edit Form ──────────────────────────────────────────────────────────
const EMPTY_FORM = {
  title: '', description: '', category: 'gestion', frequency: 'semanal',
  scope: 'TODOS', priority: 'media',
  start_date: new Date().toISOString().split('T')[0],
  due_time: '', day_of_week: 1, day_of_month: 1,
  notify_before_value: 1, notify_before_unit: 'dias', notify_channel: 'sistema',
  escalate_to_id: '', escalate_after_hours: 24,
  color: '#6366f1',
}

function ActivityForm({ initial, onSave, onClose, isSaving, users }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h3 className="font-semibold text-white">{initial?.id ? 'Editar' : 'Nueva'} Actividad Recurrente</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Basic info */}
          <div className="space-y-3">
            <input className="input w-full" placeholder="Nombre de la actividad *" value={form.title}
              onChange={e => set('title', e.target.value)} />
            <textarea className="input w-full h-16 resize-none" placeholder="Descripción (opcional)"
              value={form.description} onChange={e => set('description', e.target.value)} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="label text-xs">Frecuencia *</label>
                <select className="input w-full" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
                  {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Categoría</label>
                <select className="input w-full" value={form.category} onChange={e => set('category', e.target.value)}>
                  {['gestion','reporte','reunion','seguimiento','operativo'].map(c =>
                    <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Prioridad</label>
                <select className="input w-full" value={form.priority} onChange={e => set('priority', e.target.value)}>
                  <option value="critica">Crítica</option>
                  <option value="alta">Alta</option>
                  <option value="media">Media</option>
                  <option value="baja">Baja</option>
                </select>
              </div>
              <div>
                <label className="label text-xs">Alcance</label>
                <select className="input w-full" value={form.scope} onChange={e => set('scope', e.target.value)}>
                  <option value="TODOS">Todos</option>
                  <option value="CAS">CAS</option>
                  <option value="BO">BO</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="label text-xs">Fecha inicio</label>
                <input type="date" className="input w-full" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
              </div>
              <div>
                <label className="label text-xs">Hora límite (opcional)</label>
                <input type="time" className="input w-full" value={form.due_time} onChange={e => set('due_time', e.target.value)} />
              </div>
              {form.frequency === 'semanal' && (
                <div>
                  <label className="label text-xs">Día de la semana</label>
                  <select className="input w-full" value={form.day_of_week} onChange={e => set('day_of_week', Number(e.target.value))}>
                    {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map((d,i) =>
                      <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              {['mensual','trimestral','semestral','anual'].includes(form.frequency) && (
                <div>
                  <label className="label text-xs">Día del mes (1-31)</label>
                  <input type="number" min="1" max="31" className="input w-full" value={form.day_of_month}
                    onChange={e => set('day_of_month', Number(e.target.value))} />
                </div>
              )}
            </div>
          </div>

          {/* Notification */}
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-3 border border-slate-700/50">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-2"><Bell size={12} /> Recordatorio</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label text-xs">Avisar</label>
                <input type="number" min="1" className="input w-full" value={form.notify_before_value}
                  onChange={e => set('notify_before_value', Number(e.target.value))} />
              </div>
              <div>
                <label className="label text-xs">Unidad</label>
                <select className="input w-full" value={form.notify_before_unit} onChange={e => set('notify_before_unit', e.target.value)}>
                  <option value="minutos">Minutos</option>
                  <option value="horas">Horas</option>
                  <option value="dias">Días</option>
                </select>
              </div>
              <div>
                <label className="label text-xs">Canal</label>
                <select className="input w-full" value={form.notify_channel} onChange={e => set('notify_channel', e.target.value)}>
                  <option value="sistema">Sistema</option>
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="todos">Todos</option>
                </select>
              </div>
            </div>
          </div>

          {/* Escalation */}
          <div className="bg-red-900/10 rounded-xl p-4 space-y-3 border border-red-800/30">
            <p className="text-xs font-semibold text-red-300 uppercase tracking-wide flex items-center gap-2"><ArrowUpRight size={12} /> Escalado (si no se completa)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Escalar a</label>
                <select className="input w-full" value={form.escalate_to_id} onChange={e => set('escalate_to_id', e.target.value || '')}>
                  <option value="">Sin escalado</option>
                  {users?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Horas de gracia</label>
                <input type="number" min="1" className="input w-full" value={form.escalate_after_hours}
                  onChange={e => set('escalate_after_hours', Number(e.target.value))} />
              </div>
            </div>
          </div>

          {/* Color */}
          <div className="flex items-center gap-3">
            <label className="label text-xs">Color identificador:</label>
            <input type="color" className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer" value={form.color} onChange={e => set('color', e.target.value)} />
          </div>
        </div>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={() => form.title && onSave(form)}
            disabled={!form.title || isSaving}
            className="w-full btn-primary flex items-center justify-center gap-2"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {initial?.id ? 'Guardar cambios' : 'Crear actividad'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, label, count, color, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return { open, toggle: () => setOpen(o => !o), header: (
    <button onClick={() => setOpen(o => !o)}
      className="flex items-center gap-2 w-full text-left group mb-2">
      <Icon size={14} className={color} />
      <span className={clsx('text-xs font-semibold uppercase tracking-wider', color)}>{label}</span>
      <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', color === 'text-red-400' ? 'bg-red-900/40' : 'bg-slate-700')}>{count}</span>
      <span className="ml-auto text-slate-600 group-hover:text-slate-400">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
    </button>
  )}
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function TorreControlPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [scopeFilter, setScopeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editActivity, setEditActivity] = useState(null)
  const [logActivity, setLogActivity] = useState(null)
  const [completing, setCompleting] = useState(null)

  // Sections collapsed state
  const [openVencidas, setOpenVencidas] = useState(true)
  const [openProximas, setOpenProximas] = useState(true)
  const [openEnProceso, setOpenEnProceso] = useState(true)
  const [openSinIniciar, setOpenSinIniciar] = useState(true)
  const [openCompletadas, setOpenCompletadas] = useState(false)

  const { data: torre, isLoading, refetch } = useQuery({
    queryKey: ['torre-control', scopeFilter, categoryFilter],
    queryFn: () => activitiesAPI.torreControl({ scope: scopeFilter || undefined, category: categoryFilter || undefined }).then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersAPI.list({}).then(r => r.data?.items || r.data || []),
  })

  const createMut = useMutation({
    mutationFn: (data) => activitiesAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['torre-control'])
      setShowForm(false)
      toast.success('Actividad creada')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al crear'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => activitiesAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['torre-control'])
      setEditActivity(null)
      toast.success('Actualizada')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => activitiesAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries(['torre-control'])
      toast.success('Desactivada')
    },
  })

  const handleComplete = async (id) => {
    setCompleting(id)
    try {
      const res = await activitiesAPI.complete(id, {})
      toast.success(res.data.message || 'Marcada como cumplida ✓')
      qc.invalidateQueries(['torre-control'])
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error')
    } finally {
      setCompleting(null)
    }
  }

  const handleStart = async (id) => {
    try {
      await activitiesAPI.start(id)
      toast.success('Marcada en proceso')
      qc.invalidateQueries(['torre-control'])
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error')
    }
  }

  const kpis = torre?.kpis || {}

  const renderSection = (title, items, icon, color, open, setOpen, defaultOpen = true) => {
    if (!items?.length) return null
    return (
      <div>
        <button onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 w-full text-left group mb-2 py-1">
          {icon}
          <span className={clsx('text-xs font-semibold uppercase tracking-wider', color)}>{title}</span>
          <span className={clsx('text-[11px] font-bold px-1.5 py-0.5 rounded-full ml-1', color === 'text-red-400' ? 'bg-red-900/40 text-red-300' : color === 'text-amber-400' ? 'bg-amber-900/40 text-amber-300' : color === 'text-green-400' ? 'bg-green-900/40 text-green-300' : 'bg-slate-700 text-slate-400')}>{items.length}</span>
          <span className="ml-auto text-slate-600">{open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
        </button>
        {open && (
          <div className="space-y-2">
            {items.map(a => (
              <ActivityCard
                key={a.id}
                activity={a}
                onComplete={handleComplete}
                onStart={handleStart}
                onViewLog={setLogActivity}
                onEdit={setEditActivity}
                onDelete={(id) => deleteMut.mutate(id)}
                completing={completing}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
            <Plane size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Torre de Control</h1>
            <p className="text-slate-400 text-xs">Seguimiento de actividades recurrentes</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={scopeFilter} onChange={e => setScopeFilter(e.target.value)} className="input text-sm py-1.5 w-28">
            <option value="">Todos</option>
            <option value="CAS">CAS</option>
            <option value="BO">BO</option>
          </select>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input text-sm py-1.5 w-32">
            <option value="">Categoría</option>
            {['gestion','reporte','reunion','seguimiento','operativo'].map(c =>
              <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
          </select>
          <button onClick={() => refetch()} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Actualizar">
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} /> Nueva
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'Total', value: kpis.total, color: 'text-slate-300', bg: '' },
          { label: 'Vencidas', value: kpis.vencidas, color: 'text-red-400', bg: 'border-red-500/20' },
          { label: 'Próx. Vencer', value: kpis.proximas_a_vencer, color: 'text-amber-400', bg: 'border-amber-500/20' },
          { label: 'En Proceso', value: kpis.en_proceso, color: 'text-blue-400', bg: 'border-blue-500/20' },
          { label: 'Completadas', value: kpis.completadas, color: 'text-green-400', bg: 'border-green-500/20' },
          { label: 'Cumplimiento', value: `${kpis.cumplimiento_pct || 0}%`, color: 'text-brand-400', bg: 'border-brand-500/20' },
        ].map(k => (
          <div key={k.label} className={clsx('card text-center py-3 px-2', k.bg)}>
            <p className={clsx('text-2xl font-bold', k.color)}>{isLoading ? '—' : k.value ?? 0}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Escaladas alert */}
      {(kpis.escaladas > 0) && (
        <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-xl">
          <TriangleAlert size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300 font-semibold">
            {kpis.escaladas} actividad{kpis.escaladas > 1 ? 'es' : ''} vencida{kpis.escaladas > 1 ? 's' : ''} requiere{kpis.escaladas > 1 ? 'n' : ''} escalado inmediato
          </p>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="text-brand-400 animate-spin" />
        </div>
      )}

      {/* Activity sections */}
      {!isLoading && (
        <div className="space-y-6">
          {renderSection('Vencidas', torre?.vencidas, <AlertTriangle size={14} className="text-red-400" />, 'text-red-400', openVencidas, setOpenVencidas)}
          {renderSection('Próximas a vencer', torre?.proximas_a_vencer, <Zap size={14} className="text-amber-400" />, 'text-amber-400', openProximas, setOpenProximas)}
          {renderSection('En proceso', torre?.en_proceso, <Play size={14} className="text-blue-400" />, 'text-blue-400', openEnProceso, setOpenEnProceso)}
          {renderSection('Sin iniciar', torre?.sin_iniciar, <Circle size={14} className="text-slate-400" />, 'text-slate-400', openSinIniciar, setOpenSinIniciar)}
          {renderSection('Completadas (período actual)', torre?.completadas, <CheckCircle size={14} className="text-green-400" />, 'text-green-400', openCompletadas, setOpenCompletadas, false)}

          {/* Empty state */}
          {!torre?.vencidas?.length && !torre?.proximas_a_vencer?.length && !torre?.en_proceso?.length && !torre?.sin_iniciar?.length && !torre?.completadas?.length && (
            <div className="text-center py-16">
              <Plane size={40} className="mx-auto mb-3 text-slate-700" />
              <p className="text-slate-500 font-medium">Sin actividades recurrentes configuradas</p>
              <button onClick={() => setShowForm(true)} className="mt-3 btn-primary text-sm">
                + Crear primera actividad
              </button>
            </div>
          )}
        </div>
      )}

      {/* Forms & Modals */}
      {showForm && (
        <ActivityForm
          onSave={(data) => createMut.mutate(data)}
          onClose={() => setShowForm(false)}
          isSaving={createMut.isPending}
          users={users}
        />
      )}
      {editActivity && (
        <ActivityForm
          initial={editActivity}
          onSave={(data) => updateMut.mutate({ id: editActivity.id, data })}
          onClose={() => setEditActivity(null)}
          isSaving={updateMut.isPending}
          users={users}
        />
      )}
      {logActivity && (
        <LogModal activity={logActivity} onClose={() => setLogActivity(null)} />
      )}
    </div>
  )
}
