/**
 * QuickTasksPage — Sistema operativo de tareas CAS/BO
 *
 * Flujo: negocio → equipo (CAS/BO) → tipo de actividad (configurable) →
 *        responsable (filtrado por equipo) → participantes (cualquiera) →
 *        tiempo estimado + fecha de cierre.
 * Control: dificultades/bloqueos, no-entrega, tiempo Pomodoro, dashboard líder.
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Plus, X, Trash2, Edit3, CheckCircle2, Clock, AlertTriangle,
  Timer, Users, Building2, ListTodo, ChevronDown, ChevronUp,
  BarChart3, User, Calendar, Video, PlusCircle, Play, Ban,
  AlertCircle, Layers, UsersRound,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { quickTasksAPI, adminAPI, usersAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLORS = {
  baja:    { border: 'border-l-slate-500',  text: 'text-slate-400',  bg: 'bg-slate-800',       label: 'Baja' },
  media:   { border: 'border-l-blue-500',   text: 'text-blue-400',   bg: 'bg-blue-900/30',      label: 'Media' },
  alta:    { border: 'border-l-amber-500',  text: 'text-amber-400',  bg: 'bg-amber-900/30',     label: 'Alta' },
  urgente: { border: 'border-l-red-500',    text: 'text-red-400',    bg: 'bg-red-900/30',       label: 'Urgente' },
}

const STATUS_LABELS = {
  pendiente:   { label: 'Pendiente',   color: 'text-slate-400' },
  asignada:    { label: 'Asignada',    color: 'text-indigo-400' },
  en_progreso: { label: 'En progreso', color: 'text-blue-400' },
  completada:  { label: 'Completada',  color: 'text-green-400' },
}

const CATEGORY_CONFIG = {
  general:      { label: 'General',      color: 'text-slate-400',   bg: 'bg-slate-800',        icon: '📋' },
  reunion:      { label: 'Reunión',       color: 'text-violet-400',  bg: 'bg-violet-900/30',    icon: '📅' },
  gestion:      { label: 'Gestión',       color: 'text-blue-400',    bg: 'bg-blue-900/30',      icon: '⚙️' },
  seguimiento:  { label: 'Seguimiento',   color: 'text-cyan-400',    bg: 'bg-cyan-900/30',      icon: '🔍' },
  revision:     { label: 'Revisión',      color: 'text-amber-400',   bg: 'bg-amber-900/30',     icon: '✏️' },
  soporte:      { label: 'Soporte',       color: 'text-orange-400',  bg: 'bg-orange-900/30',    icon: '🛠️' },
  capacitacion: { label: 'Capacitación',  color: 'text-green-400',   bg: 'bg-green-900/30',     icon: '🎓' },
  otro:         { label: 'Otro',          color: 'text-pink-400',    bg: 'bg-pink-900/30',      icon: '📌' },
}

const TEAM_CONFIG = {
  CAS: { label: 'CAS', color: '#6366f1', badge: 'bg-indigo-900/40 text-indigo-300 border-indigo-600/30' },
  BO:  { label: 'BO',  color: '#0ea5e9', badge: 'bg-sky-900/40 text-sky-300 border-sky-600/30' },
}

function fmtMinutes(min) {
  if (!min && min !== 0) return '—'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function isOverdue(due_date) {
  if (!due_date) return false
  return new Date(due_date) < new Date(new Date().toDateString())
}

function formatDatetime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function toLocalDatetime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─── Task Form Fields (shared) ─────────────────────────────────────────────────

function TaskFormFields({ form, setForm, businesses, users, activityTypes, isEdit = false }) {
  const isReunion = form.category === 'reunion'
  const scopeTypes = activityTypes?.[form.team_scope] || []

  // Responsables filtered by team_scope; participants = everyone
  const responsables = useMemo(() => {
    if (!users) return []
    if (!form.team_scope) return users
    return users.filter(u => u.team === form.team_scope)
  }, [users, form.team_scope])

  const toggleParticipant = (uid) => {
    setForm(f => {
      const set = new Set(f.participants || [])
      if (set.has(uid)) set.delete(uid)
      else set.add(uid)
      return { ...f, participants: Array.from(set) }
    })
  }

  return (
    <>
      <div>
        <label className="label">Título *</label>
        <input
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          className="input"
          placeholder="¿Qué hay que hacer?"
          autoFocus={!isEdit}
        />
      </div>

      {/* Negocio + Equipo */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Negocio</label>
          <select
            value={form.business_id}
            onChange={e => setForm(f => ({ ...f, business_id: e.target.value }))}
            className="input"
          >
            <option value="">Sin negocio</option>
            {businesses?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Equipo</label>
          <select
            value={form.team_scope}
            onChange={e => setForm(f => ({ ...f, team_scope: e.target.value, activity_type: '', assigned_to_id: '' }))}
            className="input"
          >
            <option value="">—</option>
            <option value="CAS">CAS</option>
            <option value="BO">BO</option>
          </select>
        </div>
      </div>

      {/* Tipo de actividad (configurable por equipo) */}
      <div>
        <label className="label">
          Tipo de actividad {form.team_scope && <span className="text-slate-500">({form.team_scope})</span>}
        </label>
        <select
          value={form.activity_type}
          onChange={e => setForm(f => ({ ...f, activity_type: e.target.value }))}
          className="input"
          disabled={!form.team_scope}
        >
          <option value="">{form.team_scope ? 'Selecciona...' : 'Elige equipo primero'}</option>
          {scopeTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div>
        <label className="label">Descripción</label>
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          className="input h-14 resize-none text-sm"
          placeholder="Detalles opcionales..."
        />
      </div>

      {/* Categoría */}
      <div>
        <label className="label">Categoría</label>
        <select
          value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          className="input"
        >
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
          ))}
        </select>
      </div>

      {/* Reunión datetimes */}
      {isReunion && (
        <div className="rounded-lg bg-violet-950/30 border border-violet-800/40 p-3 space-y-2">
          <p className="text-xs text-violet-400 font-semibold flex items-center gap-1.5">
            <Video size={12} /> Detalles de la reunión
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Inicio</label>
              <input type="datetime-local" value={form.meeting_start}
                onChange={e => setForm(f => ({ ...f, meeting_start: e.target.value }))} className="input text-sm" />
            </div>
            <div>
              <label className="label">Fin</label>
              <input type="datetime-local" value={form.meeting_end}
                onChange={e => setForm(f => ({ ...f, meeting_end: e.target.value }))} className="input text-sm" />
            </div>
          </div>
        </div>
      )}

      {/* Responsable (filtrado por equipo) */}
      <div>
        <label className="label">
          Responsable {form.team_scope && <span className="text-slate-500">(solo {form.team_scope})</span>}
        </label>
        <select
          value={form.assigned_to_id}
          onChange={e => setForm(f => ({ ...f, assigned_to_id: e.target.value }))}
          className="input"
        >
          <option value="">Sin asignar</option>
          {responsables?.map(u => <option key={u.id} value={u.id}>{u.full_name}{u.team ? ` · ${u.team}` : ''}</option>)}
        </select>
      </div>

      {/* Participantes (cualquier usuario) */}
      <div>
        <label className="label flex items-center gap-1.5">
          <UsersRound size={12} /> Participantes
          {form.participants?.length > 0 && <span className="text-brand-400">({form.participants.length})</span>}
        </label>
        <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/40 p-2 space-y-1">
          {users?.map(u => {
            const checked = (form.participants || []).includes(u.id)
            return (
              <label key={u.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:bg-slate-700/40 rounded px-1.5 py-1">
                <input type="checkbox" checked={checked} onChange={() => toggleParticipant(u.id)} className="rounded accent-brand-500" />
                <span className="flex-1 truncate">{u.full_name}</span>
                {u.team && <span className="text-[9px] text-slate-500">{u.team}</span>}
              </label>
            )
          })}
        </div>
      </div>

      {/* Prioridad + tiempo + fecha cierre */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="label">Prioridad</label>
          <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="input text-sm">
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
        <div>
          <label className="label">Estimado (min)</label>
          <input type="number" min="1" value={form.estimated_minutes}
            onChange={e => setForm(f => ({ ...f, estimated_minutes: e.target.value }))} className="input text-sm" placeholder="30" />
        </div>
        <div>
          <label className="label">Cierre</label>
          <input type="date" value={form.due_date}
            onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input text-sm" />
        </div>
      </div>

      {isEdit && (
        <>
          <div>
            <label className="label">Estado</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="input">
              <option value="pendiente">Pendiente</option>
              <option value="asignada">Asignada</option>
              <option value="en_progreso">En progreso</option>
              <option value="completada">Completada</option>
            </select>
          </div>

          {/* Dificultades / bloqueos */}
          <div>
            <label className="label flex items-center gap-1.5 text-amber-400">
              <AlertCircle size={12} /> Dificultades / bloqueos
            </label>
            <textarea value={form.difficulty}
              onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
              className="input h-14 resize-none text-sm"
              placeholder="¿Qué impide avanzar? (visible para el líder)" />
          </div>

          {/* No entrega */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded accent-red-500"
              checked={form.will_not_deliver}
              onChange={e => setForm(f => ({ ...f, will_not_deliver: e.target.checked }))} />
            <span className="text-sm text-red-300 flex items-center gap-1"><Ban size={13} /> No se va a entregar</span>
          </label>
          {form.will_not_deliver && (
            <textarea value={form.not_deliver_reason}
              onChange={e => setForm(f => ({ ...f, not_deliver_reason: e.target.value }))}
              className="input h-14 resize-none text-sm"
              placeholder="Razón de la no entrega..." />
          )}
        </>
      )}
    </>
  )
}

// ─── Create / Edit Modals ───────────────────────────────────────────────────

const blankForm = (user, parentTask) => ({
  title: '', description: '',
  business_id: parentTask?.business_id ? String(parentTask.business_id) : '',
  assigned_to_id: '', priority: 'media', category: 'general',
  estimated_minutes: '', due_date: '', meeting_start: '', meeting_end: '',
  team_scope: parentTask?.team_scope || user?.team || '',
  activity_type: '', participants: [],
  difficulty: '', will_not_deliver: false, not_deliver_reason: '',
  status: 'pendiente',
})

function buildPayload(form) {
  return {
    title: form.title.trim(),
    description: form.description || null,
    business_id: form.business_id ? parseInt(form.business_id) : null,
    assigned_to_id: form.assigned_to_id ? parseInt(form.assigned_to_id) : null,
    priority: form.priority,
    category: form.category,
    estimated_minutes: form.estimated_minutes ? parseInt(form.estimated_minutes) : null,
    due_date: form.due_date || null,
    meeting_start: form.category === 'reunion' && form.meeting_start ? form.meeting_start : null,
    meeting_end: form.category === 'reunion' && form.meeting_end ? form.meeting_end : null,
    team_scope: form.team_scope || null,
    activity_type: form.activity_type || null,
    participants: form.participants?.length ? form.participants : null,
    difficulty: form.difficulty || null,
    will_not_deliver: !!form.will_not_deliver,
    not_deliver_reason: form.will_not_deliver ? (form.not_deliver_reason || null) : null,
  }
}

function CreateModal({ onClose, businesses, users, activityTypes, parentTask = null }) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [form, setForm] = useState(blankForm(user, parentTask))

  const mutation = useMutation({
    mutationFn: (data) => parentTask ? quickTasksAPI.createSubtask(parentTask.id, data) : quickTasksAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['quick-tasks'])
      toast.success(parentTask ? 'Sub-tarea creada' : 'Tarea creada')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al crear tarea'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('El título es obligatorio')
    mutation.mutate(buildPayload(form))
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <ListTodo size={16} className="text-amber-400" />
            {parentTask ? `Sub-tarea de: ${parentTask.title.slice(0, 28)}` : 'Nueva tarea'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <TaskFormFields form={form} setForm={setForm} businesses={businesses} users={users} activityTypes={activityTypes} />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function EditModal({ task, onClose, businesses, users, activityTypes }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: task.title || '',
    description: task.description || '',
    business_id: task.business_id ? String(task.business_id) : '',
    assigned_to_id: task.assigned_to_id ? String(task.assigned_to_id) : '',
    priority: task.priority || 'media',
    status: task.status || 'pendiente',
    category: task.category || 'general',
    estimated_minutes: task.estimated_minutes ? String(task.estimated_minutes) : '',
    due_date: task.due_date || '',
    meeting_start: toLocalDatetime(task.meeting_start),
    meeting_end: toLocalDatetime(task.meeting_end),
    team_scope: task.team_scope || '',
    activity_type: task.activity_type || '',
    participants: task.participants || [],
    difficulty: task.difficulty || '',
    will_not_deliver: !!task.will_not_deliver,
    not_deliver_reason: task.not_deliver_reason || '',
  })

  const mutation = useMutation({
    mutationFn: (data) => quickTasksAPI.update(task.id, data),
    onSuccess: () => {
      qc.invalidateQueries(['quick-tasks'])
      qc.invalidateQueries(['quick-tasks-dashboard'])
      toast.success('Tarea actualizada')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al actualizar'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate({ ...buildPayload(form), status: form.status })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <h2 className="font-semibold text-white">Editar tarea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <TaskFormFields form={form} setForm={setForm} businesses={businesses} users={users} activityTypes={activityTypes} isEdit />
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Sub-task Row ─────────────────────────────────────────────────────────────

function SubTaskRow({ task, onDone, onDelete, onEdit }) {
  return (
    <div className="flex items-center gap-2 py-1.5 pl-4 border-l-2 border-slate-700 ml-2">
      <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', {
        'bg-slate-500': task.priority === 'baja', 'bg-blue-500': task.priority === 'media',
        'bg-amber-500': task.priority === 'alta', 'bg-red-500': task.priority === 'urgente',
      })} />
      <span className={clsx('flex-1 text-xs truncate', task.is_done ? 'line-through text-slate-600' : 'text-slate-300')}>{task.title}</span>
      {task.assigned_to_name && <span className="text-[10px] text-slate-500 flex-shrink-0">{task.assigned_to_name}</span>}
      {!task.is_done && (
        <button onClick={() => onDone(task.id)} className="p-1 text-slate-600 hover:text-green-400 flex-shrink-0"><CheckCircle2 size={12} /></button>
      )}
      <button onClick={() => onEdit(task)} className="p-1 text-slate-600 hover:text-brand-400 flex-shrink-0"><Edit3 size={12} /></button>
      <button onClick={() => onDelete(task.id)} className="p-1 text-slate-600 hover:text-red-400 flex-shrink-0"><Trash2 size={12} /></button>
    </div>
  )
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onDone, onDelete, onEdit, onAddSubtask, navigate, usersMap }) {
  const [expandChildren, setExpandChildren] = useState(false)
  const qc = useQueryClient()
  const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.media
  const sc = STATUS_LABELS[task.status] || STATUS_LABELS.pendiente
  const catCfg = CATEGORY_CONFIG[task.category] || CATEGORY_CONFIG.general
  const teamCfg = task.team_scope ? TEAM_CONFIG[task.team_scope] : null
  const overdue = isOverdue(task.due_date)
  const hasTime = task.estimated_minutes > 0
  const progress = hasTime ? Math.min(100, Math.round((task.logged_minutes / task.estimated_minutes) * 100)) : 0
  const children = task.children || []
  const doneChildren = children.filter(c => c.is_done)
  const isReunion = task.category === 'reunion'
  const participantNames = (task.participants || []).map(id => usersMap?.[id]).filter(Boolean)

  const doneMutation = useMutation({
    mutationFn: (id) => quickTasksAPI.done(id),
    onSuccess: () => { qc.invalidateQueries(['quick-tasks']); toast.success('Sub-tarea completada') },
  })
  const deleteMutation = useMutation({
    mutationFn: (id) => quickTasksAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries(['quick-tasks']); toast.success('Eliminada') },
  })

  const startPomodoro = () => {
    navigate(`/pomodoro?quick_task_id=${task.id}&quick_task_name=${encodeURIComponent(task.title)}`)
  }

  return (
    <div className={clsx(
      'card border-l-4 hover:border-slate-600 transition-all',
      task.will_not_deliver ? 'border-l-red-500 bg-red-950/10' : isReunion ? 'border-l-violet-500' : pc.border,
      task.is_done && 'opacity-60'
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className={clsx('font-medium text-sm', task.is_done ? 'line-through text-slate-500' : 'text-white')}>{task.title}</h3>
          {task.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!task.is_done && (
            <button onClick={startPomodoro} title="Iniciar Pomodoro (cuenta tiempo)"
              className="p-1.5 rounded text-slate-500 hover:text-orange-400 hover:bg-orange-900/20 transition-colors">
              <Play size={14} />
            </button>
          )}
          {isReunion && !task.is_done && (
            <button onClick={() => onAddSubtask(task)} title="Agregar acción de reunión"
              className="p-1.5 rounded text-slate-500 hover:text-violet-400 hover:bg-violet-900/20 transition-colors">
              <PlusCircle size={14} />
            </button>
          )}
          <button onClick={() => onEdit(task)} className="p-1.5 rounded text-slate-500 hover:text-brand-400 hover:bg-brand-900/20 transition-colors"><Edit3 size={14} /></button>
          <button onClick={() => onDelete(task.id)} className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"><Trash2 size={14} /></button>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2">
        {teamCfg && (
          <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded border', teamCfg.badge)}>{teamCfg.label}</span>
        )}
        {task.activity_type && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 flex items-center gap-1">
            <Layers size={9} /> {task.activity_type}
          </span>
        )}
        <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1', catCfg.bg, catCfg.color)}>{catCfg.icon} {catCfg.label}</span>
        <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded', pc.bg, pc.text)}>{pc.label}</span>
        <span className={clsx('text-[10px]', sc.color)}>{sc.label}</span>

        {task.business_name && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
            style={{ color: task.business_color || '#6366f1', borderColor: (task.business_color || '#6366f1') + '55', backgroundColor: (task.business_color || '#6366f1') + '18' }}>
            {task.business_name}
          </span>
        )}
        {task.assigned_to_name && (
          <span className="flex items-center gap-1 text-[10px] text-slate-400"><User size={10} /> {task.assigned_to_name}</span>
        )}
        {participantNames.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-slate-500" title={participantNames.join(', ')}>
            <UsersRound size={10} /> {participantNames.length}
          </span>
        )}
        {task.due_date && (
          <span className={clsx('flex items-center gap-1 text-[10px]', overdue ? 'text-red-400' : 'text-slate-500')}>
            <Calendar size={10} /> {task.due_date}{overdue && ' (vencida)'}
          </span>
        )}
      </div>

      {/* Won't deliver */}
      {task.will_not_deliver && (
        <div className="mt-2 rounded bg-red-950/40 border border-red-800/40 px-2 py-1.5 text-xs text-red-300 flex items-start gap-1.5">
          <Ban size={12} className="mt-0.5 flex-shrink-0" />
          <span><strong>No se entregará.</strong>{task.not_deliver_reason ? ` ${task.not_deliver_reason}` : ''}</span>
        </div>
      )}

      {/* Difficulty / blocker */}
      {task.difficulty && !task.will_not_deliver && (
        <div className="mt-2 rounded bg-amber-950/30 border border-amber-800/40 px-2 py-1.5 text-xs text-amber-300 flex items-start gap-1.5">
          <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span>{task.difficulty}</span>
        </div>
      )}

      {/* Meeting datetimes */}
      {isReunion && (task.meeting_start || task.meeting_end) && (
        <div className="mt-2 rounded bg-violet-950/40 border border-violet-800/30 px-2 py-1.5 text-xs text-violet-300 flex flex-wrap gap-x-3 gap-y-0.5">
          {task.meeting_start && <span>📅 {formatDatetime(task.meeting_start)}</span>}
          {task.meeting_end && <span>🏁 {formatDatetime(task.meeting_end)}</span>}
          {task.meeting_duration_min != null && <span className="text-violet-400 font-medium">⏱ {fmtMinutes(task.meeting_duration_min)}</span>}
        </div>
      )}

      {/* Time progress */}
      {hasTime && (
        <div className="mt-2">
          <div className="flex justify-between text-[10px] text-slate-500 mb-1">
            <span className="flex items-center gap-1"><Clock size={10} /> {fmtMinutes(task.logged_minutes)} / {fmtMinutes(task.estimated_minutes)}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div className={clsx('h-full rounded-full transition-all', progress >= 100 ? 'bg-green-500' : 'bg-brand-500')} style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Sub-tasks */}
      {children.length > 0 && (
        <div className="mt-2">
          <button onClick={() => setExpandChildren(!expandChildren)} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 w-full">
            {expandChildren ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            <span>Acciones ({doneChildren.length}/{children.length})</span>
            {doneChildren.length < children.length && <span className="ml-auto text-amber-500 text-[10px]">● pendientes</span>}
          </button>
          {expandChildren && (
            <div className="mt-1 space-y-0.5">
              {children.map(child => (
                <SubTaskRow key={child.id} task={child}
                  onDone={(id) => doneMutation.mutate(id)}
                  onDelete={(id) => { if (confirm('¿Eliminar esta acción?')) deleteMutation.mutate(id) }}
                  onEdit={onEdit} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mark done */}
      {!task.is_done && (
        <button onClick={() => onDone(task.id)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-green-400 hover:bg-green-900/20 py-1.5 rounded-lg border border-slate-700 hover:border-green-800 transition-colors">
          <CheckCircle2 size={13} /> Marcar como hecha
        </button>
      )}
    </div>
  )
}

// ─── Leader Dashboard ─────────────────────────────────────────────────────────

function LeaderDashboard({ onEdit }) {
  const qc = useQueryClient()
  const { data: dash, isLoading } = useQuery({
    queryKey: ['quick-tasks-dashboard'],
    queryFn: () => quickTasksAPI.dashboard().then(r => r.data),
    refetchInterval: 60000,
  })

  const doneMutation = useMutation({
    mutationFn: (id) => quickTasksAPI.done(id),
    onSuccess: () => { qc.invalidateQueries(['quick-tasks-dashboard']); toast.success('Tarea completada') },
  })

  if (isLoading) return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(4)].map((_, i) => <div key={i} className="card animate-pulse h-32 bg-slate-900" />)}
    </div>
  )

  const workload = dash?.workload || []
  const blockers = dash?.blockers || []
  const notDelivering = dash?.not_delivering || []
  const meetingStats = dash?.meeting_stats_30d || []
  const OVERUSE = 8

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        <div className="card text-center"><p className="text-2xl font-bold text-white">{dash?.total_active ?? 0}</p><p className="text-xs text-slate-400 mt-0.5">Activas</p></div>
        <div className="card text-center"><p className="text-2xl font-bold text-red-400">{dash?.total_overdue ?? 0}</p><p className="text-xs text-slate-400 mt-0.5">Vencidas</p></div>
        <div className="card text-center"><p className="text-2xl font-bold text-amber-400">{dash?.total_urgent ?? 0}</p><p className="text-xs text-slate-400 mt-0.5">Urgentes</p></div>
        <div className="card text-center"><p className="text-2xl font-bold text-orange-400">{dash?.total_blockers ?? 0}</p><p className="text-xs text-slate-400 mt-0.5">Bloqueos</p></div>
        <div className="card text-center"><p className="text-2xl font-bold text-red-500">{dash?.total_not_delivering ?? 0}</p><p className="text-xs text-slate-400 mt-0.5">No entrega</p></div>
      </div>

      {/* Workload per person — control de las 20 personas */}
      {workload.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2"><Users size={15} className="text-brand-400" /> Carga por persona</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50 text-slate-500">
                  <th className="text-left px-2 py-1.5 font-medium">Persona</th>
                  <th className="px-2 py-1.5 text-center">Activas</th>
                  <th className="px-2 py-1.5 text-center">Vencidas</th>
                  <th className="px-2 py-1.5 text-center">Tiempo</th>
                  <th className="px-2 py-1.5 text-center">Bloqueos</th>
                  <th className="px-2 py-1.5 text-center">No entrega</th>
                </tr>
              </thead>
              <tbody>
                {workload.map(w => (
                  <tr key={w.user_id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-2 py-1.5 text-slate-300 truncate max-w-[140px]">{w.user_name}</td>
                    <td className="px-2 py-1.5 text-center text-white font-medium">{w.active}</td>
                    <td className={clsx('px-2 py-1.5 text-center', w.overdue > 0 ? 'text-red-400 font-medium' : 'text-slate-600')}>{w.overdue || '·'}</td>
                    <td className="px-2 py-1.5 text-center text-slate-400">
                      {fmtMinutes(w.minutes_tracked)}{w.minutes_estimated > 0 && <span className="text-slate-600"> / {fmtMinutes(w.minutes_estimated)}</span>}
                    </td>
                    <td className={clsx('px-2 py-1.5 text-center', w.blockers > 0 ? 'text-amber-400 font-medium' : 'text-slate-600')}>{w.blockers || '·'}</td>
                    <td className={clsx('px-2 py-1.5 text-center', w.will_not_deliver > 0 ? 'text-red-500 font-medium' : 'text-slate-600')}>{w.will_not_deliver || '·'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Blockers & non-delivery */}
      <div className="grid md:grid-cols-2 gap-4">
        {blockers.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-amber-400 mb-3 flex items-center gap-2 text-sm"><AlertCircle size={14} /> Bloqueos / dificultades</h3>
            <div className="space-y-2">
              {blockers.map(t => (
                <div key={t.id} className="text-xs border-b border-slate-800 last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-200 font-medium truncate">{t.title}</span>
                    <button onClick={() => onEdit(t)} className="text-slate-500 hover:text-brand-400 flex-shrink-0"><Edit3 size={12} /></button>
                  </div>
                  <p className="text-amber-300/80 mt-0.5">{t.difficulty}</p>
                  {t.assigned_to_name && <span className="text-slate-500">{t.assigned_to_name}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {notDelivering.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-red-400 mb-3 flex items-center gap-2 text-sm"><Ban size={14} /> No se entregarán</h3>
            <div className="space-y-2">
              {notDelivering.map(t => (
                <div key={t.id} className="text-xs border-b border-slate-800 last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-200 font-medium truncate">{t.title}</span>
                    <button onClick={() => onEdit(t)} className="text-slate-500 hover:text-brand-400 flex-shrink-0"><Edit3 size={12} /></button>
                  </div>
                  {t.not_deliver_reason && <p className="text-red-300/80 mt-0.5">{t.not_deliver_reason}</p>}
                  {t.assigned_to_name && <span className="text-slate-500">{t.assigned_to_name}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Meeting overuse */}
      {meetingStats.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Video size={15} className="text-violet-400" /> Uso de reuniones (30 días)
            {meetingStats.some(s => s.count > OVERUSE) && (
              <span className="text-xs text-red-400 ml-auto flex items-center gap-1"><AlertTriangle size={12} /> Sobrecarga</span>
            )}
          </h3>
          <div className="space-y-2">
            {meetingStats.map(s => (
              <div key={s.user_id} className="flex items-center gap-2">
                <span className="text-sm text-slate-300 flex-1 truncate">{s.user_name}</span>
                <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded', s.count > OVERUSE ? 'bg-red-900/40 text-red-400' : 'bg-slate-800 text-slate-400')}>{s.count} reuniones</span>
                {s.total_minutes > 0 && <span className="text-xs text-slate-500">{fmtMinutes(s.total_minutes)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By business */}
      {dash?.by_business?.map(biz => biz.total > 0 && (
        <div key={biz.business_id} className="card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: biz.business_color || '#6366f1' }} />
              <h3 className="font-semibold text-white">{biz.business_name}</h3>
              <span className="text-xs text-slate-500">{biz.total} tareas</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              {biz.overdue > 0 && <span className="text-red-400">{biz.overdue} vencidas</span>}
              {biz.urgent > 0 && <span className="text-amber-400">{biz.urgent} urgentes</span>}
            </div>
          </div>
          <div className="space-y-2">
            {biz.tasks.slice(0, 5).map(t => (
              <div key={t.id} className="flex items-center gap-2 py-1 border-b border-slate-800 last:border-0">
                <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', {
                  'bg-slate-500': t.priority === 'baja', 'bg-blue-500': t.priority === 'media',
                  'bg-amber-500': t.priority === 'alta', 'bg-red-500': t.priority === 'urgente',
                })} />
                <span className="flex-1 text-sm text-slate-300 truncate">{t.title}</span>
                {t.assigned_to_name && <span className="text-xs text-slate-500">{t.assigned_to_name}</span>}
                <button onClick={() => doneMutation.mutate(t.id)} className="p-1 text-slate-500 hover:text-green-400"><CheckCircle2 size={13} /></button>
                <button onClick={() => onEdit(t)} className="p-1 text-slate-500 hover:text-brand-400"><Edit3 size={13} /></button>
              </div>
            ))}
            {biz.tasks.length > 5 && <p className="text-xs text-slate-500 text-center pt-1">+{biz.tasks.length - 5} más</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QuickTasksPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const isLeaderOrAdmin = ['admin', 'leader', 'lider_sr'].includes(user?.role)

  const [businessFilter, setBusinessFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [includeDone, setIncludeDone] = useState(false)
  const [userIdFilter, setUserIdFilter] = useState('')
  const [leaderView, setLeaderView] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editTask, setEditTask] = useState(null)
  const [addSubtaskParent, setAddSubtaskParent] = useState(null)

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['quick-tasks', businessFilter, statusFilter, categoryFilter, includeDone, userIdFilter],
    queryFn: () => quickTasksAPI.list({
      business_id: businessFilter || undefined,
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
      include_done: includeDone,
      all_users: isLeaderOrAdmin ? true : undefined,
      assigned_to_id: userIdFilter || undefined,
    }).then(r => r.data),
    enabled: !leaderView,
  })

  const { data: businesses } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => adminAPI.businesses().then(r => Array.isArray(r.data) ? r.data : r.data?.items || []),
  })

  const { data: usersData } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersAPI.list({ is_active: true, limit: 100 }).then(r => r.data),
  })
  const users = usersData?.items || usersData || []
  const usersMap = useMemo(() => {
    const m = {}
    users.forEach(u => { m[u.id] = u.full_name })
    return m
  }, [users])

  const { data: activityTypes } = useQuery({
    queryKey: ['activity-types'],
    queryFn: () => adminAPI.getActivityTypes().then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const doneMutation = useMutation({
    mutationFn: (id) => quickTasksAPI.done(id),
    onSuccess: () => { qc.invalidateQueries(['quick-tasks']); toast.success('Tarea completada') },
    onError: () => toast.error('Error al completar tarea'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => quickTasksAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries(['quick-tasks']); toast.success('Tarea eliminada') },
    onError: () => toast.error('Error al eliminar tarea'),
  })

  // Client-side team filter (team_scope)
  const visibleTasks = useMemo(() => {
    if (!tasks) return []
    if (!teamFilter) return tasks
    return tasks.filter(t => t.team_scope === teamFilter)
  }, [tasks, teamFilter])

  const activeTasks = visibleTasks.filter(t => !t.is_done)
  const overdueTasks = activeTasks.filter(t => isOverdue(t.due_date))
  const urgentTasks = activeTasks.filter(t => t.priority === 'urgente')
  const blockedTasks = activeTasks.filter(t => t.difficulty || t.will_not_deliver)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ListTodo size={22} className="text-amber-400" /> Tareas
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">Operación CAS / BO — control de actividades del equipo</p>
        </div>
        <div className="flex items-center gap-2">
          {isLeaderOrAdmin && (
            <button onClick={() => setLeaderView(!leaderView)}
              className={clsx('btn-secondary text-sm flex items-center gap-1.5', leaderView && 'bg-brand-600 text-white border-brand-600')}>
              <BarChart3 size={14} /> Vista líder
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus size={16} /> Nueva tarea</button>
        </div>
      </div>

      {!leaderView && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card text-center py-3"><p className="text-xl font-bold text-white">{activeTasks.length}</p><p className="text-xs text-slate-400">Activas</p></div>
          <div className="card text-center py-3"><p className="text-xl font-bold text-red-400">{overdueTasks.length}</p><p className="text-xs text-slate-400">Vencidas</p></div>
          <div className="card text-center py-3"><p className="text-xl font-bold text-amber-400">{urgentTasks.length}</p><p className="text-xs text-slate-400">Urgentes</p></div>
          <div className="card text-center py-3"><p className="text-xl font-bold text-orange-400">{blockedTasks.length}</p><p className="text-xs text-slate-400">Bloqueos</p></div>
        </div>
      )}

      {leaderView ? (
        <LeaderDashboard onEdit={setEditTask} />
      ) : (
        <>
          {/* Business tabs */}
          {businesses && businesses.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button onClick={() => setBusinessFilter('')}
                className={clsx('flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', !businessFilter ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700')}>
                Todas
              </button>
              {businesses.map(biz => (
                <button key={biz.id} onClick={() => setBusinessFilter(String(biz.id))}
                  className={clsx('flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', businessFilter === String(biz.id) ? 'text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700')}
                  style={businessFilter === String(biz.id) ? { backgroundColor: biz.color || '#6366f1' } : {}}>
                  {biz.name}
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="input w-auto text-sm">
              <option value="">Todos los equipos</option>
              <option value="CAS">CAS</option>
              <option value="BO">BO</option>
            </select>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input w-auto text-sm">
              <option value="">Todas las categorías</option>
              {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.icon} {cfg.label}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-auto text-sm">
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="asignada">Asignada</option>
              <option value="en_progreso">En progreso</option>
              <option value="completada">Completada</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input type="checkbox" checked={includeDone} onChange={e => setIncludeDone(e.target.checked)} className="rounded" />
              Incluir completadas
            </label>
            {isLeaderOrAdmin && (
              <select value={userIdFilter} onChange={e => setUserIdFilter(e.target.value)} className="input w-36 text-sm">
                <option value="">Todos los usuarios</option>
                {users?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            )}
          </div>

          {/* Task list */}
          {isLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => <div key={i} className="card animate-pulse h-28 bg-slate-900" />)}
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="text-center py-16">
              <ListTodo size={48} className="mx-auto mb-3 text-slate-700" />
              <p className="text-slate-400">No hay tareas aún</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary mt-4"><Plus size={16} /> Crear primera tarea</button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleTasks.map(t => (
                <TaskCard key={t.id} task={t} usersMap={usersMap}
                  onDone={(id) => doneMutation.mutate(id)}
                  onDelete={(id) => { if (confirm('¿Eliminar esta tarea?')) deleteMutation.mutate(id) }}
                  onEdit={setEditTask} onAddSubtask={setAddSubtaskParent} navigate={navigate} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} businesses={businesses} users={users} activityTypes={activityTypes} />}
      {editTask && <EditModal task={editTask} onClose={() => setEditTask(null)} businesses={businesses} users={users} activityTypes={activityTypes} />}
      {addSubtaskParent && <CreateModal onClose={() => setAddSubtaskParent(null)} businesses={businesses} users={users} activityTypes={activityTypes} parentTask={addSubtaskParent} />}
    </div>
  )
}
