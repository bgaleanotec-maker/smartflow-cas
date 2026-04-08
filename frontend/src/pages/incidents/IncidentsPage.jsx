import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, AlertTriangle, DollarSign, Clock } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { incidentsAPI, adminAPI } from '../../services/api'
import clsx from 'clsx'

const SEVERITY_STYLES = {
  critico: 'bg-red-900/50 text-red-400 border border-red-800',
  alto: 'bg-orange-900/50 text-orange-400 border border-orange-800',
  medio: 'bg-yellow-900/50 text-yellow-400 border border-yellow-800',
  bajo: 'bg-green-900/50 text-green-400 border border-green-800',
}

const STATUS_STYLES = {
  abierto: 'bg-red-900/30 text-red-400',
  en_investigacion: 'bg-blue-900/30 text-blue-400',
  resuelto: 'bg-green-900/30 text-green-400',
  cerrado: 'bg-slate-800 text-slate-500',
}

function IncidentRow({ incident, onClick }) {
  return (
    <div
      onClick={onClick}
      className="card hover:border-slate-600 cursor-pointer transition-all hover:bg-slate-800/30"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-mono text-slate-500">{incident.incident_number}</span>
            <span className={clsx('badge text-xs', SEVERITY_STYLES[incident.severity])}>
              {incident.severity.toUpperCase()}
            </span>
            <span className={clsx('badge text-xs', STATUS_STYLES[incident.status])}>
              {incident.status.replace('_', ' ')}
            </span>
            {incident.has_economic_impact && (
              <span className="badge bg-amber-900/50 text-amber-400 border border-amber-800 text-xs">
                <DollarSign size={10} />
                Impacto económico
              </span>
            )}
          </div>
          <h3 className="font-medium text-slate-100">{incident.title}</h3>
          {incident.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{incident.description}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          {incident.responsible && (
            <div className="w-7 h-7 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold mb-1">
              {incident.responsible.full_name?.slice(0, 2).toUpperCase()}
            </div>
          )}
          <p className="text-xs text-slate-600">
            {new Date(incident.created_at).toLocaleDateString('es-CO')}
          </p>
        </div>
      </div>
    </div>
  )
}

function CreateIncidentModal({ onClose }) {
  const qc = useQueryClient()
  const { data: categories } = useQuery({
    queryKey: ['incident-categories'],
    queryFn: () => adminAPI.incidentCategories().then(r => r.data),
  })
  const { data: businesses } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => adminAPI.businesses().then(r => r.data),
  })

  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: { has_economic_impact: false, severity: 'medio' }
  })
  const hasEconomicImpact = watch('has_economic_impact')

  const mutation = useMutation({
    mutationFn: (data) => incidentsAPI.create({
      ...data,
      has_economic_impact: data.has_economic_impact === 'true' || data.has_economic_impact === true,
      affected_users_count: parseInt(data.affected_users_count) || 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['incidents'])
      toast.success('Incidente creado')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al crear incidente'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">Nuevo incidente</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-6 space-y-4">
          <div>
            <label className="label">Título *</label>
            <input {...register('title', { required: true })} className="input" placeholder="Describe brevemente el incidente..." />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea {...register('description')} className="input h-20 resize-none" placeholder="Detalle del incidente..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Severidad</label>
              <select {...register('severity')} className="input">
                <option value="bajo">Bajo</option>
                <option value="medio">Medio</option>
                <option value="alto">Alto</option>
                <option value="critico">Crítico</option>
              </select>
            </div>
            <div>
              <label className="label">Categoría</label>
              <select {...register('category_id')} className="input">
                <option value="">Sin categoría</option>
                {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Negocio afectado</label>
            <select {...register('business_id')} className="input">
              <option value="">Sin negocio específico</option>
              {businesses?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Usuarios afectados</label>
            <input {...register('affected_users_count')} type="number" min="0" defaultValue="0" className="input" />
          </div>
          <div className="flex items-center gap-3">
            <input {...register('has_economic_impact')} type="checkbox" id="eco" className="w-4 h-4 accent-brand-500" />
            <label htmlFor="eco" className="text-sm text-slate-300">¿Tiene impacto económico?</label>
          </div>
          {hasEconomicImpact && (
            <div>
              <label className="label">Monto estimado ($)</label>
              <input {...register('economic_impact_amount')} type="number" step="0.01" className="input" placeholder="0.00" />
              <textarea {...register('economic_impact_description')} className="input mt-2 h-16 resize-none" placeholder="Describe el impacto económico..." />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="btn-danger flex-1">
              <AlertTriangle size={15} /> Reportar incidente
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function IncidentsPage() {
  const [search, setSearch] = useState('')
  const [severityFilter, setSeverityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const navigate = useNavigate()

  const { data: incidents, isLoading } = useQuery({
    queryKey: ['incidents', search, severityFilter, statusFilter],
    queryFn: () => incidentsAPI.list({
      search,
      severity: severityFilter || undefined,
      status: statusFilter || undefined,
    }).then(r => r.data),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Incidentes</h1>
          <p className="text-slate-400 text-sm mt-0.5">{incidents?.length ?? 0} incidentes</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-danger">
          <Plus size={16} /> Reportar incidente
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar incidentes..." className="input pl-9" />
        </div>
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className="input w-auto">
          <option value="">Todas las severidades</option>
          <option value="critico">Crítico</option>
          <option value="alto">Alto</option>
          <option value="medio">Medio</option>
          <option value="bajo">Bajo</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-auto">
          <option value="">Todos los estados</option>
          <option value="abierto">Abierto</option>
          <option value="en_investigacion">En investigación</option>
          <option value="resuelto">Resuelto</option>
          <option value="cerrado">Cerrado</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="card animate-pulse h-20" />)}
        </div>
      ) : incidents?.length === 0 ? (
        <div className="text-center py-16">
          <AlertTriangle size={48} className="mx-auto mb-3 text-slate-700" />
          <p className="text-slate-400">No hay incidentes registrados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents?.map(inc => (
            <IncidentRow key={inc.id} incident={inc} onClick={() => navigate(`/incidents/${inc.id}`)} />
          ))}
        </div>
      )}

      {showCreate && <CreateIncidentModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
