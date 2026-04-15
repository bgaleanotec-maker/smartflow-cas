import { useState, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  ArrowLeft, Plus, Settings, Users, Calendar, ChevronDown,
  ChevronRight, X, CheckSquare, Square, AlertTriangle,
  Clock, Zap, Flag, Tag, MoreHorizontal, CheckCheck,
  Layers, BookOpen, Play, StopCircle, Circle, Archive, Trash2, Pencil
} from 'lucide-react'
import {
  projectsAPI, tasksAPI, adminAPI,
  epicsAPI, storiesAPI, usersAPI, sprintsAPI
} from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function formatDate(d) {
  if (!d) return null
  return new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })
}

function isOverdue(d) {
  if (!d) return false
  return new Date(d) < new Date() && new Date(d).toDateString() !== new Date().toDateString()
}

function daysRemaining(end) {
  if (!end) return null
  const diff = Math.ceil((new Date(end) - new Date()) / 86400000)
  return diff
}

function AvatarCircle({ name, avatarUrl, size = 7, className }) {
  const sz = `w-${size} h-${size}`
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={clsx(sz, 'rounded-full object-cover', className)} />
  }
  return (
    <div className={clsx(sz, 'rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0', className)}>
      {getInitials(name)}
    </div>
  )
}

// sprintsAPI is imported from services/api.js

// ─── TaskCard (Kanban) ─────────────────────────────────────────────────────────

function TaskCard({ task, epics, onClick }) {
  const epic = epics?.find(e => e.id === task.epic_id)
  const completedSubs = task.subtasks?.filter(s => s.is_completed).length ?? 0
  const totalSubs = task.subtasks?.length ?? 0
  const overdue = isOverdue(task.due_date)
  const priorityColor = task.priority?.color || '#64748b'

  return (
    <div
      onClick={() => onClick(task)}
      className="card py-3 cursor-pointer hover:border-slate-600 hover:shadow-lg transition-all relative overflow-hidden group"
      style={{ borderLeft: `4px solid ${priorityColor}` }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <span className="font-mono text-xs text-slate-500">{task.task_number}</span>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {epic && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/60 text-violet-300 font-medium leading-none">
              {epic.title?.length > 14 ? epic.title.slice(0, 14) + '…' : epic.title}
            </span>
          )}
          {task.story_points != null && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-bold leading-none">
              {task.story_points} SP
            </span>
          )}
        </div>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-slate-100 leading-snug line-clamp-2 mb-2">
        {task.title}
      </p>

      {/* Labels */}
      {task.labels?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.slice(0, 3).map((lbl, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300">
              {lbl}
            </span>
          ))}
        </div>
      )}

      {/* Bottom row */}
      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-2">
          {task.due_date && (
            <span className={clsx('flex items-center gap-0.5 text-[11px]', overdue ? 'text-red-400' : 'text-slate-500')}>
              <Calendar className="w-3 h-3" />
              {formatDate(task.due_date)}
            </span>
          )}
          {totalSubs > 0 && (
            <span className={clsx('flex items-center gap-0.5 text-[11px]', completedSubs === totalSubs ? 'text-emerald-400' : 'text-slate-500')}>
              <CheckCheck className="w-3 h-3" />
              {completedSubs}/{totalSubs}
            </span>
          )}
        </div>
        {task.assignee && (
          <AvatarCircle name={task.assignee.full_name} avatarUrl={task.assignee.avatar_url} size={6} />
        )}
      </div>
    </div>
  )
}

// ─── BacklogRow ────────────────────────────────────────────────────────────────

