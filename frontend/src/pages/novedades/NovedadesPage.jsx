/**
 * Novedades Operativas — noticias/eventos relevantes de la operación CAS BO
 * Todos los usuarios pueden ver. Creador / admin / leader / lider_sr pueden editar y eliminar.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Radio, Search, Loader2, X, Edit3, Trash2, Download,
  Building2, DollarSign, Star, TrendingUp, TrendingDown, Minus,
  Clock, CheckCircle2, AlertCircle, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { novedadesAPI, adminAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import VoiceInputButton from '../../components/voice/VoiceInputButton'

// ─── Constants ────────────────────────────────────────────────────────────────

const IMPACT_TYPE_STYLES = {
  OPEX: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  ON:   'bg-blue-500/15 text-blue-300 border-blue-500/30',
  OTRO: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
}

const IMPACT_TYPE_LABELS = { OPEX: 'OPEX', ON: 'ON', OTRO: 'Otro' }

const SENTIMENT_STYLES = {
  positivo: 'bg-green-500/15 text-green-300 border-green-500/30',
  neutral:  'bg-slate-500/15 text-slate-300 border-slate-500/30',
  negativo: 'bg-red-500/15 text-red-300 border-red-500/30',
}
const SENTIMENT_ICONS = {
  positivo: TrendingUp,
  neutral:  Minus,
  negativo: TrendingDown,
}
const SENTIMENT_LABELS = { positivo: 'Positivo', neutral: 'Neutral', negativo: 'Negativo' }

const REPROCESO_STYLES = {
  subsanado:   'bg-green-500/15 text-green-300 border-green-500/30',
  en_proceso:  'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  sin_iniciar: 'bg-red-500/15 text-red-300 border-red-500/30',
}
const REPROCESO_LABELS = {
  subsanado: 'Subsanado', en_proceso: 'En proceso', sin_iniciar: 'Sin iniciar',
}

// ─── Stars component ──────────────────────────────────────────────────────────

function StarRating({ value, onChange, readonly = false }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <button
          key={s}
          type="button"
          onClick={() => !readonly && onChange && onChange(s)}
          className={`transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
          disabled={readonly}
        >
          <Star
            size={readonly ? 14 : 18}
            className={s <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}
          />
        </button>
      ))}
    </div>
  )
}

// ─── Form (create / edit) ─────────────────────────────────────────────────────

function NovedadForm({ initial, businesses, onSave, onCancel, saving, title: formTitle }) {
  const [form, setForm] = useState(initial)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="card border-indigo-500/30 bg-slate-900 shadow-xl">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Radio size={16} className="text-indigo-400" /> {formTitle}
        </h3>
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
      </div>

      <div className="space-y-3">
        {/* Title */}
        <input className="input w-full" placeholder="Título de la novedad *"
          value={form.title} onChange={e => set('title', e.target.value)} />

        {/* Description */}
        <div className="relative">
          <textarea className="input w-full h-24 pr-10 resize-none"
            placeholder="Descripción detallada de la novedad..."
            value={form.description}
            onChange={e => set('description', e.target.value)} />
          <VoiceInputButton
            onText={t => set('description', (form.description ? form.description + ' ' : '') + t)}
            className="absolute bottom-2 right-2" />
        </div>

        {/* Row: business + impact_type + sentiment */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Negocio afectado</label>
            <select className="input" value={form.business_id || ''} onChange={e => set('business_id', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Sin negocio</option>
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tipo de impacto</label>
            <select className="input" value={form.impact_type} onChange={e => set('impact_type', e.target.value)}>
              <option value="OPEX">OPEX</option>
              <option value="ON">ON</option>
              <option value="OTRO">Otro</option>
            </select>
          </div>
          <div>
            <label className="label">Sentimiento</label>
            <select className="input" value={form.impact_sentiment} onChange={e => set('impact_sentiment', e.target.value)}>
              <option value="positivo">✅ Positivo</option>
              <option value="neutral">➖ Neutral</option>
              <option value="negativo">❌ Negativo</option>
            </select>
          </div>
        </div>

        {/* Stars + economic impact row */}
        <div className="grid sm:grid-cols-2 gap-3 items-start">
          <div>
            <label className="label">Nivel de importancia</label>
            <StarRating value={form.importance_stars} onChange={v => set('importance_stars', v)} />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer select-none mt-5">
              <input type="checkbox" className="w-4 h-4 rounded accent-indigo-500"
                checked={form.has_economic_impact}
                onChange={e => set('has_economic_impact', e.target.checked)} />
              <span className="text-sm text-slate-300">Impacto económico</span>
            </label>
            {form.has_economic_impact && (
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-sm flex-shrink-0">COP</span>
                <input type="number" min="0" step="1000" className="input flex-1"
                  placeholder="Monto estimado"
                  value={form.economic_impact_amount || ''}
                  onChange={e => set('economic_impact_amount', e.target.value ? Number(e.target.value) : null)} />
              </div>
            )}
          </div>
        </div>

        {/* Reproceso section */}
        <div className="border border-slate-700 rounded-xl p-3 space-y-2 bg-slate-800/30">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 rounded accent-orange-500"
              checked={form.has_reproceso}
              onChange={e => set('has_reproceso', e.target.checked)} />
            <span className="text-sm text-slate-300 flex items-center gap-1.5">
              <RefreshCw size={13} className="text-orange-400" />
              Generó reproceso
            </span>
          </label>
          {form.has_reproceso && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="label text-xs">Horas de reproceso</label>
                <input type="number" min="0" step="0.5" className="input"
                  placeholder="Ej: 4.5"
                  value={form.reproceso_hours || ''}
                  onChange={e => set('reproceso_hours', e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div>
                <label className="label text-xs">Estado de subsanación</label>
                <select className="input" value={form.reproceso_status} onChange={e => set('reproceso_status', e.target.value)}>
                  <option value="sin_iniciar">🔴 Sin iniciar</option>
                  <option value="en_proceso">🟡 En proceso</option>
                  <option value="subsanado">🟢 Subsanado</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
          <button type="button" onClick={() => form.title && onSave(form)}
            disabled={!form.title || saving} className="btn-primary flex-1">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Novedad Card ─────────────────────────────────────────────────────────────

function NovedadCard({ n, onEdit, onDelete, canManage }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card hover:border-indigo-500/30 transition-all group relative overflow-hidden">
      {/* Importance bar on left */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ background: `hsl(${45 + (n.importance_stars - 1) * 15}, 90%, ${40 + n.importance_stars * 5}%)` }}
      />
      <div className="pl-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
            {n.business_name && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400">
                <Building2 size={9} /> {n.business_name}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-semibold ${IMPACT_TYPE_STYLES[n.impact_type] || IMPACT_TYPE_STYLES.OTRO}`}>
              {IMPACT_TYPE_LABELS[n.impact_type] || n.impact_type}
            </span>
            {/* Sentiment badge */}
            {(() => {
              const SIcon = SENTIMENT_ICONS[n.impact_sentiment] || Minus
              return (
                <span className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border ${SENTIMENT_STYLES[n.impact_sentiment] || SENTIMENT_STYLES.neutral}`}>
                  <SIcon size={9} /> {SENTIMENT_LABELS[n.impact_sentiment] || n.impact_sentiment}
                </span>
              )
            })()}
            {n.has_economic_impact && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <DollarSign size={9} />
                {n.economic_impact_amount
                  ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n.economic_impact_amount)
                  : 'Impacto $'}
              </span>
            )}
          </div>
          {/* Actions */}
          {canManage && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <button onClick={() => onEdit(n)}
                className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-indigo-400 transition-colors">
                <Edit3 size={12} />
              </button>
              <button onClick={() => onDelete(n.id)}
                className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-red-400 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Title + stars */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors flex-1">{n.title}</h4>
          <StarRating value={n.importance_stars} readonly />
        </div>

        {/* Description */}
        {n.description && (
          <div>
            <p className={`text-xs text-slate-400 ${expanded ? '' : 'line-clamp-2'}`}>{n.description}</p>
            {n.description.length > 120 && (
              <button onClick={() => setExpanded(e => !e)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-0.5">
                {expanded ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        )}

        {/* Reproceso row */}
        {n.has_reproceso && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/10 text-orange-400 border border-orange-500/20">
              <RefreshCw size={9} />
              Reproceso{n.reproceso_hours ? `: ${n.reproceso_hours}h` : ''}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md border ${REPROCESO_STYLES[n.reproceso_status] || REPROCESO_STYLES.sin_iniciar}`}>
              {REPROCESO_LABELS[n.reproceso_status] || n.reproceso_status}
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800">
          <span className="text-[10px] text-slate-600">
            {n.created_by_name} · {n.created_at ? new Date(n.created_at).toLocaleDateString('es-CO') : ''}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${n.status === 'activa' ? 'bg-green-500/10 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
            {n.status === 'activa' ? 'Activa' : 'Archivada'}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  title: '', description: '', business_id: null,
  has_economic_impact: false, economic_impact_amount: null,
  impact_type: 'OTRO', importance_stars: 3,
  impact_sentiment: 'neutral',
  has_reproceso: false, reproceso_hours: null, reproceso_status: 'sin_iniciar',
}

export default function NovedadesPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)   // novedad object being edited
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterBusiness, setFilterBusiness] = useState('')

  const { data: novedades = [], isLoading } = useQuery({
    queryKey: ['novedades'],
    queryFn: () => novedadesAPI.list({ limit: 200 }).then(r => r.data),
  })

  const { data: businesses = [] } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => adminAPI.businesses().then(r => Array.isArray(r.data) ? r.data : r.data?.items || []),
  })

  const createMutation = useMutation({
    mutationFn: (data) => novedadesAPI.create(data),
    onSuccess: () => { qc.invalidateQueries(['novedades']); setShowForm(false); toast.success('Novedad registrada') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al crear'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => novedadesAPI.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['novedades']); setEditing(null); toast.success('Novedad actualizada') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al actualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => novedadesAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries(['novedades']); toast.success('Novedad eliminada') },
    onError: () => toast.error('Error al eliminar'),
  })

  const canManage = (n) => {
    const role = user?.role
    return ['admin', 'leader', 'lider_sr'].includes(role) || n.created_by_id === user?.id
  }

  const handleDelete = (id) => {
    if (confirm('¿Eliminar esta novedad?')) deleteMutation.mutate(id)
  }

  const handleDownload = () => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
    const BASE = import.meta.env.VITE_API_URL || '/api/v1'
    fetch(`${BASE}/novedades/export/csv`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'novedades_operativas.csv'
        document.body.appendChild(a); a.click()
        document.body.removeChild(a); URL.revokeObjectURL(url)
      })
      .catch(() => toast.error('Error al descargar'))
  }

  const filtered = novedades.filter(n => {
    if (search && !n.title.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType && n.impact_type !== filterType) return false
    if (filterBusiness && String(n.business_id) !== String(filterBusiness)) return false
    return true
  })

  // Stats
  const activeCount = novedades.filter(n => n.status === 'activa').length
  const ecoCount    = novedades.filter(n => n.has_economic_impact).length
  const highStars   = novedades.filter(n => n.importance_stars >= 4).length
  const opexCount   = novedades.filter(n => n.impact_type === 'OPEX').length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Radio size={22} className="text-indigo-400" /> Novedades Operativas
          </h1>
          <p className="text-slate-400 text-sm">Eventos relevantes de la operación CAS BO</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors">
            <Download size={14} /> Exportar CSV
          </button>
          <button onClick={() => { setShowForm(true); setEditing(null) }}
            className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nueva Novedad
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Activas', value: activeCount, color: 'text-indigo-400' },
          { label: 'Alta importancia (4-5★)', value: highStars, color: 'text-amber-400' },
          { label: 'Con impacto económico', value: ecoCount, color: 'text-green-400' },
          { label: 'Tipo OPEX', value: opexCount, color: 'text-orange-400' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar novedades..." className="input pl-9 py-1.5 text-sm w-full" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input py-1.5 text-sm w-auto">
          <option value="">Todos los tipos</option>
          <option value="OPEX">OPEX</option>
          <option value="ON">ON</option>
          <option value="OTRO">Otro</option>
        </select>
        <select value={filterBusiness} onChange={e => setFilterBusiness(e.target.value)} className="input py-1.5 text-sm w-auto">
          <option value="">Todos los negocios</option>
          {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {/* Create Form */}
      {showForm && !editing && (
        <NovedadForm
          title="Registrar Novedad Operativa"
          initial={EMPTY_FORM}
          businesses={businesses}
          onSave={(data) => createMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          saving={createMutation.isPending}
        />
      )}

      {/* Edit Form */}
      {editing && (
        <NovedadForm
          title="Editar Novedad Operativa"
          initial={{
            title: editing.title,
            description: editing.description || '',
            business_id: editing.business_id || null,
            has_economic_impact: editing.has_economic_impact,
            economic_impact_amount: editing.economic_impact_amount || null,
            impact_type: editing.impact_type,
            importance_stars: editing.importance_stars,
            impact_sentiment: editing.impact_sentiment || 'neutral',
            has_reproceso: editing.has_reproceso || false,
            reproceso_hours: editing.reproceso_hours || null,
            reproceso_status: editing.reproceso_status || 'sin_iniciar',
            status: editing.status,
          }}
          businesses={businesses}
          onSave={(data) => updateMutation.mutate({ id: editing.id, data })}
          onCancel={() => setEditing(null)}
          saving={updateMutation.isPending}
        />
      )}

      {/* News feed */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-500"><Loader2 className="animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Radio size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">No hay novedades operativas registradas</p>
          <button onClick={() => setShowForm(true)} className="mt-4 btn-primary text-sm">
            Registrar primera novedad
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(n => (
            <NovedadCard
              key={n.id}
              n={n}
              onEdit={setEditing}
              onDelete={handleDelete}
              canManage={canManage(n)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
