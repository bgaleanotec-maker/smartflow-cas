import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Filter, FileText, Clock, CheckCircle, XCircle,
  AlertTriangle, Pause, Send, Eye, ChevronDown, LayoutGrid, List,
} from 'lucide-react'
import { demandsAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const STATUS_CONFIG = {
  borrador: { label: 'Borrador', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: FileText },
  enviada: { label: 'Enviada', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: Send },
  en_evaluacion: { label: 'En Evaluacion', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: Eye },
  aprobada: { label: 'Aprobada', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle },
  en_ejecucion: { label: 'En Ejecucion', color: 'bg-brand-500/10 text-brand-400 border-brand-500/20', icon: Clock },
  pausada: { label: 'Pausada', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: Pause },
  rechazada: { label: 'Rechazada', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: XCircle },
  cerrada: { label: 'Cerrada', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: CheckCircle },
}

function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.borrador
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${config.color}`}>
      <Icon size={10} />
      {config.label}
    </span>
  )
}

function DemandCard({ demand, onClick }) {
  return (
    <div
      onClick={onClick}
      className="card hover:border-brand-500/50 cursor-pointer transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-500">{demand.demand_number}</span>
          {demand.radicado && (
            <span className="text-xs font-mono text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded">
              {demand.radicado}
            </span>
          )}
        </div>
        <StatusBadge status={demand.status} />
      </div>
      <h3 className="text-sm font-medium text-white group-hover:text-brand-300 transition-colors line-clamp-2 mb-2">
        {demand.title}
      </h3>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        {demand.vicepresidencia && <span>{demand.vicepresidencia.name}</span>}
        {demand.sponsor_name && <span>Sponsor: {demand.sponsor_name}</span>}
      </div>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <FileText size={11} />
          <span>{demand.requirements_count} RF</span>
        </div>
        {demand.assigned_to && (
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-brand-700 flex items-center justify-center text-[9px] font-bold">
              {demand.assigned_to.full_name?.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-xs text-slate-400">{demand.assigned_to.full_name}</span>
          </div>
        )}
        {demand.tiene_deadline && demand.fecha_deadline && (
          <span className={`text-xs ${new Date(demand.fecha_deadline) < new Date() ? 'text-red-400' : 'text-slate-500'}`}>
            {new Date(demand.fecha_deadline).toLocaleDateString('es-CO')}
          </span>
        )}
      </div>
    </div>
  )
}

export default function DemandsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [viewMode, setViewMode] = useState('grid') // grid | kanban

  const { data, isLoading } = useQuery({
    queryKey: ['demands', search, statusFilter],
    queryFn: () => demandsAPI.list({
      search: search || undefined,
      status: statusFilter || undefined,
      limit: 100,
    }).then(r => r.data),
  })

  const demands = data?.items || []
  const canCreate = ['admin', 'negocio', 'leader'].includes(user?.role)

  // Kanban columns
  const kanbanColumns = ['borrador', 'enviada', 'en_evaluacion', 'aprobada', 'en_ejecucion', 'pausada', 'cerrada']

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestion de Demanda</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {data?.total || 0} demandas registradas
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => navigate('/demands/new')}
            className="btn-primary flex items-center gap-2"
          >
            <Plus size={16} />
            Nueva Demanda
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, radicado, sponsor..."
            className="input pl-9 py-1.5 text-sm w-full"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input py-1.5 text-sm"
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`p-1.5 rounded ${viewMode === 'kanban' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const count = demands.filter(d => d.status === key).length
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
              className={`text-center px-2 py-1.5 rounded-lg border transition-all ${
                statusFilter === key ? 'border-brand-500 bg-brand-500/10' : 'border-slate-800 bg-slate-800/50 hover:border-slate-700'
              }`}
            >
              <p className="text-lg font-bold text-white">{count}</p>
              <p className="text-[10px] text-slate-500 truncate">{cfg.label}</p>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-500">Cargando demandas...</div>
      ) : viewMode === 'grid' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {demands.map(d => (
            <DemandCard
              key={d.id}
              demand={d}
              onClick={() => navigate(`/demands/${d.id}`)}
            />
          ))}
          {demands.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p>No hay demandas{statusFilter && ` con estado "${STATUS_CONFIG[statusFilter]?.label}"`}</p>
            </div>
          )}
        </div>
      ) : (
        /* Kanban View */
        <div className="flex gap-3 overflow-x-auto pb-4">
          {kanbanColumns.map(col => {
            const colDemands = demands.filter(d => d.status === col)
            const cfg = STATUS_CONFIG[col]
            return (
              <div key={col} className="flex-shrink-0 w-72">
                <div className="flex items-center gap-2 mb-2 px-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-xs text-slate-600">{colDemands.length}</span>
                </div>
                <div className="space-y-2">
                  {colDemands.map(d => (
                    <DemandCard key={d.id} demand={d} onClick={() => navigate(`/demands/${d.id}`)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
