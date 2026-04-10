import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  TrendingUp, ArrowLeft, Loader2, X, Plus, Upload, FileSpreadsheet,
  Brain, ChevronDown, Edit2, Trash2, Check, BarChart3, Target,
  AlertCircle, DollarSign, Activity, CheckCircle2, Clock, Lightbulb,
  Sparkles, Image,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { bpAPI, usersAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import BPActivityCard from './components/BPActivityCard'
import BPImportWizard from './components/BPImportWizard'
import BPRecommendationsPanel from './components/BPRecommendationsPanel'

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  borrador: { label: 'Borrador', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  en_revision: { label: 'En Revisión', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  aprobado: { label: 'Aprobado', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  vigente: { label: 'Vigente', color: 'bg-green-500/15 text-green-400 border-green-500/30' },
  cerrado: { label: 'Cerrado', color: 'bg-slate-600/15 text-slate-500 border-slate-600/30' },
}

const LINE_CATEGORIES = [
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'costo_fijo', label: 'Costo Fijo' },
  { value: 'costo_variable', label: 'Costo Variable' },
  { value: 'magnitud', label: 'Magnitud/KPI' },
  { value: 'margen', label: 'Margen' },
]

const LINE_CATEGORY_COLORS = {
  ingreso: 'text-green-400 bg-green-500/10',
  costo_fijo: 'text-red-400 bg-red-500/10',
  costo_variable: 'text-orange-400 bg-orange-500/10',
  magnitud: 'text-blue-400 bg-blue-500/10',
  margen: 'text-brand-400 bg-brand-500/10',
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const ACTIVITY_STATUSES = [
  { value: '', label: 'Todos' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_progreso', label: 'En Progreso' },
  { value: 'completada', label: 'Completada' },
  { value: 'vencida', label: 'Vencida' },
  { value: 'cancelada', label: 'Cancelada' },
]

const ACTIVITY_CATEGORIES = [
  { value: '', label: 'Todas' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'operativo', label: 'Operativo' },
  { value: 'financiero', label: 'Financiero' },
  { value: 'estrategico', label: 'Estratégico' },
  { value: 'regulatorio', label: 'Regulatorio' },
  { value: 'tecnologia', label: 'Tecnología' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCOP(value, unit = 'COP') {
  if (value == null) return '—'
  if (unit !== 'COP' && unit !== 'USD') return `${value?.toLocaleString('es-CO')} ${unit}`
  const prefix = unit === 'USD' ? 'USD ' : '$'
  if (Math.abs(value) >= 1_000_000_000) return `${prefix}${(value / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(value) >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}M`
  return `${prefix}${value?.toLocaleString('es-CO')}`
}

// ─── Line Modal ───────────────────────────────────────────────────────────────

function LineModal({ line, onClose, onSave }) {
  const [form, setForm] = useState(line || {
    category: 'ingreso',
    subcategory: '',
    name: '',
    unit: 'COP',
    monthly_plan: {},
    notes: '',
    order_index: 0,
  })

  const handleMonthChange = (monthIdx, value) => {
    setForm((f) => ({
      ...f,
      monthly_plan: { ...(f.monthly_plan || {}), [String(monthIdx + 1)]: value === '' ? null : parseFloat(value) || 0 },
    }))
  }

  const annualTotal = Object.values(form.monthly_plan || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name?.trim()) return toast.error('Ingresa el nombre de la línea')
    onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl shadow-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-slate-100">{line ? 'Editar Línea' : 'Nueva Línea Presupuestal'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoría *</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {LINE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Subcategoría</label>
              <input type="text" className="input" placeholder="Ej: Nómina, Licencias..." value={form.subcategory || ''} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre de la línea *</label>
              <input type="text" className="input" placeholder="Ej: Ingresos Recurrentes" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">Unidad</label>
              <select className="input" value={form.unit || 'COP'} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                {['COP', 'USD', '%', 'unidades', 'clientes', 'contratos', 'usuarios'].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Monthly grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Valores Mensuales (Plan)</label>
              <span className="text-xs text-brand-400 font-semibold">
                Total anual: {formatCOP(annualTotal, form.unit || 'COP')}
              </span>
            </div>
            <div className="overflow-x-auto">
              <div className="grid grid-cols-6 gap-1.5 min-w-[480px]">
                {MONTHS.map((month, idx) => (
                  <div key={idx}>
                    <label className="text-xs text-slate-500 block mb-1 text-center">{month}</label>
                    <input
                      type="number"
                      className="input text-xs text-center py-1.5 px-1"
                      placeholder="0"
                      value={form.monthly_plan?.[String(idx + 1)] ?? ''}
                      onChange={(e) => handleMonthChange(idx, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notas</label>
            <textarea className="input resize-none" rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary flex-1">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Activity Modal ───────────────────────────────────────────────────────────

function ActivityModal({ activity, users, onClose, onSave }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState(activity || {
    title: '',
    description: '',
    category: 'operativo',
    priority: 'media',
    status: 'pendiente',
    owner_id: '',
    due_date: '',
    progress: 0,
    notes: '',
    evidence: '',
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title?.trim()) return toast.error('Ingresa el título de la actividad')
    const payload = { ...form }
    if (!payload.owner_id) delete payload.owner_id
    if (!payload.due_date) delete payload.due_date
    if (payload.owner_id) payload.owner_id = parseInt(payload.owner_id)
    onSave(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-slate-100">{activity ? 'Editar Actividad' : 'Nueva Actividad'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="label">Título *</label>
            <input type="text" className="input" placeholder="Describe la actividad..." value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea className="input resize-none" rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Categoría</label>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {ACTIVITY_CATEGORIES.filter(c => c.value).map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="critica">Crítica</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estado</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {ACTIVITY_STATUSES.filter(s => s.value).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Responsable</label>
              <select className="input" value={form.owner_id || ''} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                <option value="">Sin asignar</option>
                {(users || []).map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha límite</label>
              <input type="date" className="input" value={form.due_date || ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} min={today} />
            </div>
            <div>
              <label className="label">Avance ({form.progress}%)</label>
              <input type="range" min={0} max={100} step={5} className="w-full accent-brand-500" value={form.progress} onChange={(e) => setForm({ ...form, progress: parseInt(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="label">Notas</label>
            <input type="text" className="input" value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div>
            <label className="label">Evidencia / enlace</label>
            <input type="text" className="input" placeholder="URL o descripción de la evidencia" value={form.evidence || ''} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-primary flex-1">Guardar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

function ResumenTab({ bp }) {
  const ingresos = bp.computed_ingresos || bp.total_ingresos_plan || 0
  const costos = bp.computed_costos || bp.total_costos_plan || 0
  const margen = bp.computed_margen_pct ?? bp.margen_bruto_plan ?? 0
  const ebitda = ingresos - costos

  const magnitudeLines = (bp.lines || []).filter((l) => l.category === 'magnitud')
  const activities = bp.activities || []
  const overdue = activities.filter((a) => a.is_overdue || a.status === 'vencida')
  const completed = activities.filter((a) => a.status === 'completada')

  // Latest AI analysis
  const latestAnalysis = (bp.excel_analyses || []).slice().sort(
    (a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at)
  )[0]

  const pendingRecs = (bp.recommendations || []).filter((r) => r.status === 'pendiente' && !r.is_deleted)

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card border border-green-500/20 bg-green-950/10">
          <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><DollarSign size={12} /> Ingresos Plan</p>
          <p className="text-xl font-bold text-green-400">{formatCOP(ingresos)}</p>
        </div>
        <div className="card border border-red-500/20 bg-red-950/10">
          <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Activity size={12} /> Costos Plan</p>
          <p className="text-xl font-bold text-red-400">{formatCOP(costos)}</p>
        </div>
        <div className={clsx('card border', margen >= 0 ? 'border-brand-500/20 bg-brand-950/10' : 'border-red-500/20 bg-red-950/10')}>
          <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><TrendingUp size={12} /> Margen Bruto</p>
          <p className={clsx('text-xl font-bold', margen >= 0 ? 'text-brand-400' : 'text-red-400')}>{margen.toFixed(1)}%</p>
        </div>
        <div className={clsx('card border', ebitda >= 0 ? 'border-emerald-500/20 bg-emerald-950/10' : 'border-red-500/20 bg-red-950/10')}>
          <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><BarChart3 size={12} /> EBITDA</p>
          <p className={clsx('text-xl font-bold', ebitda >= 0 ? 'text-emerald-400' : 'text-red-400')}>{formatCOP(ebitda)}</p>
        </div>
      </div>

      {/* Activities summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card border border-slate-700/50 text-center">
          <p className="text-3xl font-bold text-slate-100">{activities.length}</p>
          <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1"><Target size={11} /> Total Actividades</p>
        </div>
        <div className="card border border-green-500/20 text-center">
          <p className="text-3xl font-bold text-green-400">{completed.length}</p>
          <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1"><CheckCircle2 size={11} /> Completadas</p>
        </div>
        <div className={clsx('card border text-center', overdue.length > 0 ? 'border-red-500/30' : 'border-slate-700/50')}>
          <p className={clsx('text-3xl font-bold', overdue.length > 0 ? 'text-red-400' : 'text-slate-500')}>{overdue.length}</p>
          <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1"><AlertCircle size={11} /> Vencidas</p>
        </div>
      </div>

      {/* Completion progress */}
      {activities.length > 0 && (
        <div className="card border border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-slate-300">Avance del Plan</p>
            <p className="text-sm font-bold text-brand-400">
              {Math.round((completed.length / activities.length) * 100)}%
            </p>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: `${Math.round((completed.length / activities.length) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* AI Insights section */}
      {latestAnalysis?.ai_summary && (
        <div className="card border border-brand-500/20 bg-brand-950/5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-brand-400" />
            <h3 className="text-sm font-semibold text-brand-400">AI Insights</h3>
            <span className="text-xs text-slate-500">— análisis más reciente</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">{latestAnalysis.ai_summary}</p>
          {latestAnalysis.uploaded_at && (
            <p className="text-xs text-slate-600 mt-2">
              {new Date(latestAnalysis.uploaded_at).toLocaleDateString('es-CO', {
                day: '2-digit', month: 'short', year: 'numeric',
              })}
              {latestAnalysis.filename && ` · ${latestAnalysis.filename}`}
            </p>
          )}
        </div>
      )}

      {/* Pending recommendations reminder */}
      {pendingRecs.length > 0 && (
        <div className="card border border-purple-500/20 bg-purple-950/5">
          <div className="flex items-center gap-2">
            <Lightbulb size={14} className="text-purple-400" />
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-purple-400">{pendingRecs.length} recomendación{pendingRecs.length > 1 ? 'es' : ''} pendiente{pendingRecs.length > 1 ? 's' : ''}</span>
              {' '}de revisar en la pestaña Recomendaciones IA.
            </p>
          </div>
        </div>
      )}

      {/* Magnitudes / KPIs */}
      {magnitudeLines.length > 0 && (
        <div className="card border border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Target size={14} className="text-blue-400" />
            Magnitudes / KPIs
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {magnitudeLines.map((l) => (
              <div key={l.id} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
                <p className="text-xs text-slate-500">{l.subcategory || l.name}</p>
                <p className="text-sm font-semibold text-blue-400 mt-0.5">
                  {l.annual_plan != null ? `${l.annual_plan?.toLocaleString('es-CO')} ${l.unit}` : '—'}
                </p>
                {l.name !== l.subcategory && <p className="text-xs text-slate-600 mt-0.5">{l.name}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── AI Badge + Confidence Bar (inline) ──────────────────────────────────────

function AIBadge({ confidence, rationale }) {
  return (
    <div className="flex items-center gap-1.5 ml-1">
      <span
        className="badge text-xs bg-purple-500/10 text-purple-400 border border-purple-500/30"
        title={rationale || 'Generado por IA'}
      >
        IA
      </span>
      {confidence != null && (
        <div
          className="flex items-center gap-1"
          title={`Confianza: ${confidence}%${rationale ? '\n' + rationale : ''}`}
        >
          <div className="h-1.5 w-10 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full',
                confidence >= 80 ? 'bg-green-500' : confidence >= 60 ? 'bg-yellow-500' : 'bg-orange-500',
              )}
              style={{ width: `${confidence}%` }}
            />
          </div>
          <span className="text-xs text-slate-600">{confidence}%</span>
        </div>
      )}
    </div>
  )
}

function PresupuestoTab({ bp, bpId, canWrite, onRefresh }) {
  const qc = useQueryClient()
  const [lineModal, setLineModal] = useState(null) // null | 'new' | line object
  const [deletingId, setDeletingId] = useState(null)

  const createLineMutation = useMutation({
    mutationFn: (data) => bpAPI.createLine(bpId, data),
    onSuccess: () => { qc.invalidateQueries(['bp', bpId]); setLineModal(null); toast.success('Línea agregada') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const updateLineMutation = useMutation({
    mutationFn: ({ id, data }) => bpAPI.updateLine(bpId, id, data),
    onSuccess: () => { qc.invalidateQueries(['bp', bpId]); setLineModal(null); toast.success('Línea actualizada') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const deleteLineMutation = useMutation({
    mutationFn: (id) => bpAPI.deleteLine(bpId, id),
    onSuccess: () => { qc.invalidateQueries(['bp', bpId]); toast.success('Línea eliminada') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const handleSaveLine = (form) => {
    if (lineModal && lineModal !== 'new') {
      updateLineMutation.mutate({ id: lineModal.id, data: form })
    } else {
      createLineMutation.mutate(form)
    }
  }

  const lines = bp.lines || []
  const groupedLines = LINE_CATEGORIES.reduce((acc, cat) => {
    acc[cat.value] = lines.filter((l) => l.category === cat.value)
    return acc
  }, {})

  const totalIngresos = groupedLines.ingreso.reduce((s, l) => s + (l.annual_plan || 0), 0)
  const totalCostosFijos = groupedLines.costo_fijo.reduce((s, l) => s + (l.annual_plan || 0), 0)
  const totalCostosVar = groupedLines.costo_variable.reduce((s, l) => s + (l.annual_plan || 0), 0)
  const totalCostos = totalCostosFijos + totalCostosVar
  const margen = totalIngresos > 0 ? ((totalIngresos - totalCostos) / totalIngresos) * 100 : 0

  const aiLinesCount = lines.filter((l) => l.is_ai_generated).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-green-400 font-semibold">Ing: {formatCOP(totalIngresos)}</span>
          <span className="text-red-400 font-semibold">Cost: {formatCOP(totalCostos)}</span>
          <span className={clsx('font-semibold', margen >= 0 ? 'text-brand-400' : 'text-red-400')}>
            Margen: {margen.toFixed(1)}%
          </span>
          {aiLinesCount > 0 && (
            <span className="badge text-xs bg-purple-500/10 text-purple-400 border border-purple-500/30 flex items-center gap-1">
              <Brain size={10} /> {aiLinesCount} líneas IA
            </span>
          )}
        </div>
        {canWrite && (
          <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setLineModal('new')}>
            <Plus size={14} /> Agregar línea
          </button>
        )}
      </div>

      {/* Lines table */}
      <div className="overflow-x-auto rounded-xl border border-slate-700/50">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-slate-800/50">
              <th className="text-left px-3 py-2.5 text-xs text-slate-400 font-semibold w-8">#</th>
              <th className="text-left px-3 py-2.5 text-xs text-slate-400 font-semibold">Categoría</th>
              <th className="text-left px-3 py-2.5 text-xs text-slate-400 font-semibold min-w-[160px]">Nombre</th>
              <th className="text-left px-3 py-2.5 text-xs text-slate-400 font-semibold w-16">Unidad</th>
              {MONTHS.map((m) => (
                <th key={m} className="text-right px-1.5 py-2.5 text-xs text-slate-500 font-medium w-14">{m}</th>
              ))}
              <th className="text-right px-3 py-2.5 text-xs text-slate-400 font-semibold">Total</th>
              {canWrite && <th className="px-2 py-2.5 w-16"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={20} className="text-center py-8 text-slate-500 text-sm">
                  No hay líneas presupuestales. Agrega la primera.
                </td>
              </tr>
            ) : (
              lines.map((line, idx) => (
                <tr key={line.id} className={clsx('hover:bg-slate-800/30 transition-colors', line.is_ai_generated && 'bg-purple-950/5')}>
                  <td className="px-3 py-2 text-slate-600 text-xs">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <span className={clsx('badge text-xs', LINE_CATEGORY_COLORS[line.category] || 'text-slate-400 bg-slate-500/10')}>
                      {LINE_CATEGORIES.find((c) => c.value === line.category)?.label || line.category}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <p className="text-slate-200 font-medium text-xs">{line.name}</p>
                      {line.is_ai_generated && (
                        <AIBadge confidence={line.ai_confidence} rationale={line.ai_rationale} />
                      )}
                    </div>
                    {line.subcategory && <p className="text-slate-500 text-xs">{line.subcategory}</p>}
                  </td>
                  <td className="px-3 py-2 text-slate-500 text-xs">{line.unit}</td>
                  {MONTHS.map((_, idx2) => {
                    const val = line.monthly_plan?.[String(idx2 + 1)]
                    return (
                      <td key={idx2} className="px-1.5 py-2 text-right text-xs text-slate-400">
                        {val != null ? (Math.abs(val) >= 1_000_000 ? `${(val / 1_000_000).toFixed(1)}M` : val?.toLocaleString('es-CO')) : '—'}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right font-semibold text-xs text-slate-200">
                    {line.annual_plan != null ? formatCOP(line.annual_plan, line.unit) : '—'}
                  </td>
                  {canWrite && (
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setLineModal(line)} className="p-1 text-slate-500 hover:text-slate-300 rounded">
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => { if (window.confirm('¿Eliminar esta línea?')) deleteLineMutation.mutate(line.id) }}
                          className="p-1 text-slate-500 hover:text-red-400 rounded"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Line modal */}
      {lineModal && (
        <LineModal
          line={lineModal !== 'new' ? lineModal : null}
          onClose={() => setLineModal(null)}
          onSave={handleSaveLine}
        />
      )}
    </div>
  )
}

function ActividadesTab({ bp, bpId, canWrite }) {
  const qc = useQueryClient()
  const [actModal, setActModal] = useState(null) // null | 'new' | activity
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersAPI.list({ limit: 100 }).then((r) => r.data),
  })

  const createActMutation = useMutation({
    mutationFn: (data) => bpAPI.createActivity(bpId, data),
    onSuccess: () => { qc.invalidateQueries(['bp', bpId]); setActModal(null); toast.success('Actividad creada') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const updateActMutation = useMutation({
    mutationFn: ({ id, data }) => bpAPI.updateActivity(bpId, id, data),
    onSuccess: () => { qc.invalidateQueries(['bp', bpId]); setActModal(null); toast.success('Actividad actualizada') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const deleteActMutation = useMutation({
    mutationFn: (id) => bpAPI.deleteActivity(bpId, id),
    onSuccess: () => { qc.invalidateQueries(['bp', bpId]); toast.success('Actividad eliminada') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const handleSaveActivity = (form) => {
    if (actModal && actModal !== 'new') {
      updateActMutation.mutate({ id: actModal.id, data: form })
    } else {
      createActMutation.mutate(form)
    }
  }

  const handleStatusChange = (id, newStatus) => {
    updateActMutation.mutate({ id, data: { status: newStatus, ...(newStatus === 'completada' ? { progress: 100, completion_date: new Date().toISOString().split('T')[0] } : {}) } })
  }

  const activities = (bp.activities || []).filter((a) => {
    if (statusFilter && a.status !== statusFilter) return false
    if (categoryFilter && a.category !== categoryFilter) return false
    return true
  })

  const overdueCount = (bp.activities || []).filter((a) => a.is_overdue || a.status === 'vencida').length

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {overdueCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2.5 py-1">
              <AlertCircle size={11} />
              {overdueCount} vencidas
            </span>
          )}
          <select className="input py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {ACTIVITY_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="input py-1.5 text-sm" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            {ACTIVITY_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {(statusFilter || categoryFilter) && (
            <button
              onClick={() => { setStatusFilter(''); setCategoryFilter('') }}
              className="text-xs text-slate-400 hover:text-slate-100 flex items-center gap-1"
            >
              <X size={12} /> Limpiar
            </button>
          )}
        </div>
        {canWrite && (
          <button className="btn-primary text-sm flex items-center gap-1.5" onClick={() => setActModal('new')}>
            <Plus size={14} /> Nueva actividad
          </button>
        )}
      </div>

      {/* Activity list */}
      {activities.length === 0 ? (
        <div className="card border border-slate-700/50 text-center py-10">
          <Target size={32} className="text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">
            {statusFilter || categoryFilter ? 'No hay actividades con estos filtros.' : 'No hay actividades en este BP. ¡Agrega la primera!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {activities.map((act) => (
            <BPActivityCard
              key={act.id}
              activity={act}
              onStatusChange={handleStatusChange}
              onEdit={(a) => setActModal(a)}
            />
          ))}
        </div>
      )}

      {/* Activity modal */}
      {actModal && (
        <ActivityModal
          activity={actModal !== 'new' ? actModal : null}
          users={users || []}
          onClose={() => setActModal(null)}
          onSave={handleSaveActivity}
        />
      )}
    </div>
  )
}

function AnalisisTab({ bp, bpId }) {
  const qc = useQueryClient()
  const fileInputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const uploadMutation = useMutation({
    mutationFn: (file) => bpAPI.analyzeFile(bpId, file),
    onSuccess: () => {
      qc.invalidateQueries(['bp', bpId])
      toast.success('Archivo analizado correctamente')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al analizar archivo'),
    onSettled: () => setUploading(false),
  })

  const handleFile = (file) => {
    if (!file) return
    const name = file.name.toLowerCase()
    const validExcel = /\.(xlsx|xls|xlsm)$/.test(name)
    const validImage = /\.(png|jpg|jpeg|gif|webp)$/.test(name)
    if (!validExcel && !validImage) {
      toast.error('Solo se aceptan Excel (.xlsx, .xls, .xlsm) o imágenes (.png, .jpg, .gif, .webp)')
      return
    }
    setUploading(true)
    uploadMutation.mutate(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    handleFile(file)
  }

  const analyses = bp.excel_analyses || []

  const formatBytes = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        className={clsx(
          'border-2 border-dashed rounded-xl p-8 text-center transition-all duration-150 cursor-pointer',
          isDragOver ? 'border-brand-500 bg-brand-500/10' : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30',
          uploading && 'opacity-60 pointer-events-none',
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm,.png,.jpg,.jpeg,.gif,.webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={32} className="animate-spin text-brand-400" />
            <p className="text-sm text-slate-400">Analizando archivo con IA...</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-center gap-3 mb-3">
              <FileSpreadsheet size={28} className="text-green-400" />
              <span className="text-slate-600">|</span>
              <Image size={28} className="text-blue-400" />
            </div>
            <p className="text-slate-300 font-medium mb-1">Arrastra tu Excel o imagen aquí, o haz clic para cargar</p>
            <p className="text-xs text-slate-500">Excel: .xlsx, .xls, .xlsm · Imágenes: .png, .jpg, .gif, .webp</p>
            <p className="text-xs text-brand-400 mt-2 flex items-center justify-center gap-1">
              <Brain size={11} /> Análisis IA con Gemini — extrae líneas, actividades y recomendaciones
            </p>
          </>
        )}
      </div>

      {/* Stored analyses */}
      {analyses.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm">
          No hay análisis guardados. Carga un archivo para comenzar.
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-400">Análisis guardados ({analyses.length})</h3>
          {analyses.map((analysis) => (
            <div key={analysis.id} className="card border border-slate-700/50">
              {/* Header */}
              <div
                className="flex items-start justify-between gap-3 cursor-pointer"
                onClick={() => setExpandedId(expandedId === analysis.id ? null : analysis.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                    analysis.file_type === 'image' ? 'bg-blue-500/15' : 'bg-green-500/15',
                  )}>
                    {analysis.file_type === 'image' ? (
                      <Image size={18} className="text-blue-400" />
                    ) : (
                      <FileSpreadsheet size={18} className="text-green-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{analysis.filename}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                      <span>{formatDate(analysis.uploaded_at)}</span>
                      {analysis.file_size && <span>{formatBytes(analysis.file_size)}</span>}
                      {analysis.uploaded_by_name && <span>por {analysis.uploaded_by_name}</span>}
                      {analysis.applied_at && (
                        <span className="text-green-400 flex items-center gap-1">
                          <Check size={10} /> Aplicado
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {analysis.ai_summary && (
                    <span className="badge bg-brand-500/15 text-brand-400 border border-brand-500/30 text-xs flex items-center gap-1">
                      <Brain size={10} /> IA
                    </span>
                  )}
                  {analysis.structured_extraction && !analysis.applied_at && (
                    <span className="badge bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 text-xs">
                      Pendiente
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    className={clsx('text-slate-500 transition-transform', expandedId === analysis.id && 'rotate-180')}
                  />
                </div>
              </div>

              {/* Expanded content */}
              {expandedId === analysis.id && (
                <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3">
                  {analysis.ai_summary && (
                    <div>
                      <p className="text-xs font-semibold text-brand-400 mb-2 flex items-center gap-1.5">
                        <Brain size={12} /> Análisis IA
                      </p>
                      <div className="bg-slate-800/50 rounded-lg p-3 text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                        {analysis.ai_summary}
                      </div>
                    </div>
                  )}
                  {analysis.structured_extraction && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-2">Extracción estructurada</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="badge bg-slate-700/50 text-slate-300 text-xs">
                          {(analysis.structured_extraction.financial_lines || []).length} líneas financieras
                        </span>
                        <span className="badge bg-slate-700/50 text-slate-300 text-xs">
                          {(analysis.structured_extraction.activities || []).length} actividades
                        </span>
                        <span className="badge bg-slate-700/50 text-slate-300 text-xs">
                          {(analysis.structured_extraction.recommendations || []).length} recomendaciones
                        </span>
                      </div>
                    </div>
                  )}
                  {analysis.ai_insights && Object.keys(analysis.ai_insights).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-2">Estadísticas</p>
                      <div className="flex flex-wrap gap-2">
                        {analysis.ai_insights.total_sheets != null && (
                          <span className="badge bg-slate-700/50 text-slate-300 text-xs">
                            {analysis.ai_insights.total_sheets} hojas
                          </span>
                        )}
                        {analysis.ai_insights.rows_parsed != null && (
                          <span className="badge bg-slate-700/50 text-slate-300 text-xs">
                            {analysis.ai_insights.rows_parsed} filas analizadas
                          </span>
                        )}
                        {(analysis.ai_insights.sheet_names || []).slice(0, 3).map((s) => (
                          <span key={s} className="badge bg-slate-700/50 text-slate-400 text-xs">{s}</span>
                        ))}
                        {(analysis.ai_insights.risks || []).length > 0 && (
                          <span className="badge bg-red-500/10 text-red-400 text-xs">
                            {analysis.ai_insights.risks.length} riesgos
                          </span>
                        )}
                        {(analysis.ai_insights.opportunities || []).length > 0 && (
                          <span className="badge bg-teal-500/10 text-teal-400 text-xs">
                            {analysis.ai_insights.opportunities.length} oportunidades
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BPDetailPage() {
  const { bpId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('resumen')
  const [editBP, setEditBP] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [showImportWizard, setShowImportWizard] = useState(false)

  const canWrite = ['admin', 'leader'].includes(user?.role)

  const { data: bp, isLoading, error } = useQuery({
    queryKey: ['bp', bpId],
    queryFn: () => bpAPI.get(bpId).then((r) => r.data),
    enabled: !!bpId,
  })

  const updateMutation = useMutation({
    mutationFn: (data) => bpAPI.update(bpId, data),
    onSuccess: () => { qc.invalidateQueries(['bp', bpId]); setEditBP(false); toast.success('BP actualizado') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => bpAPI.delete(bpId),
    onSuccess: () => { navigate('/bp'); toast.success('BP eliminado') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-brand-400" />
      </div>
    )
  }

  if (error || !bp) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-400">Business Plan no encontrado</p>
        <button className="btn-secondary mt-4" onClick={() => navigate('/bp')}>Volver</button>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[bp.status] || STATUS_CONFIG.borrador
  const recCount = (bp.recommendations || []).length
  const TABS = [
    { id: 'resumen', label: 'Resumen', icon: BarChart3 },
    { id: 'presupuesto', label: 'Presupuesto', icon: DollarSign },
    { id: 'actividades', label: `Actividades (${(bp.activities || []).length})`, icon: Target },
    { id: 'analisis', label: 'Análisis IA', icon: Brain },
    { id: 'recomendaciones', label: `Recomendaciones${recCount > 0 ? ` (${recCount})` : ''}`, icon: Lightbulb },
  ]

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/bp')} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 mt-0.5">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-100">
                  {bp.business_name} — BP {bp.year}
                </h1>
                {bp.name && <span className="text-sm text-slate-500 italic">{bp.name}</span>}
                <span className={clsx('badge text-xs border', statusCfg.color)}>{statusCfg.label}</span>
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                v{bp.version} · Creado por {bp.created_by_name || '—'}
                {bp.description && ` · ${bp.description}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canWrite && (
                <button
                  className="btn-secondary text-sm flex items-center gap-1.5 border-brand-500/30 text-brand-400 hover:text-brand-300"
                  onClick={() => setShowImportWizard(true)}
                >
                  <Sparkles size={14} />
                  Importar desde Excel/Imagen
                </button>
              )}
              {canWrite && (
                <>
                  <button
                    className="btn-secondary text-sm flex items-center gap-1.5"
                    onClick={() => { setEditForm({ name: bp.name || '', description: bp.description || '', status: bp.status, version: bp.version }); setEditBP(true) }}
                  >
                    <Edit2 size={14} /> Editar
                  </button>
                  <button
                    className="btn-secondary text-sm text-red-400 hover:text-red-300 flex items-center gap-1.5"
                    onClick={() => { if (window.confirm('¿Eliminar este BP? Esta acción no se puede deshacer.')) deleteMutation.mutate() }}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-700/50">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === id
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600',
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'resumen' && <ResumenTab bp={bp} />}
        {activeTab === 'presupuesto' && <PresupuestoTab bp={bp} bpId={bpId} canWrite={canWrite} onRefresh={() => qc.invalidateQueries(['bp', bpId])} />}
        {activeTab === 'actividades' && <ActividadesTab bp={bp} bpId={bpId} canWrite={canWrite} />}
        {activeTab === 'analisis' && <AnalisisTab bp={bp} bpId={bpId} />}
        {activeTab === 'recomendaciones' && (
          <BPRecommendationsPanel bpId={bpId} recommendations={bp.recommendations || []} />
        )}
      </div>

      {/* Edit BP modal */}
      {editBP && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
              <h2 className="font-semibold text-slate-100">Editar Plan de Negocio</h2>
              <button onClick={() => setEditBP(false)} className="text-slate-400 hover:text-slate-100"><X size={18} /></button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); updateMutation.mutate({ ...editForm, version: parseInt(editForm.version) || 1 }) }}
              className="p-5 space-y-4"
            >
              <div>
                <label className="label">Nombre</label>
                <input type="text" className="input" value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Descripción</label>
                <textarea className="input resize-none" rows={3} value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Estado</label>
                  <select className="input" value={editForm.status || 'borrador'} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Versión</label>
                  <input type="number" min={1} className="input" value={editForm.version || 1} onChange={(e) => setEditForm({ ...editForm, version: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setEditBP(false)}>Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Wizard */}
      {showImportWizard && (
        <BPImportWizard
          bpId={bpId}
          onClose={() => setShowImportWizard(false)}
          onDone={() => {
            qc.invalidateQueries(['bp', bpId])
            setShowImportWizard(false)
          }}
        />
      )}
    </div>
  )
}
