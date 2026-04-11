import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Newspaper, TrendingUp, AlertTriangle, CheckCircle,
  Search, Loader2, Calendar, Star, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { hechosAPI } from '../../services/api'
import VoiceInputButton from '../../components/voice/VoiceInputButton'

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

export default function HechosPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const currentWeek = getCurrentWeek()
  const currentYear = new Date().getFullYear()

  const [form, setForm] = useState({
    title: '', description: '', category: 'comercial',
    impact_level: 'medio', week_number: currentWeek, year: currentYear,
    action_required: '', responsible_name: '',
  })

  const { data: hechos, isLoading } = useQuery({
    queryKey: ['hechos'],
    queryFn: () => hechosAPI.list({ limit: 100 }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data) => hechosAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['hechos'])
      setShowForm(false)
      setForm({ title: '', description: '', category: 'comercial', impact_level: 'medio', week_number: currentWeek, year: currentYear, action_required: '', responsible_name: '' })
      toast.success('Hecho relevante registrado')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const filtered = (hechos || []).filter(h =>
    !search || h.title.toLowerCase().includes(search.toLowerCase())
  )

  // Group by week
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
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nuevo Hecho
        </button>
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
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar hechos..." className="input pl-9 py-1.5 text-sm w-full" />
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="card border-brand-500/30 bg-slate-900">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Registrar Hecho Relevante</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
          </div>
          <div className="space-y-3">
            <input className="input w-full" placeholder="Titulo del hecho relevante *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            <div className="relative">
              <textarea className="input w-full h-24 pr-10" placeholder="Descripcion detallada..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              <VoiceInputButton onText={(t) => setForm(p => ({ ...p, description: p.description ? p.description + ' ' + t : t }))} className="absolute bottom-2 right-2" />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <select className="input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                <option value="comercial">Comercial</option>
                <option value="operativo">Operativo</option>
                <option value="estrategico">Estrategico</option>
                <option value="regulatorio">Regulatorio</option>
              </select>
              <select className="input" value={form.impact_level} onChange={e => setForm(p => ({ ...p, impact_level: e.target.value }))}>
                <option value="alto">Impacto Alto</option>
                <option value="medio">Impacto Medio</option>
                <option value="bajo">Impacto Bajo</option>
              </select>
              <div className="flex gap-2">
                <input type="number" className="input w-20" placeholder="Sem" value={form.week_number} onChange={e => setForm(p => ({ ...p, week_number: Number(e.target.value) }))} />
                <input type="number" className="input w-24" placeholder="Ano" value={form.year} onChange={e => setForm(p => ({ ...p, year: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="relative">
              <textarea className="input w-full h-16 pr-10" placeholder="Accion requerida..." value={form.action_required} onChange={e => setForm(p => ({ ...p, action_required: e.target.value }))} />
              <VoiceInputButton onText={(t) => setForm(p => ({ ...p, action_required: p.action_required ? p.action_required + ' ' + t : t }))} className="absolute bottom-2 right-2" />
            </div>
            <input className="input w-full" placeholder="Responsable" value={form.responsible_name} onChange={e => setForm(p => ({ ...p, responsible_name: e.target.value }))} />
            <button onClick={() => form.title && createMutation.mutate(form)} disabled={!form.title} className="btn-primary">
              Registrar Hecho
            </button>
          </div>
        </div>
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
                      <span className="text-[10px] text-slate-600">{STATUS_LABELS[h.status]}</span>
                    </div>
                    <h4 className="text-sm font-medium text-white group-hover:text-brand-300 transition-colors mb-1">{h.title}</h4>
                    {h.description && <p className="text-xs text-slate-500 line-clamp-2">{h.description}</p>}
                    {h.action_required && (
                      <div className="mt-2 pt-2 border-t border-slate-800">
                        <p className="text-xs text-yellow-400/80">Accion: {h.action_required}</p>
                      </div>
                    )}
                    {h.responsible_name && <p className="text-[10px] text-slate-600 mt-1">Resp: {h.responsible_name}</p>}
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
