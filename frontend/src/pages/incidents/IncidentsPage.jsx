import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, AlertTriangle, DollarSign, Clock, Pencil, Trash2, X, Users, TrendingUp, Building2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { incidentsAPI, adminAPI, usersAPI } from '../../services/api'
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

const STATUS_LABELS = {
  abierto: 'Abierto',
  en_investigacion: 'Investigación',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
}

function formatCurrency(amount) {
  if (!amount) return null
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount)
}

function BusinessSummaryPanel({ incidents, businesses }) {
  if (!incidents || incidents.length === 0) return null

  // Build per-business summary from incidents
  const bizMap = {}
  businesses?.forEach(b => {
    bizMap[b.id] = { ...b, count: 0, economic: 0, affected: 0, statuses: {} }
  })
  // also "no business"
  bizMap[0] = { id: 0, name: 'Sin negocio', color: '#64748b', count: 0, economic: 0, affected: 0, statuses: {} }

  incidents.forEach(inc => {
    const key = inc.business_id || 0
    if (!bizMap[key]) bizMap[key] = { id: key, name: inc.business?.name || 'Sin negocio', color: '#64748b', count: 0, economic: 0, affected: 0, statuses: {} }
    bizMap[key].count++
    if (inc.has_economic_impact && inc.economic_impact_amount) bizMap[key].economic += parseFloat(inc.economic_impact_amount)
    if (inc.affected_users_count) bizMap[key].affected += inc.affected_users_count
    const s = inc.status || 'abierto'
    bizMap[key].statuses[s] = (bizMap[key].statuses[s] || 0) + 1
  })

  const items = Object.values(bizMap).filter(b => b.count > 0).sort((a, b) => b.count - a.count)
  if (items.length === 0) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {items.map(biz => (
        <div key={biz.id} className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: biz.color || '#6366f1' }} />
            <span className="font-medium text-slate-200 text-sm truncate">{biz.name}</span>
            <span className="ml-auto text-xs font-bold text-slate-300">{biz.count}</span>
          </div>
          {biz.economic > 0 && (
            <div className="flex items-center gap-1.5 text-amber-400 text-xs">
              <DollarSign size={12} />
              <span>{formatCurrency(biz.economic)}</span>
            </div>
          )}
          {biz.affected > 0 && (
            <div className="flex items-center gap-1.5 text-blue-400 text-xs">
              <Users size={12} />
              <span>{biz.affected.toLocaleString()} usuarios afectados</span>
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {Object.entries(biz.statuses).map(([status, count]) => (
              <span key={status} className={clsx('text-xs px-1.5 py-0.5 rounded-full', STATUS_STYLES[status] || 'bg-slate-800 text-slate-400')}>
                {count} {STATUS_LABELS[status] || status}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function IncidentRow({ incident, onClick, onEdit, onDelete }) {
  return (
    <div
      onClick={onClick}
      className="card hover:border-slate-600 cursor-pointer transition-all hover:bg-slate-800/30 group relative"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-mono text-slate-500">{incident.incident_number}</span>
            <span className={clsx('badge text-xs', SEVERITY_STYLES[incident.severity])}>
              {incident.severity?.toUpperCase()}
            </span>
            <span className={clsx('badge text-xs', STATUS_STYLES[incident.status])}>
              {STATUS_LABELS[incident.status] || incident.status?.replace('_', ' ')}
            </span>
            {incident.business_id && (
              <span className="badge text-xs bg-slate-800 text-slate-300 flex items-center gap-1">
                <Building2 size={10} />
                {incident.business?.name || `Negocio #${incident.business_id}`}
              </span>
            )}
            {incident.has_economic_impact && incident.economic_impact_amount && (
              <span className="badge bg-amber-900/50 text-amber-400 border border-amber-800 text-xs flex items-center gap-1">
                <DollarSign size={10} />
                {formatCurrency(incident.economic_impact_amount)}
              </span>
            )}
            {incident.has_economic_impact && !incident.economic_impact_amount && (
              <span className="badge bg-amber-900/50 text-amber-400 border border-amber-800 text-xs">
                <DollarSign size={10} /> Impacto económico
              </span>
            )}
            {incident.affected_users_count > 0 && (
              <span className="badge bg-blue-900/30 text-blue-400 text-xs flex items-center gap-1">
                <Users size={10} />
                {incident.affected_users_count} usuarios
              </span>
            )}
          </div>
          <h3 className="font-medium text-slate-100">{incident.title}</h3>
          {incident.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{incident.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            {incident.responsible && (
              <div className="w-7 h-7 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold mb-1">
                {incident.responsible.full_name?.slice(0, 2).toUpperCase()}
              </div>
            )}
            <p className="text-xs text-slate-600">
              {new Date(incident.created_at).toLocaleDateString('es-CO')}
            </p>
          </div>
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(incident) }}
              className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors"
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(incident) }}
              className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
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
      category_id: data.category_id ? parseInt(data.category_id) : null,
      business_id: data.business_id ? parseInt(data.business_id) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['incidents'])
      toast.success('Incidente creado')
      onClose()
    },
    onError: (err) => {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map(d => d.msg).join(', ')
        : (typeof detail === 'string' ? detail : 'Error al crear incidente')
      toast.error(msg)
    },
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

function EditIncidentModal({ incident, onClose }) {
  const qc = useQueryClient()
  const { data: categories } = useQuery({
    queryKey: ['incident-categories'],
    queryFn: () => adminAPI.incidentCategories().then(r => r.data),
  })
  const { data: businesses } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => adminAPI.businesses().then(r => r.data),
  })
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersAPI.list().then(r => r.data?.items || r.data || []),
  })

  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: {
      title: incident.title || '',
      description: incident.description || '',
      severity: incident.severity || 'medio',
      status: incident.status || 'abierto',
      category_id: incident.category_id || '',
      business_id: incident.business_id || '',
      responsible_id: incident.responsible_id || incident.responsible?.id || '',
      affected_users_count: incident.affected_users_count || 0,
      has_economic_impact: incident.has_economic_impact || false,
      economic_impact_amount: incident.economic_impact_amount || '',
      economic_impact_description: incident.economic_impact_description || '',
    }
  })
  const hasEconomicImpact = watch('has_economic_impact')

  const mutation = useMutation({
    mutationFn: (data) => incidentsAPI.update(incident.id, {
      ...data,
      has_economic_impact: data.has_economic_impact === 'true' || data.has_economic_impact === true,
      affected_users_count: parseInt(data.affected_users_count) || 0,
      category_id: data.category_id ? parseInt(data.category_id) : null,
      business_id: data.business_id ? parseInt(data.business_id) : null,
      responsible_id: data.responsible_id ? parseInt(data.responsible_id) : null,
      economic_impact_amount: data.economic_impact_amount ? parseFloat(data.economic_impact_amount) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['incidents'])
      qc.invalidateQueries(['incident', String(incident.id)])
      toast.success('Incidente actualizado')
      onClose()
    },
    onError: (err) => {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map(d => d.msg).join(', ')
        : (typeof detail === 'string' ? detail : 'Error al actualizar incidente')
      toast.error(msg)
    },
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Pencil size={16} className="text-blue-400" /> Editar incidente {incident.incident_number}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-6 space-y-4">
          <div>
            <label className="label">Título *</label>
            <input {...register('title', { required: true })} className="input" />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea {...register('description')} className="input h-20 resize-none" />
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
              <label className="label">Estado</label>
              <select {...register('status')} className="input">
                <option value="abierto">Abierto</option>
                <option value="en_investigacion">En investigación</option>
                <option value="resuelto">Resuelto</option>
                <option value="cerrado">Cerrado</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Categoría</label>
              <select {...register('category_id')} className="input">
                <option value="">Sin categoría</option>
                {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Negocio</label>
              <select {...register('business_id')} className="input">
                <option value="">Sin negocio</option>
                {businesses?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Responsable</label>
            <select {...register('responsible_id')} className="input">
              <option value="">Sin asignar</option>
              {users?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Usuarios afectados</label>
            <input {...register('affected_users_count')} type="number" min="0" className="input" />
          </div>
          <div className="flex items-center gap-3">
            <input {...register('has_economic_impact')} type="checkbox" id="eco-edit" className="w-4 h-4 accent-brand-500" />
            <label htmlFor="eco-edit" className="text-sm text-slate-300">¿Tiene impacto económico?</label>
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
            <button type="submit" disabled={isSubmitting || mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
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
  const [businessFilter, setBusinessFilter] = useState('')
  const [showSummary, setShowSummary] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingIncident, setEditingIncident] = useState(null)
  const [deletingIncident, setDeletingIncident] = useState(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: businesses } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => adminAPI.businesses().then(r => r.data),
  })

  // All incidents (no business filter) for summary panel
  const { data: allIncidents } = useQuery({
    queryKey: ['incidents-all'],
    queryFn: () => incidentsAPI.list({ limit: 200 }).then(r => r.data),
  })

  const { data: incidents, isLoading } = useQuery({
    queryKey: ['incidents', search, severityFilter, statusFilter, businessFilter],
    queryFn: () => incidentsAPI.list({
      search,
      severity: severityFilter || undefined,
      status: statusFilter || undefined,
      business_id: businessFilter ? parseInt(businessFilter) : undefined,
    }).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => incidentsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries(['incidents'])
      qc.invalidateQueries(['incidents-all'])
      toast.success('Incidente eliminado')
      setDeletingIncident(null)
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Error al eliminar incidente'),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Incidentes</h1>
          <p className="text-slate-400 text-sm mt-0.5">{incidents?.length ?? 0} incidentes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSummary(v => !v)}
            className={clsx('btn-ghost text-xs px-3 py-2 flex items-center gap-1.5', showSummary ? 'text-brand-400' : 'text-slate-500')}
          >
            <TrendingUp size={14} /> {showSummary ? 'Ocultar' : 'Ver'} resumen
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-danger">
            <Plus size={16} /> Reportar incidente
          </button>
        </div>
      </div>

      {/* Business Summary Panel */}
      {showSummary && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Resumen por negocio</p>
          <BusinessSummaryPanel incidents={allIncidents} businesses={businesses} />
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar incidentes..." className="input pl-9" />
        </div>
        <select value={businessFilter} onChange={e => setBusinessFilter(e.target.value)} className="input w-auto">
          <option value="">Todos los negocios</option>
          {businesses?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
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
            <IncidentRow
              key={inc.id}
              incident={inc}
              onClick={() => navigate(`/incidents/${inc.id}`)}
              onEdit={(inc) => setEditingIncident(inc)}
              onDelete={(inc) => setDeletingIncident(inc)}
            />
          ))}
        </div>
      )}

      {showCreate && <CreateIncidentModal onClose={() => setShowCreate(false)} />}

      {editingIncident && (
        <EditIncidentModal incident={editingIncident} onClose={() => setEditingIncident(null)} />
      )}

      {deletingIncident && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-900/50 rounded-xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
              <h3 className="font-semibold text-slate-100">¿Eliminar incidente?</h3>
            </div>
            <p className="text-sm text-slate-400 mb-2">
              <span className="font-mono text-slate-300">{deletingIncident.incident_number}</span> — {deletingIncident.title}
            </p>
            <p className="text-xs text-slate-500 mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletingIncident(null)} className="btn-secondary">Cancelar</button>
              <button
                onClick={() => deleteMutation.mutate(deletingIncident.id)}
                disabled={deleteMutation.isPending}
                className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
