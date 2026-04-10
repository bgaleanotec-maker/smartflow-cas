import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Check, Plus, Trash2, MessageSquare, Clock, User, Calendar,
  Tag, Bell, Link2, ChevronDown, Send, Loader2, AlertCircle, Mic,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { bpAPI, usersAPI, voiceAPI } from '../../../services/api'
import { useAuthStore } from '../../../stores/authStore'

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  critica: { label: 'Crítica', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  alta: { label: 'Alta', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  media: { label: 'Media', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  baja: { label: 'Baja', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
}

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  en_progreso: { label: 'En Progreso', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  completada: { label: 'Completada', color: 'bg-green-500/15 text-green-400 border-green-500/30' },
  cancelada: { label: 'Cancelada', color: 'bg-slate-600/15 text-slate-500 border-slate-600/30' },
  vencida: { label: 'Vencida', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
}

const REMINDER_OPTIONS = [1, 2, 3, 5, 7, 14]

const PRIORITY_COLORS_MAP = {
  critica: '#ef4444',
  alta: '#f97316',
  media: '#eab308',
  baja: '#64748b',
}

function Avatar({ name, size = 'sm' }) {
  const initials = (name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const colors = ['bg-indigo-500', 'bg-violet-500', 'bg-cyan-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600']
  const idx = (name || '').charCodeAt(0) % colors.length
  return (
    <div className={clsx(
      'rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0',
      colors[idx],
      size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm',
    )}>
      {initials}
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'))
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Section ──────────────────────────────────────────────────────────────────

function Section({ title, badge, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-slate-700/50 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-slate-400" />}
          <span className="text-sm font-semibold text-slate-300">{title}</span>
          {badge != null && (
            <span className="badge text-xs bg-brand-500/15 text-brand-400 border border-brand-500/30">{badge}</span>
          )}
        </div>
        <ChevronDown size={14} className={clsx('text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  )
}

// ─── Checklist Section ────────────────────────────────────────────────────────

function ChecklistSection({ bpId, activity, onProgressUpdate }) {
  const qc = useQueryClient()
  const [newItem, setNewItem] = useState('')
  const inputRef = useRef(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['bp-checklist', bpId, activity.id],
    queryFn: () => bpAPI.getChecklist(bpId, activity.id).then((r) => r.data),
  })

  const addMutation = useMutation({
    mutationFn: (data) => bpAPI.addChecklistItem(bpId, activity.id, data),
    onSuccess: () => {
      qc.invalidateQueries(['bp-checklist', bpId, activity.id])
      qc.invalidateQueries(['bp', String(bpId)])
      setNewItem('')
      onProgressUpdate?.()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ itemId, data }) => bpAPI.updateChecklistItem(bpId, activity.id, itemId, data),
    onSuccess: () => {
      qc.invalidateQueries(['bp-checklist', bpId, activity.id])
      qc.invalidateQueries(['bp', String(bpId)])
      onProgressUpdate?.()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (itemId) => bpAPI.deleteChecklistItem(bpId, activity.id, itemId),
    onSuccess: () => {
      qc.invalidateQueries(['bp-checklist', bpId, activity.id])
      qc.invalidateQueries(['bp', String(bpId)])
      onProgressUpdate?.()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const done = items.filter((i) => i.is_completed).length
  const total = items.length

  const handleAdd = () => {
    if (!newItem.trim()) return
    addMutation.mutate({ title: newItem.trim(), order_index: total })
  }

  if (isLoading) return <div className="py-3 flex justify-center"><Loader2 size={16} className="animate-spin text-slate-500" /></div>

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      {total > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-300"
              style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }}
            />
          </div>
          <span className="text-xs text-slate-400 flex-shrink-0">{done}/{total}</span>
        </div>
      )}

      {/* Items */}
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-2 group">
          <button
            onClick={() => toggleMutation.mutate({ itemId: item.id, data: { is_completed: !item.is_completed } })}
            className={clsx(
              'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all',
              item.is_completed
                ? 'bg-green-500 border-green-500 text-white'
                : 'border-slate-600 hover:border-brand-500',
            )}
          >
            {item.is_completed && <Check size={10} />}
          </button>
          <span className={clsx(
            'text-sm flex-1 leading-snug',
            item.is_completed ? 'line-through text-slate-500' : 'text-slate-300',
          )}>
            {item.title}
          </span>
          <button
            onClick={() => deleteMutation.mutate(item.id)}
            className="opacity-0 group-hover:opacity-100 p-1 text-slate-600 hover:text-red-400 transition-all"
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {/* Add item */}
      <div className="flex gap-2 mt-2">
        <input
          ref={inputRef}
          type="text"
          className="input flex-1 py-1.5 text-sm"
          placeholder="Agregar ítem..."
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
        />
        <button
          onClick={handleAdd}
          disabled={!newItem.trim() || addMutation.isPending}
          className="btn-primary py-1.5 px-3 text-sm disabled:opacity-50"
        >
          {addMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        </button>
      </div>
    </div>
  )
}

// ─── Comments Section ─────────────────────────────────────────────────────────

function CommentsSection({ bpId, activity }) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [newComment, setNewComment] = useState('')

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['bp-comments', bpId, activity.id],
    queryFn: () => bpAPI.getComments(bpId, activity.id).then((r) => r.data),
  })

  const addMutation = useMutation({
    mutationFn: (data) => bpAPI.addComment(bpId, activity.id, data),
    onSuccess: () => {
      qc.invalidateQueries(['bp-comments', bpId, activity.id])
      qc.invalidateQueries(['bp', String(bpId)])
      setNewComment('')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (commentId) => bpAPI.deleteComment(bpId, activity.id, commentId),
    onSuccess: () => {
      qc.invalidateQueries(['bp-comments', bpId, activity.id])
      qc.invalidateQueries(['bp', String(bpId)])
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const handleSend = () => {
    if (!newComment.trim()) return
    addMutation.mutate({ content: newComment.trim() })
  }

  if (isLoading) return <div className="py-3 flex justify-center"><Loader2 size={16} className="animate-spin text-slate-500" /></div>

  return (
    <div className="space-y-3">
      {comments.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-3">Sin comentarios aún. ¡Sé el primero!</p>
      )}
      {comments.map((c) => (
        <div key={c.id} className="flex gap-2.5 group">
          <Avatar name={c.author_name} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-slate-300">{c.author_name || 'Usuario'}</span>
              <span className="text-xs text-slate-600">{formatDateTime(c.created_at)}</span>
              {(c.author_id === user?.id || ['admin', 'leader'].includes(user?.role)) && (
                <button
                  onClick={() => { if (window.confirm('¿Eliminar comentario?')) deleteMutation.mutate(c.id) }}
                  className="opacity-0 group-hover:opacity-100 ml-auto p-0.5 text-slate-600 hover:text-red-400 transition-all"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
            <p className="text-sm text-slate-300 leading-relaxed bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-700/50">
              {c.content}
            </p>
          </div>
        </div>
      ))}

      {/* Add comment */}
      <div className="flex gap-2 mt-2">
        <Avatar name={user?.full_name} size="sm" />
        <div className="flex-1 flex gap-2">
          <textarea
            className="input flex-1 py-2 text-sm resize-none"
            rows={2}
            placeholder="Escribe un comentario..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleSend() }}
          />
          <button
            onClick={handleSend}
            disabled={!newComment.trim() || addMutation.isPending}
            className="btn-primary px-3 self-end disabled:opacity-50"
            title="Ctrl+Enter para enviar"
          >
            {addMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Transcriptions Section ───────────────────────────────────────────────────

function TranscriptionsSection({ activityId }) {
  const [expanded, setExpanded] = useState(null)
  const { data: meetings = [], isLoading } = useQuery({
    queryKey: ['voice-meetings-activity', activityId],
    queryFn: () => voiceAPI.meetingsByActivity(activityId).then(r => r.data),
    enabled: !!activityId,
  })

  if (isLoading) return <div className="py-3 flex justify-center"><Loader2 size={16} className="animate-spin text-slate-500" /></div>
  if (meetings.length === 0) return (
    <p className="text-xs text-slate-500 text-center py-3">
      No hay transcripciones vinculadas. Graba una reunión con ARIA y vincúlala a esta actividad.
    </p>
  )

  return (
    <div className="space-y-2">
      {meetings.map(m => (
        <div key={m.id} className="bg-slate-800/40 rounded-lg border border-slate-700/40 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-800/60 transition-colors"
            onClick={() => setExpanded(expanded === m.id ? null : m.id)}
          >
            <div className="flex-1 min-w-0 mr-2">
              <p className="text-xs font-semibold text-slate-200 truncate">{m.title}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {m.started_at ? new Date(m.started_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                {m.duration_seconds ? ` · ${Math.round(m.duration_seconds / 60)}min` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${
                m.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : m.status === 'recording' ? 'bg-red-500/15 text-red-400 border-red-500/30'
                : 'bg-slate-600/20 text-slate-400 border-slate-600/30'
              }`}>{m.status === 'completed' ? '✓ Lista' : m.status === 'recording' ? '⏺ Grabando' : m.status}</span>
              <ChevronDown size={12} className={clsx('text-slate-500 transition-transform', expanded === m.id && 'rotate-180')} />
            </div>
          </button>
          {expanded === m.id && (
            <div className="px-3 pb-3 border-t border-slate-700/30 pt-2 space-y-2">
              {m.ai_summary && (
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 rounded-lg p-2.5">
                  <span className="text-purple-400 font-semibold block mb-1">Resumen IA</span>
                  {m.ai_summary}
                </p>
              )}
              {m.ai_action_items?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5">Acciones</p>
                  {m.ai_action_items.map((item, i) => (
                    <div key={i} className="flex gap-1.5 text-xs text-slate-300 mb-1">
                      <span className="text-amber-500 flex-shrink-0">→</span>
                      {item.text || item}
                    </div>
                  ))}
                </div>
              )}
              {m.full_transcript && (
                <details className="text-xs">
                  <summary className="text-slate-500 cursor-pointer hover:text-slate-400">Ver transcripción completa</summary>
                  <pre className="mt-1 text-slate-400 whitespace-pre-wrap font-sans leading-relaxed text-[11px] max-h-40 overflow-y-auto bg-slate-900/40 rounded p-2">
                    {m.full_transcript}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export default function BPActivityDetailDrawer({ bpId, activity, onClose, onUpdated }) {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const canWrite = ['admin', 'leader'].includes(user?.role)
  const [form, setForm] = useState({})
  const [newTag, setNewTag] = useState('')
  const [hasChanges, setHasChanges] = useState(false)

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersAPI.list({ limit: 100 }).then((r) => r.data),
  })

  useEffect(() => {
    if (activity) {
      setForm({
        title: activity.title || '',
        description: activity.description || '',
        status: activity.status || 'pendiente',
        priority: activity.priority || 'media',
        category: activity.category || 'operativo',
        owner_id: activity.owner_id || '',
        due_date: activity.due_date || '',
        start_date: activity.start_date || '',
        estimated_hours: activity.estimated_hours || '',
        actual_hours: activity.actual_hours || '',
        notes: activity.notes || '',
        reminder_days_before: activity.reminder_days_before || 3,
        tags: activity.tags ? [...(activity.tags.list || [])] : [],
        progress: activity.progress || 0,
      })
      setHasChanges(false)
    }
  }, [activity])

  const updateMutation = useMutation({
    mutationFn: (data) => bpAPI.updateActivity(bpId, activity.id, data),
    onSuccess: () => {
      qc.invalidateQueries(['bp', String(bpId)])
      toast.success('Actividad actualizada')
      setHasChanges(false)
      onUpdated?.()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => bpAPI.deleteActivity(bpId, activity.id),
    onSuccess: () => {
      qc.invalidateQueries(['bp', String(bpId)])
      toast.success('Actividad eliminada')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const handleSave = () => {
    const payload = { ...form }
    if (payload.owner_id === '') delete payload.owner_id
    else payload.owner_id = parseInt(payload.owner_id)
    if (!payload.due_date) delete payload.due_date
    if (!payload.start_date) delete payload.start_date
    if (payload.estimated_hours === '') payload.estimated_hours = null
    else if (payload.estimated_hours !== null) payload.estimated_hours = parseFloat(payload.estimated_hours)
    if (payload.actual_hours === '') payload.actual_hours = null
    else if (payload.actual_hours !== null) payload.actual_hours = parseFloat(payload.actual_hours)
    // Store tags as { list: [...] }
    payload.tags = form.tags?.length > 0 ? { list: form.tags } : null
    updateMutation.mutate(payload)
  }

  const handleChange = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setHasChanges(true)
  }

  const handleAddTag = () => {
    if (!newTag.trim() || form.tags?.includes(newTag.trim())) return
    handleChange('tags', [...(form.tags || []), newTag.trim()])
    setNewTag('')
  }

  const handleRemoveTag = (tag) => {
    handleChange('tags', (form.tags || []).filter((t) => t !== tag))
  }

  if (!activity) return null

  const priorityCfg = PRIORITY_CONFIG[form.status] || PRIORITY_CONFIG.media
  const statusCfg = STATUS_CONFIG[form.status] || STATUS_CONFIG.pendiente

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-slate-900 shadow-2xl z-50 flex flex-col overflow-hidden border-l border-slate-700/50">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-slate-700/50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              {canWrite ? (
                <input
                  type="text"
                  className="w-full bg-transparent text-slate-100 font-semibold text-base leading-snug border-b border-transparent hover:border-slate-600 focus:border-brand-500 outline-none transition-colors pb-0.5"
                  value={form.title || ''}
                  onChange={(e) => handleChange('title', e.target.value)}
                />
              ) : (
                <h2 className="text-slate-100 font-semibold text-base leading-snug">{form.title}</h2>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {canWrite ? (
                  <select
                    className="input py-0.5 px-2 text-xs"
                    value={form.status || 'pendiente'}
                    onChange={(e) => handleChange('status', e.target.value)}
                  >
                    {Object.entries(STATUS_CONFIG).map(([v, cfg]) => (
                      <option key={v} value={v}>{cfg.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className={clsx('badge text-xs border', statusCfg.color)}>{statusCfg.label}</span>
                )}
                {canWrite ? (
                  <select
                    className="input py-0.5 px-2 text-xs"
                    value={form.priority || 'media'}
                    onChange={(e) => handleChange('priority', e.target.value)}
                  >
                    {Object.entries(PRIORITY_CONFIG).map(([v, cfg]) => (
                      <option key={v} value={v}>{cfg.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className={clsx('badge text-xs border', PRIORITY_CONFIG[form.priority]?.color)}>{PRIORITY_CONFIG[form.priority]?.label}</span>
                )}
                {activity.is_milestone && (
                  <span className="badge text-xs bg-amber-500/15 text-amber-400 border border-amber-500/30">◆ Hito</span>
                )}
                {activity.depends_on_id && (
                  <span className="badge text-xs bg-slate-600/20 text-slate-400 border border-slate-600/30 flex items-center gap-1">
                    <Link2 size={10} /> Dependiente
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Meta row */}
          <div className="border-b border-slate-700/50 px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs mb-1">Responsable</label>
                {canWrite ? (
                  <select
                    className="input py-1.5 text-sm"
                    value={form.owner_id || ''}
                    onChange={(e) => handleChange('owner_id', e.target.value)}
                  >
                    <option value="">Sin asignar</option>
                    {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5 text-sm text-slate-300">
                    <User size={13} className="text-slate-500" />
                    {activity.owner_name || 'Sin asignar'}
                  </div>
                )}
              </div>
              <div>
                <label className="label text-xs mb-1">Fecha límite</label>
                {canWrite ? (
                  <input
                    type="date"
                    className="input py-1.5 text-sm"
                    value={form.due_date || ''}
                    onChange={(e) => handleChange('due_date', e.target.value)}
                  />
                ) : (
                  <div className="flex items-center gap-1.5 text-sm text-slate-300">
                    <Calendar size={13} className="text-slate-500" />
                    {formatDate(activity.due_date) || '—'}
                  </div>
                )}
              </div>
              <div>
                <label className="label text-xs mb-1">Fecha inicio</label>
                {canWrite ? (
                  <input
                    type="date"
                    className="input py-1.5 text-sm"
                    value={form.start_date || ''}
                    onChange={(e) => handleChange('start_date', e.target.value)}
                  />
                ) : (
                  <div className="flex items-center gap-1.5 text-sm text-slate-300">
                    <Calendar size={13} className="text-slate-500" />
                    {formatDate(activity.start_date) || '—'}
                  </div>
                )}
              </div>
              <div>
                <label className="label text-xs mb-1">Horas (real / est.)</label>
                {canWrite ? (
                  <div className="flex gap-1">
                    <input
                      type="number"
                      className="input py-1.5 text-sm w-1/2"
                      placeholder="Real"
                      min={0}
                      step={0.5}
                      value={form.actual_hours || ''}
                      onChange={(e) => handleChange('actual_hours', e.target.value)}
                    />
                    <input
                      type="number"
                      className="input py-1.5 text-sm w-1/2"
                      placeholder="Est."
                      min={0}
                      step={0.5}
                      value={form.estimated_hours || ''}
                      onChange={(e) => handleChange('estimated_hours', e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-sm text-slate-300">
                    <Clock size={13} className="text-slate-500" />
                    {activity.actual_hours != null ? `${activity.actual_hours}h real` : '—'}
                    {activity.estimated_hours != null ? ` / ${activity.estimated_hours}h est.` : ''}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          <Section title="Descripción" defaultOpen>
            {canWrite ? (
              <textarea
                className="input w-full resize-none text-sm"
                rows={3}
                placeholder="Describe la actividad..."
                value={form.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
              />
            ) : (
              <p className="text-sm text-slate-300 leading-relaxed">
                {activity.description || <span className="text-slate-600">Sin descripción</span>}
              </p>
            )}
          </Section>

          {/* Checklist */}
          <Section
            title="Lista de verificación"
            badge={`${activity.checklist_done || 0}/${activity.checklist_total || 0}`}
            icon={Check}
            defaultOpen
          >
            <ChecklistSection
              bpId={bpId}
              activity={activity}
              onProgressUpdate={() => qc.invalidateQueries(['bp', String(bpId)])}
            />
          </Section>

          {/* Comments */}
          <Section
            title="Comentarios"
            badge={activity.comment_count || 0}
            icon={MessageSquare}
            defaultOpen={false}
          >
            <CommentsSection bpId={bpId} activity={activity} />
          </Section>

          {/* Reminder settings */}
          <Section title="Recordatorio" icon={Bell} defaultOpen={false}>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">Notificar</label>
              {canWrite ? (
                <select
                  className="input py-1.5 text-sm w-32"
                  value={form.reminder_days_before || 3}
                  onChange={(e) => handleChange('reminder_days_before', parseInt(e.target.value))}
                >
                  {REMINDER_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d} día{d !== 1 ? 's' : ''} antes</option>
                  ))}
                </select>
              ) : (
                <span className="text-sm text-slate-300">{activity.reminder_days_before || 3} días antes</span>
              )}
            </div>
          </Section>

          {/* Tags */}
          <Section title="Etiquetas" icon={Tag} defaultOpen={false}>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(form.tags || []).map((tag) => (
                <span key={tag} className="flex items-center gap-1 badge text-xs bg-brand-500/15 text-brand-400 border border-brand-500/30">
                  {tag}
                  {canWrite && (
                    <button onClick={() => handleRemoveTag(tag)} className="ml-0.5 text-brand-500 hover:text-red-400">
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
              {(form.tags || []).length === 0 && (
                <span className="text-xs text-slate-600">Sin etiquetas</span>
              )}
            </div>
            {canWrite && (
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1 py-1.5 text-sm"
                  placeholder="Nueva etiqueta..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTag() }}
                />
                <button onClick={handleAddTag} className="btn-secondary py-1.5 px-3 text-sm">
                  <Plus size={13} />
                </button>
              </div>
            )}
          </Section>

          {/* Transcriptions */}
          <Section title="Transcripciones de reuniones" icon={Mic} defaultOpen={false}>
            <TranscriptionsSection activityId={activity.id} />
          </Section>

          {/* Notes */}
          {(activity.notes || canWrite) && (
            <Section title="Notas internas" defaultOpen={false}>
              {canWrite ? (
                <textarea
                  className="input w-full resize-none text-sm"
                  rows={2}
                  placeholder="Notas internas..."
                  value={form.notes || ''}
                  onChange={(e) => handleChange('notes', e.target.value)}
                />
              ) : (
                <p className="text-sm text-slate-400 italic">{activity.notes}</p>
              )}
            </Section>
          )}
        </div>

        {/* Footer */}
        {canWrite && (
          <div className="flex-shrink-0 border-t border-slate-700/50 px-5 py-3 flex gap-2 bg-slate-900">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className={clsx(
                'btn-primary flex-1 text-sm flex items-center justify-center gap-2',
                !hasChanges && 'opacity-60',
              )}
            >
              {updateMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              Guardar cambios
            </button>
            <button
              onClick={() => { if (window.confirm('¿Eliminar esta actividad?')) deleteMutation.mutate() }}
              disabled={deleteMutation.isPending}
              className="btn-secondary text-sm text-red-400 hover:text-red-300 border-red-500/30 flex items-center gap-1.5 px-3"
            >
              {deleteMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