function BacklogRow({ task, epics, onClick, statuses }) {
  const epic = epics?.find(e => e.id === task.epic_id)
  const status = statuses?.find(s => s.id === task.status_id)
  const priorityColor = task.priority?.color || '#64748b'
  const overdue = isOverdue(task.due_date)

  return (
    <div
      onClick={() => onClick(task)}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-800 cursor-pointer group transition-colors border border-transparent hover:border-slate-700"
    >
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: priorityColor }} />
      <span className="font-mono text-xs text-slate-500 w-20 flex-shrink-0">{task.task_number}</span>
      <span className="flex-1 text-sm text-slate-200 truncate font-medium">{task.title}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        {epic && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-300 hidden sm:inline">
            {epic.title?.length > 16 ? epic.title.slice(0, 16) + '…' : epic.title}
          </span>
        )}
        {status && (
          <span className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded" style={{ background: `${status.color}22`, color: status.color }}>
            <Circle className="w-2 h-2 fill-current" />
            {status.name}
          </span>
        )}
        {task.story_points != null && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 font-bold">
            {task.story_points}sp
          </span>
        )}
        {task.assignee && (
          <AvatarCircle name={task.assignee.full_name} avatarUrl={task.assignee.avatar_url} size={6} />
        )}
        {task.due_date && (
          <span className={clsx('text-[11px] hidden md:flex items-center gap-0.5', overdue ? 'text-red-400' : 'text-slate-500')}>
            <Calendar className="w-3 h-3" />
            {formatDate(task.due_date)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── TaskDetailPanel (slide-in from right) ────────────────────────────────────

function TaskDetailPanel({ task, statuses, priorities, users, epics, sprints, onClose, projectId }) {
  const qc = useQueryClient()
  const [editTitle, setEditTitle] = useState(false)
  const [titleVal, setTitleVal] = useState(task?.title || '')

  const updateMutation = useMutation({
    mutationFn: (data) => tasksAPI.update(task.id, data),
    onSuccess: () => {
      qc.invalidateQueries(['project-tasks', projectId])
      toast.success('Tarea actualizada')
    },
    onError: () => toast.error('Error al actualizar'),
  })

  const toggleSubtask = (subtask) => {
    tasksAPI.toggleSubtask(task.id, subtask.id)
      .then(() => qc.invalidateQueries(['project-tasks', projectId]))
      .catch(() => toast.error('Error al actualizar subtarea'))
  }

  if (!task) return null

  const completedSubs = task.subtasks?.filter(s => s.is_completed).length ?? 0
  const totalSubs = task.subtasks?.length ?? 0

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-slate-900 border-l border-slate-700 z-50 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-slate-500">{task.task_number}</span>
            {task.priority && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded" style={{ background: `${task.priority.color}22`, color: task.priority.color }}>
                <Flag className="w-3 h-3" />
                {task.priority.name}
              </span>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost p-1 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Title */}
          {editTitle ? (
            <div className="flex gap-2">
              <input
                className="input flex-1 text-base font-semibold"
                value={titleVal}
                onChange={e => setTitleVal(e.target.value)}
                autoFocus
              />
              <button className="btn-primary text-sm" onClick={() => { updateMutation.mutate({ title: titleVal }); setEditTitle(false) }}>✓</button>
              <button className="btn-ghost text-sm" onClick={() => setEditTitle(false)}>✕</button>
            </div>
          ) : (
            <h2
              className="text-lg font-semibold text-slate-100 cursor-pointer hover:text-indigo-300 transition-colors"
              onClick={() => { setTitleVal(task.title); setEditTitle(true) }}
            >
              {task.title}
            </h2>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Status */}
            <div>
              <label className="label text-xs mb-1">Estado</label>
              <select
                className="input text-sm w-full"
                value={task.status_id || ''}
                onChange={e => updateMutation.mutate({ status_id: e.target.value })}
              >
                {statuses?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {/* Priority */}
            <div>
              <label className="label text-xs mb-1">Prioridad</label>
              <select
                className="input text-sm w-full"
                value={task.priority_id || ''}
                onChange={e => updateMutation.mutate({ priority_id: e.target.value })}
              >
                {priorities?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {/* Assignee */}
            <div>
              <label className="label text-xs mb-1">Asignado a</label>
              <select
                className="input text-sm w-full"
                value={task.assignee?.id || ''}
                onChange={e => updateMutation.mutate({ assignee_id: e.target.value || null })}
              >
                <option value="">Sin asignar</option>
                {users?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            {/* Due date */}
            <div>
              <label className="label text-xs mb-1">Fecha límite</label>
              <input
                type="date"
                className="input text-sm w-full"
                value={task.due_date?.slice(0, 10) || ''}
                onChange={e => updateMutation.mutate({ due_date: e.target.value || null })}
              />
            </div>
            {/* Story points */}
            <div>
              <label className="label text-xs mb-1">Story Points</label>
              <input
                type="number"
                min="0"
                max="100"
                className="input text-sm w-full"
                defaultValue={task.story_points ?? ''}
                onBlur={e => updateMutation.mutate({ story_points: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
            {/* Estimated hours */}
            <div>
              <label className="label text-xs mb-1">Horas estimadas</label>
              <input
                type="number"
                min="0"
                className="input text-sm w-full"
                defaultValue={task.estimated_hours ?? ''}
                onBlur={e => updateMutation.mutate({ estimated_hours: e.target.value ? Number(e.target.value) : null })}
              />
            </div>
          </div>

          {/* Epic + Sprint */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-xs mb-1">Épica</label>
              <select
                className="input text-sm w-full"
                value={task.epic_id || ''}
                onChange={e => updateMutation.mutate({ epic_id: e.target.value || null })}
              >
                <option value="">Sin épica</option>
                {epics?.map(ep => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
              </select>
            </div>
            <div>
              <label className="label text-xs mb-1">Sprint</label>
              <select
                className="input text-sm w-full"
                value={task.sprint_id || ''}
                onChange={e => updateMutation.mutate({ sprint_id: e.target.value || null })}
              >
                <option value="">Backlog</option>
                {sprints?.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label text-xs mb-1">Descripción</label>
            <textarea
              className="input text-sm w-full h-24 resize-none"
              defaultValue={task.description || ''}
              placeholder="Agregar descripción…"
              onBlur={e => updateMutation.mutate({ description: e.target.value })}
            />
          </div>

          {/* Subtasks */}
          {totalSubs > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label text-xs">Subtareas</label>
                <span className="text-xs text-slate-500">{completedSubs}/{totalSubs}</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-1 mb-3">
                <div
                  className="bg-emerald-500 h-1 rounded-full transition-all"
                  style={{ width: totalSubs > 0 ? `${(completedSubs / totalSubs) * 100}%` : '0%' }}
                />
              </div>
              <div className="space-y-1.5">
                {task.subtasks.map(sub => (
                  <div
                    key={sub.id}
                    onClick={() => toggleSubtask(sub)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 cursor-pointer transition-colors group"
                  >
                    {sub.is_completed
                      ? <CheckSquare className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      : <Square className="w-4 h-4 text-slate-500 flex-shrink-0 group-hover:text-slate-300" />
                    }
                    <span className={clsx('text-sm flex-1', sub.is_completed ? 'line-through text-slate-500' : 'text-slate-300')}>
                      {sub.title}
                    </span>
                    {sub.assignee && (
                      <AvatarCircle name={sub.assignee.full_name} size={5} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reporter / dates */}
          <div className="border-t border-slate-800 pt-4 space-y-1">
            {task.reporter && (
              <p className="text-xs text-slate-500">Reportado por: <span className="text-slate-400">{task.reporter.full_name}</span></p>
            )}
            {task.created_at && (
              <p className="text-xs text-slate-500">Creado: <span className="text-slate-400">{new Date(task.created_at).toLocaleDateString('es-BO')}</span></p>
            )}
            {task.completed_at && (
              <p className="text-xs text-slate-500">Completado: <span className="text-emerald-400">{new Date(task.completed_at).toLocaleDateString('es-BO')}</span></p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── CreateTaskModal ───────────────────────────────────────────────────────────

function CreateTaskModal({ projectId, onClose, statuses, priorities, users, epics, sprints, defaultSprintId }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: '', description: '', status_id: statuses?.[0]?.id || '',
    priority_id: priorities?.find(p => p.name === 'Media')?.id || priorities?.[0]?.id || '',
    assignee_id: '', epic_id: '', sprint_id: defaultSprintId || '',
    story_points: '', due_date: '', estimated_hours: '',
  })

  const mutation = useMutation({
    mutationFn: (data) => tasksAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['project-tasks', projectId])
      toast.success('Tarea creada')
      onClose()
    },
    onError: () => toast.error('Error al crear tarea'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('El título es requerido')
    mutation.mutate({
      ...form,
      project_id: projectId,
      story_points: form.story_points ? Number(form.story_points) : null,
      estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
      assignee_id: form.assignee_id || null,
      epic_id: form.epic_id || null,
      sprint_id: form.sprint_id || null,
      due_date: form.due_date || null,
    })
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-semibold text-slate-100">Nueva Tarea</h3>
          <button onClick={onClose} className="btn-ghost p-1 rounded"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Título *</label>
            <input className="input w-full" placeholder="Título de la tarea" value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input w-full h-20 resize-none" placeholder="Descripción opcional…" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estado</label>
              <select className="input w-full" value={form.status_id} onChange={e => set('status_id', e.target.value)}>
                {statuses?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select className="input w-full" value={form.priority_id} onChange={e => set('priority_id', e.target.value)}>
                {priorities?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Asignado a</label>
              <select className="input w-full" value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {users?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Épica</label>
              <select className="input w-full" value={form.epic_id} onChange={e => set('epic_id', e.target.value)}>
                <option value="">Sin épica</option>
                {epics?.map(ep => <option key={ep.id} value={ep.id}>{ep.title}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sprint</label>
              <select className="input w-full" value={form.sprint_id} onChange={e => set('sprint_id', e.target.value)}>
                <option value="">Backlog</option>
                {sprints?.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Story Points</label>
              <input type="number" min="0" className="input w-full" placeholder="0" value={form.story_points} onChange={e => set('story_points', e.target.value)} />
            </div>
            <div>
              <label className="label">Fecha límite</label>
              <input type="date" className="input w-full" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Horas estimadas</label>
              <input type="number" min="0" className="input w-full" placeholder="0" value={form.estimated_hours} onChange={e => set('estimated_hours', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando…' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── CreateEpicModal ───────────────────────────────────────────────────────────

function CreateEpicModal({ projectId, onClose, users, priorities }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ title: '', description: '', owner_id: '', due_date: '', priority_id: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: (data) => epicsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['project-epics', projectId])
      toast.success('Épica creada')
      onClose()
    },
    onError: () => toast.error('Error al crear épica'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('El título es requerido')
    mutation.mutate({ ...form, project_id: projectId, owner_id: form.owner_id || null, due_date: form.due_date || null, priority_id: form.priority_id || null })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2"><Layers className="w-4 h-4 text-violet-400" /> Nueva Épica</h3>
          <button onClick={onClose} className="btn-ghost p-1 rounded"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Título *</label>
            <input className="input w-full" placeholder="Nombre de la épica" value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input w-full h-20 resize-none" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Responsable</label>
              <select className="input w-full" value={form.owner_id} onChange={e => set('owner_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {users?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select className="input w-full" value={form.priority_id} onChange={e => set('priority_id', e.target.value)}>
                <option value="">Sin prioridad</option>
                {priorities?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="label">Fecha límite</label>
              <input type="date" className="input w-full" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando…' : 'Crear épica'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── EditEpicModal ─────────────────────────────────────────────────────────────

function EditEpicModal({ epic, projectId, onClose, users }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: epic.title || '',
    description: epic.description || '',
    owner_id: epic.owner?.id || '',
    due_date: epic.due_date || '',
    status: epic.status || 'backlog',
    priority: epic.priority || 'media',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: (data) => epicsAPI.update(epic.id, data),
    onSuccess: () => {
      qc.invalidateQueries(['project-epics', projectId])
      toast.success('Épica actualizada')
      onClose()
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Error al actualizar épica'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('El título es requerido')
    mutation.mutate({
      title: form.title,
      description: form.description || null,
      owner_id: form.owner_id || null,
      due_date: form.due_date || null,
      status: form.status,
      priority: form.priority,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2"><Layers className="w-4 h-4 text-violet-400" /> Editar Épica</h3>
          <button onClick={onClose} className="btn-ghost p-1 rounded"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Título *</label>
            <input className="input w-full" value={form.title} onChange={e => set('title', e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input w-full h-20 resize-none" value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estado</label>
              <select className="input w-full" value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="backlog">Backlog</option>
                <option value="en_progreso">En progreso</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select className="input w-full" value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <div>
              <label className="label">Responsable</label>
              <select className="input w-full" value={form.owner_id} onChange={e => set('owner_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {users?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fecha límite</label>
              <input type="date" className="input w-full" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── CreateSprintModal ─────────────────────────────────────────────────────────

function CreateSprintModal({ projectId, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', goal: '', start_date: '', end_date: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const mutation = useMutation({
    mutationFn: (data) => sprintsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['project-sprints', projectId])
      toast.success('Sprint creado')
      onClose()
    },
    onError: () => toast.error('Error al crear sprint'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('El nombre es requerido')
    mutation.mutate({ ...form, project_id: projectId, start_date: form.start_date || null, end_date: form.end_date || null })
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-semibold text-slate-100 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-400" /> Nuevo Sprint</h3>
          <button onClick={onClose} className="btn-ghost p-1 rounded"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Nombre *</label>
            <input className="input w-full" placeholder="ej. Sprint 1" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Objetivo</label>
            <textarea className="input w-full h-16 resize-none" placeholder="¿Qué se quiere lograr en este sprint?" value={form.goal} onChange={e => set('goal', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha inicio</label>
              <input type="date" className="input w-full" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="label">Fecha fin</label>
              <input type="date" className="input w-full" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando…' : 'Crear sprint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'tablero', label: 'Tablero' },
  { id: 'backlog', label: 'Backlog' },
  { id: 'epicas', label: 'Épicas' },
  { id: 'equipo', label: 'Equipo' },
]

export default function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const isLeaderOrAdmin = user?.role === 'admin' || user?.role === 'leader' || user?.role === 'project_leader'

  const [activeTab, setActiveTab] = useState('tablero')
  const [selectedTask, setSelectedTask] = useState(null)
  const [showCreateTask, setShowCreateTask] = useState(false)
  const [showCreateEpic, setShowCreateEpic] = useState(false)
  const [showCreateSprint, setShowCreateSprint] = useState(false)
  const [createTaskSprintId, setCreateTaskSprintId] = useState(null)
  const [expandedEpics, setExpandedEpics] = useState({})
  const [quickAddSprint, setQuickAddSprint] = useState(null)
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [showConfirm, setShowConfirm] = useState(null) // 'delete' | 'archive' | null
  const [editingEpic, setEditingEpic] = useState(null)
  const [deletingEpicId, setDeletingEpicId] = useState(null)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsAPI.get(id).then(r => r.data),
    enabled: !!id,
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ['project-tasks', id],
    queryFn: () => tasksAPI.list({ project_id: id, limit: 200 }).then(r => r.data?.items || r.data || []),
    enabled: !!id,
  })

  const { data: statuses = [] } = useQuery({
    queryKey: ['task-statuses'],
    queryFn: () => adminAPI.taskStatuses().then(r => r.data?.items || r.data || []),
  })

  const { data: priorities = [] } = useQuery({
    queryKey: ['priorities'],
    queryFn: () => adminAPI.priorities().then(r => r.data?.items || r.data || []),
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users-active'],
    queryFn: () => usersAPI.list({ is_active: true, limit: 100 }).then(r => r.data?.items || r.data || []),
  })

  const { data: epics = [] } = useQuery({
    queryKey: ['project-epics', id],
    queryFn: () => epicsAPI.list({ project_id: id }).then(r => r.data?.items || r.data || []),
    enabled: !!id,
  })

  const { data: stories = [] } = useQuery({
    queryKey: ['project-stories', id],
    queryFn: () => storiesAPI.list({ project_id: id }).then(r => r.data?.items || r.data || []),
    enabled: !!id,
  })

  const { data: sprints = [] } = useQuery({
    queryKey: ['project-sprints', id],
    queryFn: () => sprintsAPI.list(id).then(r => r.data?.items || r.data || []),
    enabled: !!id,
  })

  // ── Derived ────────────────────────────────────────────────────────────────

  const activeSprint = sprints.find(s => s.is_active && !s.is_completed)
  const sprintTasks = activeSprint ? tasks.filter(t => t.sprint_id === activeSprint.id) : []
  const backlogTasks = tasks.filter(t => !t.sprint_id)
  const completedSprintTasks = sprintTasks.filter(t => statuses.find(s => s.id === t.status_id)?.is_done_state)
  const daysLeft = activeSprint ? daysRemaining(activeSprint.end_date) : null

  // Progress
  const doneTasks = tasks.filter(t => statuses.find(s => s.id === t.status_id)?.is_done_state)
  const progress = tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0

  // Sprint mutations
  const startSprintMutation = useMutation({
    mutationFn: (spId) => sprintsAPI.update(spId, { is_active: true }),
    onSuccess: () => { qc.invalidateQueries(['project-sprints', id]); toast.success('Sprint iniciado') },
    onError: () => toast.error('Error al iniciar sprint'),
  })

  const completeSprintMutation = useMutation({
    mutationFn: (spId) => sprintsAPI.update(spId, { is_completed: true, is_active: false }),
    onSuccess: () => { qc.invalidateQueries(['project-sprints', id]); toast.success('Sprint completado') },
    onError: () => toast.error('Error al completar sprint'),
  })

  const deleteProjectMutation = useMutation({
    mutationFn: () => projectsAPI.delete(id),
    onSuccess: () => {
      toast.success('Proyecto eliminado')
      navigate('/projects')
    },
    onError: (err) => {
      const msg = err?.response?.data?.detail || err?.message || 'Error al eliminar el proyecto'
      toast.error(`Error: ${msg}`)
    },
  })

  const archiveProjectMutation = useMutation({
    mutationFn: () => projectsAPI.update(id, { status: 'cerrado' }),
    onSuccess: () => {
      qc.invalidateQueries(['project', id])
      toast.success('Proyecto archivado')
      setShowConfirm(null)
    },
    onError: (err) => {
      const msg = err?.response?.data?.detail || err?.message || 'Error al archivar el proyecto'
      toast.error(`Error: ${msg}`)
    },
  })

  const deleteEpicMutation = useMutation({
    mutationFn: (epicId) => epicsAPI.delete(epicId),
    onSuccess: () => {
      qc.invalidateQueries(['project-epics', id])
      toast.success('Épica eliminada')
      setDeletingEpicId(null)
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Error al eliminar épica'),
  })

  // Only THE project's leader (or admin) can delete/archive
  const canManageProject = project && (user?.role === 'admin' || user?.id === project?.leader_id)

  // ── Handlers ───────────────────────────────────────────────────────────────

  const openTask = (task) => setSelectedTask(task)

  // Re-fetch task detail when opening (to get latest subtasks etc)
  const handleOpenTask = async (task) => {
    try {
      const res = await tasksAPI.get(task.id)
      setSelectedTask(res.data)
    } catch {
      setSelectedTask(task)
    }
  }

  const openCreateTask = (sprintId = null) => {
    setCreateTaskSprintId(sprintId)
    setShowCreateTask(true)
  }

  if (loadingProject) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
        Proyecto no encontrado
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* ── Sticky Header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 shadow-lg">
        <div className="px-4 md:px-6 pt-4 pb-0">
          {/* Row 1: back + title + actions */}
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex items-start gap-3 min-w-0">
              <button onClick={() => navigate(-1)} className="btn-ghost p-1.5 rounded mt-0.5 flex-shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Circle className="w-3 h-3 text-indigo-400 fill-indigo-400 flex-shrink-0" />
                  <h1 className="text-xl font-bold text-slate-100 truncate">{project.name}</h1>
                  {project.status && (
                    <span className="badge bg-indigo-900/60 text-indigo-300 text-xs">
                      {project.status}
                    </span>
                  )}
                </div>
                {project.description && (
                  <p className="text-sm text-slate-400 mt-0.5 line-clamp-1">{project.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => openCreateTask()}
                className="btn-primary flex items-center gap-1.5 text-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Nueva tarea</span>
              </button>
              {canManageProject && (
                <div className="relative">
                  <button
                    className="btn-ghost p-2 rounded"
                    onClick={() => setShowSettingsMenu(v => !v)}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  {showSettingsMenu && (
                    <>
                      {/* Backdrop */}
                      <div className="fixed inset-0 z-40" onClick={() => setShowSettingsMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                        <button
                          className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                          onClick={() => { setShowSettingsMenu(false); setShowConfirm('archive') }}
                          disabled={project?.status === 'cerrado'}
                        >
                          <Archive className="w-4 h-4 text-amber-400" />
                          <span>Archivar proyecto</span>
                        </button>
                        <div className="border-t border-slate-700" />
                        <button
                          className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-400 hover:bg-red-900/30 transition-colors"
                          onClick={() => { setShowSettingsMenu(false); setShowConfirm('delete') }}
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Eliminar proyecto</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: progress + meta */}
          <div className="flex items-center gap-4 pb-3">
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <div className="flex-1 bg-slate-800 rounded-full h-1.5 max-w-xs">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 flex-shrink-0">{progress}%</span>
            </div>
            {/* Members avatars */}
            <div className="flex items-center -space-x-2">
              {project.leader && (
                <AvatarCircle
                  name={project.leader.full_name || project.leader_name}
                  avatarUrl={project.leader?.avatar_url}
                  size={7}
                  className="ring-2 ring-slate-900"
                />
              )}
              {project.members?.slice(0, 4).map((m, i) => (
                <AvatarCircle
                  key={m.id || i}
                  name={m.full_name}
                  avatarUrl={m.avatar_url}
                  size={7}
                  className="ring-2 ring-slate-900"
                />
              ))}
              {(project.members?.length ?? 0) > 4 && (
                <div className="w-7 h-7 rounded-full bg-slate-700 ring-2 ring-slate-900 flex items-center justify-center text-xs text-slate-400">
                  +{project.members.length - 4}
                </div>
              )}
            </div>
            {project.due_date && (
              <div className={clsx('flex items-center gap-1 text-xs flex-shrink-0', isOverdue(project.due_date) ? 'text-red-400' : 'text-slate-400')}>
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(project.due_date)}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0 border-b border-slate-800 -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">

        {/* ═══ TABLERO TAB ══════════════════════════════════════════════════ */}
        {activeTab === 'tablero' && (
          <div className="p-4 md:p-6">
            {/* Sprint Banner */}
            {activeSprint && (
              <div className="mb-5 card flex items-center gap-3 flex-wrap bg-gradient-to-r from-indigo-900/30 to-slate-800 border-indigo-700/50">
                <span className="text-base">🏃</span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-slate-100">Sprint: </span>
                  <span className="text-sm text-indigo-300">&ldquo;{activeSprint.name}&rdquo;</span>
                  {daysLeft !== null && (
                    <span className="text-sm text-slate-400 ml-2">
                      · {daysLeft > 0 ? `${daysLeft} días restantes` : daysLeft === 0 ? 'Vence hoy' : `${Math.abs(daysLeft)} días vencido`}
                    </span>
                  )}
                  <span className="text-sm text-slate-400 ml-2">
                    · {completedSprintTasks.length}/{sprintTasks.length} tareas completadas
                  </span>
                </div>
                {isLeaderOrAdmin && (
                  <button
                    onClick={() => completeSprintMutation.mutate(activeSprint.id)}
                    className="btn-secondary text-xs flex items-center gap-1"
                    disabled={completeSprintMutation.isPending}
                  >
                    <StopCircle className="w-3.5 h-3.5" />
                    Completar sprint
                  </button>
                )}
              </div>
            )}

            {/* Kanban columns */}
            <div className="flex gap-4 overflow-x-auto pb-6">
              {statuses.map(status => {
                const colTasks = tasks.filter(t => t.status_id === status.id)
                return (
                  <div key={status.id} className="flex-shrink-0 w-72 flex flex-col">
                    {/* Column header */}
                    <div className="flex items-center gap-2 mb-3 px-1">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: status.color }} />
                      <span className="text-sm font-semibold text-slate-300 flex-1 truncate">{status.name}</span>
                      <span className="badge bg-slate-800 text-slate-500 text-xs">{colTasks.length}</span>
                    </div>

                    {/* Cards */}
                    <div className="space-y-2 flex-1 min-h-16">
                      {colTasks.map(task => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          epics={epics}
                          onClick={handleOpenTask}
                        />
                      ))}
                    </div>

                    {/* Quick add */}
                    <button
                      onClick={() => openCreateTask(activeSprint?.id || null)}
                      className="mt-3 w-full flex items-center gap-1.5 px-3 py-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors text-sm border border-dashed border-slate-800 hover:border-slate-600"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar tarea
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══ BACKLOG TAB ══════════════════════════════════════════════════ */}
        {activeTab === 'backlog' && (
          <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
            {/* Sprint management header */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Sprints</h2>
              {isLeaderOrAdmin && (
                <button
                  onClick={() => setShowCreateSprint(true)}
                  className="btn-secondary flex items-center gap-1.5 text-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Crear sprint
                </button>
              )}
            </div>

            {/* Sprint cards */}
            {sprints.length > 0 && (
              <div className="space-y-3">
                {sprints.map(sprint => {
                  const spTasks = tasks.filter(t => t.sprint_id === sprint.id)
                  const spDone = spTasks.filter(t => statuses.find(s => s.id === t.status_id)?.is_done_state)
                  const isActive = sprint.is_active && !sprint.is_completed
                  const isCompleted = sprint.is_completed

                  return (
                    <div key={sprint.id} className={clsx('card', isActive && 'border-indigo-700/50')}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={clsx(
                              'w-2 h-2 rounded-full flex-shrink-0',
                              isActive ? 'bg-indigo-400 animate-pulse' : isCompleted ? 'bg-emerald-500' : 'bg-slate-600'
                            )} />
                            <span className="font-semibold text-slate-100">{sprint.name}</span>
                            {isActive && <span className="badge bg-indigo-900/60 text-indigo-300 text-xs">Activo</span>}
                            {isCompleted && <span className="badge bg-emerald-900/50 text-emerald-300 text-xs">Completado</span>}
                          </div>
                          {sprint.goal && <p className="text-xs text-slate-400 mt-0.5 ml-4">{sprint.goal}</p>}
                          <div className="flex items-center gap-3 mt-1 ml-4 text-xs text-slate-500">
                            {sprint.start_date && <span><Calendar className="w-3 h-3 inline mr-0.5" />{formatDate(sprint.start_date)}</span>}
                            {sprint.end_date && <span>→ {formatDate(sprint.end_date)}</span>}
                            <span>{spTasks.length} tareas · {spDone.length} completadas</span>
                          </div>
                        </div>
                        {isLeaderOrAdmin && !isActive && !isCompleted && (
                          <button
                            onClick={() => startSprintMutation.mutate(sprint.id)}
                            className="btn-primary text-xs flex items-center gap-1"
                            disabled={startSprintMutation.isPending || !!activeSprint}
                          >
                            <Play className="w-3 h-3" />
                            Iniciar
                          </button>
                        )}
                        {isLeaderOrAdmin && isActive && (
                          <button
                            onClick={() => completeSprintMutation.mutate(sprint.id)}
                            className="btn-secondary text-xs flex items-center gap-1"
                            disabled={completeSprintMutation.isPending}
                          >
                            <StopCircle className="w-3 h-3" />
                            Completar
                          </button>
                        )}
                      </div>

                      {/* Sprint tasks list */}
                      {spTasks.length > 0 && (
                        <div className="mt-3 border-t border-slate-800 pt-3 space-y-0.5">
                          {spTasks.map(task => (
                            <BacklogRow key={task.id} task={task} epics={epics} statuses={statuses} onClick={handleOpenTask} />
                          ))}
                        </div>
                      )}

                      {/* Add to sprint */}
                      {!isCompleted && (
                        <button
                          onClick={() => openCreateTask(sprint.id)}
                          className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Agregar tarea al sprint
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Backlog section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                  Backlog <span className="text-slate-600 normal-case font-normal">({backlogTasks.length} tareas)</span>
                </h2>
                <button
                  onClick={() => openCreateTask(null)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar
                </button>
              </div>
              {backlogTasks.length === 0 ? (
                <div className="card flex flex-col items-center py-10 text-slate-500">
                  <BookOpen className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">El backlog está vacío</p>
                  <button onClick={() => openCreateTask(null)} className="mt-3 btn-secondary text-xs flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Nueva tarea
                  </button>
                </div>
              ) : (
                <div className="card divide-y divide-slate-800/50 py-0 px-0 overflow-hidden">
                  {backlogTasks.map(task => (
                    <div key={task.id} className="px-2">
                      <BacklogRow task={task} epics={epics} statuses={statuses} onClick={handleOpenTask} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ ÉPICAS TAB ═══════════════════════════════════════════════════ */}
        {activeTab === 'epicas' && (
          <div className="p-4 md:p-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Épicas del Proyecto</h2>
              {isLeaderOrAdmin && (
                <button
                  onClick={() => setShowCreateEpic(true)}
                  className="btn-primary flex items-center gap-1.5 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Nueva épica
                </button>
              )}
            </div>

            {epics.length === 0 ? (
              <div className="card flex flex-col items-center py-14 text-slate-500">
                <Layers className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm font-medium mb-1">Sin épicas todavía</p>
                <p className="text-xs text-slate-600 mb-4">Las épicas agrupan historias y funcionalidades relacionadas</p>
                {isLeaderOrAdmin && (
                  <button onClick={() => setShowCreateEpic(true)} className="btn-primary text-sm flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Crear primera épica
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {epics.map(epic => {
                  const epicStories = stories.filter(s => s.epic_id === epic.id)
                  const isExpanded = expandedEpics[epic.id] !== false // default expanded
                  const owner = users.find(u => u.id === epic.owner_id)

                  return (
                    <div key={epic.id} className="card py-0 px-0 overflow-hidden">
                      {/* Epic header */}
                      <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-800/50 transition-colors group/epic">
                        <div
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                          onClick={() => setExpandedEpics(e => ({ ...e, [epic.id]: !isExpanded }))}
                        >
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                            : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          }
                          <div className="w-2.5 h-2.5 rounded-full bg-violet-500 flex-shrink-0" />
                          <span className="flex-1 font-semibold text-slate-100 truncate">{epic.title}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {epic.status && (
                            <span className="badge bg-slate-700 text-slate-300 text-xs">{epic.status}</span>
                          )}
                          {owner && (
                            <AvatarCircle name={owner.full_name} size={6} className="ring-1 ring-slate-700" />
                          )}
                          <span className="text-xs text-slate-500">{epicStories.length} historias</span>
                          {isLeaderOrAdmin && (
                            <div className="flex items-center gap-1 opacity-0 group-hover/epic:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingEpic(epic) }}
                                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-violet-400 transition-colors"
                                title="Editar épica"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setDeletingEpicId(epic.id) }}
                                className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                                title="Eliminar épica"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Stories */}
                      {isExpanded && (
                        <div className="border-t border-slate-800">
                          {epicStories.length === 0 && (
                            <p className="text-xs text-slate-600 px-10 py-3">Sin historias en esta épica</p>
                          )}
                          {epicStories.map(story => {
                            const storyAssignee = users.find(u => u.id === story.assignee_id)
                            return (
                              <div key={story.id} className="flex items-center gap-3 px-10 py-2.5 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                                <BookOpen className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                                <span className="flex-1 text-sm text-slate-200 truncate">{story.title}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {story.status && (
                                    <span className="badge bg-slate-700 text-slate-400 text-xs">{story.status}</span>
                                  )}
                                  {story.story_points != null && (
                                    <span className="text-xs text-slate-500 font-bold">{story.story_points}sp</span>
                                  )}
                                  {storyAssignee && (
                                    <AvatarCircle name={storyAssignee.full_name} size={5} />
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          {/* Add story */}
                          <button
                            onClick={() => {
                              const title = window.prompt('Título de la historia:')
                              if (title?.trim()) {
                                epicsAPI.createStory(epic.id, { title, project_id: id })
                                  .then(() => { qc.invalidateQueries(['project-stories', id]); toast.success('Historia creada') })
                                  .catch(() => toast.error('Error al crear historia'))
                              }
                            }}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-400 transition-colors px-10 py-2.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Agregar historia
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ EQUIPO TAB ═══════════════════════════════════════════════════ */}
        {activeTab === 'equipo' && (
          <div className="p-4 md:p-6 max-w-4xl mx-auto">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">Equipo del Proyecto</h2>

            {/* Collect all member IDs */}
            {(() => {
              const memberIds = new Set()
              if (project.leader_id) memberIds.add(project.leader_id)
              project.members?.forEach(m => memberIds.add(m.id))

              const teamMembers = users.filter(u => memberIds.has(u.id))

              if (teamMembers.length === 0) {
                return (
                  <div className="card flex flex-col items-center py-12 text-slate-500">
                    <Users className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">Sin miembros registrados</p>
                  </div>
                )
              }

              return (
                <div className="space-y-3">
                  {teamMembers.map(member => {
                    const memberTasks = tasks.filter(t => t.assignee?.id === member.id)
                    const inProgressTasks = memberTasks.filter(t => !statuses.find(s => s.id === t.status_id)?.is_done_state)
                    const overdueTasks = memberTasks.filter(t => isOverdue(t.due_date) && !statuses.find(s => s.id === t.status_id)?.is_done_state)
                    const isLeader = member.id === project.leader_id

                    return (
                      <div key={member.id} className="card">
                        {/* Member header */}
                        <div className="flex items-center gap-3 mb-3">
                          <AvatarCircle name={member.full_name} avatarUrl={member.avatar_url} size={10} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-100">{member.full_name}</span>
                              {isLeader && <span className="badge bg-amber-900/50 text-amber-300 text-xs">Líder</span>}
                              {member.main_business && (
                                <span className="text-xs text-slate-500">{member.main_business}</span>
                              )}
                            </div>
                            {member.email && <p className="text-xs text-slate-500 mt-0.5">{member.email}</p>}
                          </div>
                          {/* Stats */}
                          <div className="flex items-center gap-4 flex-shrink-0">
                            <div className="text-center">
                              <p className="text-lg font-bold text-slate-100">{memberTasks.length}</p>
                              <p className="text-xs text-slate-500">tareas</p>
                            </div>
                            <div className="text-center">
                              <p className="text-lg font-bold text-indigo-400">{inProgressTasks.length}</p>
                              <p className="text-xs text-slate-500">en progreso</p>
                            </div>
                            <div className="text-center">
                              <p className={clsx('text-lg font-bold', overdueTasks.length > 0 ? 'text-red-400' : 'text-slate-600')}>
                                {overdueTasks.length}
                              </p>
                              <p className="text-xs text-slate-500">vencidas</p>
                            </div>
                          </div>
                        </div>

                        {/* Member tasks */}
                        {memberTasks.length > 0 && (
                          <div className="border-t border-slate-800 pt-3 flex flex-wrap gap-1.5">
                            {memberTasks.slice(0, 8).map(task => {
                              const st = statuses.find(s => s.id === task.status_id)
                              const isDone = st?.is_done_state
                              return (
                                <button
                                  key={task.id}
                                  onClick={() => handleOpenTask(task)}
                                  className={clsx(
                                    'text-xs px-2 py-1 rounded transition-colors max-w-[200px] truncate',
                                    isDone
                                      ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50'
                                      : isOverdue(task.due_date)
                                        ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  )}
                                >
                                  {task.task_number} · {task.title}
                                </button>
                              )
                            })}
                            {memberTasks.length > 8 && (
                              <span className="text-xs text-slate-500 px-2 py-1">+{memberTasks.length - 8} más</span>
                            )}
                          </div>
                        )}
                        {memberTasks.length === 0 && (
                          <p className="text-xs text-slate-600 border-t border-slate-800 pt-3">Sin tareas asignadas</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {showCreateTask && (
        <CreateTaskModal
          projectId={id}
          onClose={() => { setShowCreateTask(false); setCreateTaskSprintId(null) }}
          statuses={statuses}
          priorities={priorities}
          users={users}
          epics={epics}
          sprints={sprints}
          defaultSprintId={createTaskSprintId}
        />
      )}

      {showCreateEpic && (
        <CreateEpicModal
          projectId={id}
          onClose={() => setShowCreateEpic(false)}
          users={users}
          priorities={priorities}
        />
      )}

      {editingEpic && (
        <EditEpicModal
          epic={editingEpic}
          projectId={id}
          onClose={() => setEditingEpic(null)}
          users={users}
        />
      )}

      {deletingEpicId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-900/50 rounded-xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
              <h3 className="font-semibold text-slate-100">¿Eliminar épica?</h3>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              Se eliminarán también todas las historias asociadas a esta épica. Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingEpicId(null)} className="btn-secondary">Cancelar</button>
              <button
                onClick={() => deleteEpicMutation.mutate(deletingEpicId)}
                disabled={deleteEpicMutation.isPending}
                className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteEpicMutation.isPending ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateSprint && (
        <CreateSprintModal
          projectId={id}
          onClose={() => setShowCreateSprint(false)}
        />
      )}

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          statuses={statuses}
          priorities={priorities}
          users={users}
          epics={epics}
          sprints={sprints}
          projectId={id}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {/* ── Confirm Delete / Archive Modal ───────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6">
            {showConfirm === 'delete' ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center flex-shrink-0">
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">Eliminar proyecto</h3>
                    <p className="text-xs text-slate-400">Esta acción no se puede deshacer</p>
                  </div>
                </div>
                <p className="text-sm text-slate-300 mb-2">
                  ¿Estás seguro que deseas eliminar el proyecto <span className="font-semibold text-white">&ldquo;{project.name}&rdquo;</span>?
                </p>
                <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2 mb-5">
                  ⚠ Se eliminarán permanentemente todos los datos asociados (tareas, sprints, épicas).
                </p>
                <div className="flex gap-3">
                  <button
                    className="flex-1 btn-secondary"
                    onClick={() => setShowConfirm(null)}
                    disabled={deleteProjectMutation.isPending}
                  >
                    Cancelar
                  </button>
                  <button
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                    onClick={() => deleteProjectMutation.mutate()}
                    disabled={deleteProjectMutation.isPending}
                  >
                    {deleteProjectMutation.isPending ? 'Eliminando…' : 'Sí, eliminar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                    <Archive className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">Archivar proyecto</h3>
                    <p className="text-xs text-slate-400">El proyecto quedará como cerrado</p>
                  </div>
                </div>
                <p className="text-sm text-slate-300 mb-5">
                  ¿Archivar el proyecto <span className="font-semibold text-white">&ldquo;{project.name}&rdquo;</span>? Se marcará como <span className="text-amber-400 font-medium">cerrado</span> y ya no aparecerá en los proyectos activos.
                </p>
                <div className="flex gap-3">
                  <button
                    className="flex-1 btn-secondary"
                    onClick={() => setShowConfirm(null)}
                    disabled={archiveProjectMutation.isPending}
                  >
                    Cancelar
                  </button>
                  <button
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                    onClick={() => archiveProjectMutation.mutate()}
                    disabled={archiveProjectMutation.isPending}
                  >
                    {archiveProjectMutation.isPending ? 'Archivando…' : 'Sí, archivar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
