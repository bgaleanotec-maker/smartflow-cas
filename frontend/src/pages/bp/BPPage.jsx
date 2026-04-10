import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, Plus, AlertCircle, CheckCircle2, BarChart3,
  DollarSign, Target, Loader2, X, Calendar,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { bpAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { adminAPI } from '../../services/api'

const STATUS_CONFIG = {
  borrador: { label: 'Borrador', color: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  en_revision: { label: 'En Revisión', color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  aprobado: { label: 'Aprobado', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  vigente: { label: 'Vigente', color: 'bg-green-500/15 text-green-400 border-green-500/30' },
  cerrado: { label: 'Cerrado', color: 'bg-slate-600/15 text-slate-500 border-slate-600/30' },
}

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [2025, 2026, 2027, 2028, 2029, 2030]

function formatCOP(value) {
  if (value == null) return '—'
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value?.toLocaleString('es-CO') || 0}`
}

function BusinessCard({ summary, onNavigate }) {
  const hasData = summary.latest_bp_id != null
  const statusCfg = summary.status ? (STATUS_CONFIG[summary.status] || STATUS_CONFIG.borrador) : null

  return (
    <div
      className={clsx(
        'card border cursor-pointer hover:border-brand-500/50 transition-all duration-150 group',
        hasData ? 'border-slate-700/50' : 'border-slate-700/30 opacity-70',
      )}
      style={{ borderLeftWidth: '3px', borderLeftColor: summary.business_color || '#6366f1' }}
      onClick={() => hasData && onNavigate(summary.latest_bp_id)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-slate-100 group-hover:text-brand-300 transition-colors">
            {summary.business_name}
          </h3>
          {hasData && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Calendar size={11} />
                {summary.year}
              </span>
              {statusCfg && (
                <span className={clsx('badge text-xs border', statusCfg.color)}>
                  {statusCfg.label}
                </span>
              )}
            </div>
          )}
        </div>
        {!hasData && (
          <span className="text-xs text-slate-600 italic">Sin BP</span>
        )}
      </div>

      {hasData ? (
        <>
          {/* Financial metrics */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-0.5">Ingresos</p>
              <p className="text-sm font-semibold text-green-400">
                {formatCOP(summary.total_ingresos_plan)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-0.5">Costos</p>
              <p className="text-sm font-semibold text-red-400">
                {formatCOP(summary.total_costos_plan)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-0.5">Margen</p>
              <p className={clsx(
                'text-sm font-semibold',
                summary.margen_bruto_plan != null
                  ? summary.margen_bruto_plan >= 0 ? 'text-brand-400' : 'text-red-400'
                  : 'text-slate-500',
              )}>
                {summary.margen_bruto_plan != null ? `${summary.margen_bruto_plan.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>

          {/* Activity stats */}
          <div className="border-t border-slate-700/50 pt-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <Target size={11} />
                {summary.activities_total} actividades
              </span>
              <span className="flex items-center gap-1 text-green-400">
                <CheckCircle2 size={11} />
                {summary.activities_completed}
              </span>
              {summary.activities_overdue > 0 && (
                <span className="flex items-center gap-1 text-red-400 font-medium">
                  <AlertCircle size={11} />
                  {summary.activities_overdue} vencidas
                </span>
              )}
            </div>
            {/* Completion progress */}
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full"
                  style={{ width: `${summary.completion_pct}%` }}
                />
              </div>
              <span className="text-xs text-slate-500">{summary.completion_pct}%</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-600 mt-1">
          No hay plan de negocio registrado para este negocio.
        </p>
      )}
    </div>
  )
}

function CreateBPModal({ onClose, businesses }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    business_id: '',
    year: CURRENT_YEAR,
    name: '',
    description: '',
    status: 'borrador',
    scope: 'CAS',
  })

  const createMutation = useMutation({
    mutationFn: (data) => bpAPI.create(data),
    onSuccess: (res) => {
      qc.invalidateQueries(['bp-dashboard'])
      qc.invalidateQueries(['bps'])
      toast.success('Plan de negocio creado')
      onClose(res.data?.id)
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al crear BP'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.business_id) return toast.error('Selecciona un negocio')
    createMutation.mutate({ ...form, business_id: parseInt(form.business_id) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-slate-100">Nuevo Plan de Negocio</h2>
          <button onClick={() => onClose(null)} className="text-slate-400 hover:text-slate-100">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Negocio *</label>
            <select
              className="input"
              value={form.business_id}
              onChange={(e) => setForm({ ...form, business_id: e.target.value })}
              required
            >
              <option value="">Seleccionar negocio...</option>
              {(businesses || []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Año *</label>
              <select
                className="input"
                value={form.year}
                onChange={(e) => setForm({ ...form, year: parseInt(e.target.value) })}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Estado</label>
              <select
                className="input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Nombre (opcional)</label>
            <input
              type="text"
              className="input"
              placeholder="Ej: BP Vantilisto 2026 v1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Contexto o notas del plan..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => onClose(null)}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : 'Crear BP'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function BPPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [yearFilter, setYearFilter] = useState(CURRENT_YEAR)
  const [showCreate, setShowCreate] = useState(false)

  const canWrite = ['admin', 'leader'].includes(user?.role)

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['bp-dashboard', yearFilter],
    queryFn: () => bpAPI.dashboard({ year: yearFilter }).then((r) => r.data),
  })

  const { data: businessesData } = useQuery({
    queryKey: ['admin-businesses'],
    queryFn: () => adminAPI.businesses().then((r) => r.data),
    enabled: showCreate,
  })

  const handleNavigate = (bpId) => {
    navigate(`/bp/${bpId}`)
  }

  const handleCreateClose = (newBpId) => {
    setShowCreate(false)
    if (newBpId) navigate(`/bp/${newBpId}`)
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={22} className="text-brand-400" />
            <h1 className="text-2xl font-bold text-slate-100">Plan de Negocio</h1>
            <span className="badge bg-brand-500/15 text-brand-400 border border-brand-500/30 text-xs">CAS</span>
          </div>
          <p className="text-slate-400 text-sm">Seguimiento de presupuesto, KPIs y actividades estratégicas por negocio</p>
        </div>
        {canWrite && (
          <button className="btn-primary flex items-center gap-2 flex-shrink-0" onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            Nuevo BP
          </button>
        )}
      </div>

      {/* Year filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Año:</span>
        <div className="flex gap-1">
          {YEARS.map((y) => (
            <button
              key={y}
              onClick={() => setYearFilter(y)}
              className={clsx(
                'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                yearFilter === y
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-100',
              )}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      {dashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card border border-slate-700/50">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><BarChart3 size={12} /> BPs Activos</p>
            <p className="text-2xl font-bold text-slate-100">{dashboard.total_bps}</p>
          </div>
          <div className="card border border-slate-700/50">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><Target size={12} /> Total Actividades</p>
            <p className="text-2xl font-bold text-slate-100">{dashboard.total_activities}</p>
          </div>
          <div className="card border border-slate-700/50">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><AlertCircle size={12} /> Vencidas</p>
            <p className={clsx('text-2xl font-bold', dashboard.total_overdue > 0 ? 'text-red-400' : 'text-slate-100')}>
              {dashboard.total_overdue}
            </p>
          </div>
          <div className="card border border-slate-700/50">
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1"><DollarSign size={12} /> Negocios con BP</p>
            <p className="text-2xl font-bold text-slate-100">{dashboard.total_businesses_with_bp}</p>
          </div>
        </div>
      )}

      {/* Business cards grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-brand-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(dashboard?.businesses || []).map((summary) => (
            <BusinessCard
              key={summary.business_id}
              summary={summary}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateBPModal
          onClose={handleCreateClose}
          businesses={businessesData || []}
        />
      )}
    </div>
  )
}
