/**
 * QuickTasksPage — Tareas puntuales no asociadas a proyectos
 * Categorías: general | reunion | gestion | seguimiento | revision | soporte | capacitacion | otro
 * Las reuniones tienen start/end datetime y pueden generar sub-tareas.
 */
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Plus, X, Trash2, Edit3, CheckCircle2, Clock, AlertTriangle,
  Timer, Users, Building2, ListTodo, ChevronDown, ChevronRight,
  BarChart3, User, Calendar, Tag, Video, ChevronUp, PlusCircle,
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

// ─── Sub-task Row ─────────────────────────────────────────────────────────────

function SubTaskRow({ task, onDone, onDelete, onEdit }) {
  const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.media
  return (
    <div className="flex items-center gap-2 py-1.5 pl-4 border-l-2 border-slate-700 ml-2">
      <div className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', {
        'bg-slate-500': task.priority === 'baja',
        'bg-blue-500': task.priority === 'media',
        'bg-amber-500': task.priority === 'alta',
        'bg-red-500': task.priority === 'urgente',
      })} />
      <span className={clsx('flex-1 text-xs truncate', task.is_done ? 'line-through text-slate-600' : 'text-slate-300')}>
        {task.title}
      </span>
      {task.assigned_to_name && (
        <span className="text-[10px] text-slate-500 flex-shrink-0">{task.assigned_to_name}</span>
      )}
      {!task.is_done && (
        <button onClick={() => onDone(task.id)} className="p-1 text-slate-600 hover:text-green-400 transition-colors flex-shrink-0">
          <CheckCircle2 size={12} />
        </button>
      )}
      <button onClick={() => onEdit(task)} className="p-1 text-slate-600 hover:text-brand-400 transition-colors flex-shrink-0">
        <Edit3 size={12} />
      </button>
      <button onClick={() => onDelete(task.id)} className="p-1 text-slate-600 hover:text-red-400 transition-colors flex-shrink-0">
        <Trash2 size={12} />
      </button>
    </div>
  )
}

// ─── Task Form Fields (shared by Create/Edit) ─────────────────────────────────

