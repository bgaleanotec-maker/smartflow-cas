/**
 * BPRecommendationsPanel — Display, filter, and manage BP recommendations.
 * Shows AI-generated and manual recommendations with status management.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Brain, Plus, Trash2, Check, X, AlertTriangle, Lightbulb,
  TrendingUp, Settings, DollarSign, Target, Shield, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { bpAPI } from '../../../services/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  comercial: {
    label: 'Comercial',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    icon: TrendingUp,
  },
  financiero: {
    label: 'Financiero',
    color: 'text-green-400 bg-green-500/10 border-green-500/30',
    icon: DollarSign,
  },
  operativo: {
    label: 'Operativo',
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    icon: Settings,
  },
  estrategico: {
    label: 'Estratégico',
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
    icon: Target,
  },
  riesgo: {
    label: 'Riesgo',
    color: 'text-red-400 bg-red-500/10 border-red-500/30',
    icon: AlertTriangle,
  },
  oportunidad: {
    label: 'Oportunidad',
    color: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
    icon: Lightbulb,
  },
}

const PRIORITY_CONFIG = {
  critica: { label: 'Crítica', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  alta: { label: 'Alta', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  media: { label: 'Media', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' },
  baja: { label: 'Baja', color: 'text-slate-400 bg-slate-500/10 border-slate-600/30' },
}

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'text-slate-300' },
  aceptada: { label: 'Aceptada', color: 'text-green-400' },
  en_revision: { label: 'En Revisión', color: 'text-yellow-400' },
  descartada: { label: 'Descartada', color: 'text-slate-500' },
}

const IMPACT_CONFIG = {
  alto: { label: 'Impacto Alto', color: 'text-red-400' },
  medio: { label: 'Impacto Medio', color: 'text-yellow-400' },
  bajo: { label: 'Impacto Bajo', color: 'text-slate-400' },
}

// ─── Add Recommendation Modal ─────────────────────────────────────────────────

function AddRecommendationModal({ bpId, onClose, onCreated }) {
  const [form, setForm] = useState({
    category: 'estrategico',
    title: '',
    description: '',
    priority: 'media',
    impact_level: 'medio',
    source: 'manual',
  })

  const createMutation = useMutation({
    mutationFn: (data) => bpAPI.createRecommendation(bpId, data),
    onSuccess: (res) => {
      toast.success('Recomendación creada')
      onCreated(res.data)
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al crear recomendación'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('El título es requerido')
    createMutation.mutate(form)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="font-semibold text-slate-100">Nueva Recomendación</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="label">Título *</label>
            <input
              type="text"
              className="input"
              placeholder="Título conciso de la recomendación..."
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoría</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(CATEGORY_CONFIG).map(([v, { label }]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {Object.entries(PRIORITY_CONFIG).map(([v, { label }]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Nivel de impacto</label>
            <select className="input" value={form.impact_level || 'medio'} onChange={(e) => setForm({ ...form, impact_level: e.target.value })}>
              <option value="alto">Alto</option>
              <option value="medio">Medio</option>
              <option value="bajo">Bajo</option>
            </select>
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Descripción detallada con argumentos..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Recommendation Card ──────────────────────────────────────────────────────

function RecommendationCard({ rec, bpId, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  const catCfg = CATEGORY_CONFIG[rec.category] || CATEGORY_CONFIG.estrategico
  const prioCfg = PRIORITY_CONFIG[rec.priority] || PRIORITY_CONFIG.media
  const statusCfg = STATUS_CONFIG[rec.status] || STATUS_CONFIG.pendiente
  const impactCfg = rec.impact_level ? IMPACT_CONFIG[rec.impact_level] : null

  const CategoryIcon = catCfg.icon

  const isDescartada = rec.status === 'descartada'

  return (
    <div className={clsx(
      'bg-slate-800/40 rounded-xl border transition-all',
      isDescartada ? 'border-slate-800/50 opacity-50' : 'border-slate-700/50',
    )}>
      {/* Card header */}
      <div
        className="flex items-start gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Category icon */}
        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', catCfg.color.split(' ').slice(1).join(' '))}>
          <CategoryIcon size={14} className={catCfg.color.split(' ')[0]} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={clsx('text-sm font-medium leading-snug', isDescartada ? 'text-slate-500 line-through' : 'text-slate-100')}>
              {rec.title}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={clsx('badge text-xs border', catCfg.color)}>{catCfg.label}</span>
            <span className={clsx('badge text-xs border', prioCfg.color)}>{prioCfg.label}</span>
            {impactCfg && (
              <span className={clsx('text-xs', impactCfg.color)}>{impactCfg.label}</span>
            )}
            {rec.is_ai_generated && (
              <span className="badge text-xs bg-brand-500/10 text-brand-400 border border-brand-500/30 flex items-center gap-1">
                <Brain size={9} /> IA
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-slate-700/40 mt-0 space-y-3">
          {rec.description && (
            <p className="text-sm text-slate-400 leading-relaxed pt-3">{rec.description}</p>
          )}

          {/* Status + Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Estado:</span>
              <select
                className="input py-1 text-xs"
                value={rec.status}
                onChange={(e) => onUpdate(rec.id, { status: e.target.value })}
                onClick={(e) => e.stopPropagation()}
              >
                {Object.entries(STATUS_CONFIG).map(([v, { label }]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            <button
              className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
              onClick={(e) => { e.stopPropagation(); onDelete(rec.id) }}
              title="Eliminar recomendación"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function BPRecommendationsPanel({ bpId, recommendations: initialRecs }) {
  const qc = useQueryClient()
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  // Use local data from the bp query if available, otherwise fetch separately
  const { data: fetchedRecs } = useQuery({
    queryKey: ['bp-recommendations', bpId],
    queryFn: () => bpAPI.listRecommendations(bpId).then((r) => r.data),
    initialData: initialRecs,
    staleTime: 30_000,
  })

  const recs = fetchedRecs || initialRecs || []

  const updateMutation = useMutation({
    mutationFn: ({ recId, data }) => bpAPI.updateRecommendation(bpId, recId, data),
    onSuccess: () => qc.invalidateQueries(['bp-recommendations', bpId]),
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (recId) => bpAPI.deleteRecommendation(bpId, recId),
    onSuccess: () => {
      qc.invalidateQueries(['bp-recommendations', bpId])
      qc.invalidateQueries(['bp', bpId])
      toast.success('Recomendación eliminada')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const handleUpdate = (recId, data) => updateMutation.mutate({ recId, data })
  const handleDelete = (recId) => {
    if (window.confirm('¿Eliminar esta recomendación?')) {
      deleteMutation.mutate(recId)
    }
  }

  // Stats
  const pending = recs.filter((r) => r.status === 'pendiente').length
  const accepted = recs.filter((r) => r.status === 'aceptada').length
  const discarded = recs.filter((r) => r.status === 'descartada').length
  const aiCount = recs.filter((r) => r.is_ai_generated).length

  // Filtered
  const filtered = recs.filter((r) => {
    if (categoryFilter && r.category !== categoryFilter) return false
    if (statusFilter && r.status !== statusFilter) return false
    return true
  })

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card border border-slate-700/50 text-center">
          <p className="text-2xl font-bold text-slate-100">{recs.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">Total</p>
        </div>
        <div className="card border border-yellow-500/20 text-center">
          <p className="text-2xl font-bold text-yellow-400">{pending}</p>
          <p className="text-xs text-slate-500 mt-0.5">Pendientes</p>
        </div>
        <div className="card border border-green-500/20 text-center">
          <p className="text-2xl font-bold text-green-400">{accepted}</p>
          <p className="text-xs text-slate-500 mt-0.5">Aceptadas</p>
        </div>
        <div className="card border border-brand-500/20 text-center">
          <p className="text-2xl font-bold text-brand-400">{aiCount}</p>
          <p className="text-xs text-slate-500 mt-0.5">Generadas por IA</p>
        </div>
      </div>

      {/* Filters + add button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="input py-1.5 text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {Object.entries(CATEGORY_CONFIG).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <select
            className="input py-1.5 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_CONFIG).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          {(categoryFilter || statusFilter) && (
            <button
              onClick={() => { setCategoryFilter(''); setStatusFilter('') }}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
            >
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
        <button
          className="btn-primary text-sm flex items-center gap-1.5"
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={14} /> Nueva recomendación
        </button>
      </div>

      {/* Recommendations list */}
      {filtered.length === 0 ? (
        <div className="card border border-slate-700/50 text-center py-12">
          <Lightbulb size={36} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm font-medium mb-1">
            {categoryFilter || statusFilter ? 'No hay recomendaciones con estos filtros.' : 'No hay recomendaciones aún.'}
          </p>
          <p className="text-slate-500 text-xs">
            {!categoryFilter && !statusFilter && 'Usa el asistente IA para analizar un archivo del BP anterior y generar recomendaciones automáticamente.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((rec) => (
            <RecommendationCard
              key={rec.id}
              rec={rec}
              bpId={bpId}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAddModal && (
        <AddRecommendationModal
          bpId={bpId}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            qc.invalidateQueries(['bp-recommendations', bpId])
            qc.invalidateQueries(['bp', bpId])
          }}
        />
      )}
    </div>
  )
}
