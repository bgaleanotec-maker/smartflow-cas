import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import {
  BookOpen, Plus, ChevronDown, ChevronRight, AlertCircle,
  Calendar, User, Star, X, CheckCircle2, Clock, Loader2,
  MessageSquare, Flag, Layers
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { epicsAPI, storiesAPI, projectsAPI, usersAPI } from '../../services/api'

// ─── Constants ───────────────────────────────────────────────────────────────

const EPIC_STATUS_LABELS = {
  backlog: 'Backlog',
  en_progreso: 'En progreso',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

const EPIC_STATUS_COLORS = {
  backlog: 'bg-slate-700 text-slate-300',
  en_progreso: 'bg-blue-900/60 text-blue-300 border border-blue-700/40',
  completada: 'bg-green-900/60 text-green-300 border border-green-700/40',
  cancelada: 'bg-red-900/60 text-red-300 border border-red-700/40',
}

const STORY_STATUS_LABELS = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  en_revision: 'En revisión',
  completada: 'Completada',
  bloqueada: 'Bloqueada',
}

const STORY_STATUS_COLORS = {
  pendiente: 'bg-slate-700 text-slate-300',
  en_progreso: 'bg-blue-900/60 text-blue-300 border border-blue-700/40',
  en_revision: 'bg-amber-900/60 text-amber-300 border border-amber-700/40',
  completada: 'bg-green-900/60 text-green-300 border border-green-700/40',
  bloqueada: 'bg-red-900/60 text-red-300 border border-red-700/40',
}

const PRIORITY_COLORS = {
  alta: 'text-red-400',
  media: 'text-blue-400',
  baja: 'text-slate-400',
}

const PRIORITY_LABELS = { alta: 'Alta', media: 'Media', baja: 'Baja' }

const UPDATE_TYPE_CONFIG = {
  novedad:    { icon: '📝', label: 'Novedad',    color: 'text-blue-400' },
  bloqueo:    { icon: '🚫', label: 'Bloqueo',    color: 'text-red-400' },
  desbloqueo: { icon: '✅', label: 'Desbloqueo', color: 'text-green-400' },
  entrega:    { icon: '🎯', label: 'Entrega',    color: 'text-purple-400' },
  comentario: { icon: '💬', label: 'Comentario', color: 'text-slate-400' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function Badge({ children, className }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', className)}>
      {children}
    </span>
  )
}

// ─── CreateEpicModal ──────────────────────────────────────────────────────────

function CreateEpicModal({ onClose, projects, users }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: '', description: '', project_id: '', status: 'backlog',
    priority: 'media', due_date: '', owner_id: '',
  })
  const mut = useMutation({
    mutationFn: (data) => epicsAPI.create(data),
    onSuccess: () => { qc.invalidateQueries(['epics']); toast.success('Épica creada ✓'); onClose() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al crear épica'),
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-white text-lg flex items-center gap-2">
            <BookOpen size={18} className="text-brand-400" /> Nueva Épica
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Título *</label>
            <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Título de la épica" />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Descripción opcional..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Proyecto</label>
              <select className="input" value={form.project_id} onChange={e => set('project_id', e.target.value)}>
                <option value="">Sin proyecto</option>
                {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Responsable</label>
              <select className="input" value={form.owner_id} onChange={e => set('owner_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {users?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fecha límite</label>
              <input type="date" className="input" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button
            onClick={() => mut.mutate({ ...form, project_id: form.project_id || null, owner_id: form.owner_id || null, due_date: form.due_date || null })}
            disabled={!form.title || mut.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {mut.isPending && <Loader2 size={14} className="animate-spin" />}
            Crear Épica
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── CreateStoryModal ─────────────────────────────────────────────────────────

function CreateStoryModal({ epic, onClose, users }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: '', description: '', acceptance_criteria: '',
    priority: 'media', assigned_to_id: '', story_points: '',
    is_blocking: false, due_date: '',
  })
  const mut = useMutation({
    mutationFn: (data) => epicsAPI.createStory(epic.id, data),
    onSuccess: () => { qc.invalidateQueries(['epics']); toast.success('Historia creada ✓'); onClose() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al crear historia'),
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-white text-lg flex items-center gap-2">
            <Layers size={18} className="text-brand-400" /> Nueva Historia
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">Épica: <span className="text-slate-300">{epic.title}</span></p>

        <div className="space-y-4">
          <div>
            <label className="label">Título *</label>
            <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Título de la historia" />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input resize-none" rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Descripción opcional..." />
          </div>
          <div>
            <label className="label">Criterios de aceptación</label>
            <textarea className="input resize-none" rows={3} value={form.acceptance_criteria} onChange={e => set('acceptance_criteria', e.target.value)} placeholder="Como usuario, quiero... Para que..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Prioridad</label>
              <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
            <div>
              <label className="label">Story Points</label>
              <input type="number" className="input" value={form.story_points} onChange={e => set('story_points', e.target.value)} placeholder="1-13" min="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Asignado a</label>
              <select className="input" value={form.assigned_to_id} onChange={e => set('assigned_to_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {users?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fecha límite</label>
              <input type="date" className="input" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_blocking} onChange={e => set('is_blocking', e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm text-slate-300">Marcar como bloqueante</span>
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button
            onClick={() => mut.mutate({ ...form, project_id: epic.project_id, assigned_to_id: form.assigned_to_id || null, story_points: form.story_points || null, due_date: form.due_date || null })}
            disabled={!form.title || mut.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            {mut.isPending && <Loader2 size={14} className="animate-spin" />}
            Crear Historia
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── AddUpdateForm ────────────────────────────────────────────────────────────

function AddUpdateForm({ storyId, onDone }) {
  const qc = useQueryClient()
  const [content, setContent] = useState('')
  const [updateType, setUpdateType] = useState('novedad')
  const mut = useMutation({
    mutationFn: () => storiesAPI.addUpdate(storyId, { content, update_type: updateType }),
    onSuccess: () => { qc.invalidateQueries(['epics']); toast.success('Novedad publicada ✓'); setContent(''); onDone?.() },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al publicar novedad'),
  })

  return (
    <div className="mt-3 space-y-2">
      <select className="input text-xs" value={updateType} onChange={e => setUpdateType(e.target.value)}>
        {Object.entries(UPDATE_TYPE_CONFIG).map(([k, v]) => (
          <option key={k} value={k}>{v.icon} {v.label}</option>
        ))}
      </select>
      <textarea
        className="input resize-none text-sm"
        rows={2}
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Escribe la novedad o comentario..."
      />
      <button
        onClick={() => mut.mutate()}
        disabled={!content.trim() || mut.isPending}
        className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
      >
        {mut.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
        Publicar
      </button>
    </div>
  )
}

// ─── StoryCard ────────────────────────────────────────────────────────────────

function StoryCard({ story, users }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [showUpdateForm, setShowUpdateForm] = useState(false)

  const completeMut = useMutation({
    mutationFn: () => storiesAPI.update(story.id, { status: story.status === 'completada' ? 'pendiente' : 'completada' }),
    onSuccess: () => qc.invalidateQueries(['epics']),
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al actualizar historia'),
  })

  return (
    <div className={clsx('rounded-xl border transition-colors', story.status === 'bloqueada' ? 'border-red-800/50 bg-red-950/20' : 'border-slate-700/50 bg-slate-800/40')}>
      <div className="p-3">
        <div className="flex items-start gap-2">
          {/* Complete checkbox */}
          <button
            onClick={() => completeMut.mutate()}
            disabled={completeMut.isPending}
            className={clsx('mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors', story.status === 'completada' ? 'bg-green-600 border-green-600' : 'border-slate-600 hover:border-green-500')}
          >
            {story.status === 'completada' && <CheckCircle2 size={12} className="text-white" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <Badge className={STORY_STATUS_COLORS[story.status]}>
                {STORY_STATUS_LABELS[story.status]}
              </Badge>
              <span className={clsx('text-xs font-medium', PRIORITY_COLORS[story.priority])}>
                <Flag size={10} className="inline mr-0.5" />{PRIORITY_LABELS[story.priority]}
              </span>
              {story.is_blocking && (
                <Badge className="bg-red-900/60 text-red-300 border border-red-700/40">
                  🚫 Bloqueante
                </Badge>
              )}
              {story.story_points && (
                <span className="text-xs text-slate-500">{story.story_points} pts</span>
              )}
            </div>

            <p className={clsx('text-sm font-medium', story.status === 'completada' ? 'line-through text-slate-500' : 'text-slate-200')}>
              {story.title}
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500">
              {story.assigned_to && (
                <span className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded-full bg-brand-700 flex items-center justify-center text-[9px] font-bold">
                    {initials(story.assigned_to.full_name)}
                  </div>
                  {story.assigned_to.full_name.split(' ')[0]}
                </span>
              )}
              {story.due_date && (
                <span className="flex items-center gap-0.5">
                  <Calendar size={10} />
                  {story.due_date}
                </span>
              )}
              {story.updates?.length > 0 && (
                <span className="flex items-center gap-0.5">
                  <MessageSquare size={10} />
                  {story.updates.length}
                </span>
              )}
            </div>

            {/* Last update snippet */}
            {story.updates?.length > 0 && !expanded && (
              <p className="text-xs text-slate-500 mt-1.5 italic truncate">
                {UPDATE_TYPE_CONFIG[story.updates[0].update_type]?.icon} {story.updates[0].content.slice(0, 80)}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => { setShowUpdateForm(!showUpdateForm); setExpanded(true) }}
              className="text-xs px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
            >
              Novedad
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-3 pb-3">
          {story.acceptance_criteria && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-slate-400 mb-1">Criterios de aceptación</p>
              <p className="text-xs text-slate-300 whitespace-pre-line">{story.acceptance_criteria}</p>
            </div>
          )}

          {showUpdateForm && (
            <AddUpdateForm storyId={story.id} onDone={() => setShowUpdateForm(false)} />
          )}

          {/* Updates timeline */}
          {story.updates?.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-400">Historial de novedades</p>
              {story.updates.map(upd => {
                const cfg = UPDATE_TYPE_CONFIG[upd.update_type] || {}
                return (
                  <div key={upd.id} className="flex gap-2 text-xs">
                    <span className="flex-shrink-0 mt-0.5">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={clsx('font-medium', cfg.color)}>{cfg.label}</span>
                        <span className="text-slate-500">{upd.user?.full_name}</span>
                        <span className="text-slate-600 ml-auto">
                          {new Date(upd.created_at).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <p className="text-slate-300 whitespace-pre-line">{upd.content}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── EpicCard ─────────────────────────────────────────────────────────────────

function EpicCard({ epic, users }) {
  const [expanded, setExpanded] = useState(false)
  const [showCreateStory, setShowCreateStory] = useState(false)
  const qc = useQueryClient()

  const deleteMut = useMutation({
    mutationFn: () => epicsAPI.delete(epic.id),
    onSuccess: () => { qc.invalidateQueries(['epics']); toast.success('Épica eliminada'); },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al eliminar épica'),
  })

  const completedStories = epic.stories?.filter(s => s.status === 'completada').length ?? 0
  const totalStories = epic.stories?.length ?? 0
  const blockingCount = epic.stories?.filter(s => s.is_blocking || s.status === 'bloqueada').length ?? 0

  return (
    <>
      <div className="card border border-slate-700/50">
        {/* Header */}
        <div className="flex items-start gap-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 flex-shrink-0 transition-colors"
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <Badge className={EPIC_STATUS_COLORS[epic.status]}>
                {EPIC_STATUS_LABELS[epic.status]}
              </Badge>
              <span className={clsx('text-xs font-medium', PRIORITY_COLORS[epic.priority])}>
                <Flag size={10} className="inline mr-0.5" />{PRIORITY_LABELS[epic.priority]}
              </span>
              {blockingCount > 0 && (
                <Badge className="bg-red-900/60 text-red-300 border border-red-700/40">
                  🚫 {blockingCount} bloqueante{blockingCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>

            <h3 className="font-semibold text-white text-sm mb-1">{epic.title}</h3>
            {epic.description && (
              <p className="text-xs text-slate-400 mb-2 line-clamp-2">{epic.description}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {epic.owner && (
                <span className="flex items-center gap-1">
                  <div className="w-5 h-5 rounded-full bg-brand-700 flex items-center justify-center text-[9px] font-bold text-white">
                    {initials(epic.owner.full_name)}
                  </div>
                  {epic.owner.full_name.split(' ')[0]}
                </span>
              )}
              {epic.due_date && (
                <span className="flex items-center gap-0.5">
                  <Calendar size={10} />
                  {epic.due_date}
                </span>
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-0.5 hover:text-slate-300 transition-colors"
              >
                <Layers size={10} />
                {completedStories}/{totalStories} historias
              </button>
            </div>
          </div>

          <button
            onClick={() => setShowCreateStory(true)}
            className="flex-shrink-0 p-1.5 rounded-lg bg-brand-600/20 hover:bg-brand-600/40 text-brand-400 border border-brand-600/30 transition-colors"
            title="Nueva historia"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Progress bar */}
        {totalStories > 0 && (
          <div className="mt-3 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: `${(completedStories / totalStories) * 100}%` }}
            />
          </div>
        )}

        {/* Stories list */}
        {expanded && (
          <div className="mt-4 space-y-2 border-t border-slate-700/50 pt-4">
            {epic.stories?.length === 0 ? (
              <div className="text-center py-4 text-slate-500">
                <Layers size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-xs">Sin historias aún</p>
                <button
                  onClick={() => setShowCreateStory(true)}
                  className="text-xs text-brand-400 hover:underline mt-1"
                >
                  + Crear primera historia
                </button>
              </div>
            ) : (
              epic.stories.map(story => <StoryCard key={story.id} story={story} users={users} />)
            )}
          </div>
        )}
      </div>

      {showCreateStory && (
        <CreateStoryModal epic={epic} onClose={() => setShowCreateStory(false)} users={users} />
      )}
    </>
  )
}

// ─── EpicsPage ────────────────────────────────────────────────────────────────

export default function EpicsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [showCreateEpic, setShowCreateEpic] = useState(false)
  const projectFilter = searchParams.get('project_id') ? parseInt(searchParams.get('project_id')) : null

  const { data: epics, isLoading } = useQuery({
    queryKey: ['epics', projectFilter],
    queryFn: () => epicsAPI.list(projectFilter ? { project_id: projectFilter } : {}).then(r => r.data),
  })

  const { data: projects } = useQuery({
    queryKey: ['projects-list'],
    queryFn: () => projectsAPI.list().then(r => r.data),
  })

  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersAPI.list().then(r => r.data),
  })

  const handleProjectFilter = (e) => {
    const val = e.target.value
    if (val) setSearchParams({ project_id: val })
    else setSearchParams({})
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen size={22} className="text-brand-400" />
            Épicas e Historias
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {epics?.length ?? 0} épica{epics?.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="input py-1.5 text-sm"
            value={projectFilter ?? ''}
            onChange={handleProjectFilter}
          >
            <option value="">Todos los proyectos</option>
            {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={() => setShowCreateEpic(true)}
            className="btn-primary flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={16} /> Nueva Épica
          </button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 size={32} className="animate-spin" />
        </div>
      ) : epics?.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <BookOpen size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium text-slate-400">No hay épicas</p>
          <p className="text-sm mt-1">Crea la primera épica para comenzar a organizar tu trabajo</p>
          <button onClick={() => setShowCreateEpic(true)} className="btn-primary mt-4 flex items-center gap-2 mx-auto">
            <Plus size={16} /> Nueva Épica
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {epics.map(epic => <EpicCard key={epic.id} epic={epic} users={users} />)}
        </div>
      )}

      {/* Modals */}
      {showCreateEpic && (
        <CreateEpicModal
          onClose={() => setShowCreateEpic(false)}
          projects={projects}
          users={users}
        />
      )}
    </div>
  )
}