function TaskFormFields({ form, setForm, businesses, users, isEdit = false }) {
  const isReunion = form.category === 'reunion'
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
      <div>
        <label className="label">Descripción</label>
        <textarea
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          className="input h-16 resize-none text-sm"
          placeholder="Detalles opcionales..."
        />
      </div>

      {/* Category */}
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

      {/* Meeting datetimes */}
      {isReunion && (
        <div className="rounded-lg bg-violet-950/30 border border-violet-800/40 p-3 space-y-2">
          <p className="text-xs text-violet-400 font-semibold flex items-center gap-1.5">
            <Video size={12} /> Detalles de la reunión
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Inicio</label>
              <input
                type="datetime-local"
                value={form.meeting_start}
                onChange={e => setForm(f => ({ ...f, meeting_start: e.target.value }))}
                className="input text-sm"
              />
            </div>
            <div>
              <label className="label">Fin</label>
              <input
                type="datetime-local"
                value={form.meeting_end}
                onChange={e => setForm(f => ({ ...f, meeting_end: e.target.value }))}
                className="input text-sm"
              />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Prioridad</label>
          <select
            value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
            className="input"
          >
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
        <div>
          <label className="label">Vencimiento</label>
          <input
            type="date"
            value={form.due_date}
            onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label">Empresa</label>
        <select
          value={form.business_id}
          onChange={e => setForm(f => ({ ...f, business_id: e.target.value }))}
          className="input"
        >
          <option value="">Sin empresa</option>
          {businesses?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Asignar a</label>
        <select
          value={form.assigned_to_id}
          onChange={e => setForm(f => ({ ...f, assigned_to_id: e.target.value }))}
          className="input"
        >
          <option value="">Sin asignar</option>
          {users?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Tiempo estimado (min)</label>
        <input
          type="number"
          min="1"
          value={form.estimated_minutes}
          onChange={e => setForm(f => ({ ...f, estimated_minutes: e.target.value }))}
          className="input"
          placeholder="Ej: 30"
        />
      </div>
      {isEdit && (
        <div>
          <label className="label">Estado</label>
          <select
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
            className="input"
          >
            <option value="pendiente">Pendiente</option>
            <option value="asignada">Asignada</option>
            <option value="en_progreso">En progreso</option>
            <option value="completada">Completada</option>
          </select>
        </div>
      )}
    </>
  )
}

// ─── CreateModal ──────────────────────────────────────────────────────────────

function CreateModal({ onClose, businesses, users, parentTask = null }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: '', description: '', business_id: parentTask?.business_id ? String(parentTask.business_id) : '',
    assigned_to_id: '', priority: 'media', category: 'general',
    estimated_minutes: '', due_date: '', meeting_start: '', meeting_end: '',
  })

  const mutation = useMutation({
    mutationFn: (data) => parentTask
      ? quickTasksAPI.createSubtask(parentTask.id, data)
      : quickTasksAPI.create(data),
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
    mutation.mutate({
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
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <ListTodo size={16} className="text-amber-400" />
            {parentTask ? `Sub-tarea de: ${parentTask.title.slice(0, 30)}` : 'Nueva tarea rápida'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <TaskFormFields form={form} setForm={setForm} businesses={businesses} users={users} />
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

// ─── EditModal ────────────────────────────────────────────────────────────────

function EditModal({ task, onClose, businesses, users }) {
  const qc = useQueryClient()

  const toLocalDatetime = (iso) => {
    if (!iso) return ''
    // Convert ISO to local datetime-local input format
    const d = new Date(iso)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

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
  })

  const mutation = useMutation({
    mutationFn: (data) => quickTasksAPI.update(task.id, data),
    onSuccess: () => {
      qc.invalidateQueries(['quick-tasks'])
      toast.success('Tarea actualizada')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al actualizar'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate({
      title: form.title.trim(),
      description: form.description || null,
      business_id: form.business_id ? parseInt(form.business_id) : null,
      assigned_to_id: form.assigned_to_id ? parseInt(form.assigned_to_id) : null,
      priority: form.priority,
      status: form.status,
      category: form.category,
      estimated_minutes: form.estimated_minutes ? parseInt(form.estimated_minutes) : null,
      due_date: form.due_date || null,
      meeting_start: form.category === 'reunion' && form.meeting_start ? form.meeting_start : null,
      meeting_end: form.category === 'reunion' && form.meeting_end ? form.meeting_end : null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
          <h2 className="font-semibold text-white">Editar tarea</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <TaskFormFields form={form} setForm={setForm} businesses={businesses} users={users} isEdit />
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

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onDone, onDelete, onEdit, onAddSubtask, navigate }) {
  const [expandChildren, setExpandChildren] = useState(false)
  const qc = useQueryClient()
  const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.media
  const sc = STATUS_LABELS[task.status] || STATUS_LABELS.pendiente
  const catCfg = CATEGORY_CONFIG[task.category] || CATEGORY_CONFIG.general
  const overdue = isOverdue(task.due_date)
  const hasTime = task.estimated_minutes > 0
  const progress = hasTime ? Math.min(100, Math.round((task.logged_minutes / task.estimated_minutes) * 100)) : 0
  const children = task.children || []
  const doneChildren = children.filter(c => c.is_done)
  const isReunion = task.category === 'reunion'

  const doneMutation = useMutation({
    mutationFn: (id) => quickTasksAPI.done(id),
    onSuccess: () => { qc.invalidateQueries(['quick-tasks']); toast.success('Sub-tarea completada') },
  })
  const deleteMutation = useMutation({
    mutationFn: (id) => quickTasksAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries(['quick-tasks']); toast.success('Eliminada') },
  })

  return (
    <div className={clsx(
      'card border-l-4 hover:border-slate-600 transition-all',
      isReunion ? 'border-l-violet-500' : pc.border,
      task.is_done && 'opacity-60'
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className={clsx('font-medium text-sm', task.is_done ? 'line-through text-slate-500' : 'text-white')}>
            {task.title}
          </h3>
          {task.description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!task.is_done && (
            <button
              onClick={() => navigate('/pomodoro')}
              title="Iniciar Pomodoro"
              className="p-1.5 rounded text-slate-500 hover:text-orange-400 hover:bg-orange-900/20 transition-colors"
            >
              <Timer size={14} />
            </button>
          )}
          {isReunion && !task.is_done && (
            <button
              onClick={() => onAddSubtask(task)}
              title="Agregar acción de reunión"
              className="p-1.5 rounded text-slate-500 hover:text-violet-400 hover:bg-violet-900/20 transition-colors"
            >
              <PlusCircle size={14} />
            </button>
          )}
          <button onClick={() => onEdit(task)} className="p-1.5 rounded text-slate-500 hover:text-brand-400 hover:bg-brand-900/20 transition-colors">
            <Edit3 size={14} />
          </button>
          <button onClick={() => onDelete(task.id)} className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap mt-2">
        {/* Category badge */}
        <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1', catCfg.bg, catCfg.color)}>
          {catCfg.icon} {catCfg.label}
        </span>
        <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded', pc.bg, pc.text)}>
          {pc.label}
        </span>
        <span className={clsx('text-[10px]', sc.color)}>{sc.label}</span>

        {task.business_name && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
            style={{
              color: task.business_color || '#6366f1',
              borderColor: (task.business_color || '#6366f1') + '55',
              backgroundColor: (task.business_color || '#6366f1') + '18',
            }}
          >
            {task.business_name}
          </span>
        )}

        {task.assigned_to_name && (
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <User size={10} /> {task.assigned_to_name}
          </span>
        )}

        {task.due_date && (
          <span className={clsx('flex items-center gap-1 text-[10px]', overdue ? 'text-red-400' : 'text-slate-500')}>
            <Calendar size={10} /> {task.due_date}{overdue && ' (vencida)'}
          </span>
        )}
      </div>

      {/* Meeting datetimes */}
      {isReunion && (task.meeting_start || task.meeting_end) && (
        <div className="mt-2 rounded bg-violet-950/40 border border-violet-800/30 px-2 py-1.5 text-xs text-violet-300 flex flex-wrap gap-x-3 gap-y-0.5">
          {task.meeting_start && <span>📅 Inicio: {formatDatetime(task.meeting_start)}</span>}
          {task.meeting_end && <span>🏁 Fin: {formatDatetime(task.meeting_end)}</span>}
          {task.meeting_duration_min != null && (
            <span className="text-violet-400 font-medium">⏱ {fmtMinutes(task.meeting_duration_min)}</span>
          )}
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
            <div
              className={clsx('h-full rounded-full transition-all', progress >= 100 ? 'bg-green-500' : 'bg-brand-500')}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Sub-tasks / action items */}
      {children.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setExpandChildren(!expandChildren)}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors w-full"
          >
            {expandChildren ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            <span>Acciones ({doneChildren.length}/{children.length} completadas)</span>
            {doneChildren.length < children.length && (
              <span className="ml-auto text-amber-500 text-[10px]">● pendientes</span>
            )}
          </button>
          {expandChildren && (
            <div className="mt-1 space-y-0.5">
              {children.map(child => (
                <SubTaskRow
                  key={child.id}
                  task={child}
                  onDone={(id) => doneMutation.mutate(id)}
                  onDelete={(id) => {
                    if (confirm('¿Eliminar esta acción?')) deleteMutation.mutate(id)
                  }}
                  onEdit={onEdit}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Mark done button */}
      {!task.is_done && (
        <button
          onClick={() => onDone(task.id)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-green-400 hover:bg-green-900/20 py-1.5 rounded-lg border border-slate-700 hover:border-green-800 transition-colors"
        >
          <CheckCircle2 size={13} /> Marcar como hecha
        </button>
      )}
    </div>
  )
}

// ─── Leader Dashboard View ────────────────────────────────────────────────────

function LeaderDashboard({ navigate, businesses, users, onEdit }) {
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

  const deleteMutation = useMutation({
    mutationFn: (id) => quickTasksAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries(['quick-tasks-dashboard']); toast.success('Tarea eliminada') },
  })

  if (isLoading) return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(4)].map((_, i) => <div key={i} className="card animate-pulse h-32 bg-slate-900" />)}
    </div>
  )

  const meetingStats = dash?.meeting_stats_30d || []
  const OVERUSE_THRESHOLD = 8  // >8 meetings/30d = overuse

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center">
          <p className="text-2xl font-bold text-white">{dash?.total_active ?? 0}</p>
          <p className="text-xs text-slate-400 mt-0.5">Activas</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-red-400">{dash?.total_overdue ?? 0}</p>
          <p className="text-xs text-slate-400 mt-0.5">Vencidas</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-amber-400">{dash?.total_urgent ?? 0}</p>
          <p className="text-xs text-slate-400 mt-0.5">Urgentes</p>
        </div>
      </div>

      {/* Meeting overuse panel */}
      {meetingStats.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
            <Video size={15} className="text-violet-400" /> Uso de reuniones (últimos 30 días)
            {meetingStats.some(s => s.count > OVERUSE_THRESHOLD) && (
              <span className="text-xs text-red-400 ml-auto flex items-center gap-1">
                <AlertTriangle size={12} /> Sobrecarga detectada
              </span>
            )}
          </h3>
          <div className="space-y-2">
            {meetingStats.map(s => (
              <div key={s.user_id} className="flex items-center gap-2">
                <span className="text-sm text-slate-300 flex-1 truncate">{s.user_name}</span>
                <span className={clsx(
                  'text-xs font-semibold px-2 py-0.5 rounded',
                  s.count > OVERUSE_THRESHOLD ? 'bg-red-900/40 text-red-400' : 'bg-slate-800 text-slate-400'
                )}>
                  {s.count} reuniones
                </span>
                {s.total_minutes > 0 && (
                  <span className="text-xs text-slate-500">{fmtMinutes(s.total_minutes)}</span>
                )}
                {s.count > OVERUSE_THRESHOLD && (
                  <AlertTriangle size={12} className="text-red-400 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By business */}
      {dash?.by_business?.map(biz => (
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
          {biz.tasks.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-2">Sin tareas activas</p>
          ) : (
            <div className="space-y-2">
              {biz.tasks.slice(0, 5).map(t => (
                <div key={t.id} className="flex items-center gap-2 py-1 border-b border-slate-800 last:border-0">
                  <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', {
                    'bg-slate-500': t.priority === 'baja',
                    'bg-blue-500': t.priority === 'media',
                    'bg-amber-500': t.priority === 'alta',
                    'bg-red-500': t.priority === 'urgente',
                  })} />
                  <span className="flex-1 text-sm text-slate-300 truncate">{t.title}</span>
                  {t.assigned_to_name && <span className="text-xs text-slate-500">{t.assigned_to_name}</span>}
                  {t.due_date && (
                    <span className={clsx('text-xs', isOverdue(t.due_date) ? 'text-red-400' : 'text-slate-500')}>
                      {t.due_date}
                    </span>
                  )}
                  <button onClick={() => doneMutation.mutate(t.id)} className="p-1 text-slate-500 hover:text-green-400 transition-colors">
                    <CheckCircle2 size={13} />
                  </button>
                  <button onClick={() => onEdit(t)} className="p-1 text-slate-500 hover:text-brand-400 transition-colors">
                    <Edit3 size={13} />
                  </button>
                </div>
              ))}
              {biz.tasks.length > 5 && (
                <p className="text-xs text-slate-500 text-center pt-1">+{biz.tasks.length - 5} más</p>
              )}
            </div>
          )}
        </div>
      ))}

      {dash?.no_business?.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-slate-400 mb-3 text-sm">Sin empresa asignada ({dash.no_business.length})</h3>
          <div className="space-y-2">
            {dash.no_business.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-sm py-1 border-b border-slate-800 last:border-0">
                <span className="flex-1 text-slate-300 truncate">{t.title}</span>
                {t.assigned_to_name && <span className="text-xs text-slate-500">{t.assigned_to_name}</span>}
                <button onClick={() => doneMutation.mutate(t.id)} className="p-1 text-slate-500 hover:text-green-400">
                  <CheckCircle2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
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

  const activeTasks = tasks?.filter(t => !t.is_done) || []
  const overdueTasks = tasks?.filter(t => !t.is_done && isOverdue(t.due_date)) || []
  const urgentTasks = tasks?.filter(t => !t.is_done && t.priority === 'urgente') || []
  const meetingTasks = tasks?.filter(t => !t.is_done && t.category === 'reunion') || []

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ListTodo size={22} className="text-amber-400" />
            Tareas Rápidas
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">Tareas puntuales no asociadas a proyectos</p>
        </div>
        <div className="flex items-center gap-2">
          {isLeaderOrAdmin && (
            <button
              onClick={() => setLeaderView(!leaderView)}
              className={clsx('btn-secondary text-sm flex items-center gap-1.5', leaderView && 'bg-brand-600 text-white border-brand-600')}
            >
              <BarChart3 size={14} />
              Vista líder
            </button>
          )}
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={16} /> Nueva tarea
          </button>
        </div>
      </div>

      {/* KPI row (only in list view) */}
      {!leaderView && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card text-center py-3">
            <p className="text-xl font-bold text-white">{activeTasks.length}</p>
            <p className="text-xs text-slate-400">Activas</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-xl font-bold text-red-400">{overdueTasks.length}</p>
            <p className="text-xs text-slate-400">Vencidas</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-xl font-bold text-amber-400">{urgentTasks.length}</p>
            <p className="text-xs text-slate-400">Urgentes</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-xl font-bold text-violet-400">{meetingTasks.length}</p>
            <p className="text-xs text-slate-400">Reuniones</p>
          </div>
        </div>
      )}

      {leaderView ? (
        <LeaderDashboard navigate={navigate} businesses={businesses} users={users} onEdit={setEditTask} />
      ) : (
        <>
          {/* Business tabs */}
          {businesses && businesses.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button
                onClick={() => setBusinessFilter('')}
                className={clsx(
                  'flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  !businessFilter ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700'
                )}
              >
                Todas
              </button>
              {businesses.map(biz => (
                <button
                  key={biz.id}
                  onClick={() => setBusinessFilter(String(biz.id))}
                  className={clsx(
                    'flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    businessFilter === String(biz.id) ? 'text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-700'
                  )}
                  style={businessFilter === String(biz.id) ? { backgroundColor: biz.color || '#6366f1' } : {}}
                >
                  {biz.name}
                </button>
              ))}
            </div>
          )}

          {/* Filters row */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Category filter */}
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="input w-auto text-sm"
            >
              <option value="">Todas las categorías</option>
              {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="input w-auto text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="asignada">Asignada</option>
              <option value="en_progreso">En progreso</option>
              <option value="completada">Completada</option>
            </select>

            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDone}
                onChange={e => setIncludeDone(e.target.checked)}
                className="rounded"
              />
              Incluir completadas
            </label>

            {isLeaderOrAdmin && (
              <select
                value={userIdFilter}
                onChange={e => setUserIdFilter(e.target.value)}
                className="input w-36 text-sm"
              >
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
          ) : tasks?.length === 0 ? (
            <div className="text-center py-16">
              <ListTodo size={48} className="mx-auto mb-3 text-slate-700" />
              <p className="text-slate-400">No hay tareas aún</p>
              <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">
                <Plus size={16} /> Crear primera tarea
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(tasks || []).map(t => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onDone={(id) => doneMutation.mutate(id)}
                  onDelete={(id) => {
                    if (confirm('¿Eliminar esta tarea?')) deleteMutation.mutate(id)
                  }}
                  onEdit={setEditTask}
                  onAddSubtask={setAddSubtaskParent}
                  navigate={navigate}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} businesses={businesses} users={users} />
      )}
      {editTask && (
        <EditModal task={editTask} onClose={() => setEditTask(null)} businesses={businesses} users={users} />
      )}
      {addSubtaskParent && (
        <CreateModal
          onClose={() => setAddSubtaskParent(null)}
          businesses={businesses}
          users={users}
          parentTask={addSubtaskParent}
        />
      )}
    </div>
  )
}
