import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, TrendingUp, Clock, AlertTriangle, DollarSign,
  FileText, CheckCircle, XCircle, Loader2, ArrowRight,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { demandsAPI } from '../../services/api'

const STATUS_COLORS = {
  borrador: '#64748b', enviada: '#3b82f6', en_evaluacion: '#eab308',
  aprobada: '#22c55e', en_ejecucion: '#6366f1', pausada: '#f97316',
  rechazada: '#ef4444', cerrada: '#10b981',
}
const STATUS_LABELS = {
  borrador: 'Borrador', enviada: 'Enviada', en_evaluacion: 'Evaluacion',
  aprobada: 'Aprobada', en_ejecucion: 'Ejecucion', pausada: 'Pausada',
  rechazada: 'Rechazada', cerrada: 'Cerrada',
}

function KPICard({ label, value, icon: Icon, color = 'text-brand-400', sub }) {
  return (
    <div className="card text-center">
      <Icon size={18} className={`mx-auto mb-1 ${color}`} />
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[9px] text-slate-600">{sub}</p>}
    </div>
  )
}

export default function DemandDashboardPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['demand-dashboard'],
    queryFn: () => demandsAPI.dashboard().then(r => r.data),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      <Loader2 size={24} className="animate-spin mr-2" /> Cargando dashboard...
    </div>
  )

  const stats = data || {}
  const byStatus = stats.by_status || {}
  const economic = stats.economic_impact || {}
  const aging = stats.aging || {}

  // Prepare chart data
  const statusChartData = Object.entries(byStatus).map(([key, val]) => ({
    name: STATUS_LABELS[key] || key, value: val, fill: STATUS_COLORS[key] || '#6366f1',
  }))

  const monthChartData = (stats.by_month || []).map(m => ({
    name: `${m.month}/${m.year}`, count: m.count,
  }))

  const vpChartData = (stats.by_vicepresidencia || []).slice(0, 8)

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard de Demandas</h1>
        <p className="text-slate-400 text-sm mt-0.5">Vision gerencial de la gestion de demanda TI</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Total Demandas" value={stats.total || 0} icon={FileText} />
        <KPICard label="En Evaluacion" value={byStatus.en_evaluacion || 0} icon={Clock} color="text-yellow-400" />
        <KPICard label="Aprobadas" value={byStatus.aprobada || 0} icon={CheckCircle} color="text-green-400" />
        <KPICard label="En Ejecucion" value={byStatus.en_ejecucion || 0} icon={TrendingUp} color="text-brand-400" />
        <KPICard label="Rechazadas" value={byStatus.rechazada || 0} icon={XCircle} color="text-red-400" />
        <KPICard label="Cerradas" value={byStatus.cerrada || 0} icon={CheckCircle} color="text-emerald-400" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Status distribution */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Distribucion por Estado</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                  {statusChartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly trend */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Demandas por Mes</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff' }} />
                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={{ r: 4, fill: '#6366f1' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By vicepresidencia */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Demandas por Vicepresidencia</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vpChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#64748b', fontSize: 10 }} width={150} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff' }} />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Economic impact */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Impacto Economico</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 rounded-lg bg-slate-800">
              <p className="text-xs text-slate-500">Estimado Total</p>
              <p className="text-lg font-bold text-green-400">${(economic.total_estimado || 0).toLocaleString('es-CO')}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800">
              <p className="text-xs text-slate-500">Real Total</p>
              <p className="text-lg font-bold text-brand-400">${(economic.total_real || 0).toLocaleString('es-CO')}</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-800">
              <p className="text-xs text-slate-500">Con Beneficio</p>
              <p className="text-lg font-bold text-white">{economic.demands_with_benefit || 0}</p>
            </div>
          </div>
          {economic.total_estimado > 0 && (
            <div className="h-4 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-brand-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((economic.total_real || 0) / economic.total_estimado) * 100)}%` }}
              />
            </div>
          )}
          <p className="text-xs text-slate-500 mt-1 text-center">
            {economic.total_estimado > 0 ? `${Math.round(((economic.total_real || 0) / economic.total_estimado) * 100)}% cumplimiento` : 'Sin datos de beneficio'}
          </p>
        </div>
      </div>

      {/* Aging and Alerts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Aging */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4">Envejecimiento del Backlog</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-2xl font-bold text-yellow-400">{aging.over_30 || 0}</p>
              <p className="text-xs text-slate-500">&gt;30 dias</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <p className="text-2xl font-bold text-orange-400">{aging.over_60 || 0}</p>
              <p className="text-xs text-slate-500">&gt;60 dias</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-2xl font-bold text-red-400">{aging.over_90 || 0}</p>
              <p className="text-xs text-slate-500">&gt;90 dias</p>
            </div>
          </div>
        </div>

        {/* Delayed demands */}
        <div className="card">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400" />
            Demandas en Retraso ({stats.delayed_demands?.length || 0})
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(stats.delayed_demands || []).map(d => (
              <div
                key={d.id}
                onClick={() => navigate(`/demands/${d.id}`)}
                className="flex items-center justify-between p-2 rounded-lg bg-red-500/5 border border-red-500/10 cursor-pointer hover:bg-red-500/10"
              >
                <div>
                  <span className="text-xs font-mono text-slate-500">{d.demand_number}</span>
                  <p className="text-sm text-white truncate max-w-[200px]">{d.title}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-red-400 font-semibold">{d.days_overdue}d retraso</p>
                  <p className="text-[10px] text-slate-600">{d.assigned_to || 'Sin asignar'}</p>
                </div>
              </div>
            ))}
            {(!stats.delayed_demands || stats.delayed_demands.length === 0) && (
              <p className="text-sm text-slate-500 text-center py-4">Sin demandas en retraso</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
