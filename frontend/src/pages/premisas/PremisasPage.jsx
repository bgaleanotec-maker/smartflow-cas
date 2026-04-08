import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Landmark, TrendingUp, TrendingDown, AlertTriangle,
  Search, Loader2, DollarSign, CheckCircle, X, Brain, Clock,
  BarChart3,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import toast from 'react-hot-toast'
import { premisasAPI, aiAPI } from '../../services/api'

const STATUS_CONFIG = {
  activa: { label: 'Activa', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  en_revision: { label: 'En Revision', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  aprobada: { label: 'Aprobada', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  descartada: { label: 'Descartada', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  vencida: { label: 'Vencida', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
}

const CATEGORY_LABELS = {
  presupuesto: 'Presupuesto', ingresos: 'Ingresos',
  costos: 'Costos', mercado: 'Mercado', regulatorio: 'Regulatorio',
}

export default function PremisasPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState('')
  const currentYear = new Date().getFullYear()

  const [form, setForm] = useState({
    title: '', description: '', category: 'presupuesto',
    budget_year: currentYear, budget_line: '',
    estimated_amount: '', assumption_basis: '',
    risk_if_wrong: '', recommendations: '',
    responsible_name: '',
  })

  const { data: premisas, isLoading } = useQuery({
    queryKey: ['premisas'],
    queryFn: () => premisasAPI.list({ limit: 100 }).then(r => r.data),
  })

  const { data: stats } = useQuery({
    queryKey: ['premisas-stats'],
    queryFn: () => premisasAPI.dashboard().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data) => premisasAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['premisas'])
      qc.invalidateQueries(['premisas-stats'])
      setShowForm(false)
      setForm({ title: '', description: '', category: 'presupuesto', budget_year: currentYear, budget_line: '', estimated_amount: '', assumption_basis: '', risk_if_wrong: '', recommendations: '', responsible_name: '' })
      toast.success('Premisa registrada')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const handleAIAssist = async () => {
    setAiLoading(true)
    try {
      const context = premisas ? `Premisas activas: ${premisas.length}. Total estimado: $${stats?.total_estimated?.toLocaleString() || 0}. Total real: $${stats?.total_actual?.toLocaleString() || 0}` : ''
      const res = await aiAPI.assist({ prompt: 'Dame recomendaciones para las premisas de presupuesto actuales', context, module: 'premisas' })
      setAiResponse(res.data.response)
    } catch {
      setAiResponse('Error al obtener recomendaciones. Verifica la configuracion de IA en Integraciones.')
    } finally {
      setAiLoading(false)
    }
  }

  const filtered = (premisas || []).filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  )

  // Chart data for budget comparison
  const chartData = filtered
    .filter(p => p.estimated_amount || p.actual_amount)
    .slice(0, 8)
    .map(p => ({
      name: p.title.substring(0, 20) + (p.title.length > 20 ? '...' : ''),
      estimado: p.estimated_amount || 0,
      real: p.actual_amount || 0,
    }))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Premisas del Negocio</h1>
          <p className="text-slate-400 text-sm">Seguimiento de premisas para el presupuesto y planificacion</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAIAssist} disabled={aiLoading} className="btn-ghost flex items-center gap-1.5 text-sm">
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
            Recomendaciones IA
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nueva Premisa
          </button>
        </div>
      </div>

      {/* AI Response */}
      {aiResponse && (
        <div className="card border-purple-500/30 bg-purple-900/10">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-purple-400" />
              <h3 className="text-sm font-semibold text-purple-300">Asistente IA</h3>
            </div>
            <button onClick={() => setAiResponse('')} className="text-slate-500 hover:text-slate-300"><X size={14} /></button>
          </div>
          <div className="text-sm text-slate-300 whitespace-pre-wrap">{aiResponse}</div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card text-center">
            <Landmark size={18} className="mx-auto mb-1 text-brand-400" />
            <p className="text-2xl font-bold text-brand-400">{stats.total || 0}</p>
            <p className="text-[10px] text-slate-500">Total Premisas</p>
          </div>
          <div className="card text-center">
            <TrendingUp size={18} className="mx-auto mb-1 text-green-400" />
            <p className="text-xl font-bold text-green-400">${(stats.total_estimated || 0).toLocaleString('es-CO')}</p>
            <p className="text-[10px] text-slate-500">Estimado Total</p>
          </div>
          <div className="card text-center">
            <DollarSign size={18} className="mx-auto mb-1 text-blue-400" />
            <p className="text-xl font-bold text-blue-400">${(stats.total_actual || 0).toLocaleString('es-CO')}</p>
            <p className="text-[10px] text-slate-500">Real Total</p>
          </div>
          <div className="card text-center">
            <BarChart3 size={18} className="mx-auto mb-1 text-yellow-400" />
            <p className="text-xl font-bold text-yellow-400">
              {stats.total_estimated ? Math.round((stats.total_actual / stats.total_estimated) * 100) : 0}%
            </p>
            <p className="text-[10px] text-slate-500">Ejecucion</p>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Estimado vs Real</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff' }} />
                <Bar dataKey="estimado" fill="#22c55e" radius={[4, 4, 0, 0]} name="Estimado" />
                <Bar dataKey="real" fill="#6366f1" radius={[4, 4, 0, 0]} name="Real" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar premisas..." className="input pl-9 py-1.5 text-sm w-full" />
      </div>

      {/* Form */}
      {showForm && (
        <div className="card border-brand-500/30 bg-slate-900">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Nueva Premisa</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
          </div>
          <div className="space-y-3">
            <input className="input w-full" placeholder="Titulo de la premisa *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            <textarea className="input w-full h-20" placeholder="Descripcion..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            <div className="grid sm:grid-cols-3 gap-3">
              <select className="input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                <option value="presupuesto">Presupuesto</option>
                <option value="ingresos">Ingresos</option>
                <option value="costos">Costos</option>
                <option value="mercado">Mercado</option>
                <option value="regulatorio">Regulatorio</option>
              </select>
              <input type="number" className="input" placeholder="Ano presupuesto" value={form.budget_year} onChange={e => setForm(p => ({ ...p, budget_year: Number(e.target.value) }))} />
              <input className="input" placeholder="Linea presupuestal" value={form.budget_line} onChange={e => setForm(p => ({ ...p, budget_line: e.target.value }))} />
            </div>
            <input type="number" className="input w-full" placeholder="Monto estimado (COP)" value={form.estimated_amount} onChange={e => setForm(p => ({ ...p, estimated_amount: e.target.value }))} />
            <textarea className="input w-full h-16" placeholder="Base de la premisa (en que se fundamenta)" value={form.assumption_basis} onChange={e => setForm(p => ({ ...p, assumption_basis: e.target.value }))} />
            <textarea className="input w-full h-16" placeholder="Riesgo si la premisa es incorrecta" value={form.risk_if_wrong} onChange={e => setForm(p => ({ ...p, risk_if_wrong: e.target.value }))} />
            <input className="input w-full" placeholder="Responsable" value={form.responsible_name} onChange={e => setForm(p => ({ ...p, responsible_name: e.target.value }))} />
            <button onClick={() => form.title && createMutation.mutate({ ...form, estimated_amount: form.estimated_amount ? Number(form.estimated_amount) : null })} disabled={!form.title} className="btn-primary">
              Registrar Premisa
            </button>
          </div>
        </div>
      )}

      {/* Premisas list */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-500"><Loader2 className="animate-spin mx-auto" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const statusCfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.activa
            const hasVariance = p.variance_pct != null
            return (
              <div key={p.id} className="card hover:border-brand-500/30 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-sm font-medium text-white">{p.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-600">{CATEGORY_LABELS[p.category]}</span>
                      <span className="text-xs text-slate-600">{p.budget_year}</span>
                      {p.budget_line && <span className="text-xs text-slate-600">{p.budget_line}</span>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${statusCfg.color}`}>{statusCfg.label}</span>
                </div>
                {p.description && <p className="text-xs text-slate-500 mb-2">{p.description}</p>}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-2 rounded bg-slate-800/50">
                    <p className="text-xs text-slate-500">Estimado</p>
                    <p className="text-sm font-semibold text-green-400">{p.estimated_amount ? `$${Number(p.estimated_amount).toLocaleString('es-CO')}` : '-'}</p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/50">
                    <p className="text-xs text-slate-500">Real</p>
                    <p className="text-sm font-semibold text-blue-400">{p.actual_amount ? `$${Number(p.actual_amount).toLocaleString('es-CO')}` : 'Pendiente'}</p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/50">
                    <p className="text-xs text-slate-500">Varianza</p>
                    <p className={`text-sm font-semibold ${hasVariance ? (p.variance_pct > 0 ? 'text-red-400' : 'text-green-400') : 'text-slate-600'}`}>
                      {hasVariance ? `${p.variance_pct > 0 ? '+' : ''}${Number(p.variance_pct).toFixed(1)}%` : '-'}
                    </p>
                  </div>
                </div>
                {p.assumption_basis && (
                  <div className="mt-2 pt-2 border-t border-slate-800">
                    <p className="text-[10px] text-slate-600">Base: {p.assumption_basis}</p>
                  </div>
                )}
                {p.ai_recommendation && (
                  <div className="mt-2 p-2 rounded bg-purple-500/5 border border-purple-500/10">
                    <div className="flex items-center gap-1 mb-1"><Brain size={10} className="text-purple-400" /><span className="text-[10px] text-purple-400">IA</span></div>
                    <p className="text-xs text-slate-400">{p.ai_recommendation}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {filtered.length === 0 && !isLoading && (
        <div className="text-center py-12 text-slate-500">
          <Landmark size={40} className="mx-auto mb-3 opacity-30" />
          <p>No hay premisas registradas</p>
        </div>
      )}
    </div>
  )
}
