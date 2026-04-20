import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Newspaper, TrendingUp, AlertTriangle, CheckCircle,
  Search, Loader2, Calendar, Star, X, Edit3, Trash2, Download,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { hechosAPI } from '../../services/api'
import VoiceInputButton from '../../components/voice/VoiceInputButton'
import { useAuthStore } from '../../stores/authStore'

const IMPACT_COLORS = {
  alto: 'bg-red-500/10 text-red-400 border-red-500/20',
  medio: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  bajo: 'bg-green-500/10 text-green-400 border-green-500/20',
}

const CATEGORY_ICONS = {
  comercial: TrendingUp, operativo: AlertTriangle,
  estrategico: Star, regulatorio: Newspaper,
}

const STATUS_LABELS = {
  reportado: 'Reportado', en_seguimiento: 'En Seguimiento',
  resuelto: 'Resuelto', cerrado: 'Cerrado',
}

function getCurrentWeek() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  const diff = now - start + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60000)
  return Math.ceil(diff / 604800000)
}

const EMPTY_FORM = (week, year) => ({
  title: '', description: '', category: 'comercial',
  impact_level: 'medio', week_number: week, year,
  action_required: '', responsible_name: '', status: 'reportado',
})

// ─── Edit/Create Form (shared) ────────────────────────────────────────────────
function HechoForm({ initial, onSave, onCancel, saving, title: formTitle }) {
  const [form, setForm] = useState(initial)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  return (
    <div className="card border-brand-500/30 bg-slate-900">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">{formTitle}</h3>
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
      </div>
      <div className="space-y-3">
        <input className="input w-full" placeholder="Título del hecho relevante *"
          value={form.title} onChange={e => set('title', e.target.value)} />
        <div className="relative">
          <textarea className="input w-full h-24 pr-10" placeholder="Descripción detallada..."
            value={form.description} onChange={e => set('description', e.target.value)} />
          <VoiceInputButton onText={t => set('description', (form.description ? form.description + ' ' : '') + t)}
            className="absolute bottom-2 right-2" />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
            <option value="comercial">Comercial</option>
            <option value="operativo">Operativo</option>
            <option value="estrategico">Estratégico</option>
            <option value="regulatorio">Regulatorio</option>
          </select>
          <select className="input" value={form.impact_level} onChange={e => set('impact_level', e.target.value)}>
            <option value="alto">Impacto Alto</option>
            <option value="medio">Impacto Medio</option>
            <option value="bajo">Impacto Bajo</option>
          </select>
          <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="reportado">Reportado</option>
            <option value="en_seguimiento">En Seguimiento</option>
            <option value="resuelto">Resuelto</option>
            <option value="cerrado">Cerrado</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input type="number" className="input" placeholder="Semana" min={1} max={53}
            value={form.week_number} onChange={e => set('week_number', Number(e.target.value))} />
          <input type="number" className="input" placeholder="Año"
            value={form.year} onChange={e => set('year', Number(e.target.value))} />
        </div>
        <div className="relative">
          <textarea className="input w-full h-16 pr-10" placeholder="Acción requerida..."
            value={form.action_required} onChange={e => set('action_required', e.target.value)} />
          <VoiceInputButton onText={t => set('action_required', (form.action_required ? form.action_required + ' ' : '') + t)}
            className="absolute bottom-2 right-2" />
        </div>
        <input className="input w-full" placeholder="Responsable"
          value={form.responsible_name} onChange={e => set('responsible_name', e.target.value)} />
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={() => form.title && onSave(form)} disabled={!form.title || saving}
            className="btn-primary flex-1">
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function HechosPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const currentWeek = getCurrentWeek()
  const currentYear = new Date().getFullYear()

  const { data: hechos, isLoading } = useQuery({
    queryKey: ['hechos'],
    queryFn: () => hechosAPI.list({ limit: 200 }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data) => hechosAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['hechos'])
      setShowForm(false)
      toast.success('Hecho relevante registrado')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al crear'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => hechosAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['hechos'])
      setEditingId(null)
      toast.success('Hecho actualizado')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al actualizar'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => hechosAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries(['hechos']); toast.success('Hecho eliminado') },
    onError: () => toast.error('Error al eliminar'),
  })

  const canManage = (h) => {
    const role = user?.role
    return role === 'admin' || role === 'leader' || role === 'lider_sr'
      || h.created_by?.id === user?.id
  }

  const handleDownload = () => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
    const BASE = import.meta.env.VITE_API_URL || '/api/v1'
    const url = `${BASE}/hechos/export/csv`
    const a = document.createElement('a')
    a.href = url
    a.download = 'hechos_relevantes.csv'
    // Pass auth via a short-lived URL trick using fetch
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const burl = URL.createObjectURL(blob)
        a.href = burl
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(burl)
      })
      .catch(() => toast.error('Error al descargar'))
  }

  const filtered = (hechos || []).filter(h =>
    !search || h.title.toLowerCase().includes(search.toLowerCase())
  )

  const byWeek = {}
  filtered.forEach(h => {
    const key = `Semana ${h.week_number} - ${h.year}`
    if (!byWeek[key]) byWeek[key] = []
    byWeek[key].push(h)
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Hechos Relevantes</h1>
          <p className="text-slate-400 text-sm">Hitos importantes de la semana para temas comerciales y del negocio</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors">
            <Download size={14} /> Exportar CSV
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nuevo Hecho
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total esta semana', value: filtered.filter(h => h.week_number === currentWeek).length, color: 'text-brand-400' },
          { label: 'Impacto Alto', value: filtered.filter(h => h.impact_level === 'alto').length, color: 'text-red-400' },
          { label: 'En Seguimiento', value: filtered.filter(h => h.status === 'en_seguimiento').length, color: 'text-yellow-400' },
          { label: 'Resueltos', value: filtered.filter(h => h.status === 'resuelto').length, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar hechos..." className="input pl-9 py-1.5 text-sm w-full" />
      </div>

      {/* Create Form */}
      {showForm && (
        <HechoForm
          title="Registrar Hecho Relevante"
          initial={EMPTY_FORM(currentWeek, currentYear)}
          onSave={(data) => createMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          saving={createMutation.isPending}
        />
      )}

      {/* Hechos grouped by week */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-500"><Loader2 className="animate-spin mx-auto" /></div>
      ) : (
        Object.entries(byWeek).map(([weekLabel, items]) => (
          <div key={weekLabel}>
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={14} className="text-brand-400" />
              <h3 className="text-sm font-semibold text-slate-300">{weekLabel}</h3>
              <span className="text-xs text-slate-600">{items.length} hechos</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {items.map(h => {
                const CatIcon = CATEGORY_ICONS[h.category] || Newspaper
                if (editingId === h.id) {
                  return (
                    <div key={h.id} className="sm:col-span-2 lg:col-span-3">
                      <HechoForm
                        title="Editar Hecho Relevante"
                        initial={{
                          title: h.title, description: h.description || '',
                          category: h.category, impact_level: h.impact_level,
                          week_number: h.week_number, year: h.year,
                          action_required: h.action_required || '',
                          responsible_name: h.responsible_name || '',
                          status: h.status,
                        }}
                        onSave={(data) => updateMutation.mutate({ id: h.id, data })}
                        onCancel={() => setEditingId(null)}
                        saving={updateMutation.isPending}
                      />
                    </div>
                  )
                }
                return (
                  <div key={h.id} className="card hover:border-brand-500/30 transition-all group">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                          <CatIcon size={14} className="text-brand-400" />
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${IMPACT_COLORS[h.impact_level]}`}>
                          {h.impact_level}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-600">{STATUS_LABELS[h.status]}</span>
                        {canManage(h) && (
                          <>
                            <button onClick={() => setEditingId(h.id)}
                              className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-brand-400 transition-colors opacity-0 group-hover:opacity-100">
                              <Edit3 size={12} />
                            </button>
                            <button onClick={() => {
                              if (confirm('¿Eliminar este hecho?')) deleteMutation.mutate(h.id)
                            }}
                              className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <h4 className="text-sm font-medium text-white group-hover:text-brand-300 transition-colors mb-1">{h.title}</h4>
                    {h.description && <p className="text-xs text-slate-500 line-clamp-2">{h.description}</p>}
                    {h.action_required && (
                      <div className="mt-2 pt-2 border-t border-slate-800">
                        <p className="text-xs text-yellow-400/80">Acción: {h.action_required}</p>
                      </div>
                    )}
                    {h.responsible_name && <p className="text-[10px] text-slate-600 mt-1">Resp: {h.responsible_name}</p>}
                    {h.created_by && <p className="text-[10px] text-slate-700 mt-0.5">Por: {h.created_by.full_name}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}

      {filtered.length === 0 && !isLoading && (
        <div className="text-center py-12 text-slate-500">
          <Newspaper size={40} className="mx-auto mb-3 opacity-30" />
          <p>No hay hechos relevantes registrados</p>
        </div>
      )}
    </div>
  )
}
