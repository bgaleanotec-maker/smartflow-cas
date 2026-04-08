import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, AlertTriangle, Clock, CheckCircle, XCircle, Target,
  Loader2, Calendar, Filter, Brain, X, Search,
  Plane, Shield, TrendingUp, Users, Zap,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import toast from 'react-hot-toast'
import { activitiesAPI, aiAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const PRIORITY_COLORS = { critica: '#ef4444', alta: '#f97316', media: '#eab308', baja: '#22c55e' }
const STATUS_CONFIG = {
  sin_iniciar: { label: 'Sin Iniciar', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: Clock },
  en_proceso: { label: 'En Proceso', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: TrendingUp },
  completada: { label: 'Completada', color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: CheckCircle },
  vencida: { label: 'Vencida', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: AlertTriangle },
  proxima_a_vencer: { label: 'Proxima a Vencer', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: Zap },
  cancelada: { label: 'Cancelada', color: 'bg-slate-500/10 text-slate-600 border-slate-700', icon: XCircle },
}
const FREQ_LABELS = { unica: 'Unica', diaria: 'Diaria', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' }

export default function TorreControlPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [scopeFilter, setScopeFilter] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const [form, setForm] = useState({
    title: '', description: '', category: 'gestion', frequency: 'semanal',
    scope: 'TODOS', priority: 'media', start_date: new Date().toISOString().split('T')[0],
    day_of_week: 0, day_of_month: 1, reminder_days_before: 1, color: '#6366f1',
  })

  const { data: torre } = useQuery({
    queryKey: ['torre-control', scopeFilter],
    queryFn: () => activitiesAPI.torreControl({ scope: scopeFilter || undefined }).then(r => r.data),
  })

  const { data: activities } = useQuery({
    queryKey: ['activities'],
    queryFn: () => activitiesAPI.list({}).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data) => activitiesAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['torre-control'])
      qc.invalidateQueries(['activities'])
      setShowForm(false)
      toast.success('Actividad creada')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const updateInstanceMutation = useMutation({
    mutationFn: ({ id, data }) => activitiesAPI.updateInstance(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['torre-control'])
      toast.success('Estado actualizado')
    },
  })

  const handleAI = async () => {
    setAiLoading(true)
    try {
      const context = torre ? `Pendientes: ${torre.kpis.pendientes}, Vencidas: ${torre.kpis.vencidas}, Cumplimiento: ${torre.kpis.cumplimiento_pct}%` : ''
      const res = await aiAPI.assist({ prompt: 'Analiza el estado de las actividades y dame recomendaciones de priorizacion', context, module: 'demand' })
      setAiResponse(res.data.response)
    } catch { setAiResponse('Error al obtener recomendaciones') }
    finally { setAiLoading(false) }
  }

  const kpis = torre?.kpis || { pendientes: 0, vencidas: 0, completadas_semana: 0, cumplimiento_pct: 0 }
  const pieData = [
    { name: 'Completadas', value: kpis.completadas_semana, fill: '#22c55e' },
    { name: 'Pendientes', value: kpis.pendientes - kpis.vencidas, fill: '#eab308' },
    { name: 'Vencidas', value: kpis.vencidas, fill: '#ef4444' },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
            <Plane size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Torre de Control</h1>
            <p className="text-slate-400 text-sm">Centro de gestion de actividades recurrentes</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAI} disabled={aiLoading} className="btn-ghost text-sm flex items-center gap-1.5">
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />} IA
          </button>
          <select value={scopeFilter} onChange={e => setScopeFilter(e.target.value)} className="input text-sm py-1.5">
            <option value="">Todos</option>
            <option value="CAS">CAS</option>
            <option value="BO">BO</option>
          </select>
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nueva Actividad
          </button>
        </div>
      </div>

      {/* AI Response */}
      {aiResponse && (
        <div className="card border-purple-500/30 bg-purple-900/10">
          <div className="flex justify-between mb-2">
            <div className="flex items-center gap-2"><Brain size={14} className="text-purple-400" /><span className="text-sm font-semibold text-purple-300">Recomendaciones IA</span></div>
            <button onClick={() => setAiResponse('')}><X size={14} className="text-slate-500" /></button>
          </div>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{aiResponse}</p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card text-center bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <Target size={20} className="mx-auto mb-2 text-brand-400" />
          <p className="text-3xl font-bold text-white">{kpis.pendientes}</p>
          <p className="text-xs text-slate-500">Pendientes</p>
        </div>
        <div className="card text-center bg-gradient-to-br from-red-900/20 to-slate-900 border-red-500/20">
          <AlertTriangle size={20} className="mx-auto mb-2 text-red-400" />
          <p className="text-3xl font-bold text-red-400">{kpis.vencidas}</p>
          <p className="text-xs text-slate-500">Vencidas</p>
        </div>
        <div className="card text-center bg-gradient-to-br from-green-900/20 to-slate-900 border-green-500/20">
          <CheckCircle size={20} className="mx-auto mb-2 text-green-400" />
          <p className="text-3xl font-bold text-green-400">{kpis.completadas_semana}</p>
          <p className="text-xs text-slate-500">Completadas (semana)</p>
        </div>
        <div className="card text-center bg-gradient-to-br from-brand-900/20 to-slate-900 border-brand-500/20">
          <Shield size={20} className="mx-auto mb-2 text-brand-400" />
          <p className="text-3xl font-bold text-brand-400">{kpis.cumplimiento_pct}%</p>
          <p className="text-xs text-slate-500">Cumplimiento</p>
        </div>
        <div className="card flex items-center justify-center">
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={100}>
              <PieChart><Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={40} innerRadius={25}>
                {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Pie><Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 12 }} /></PieChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-slate-600">Sin datos</p>}
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card border-brand-500/30">
          <div className="flex justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Nueva Actividad Recurrente</h3>
            <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-500" /></button>
          </div>
          <div className="space-y-3">
            <input className="input w-full" placeholder="Titulo de la actividad *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            <textarea className="input w-full h-16" placeholder="Descripcion..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            <div className="grid sm:grid-cols-4 gap-3">
              <select className="input" value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}>
                {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="input" value={form.scope} onChange={e => setForm(p => ({ ...p, scope: e.target.value }))}>
                <option value="TODOS">Todos</option>
                <option value="CAS">CAS</option>
                <option value="BO">BO</option>
              </select>
              <select className="input" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="critica">Critica</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
              <select className="input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                <option value="gestion">Gestion</option>
                <option value="reporte">Reporte</option>
                <option value="reunion">Reunion</option>
                <option value="seguimiento">Seguimiento</option>
                <option value="operativo">Operativo</option>
              </select>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="label text-xs">Fecha inicio</label>
                <input type="date" className="input w-full" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div>
                <label className="label text-xs">Recordatorio (dias antes)</label>
                <input type="number" className="input w-full" value={form.reminder_days_before} onChange={e => setForm(p => ({ ...p, reminder_days_before: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label text-xs">Color</label>
                <input type="color" className="w-full h-10 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} />
              </div>
            </div>
            <button onClick={() => form.title && createMutation.mutate(form)} disabled={!form.title} className="btn-primary">Crear Actividad</button>
          </div>
        </div>
      )}

      {/* Alerts - Vencidas */}
      {torre?.vencidas?.length > 0 && (
        <div className="card border-red-500/20 bg-red-900/5">
          <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2 mb-3">
            <AlertTriangle size={14} /> Actividades Vencidas ({torre.vencidas.length})
          </h3>
          <div className="space-y-2">
            {torre.vencidas.map(item => (
              <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-red-500/5 border border-red-500/10">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-8 rounded-full" style={{ background: item.color }} />
                  <div>
                    <p className="text-sm text-white font-medium">{item.title}</p>
                    <p className="text-[10px] text-slate-500">{item.category} | {item.scope} | {item.assigned_to || 'Sin asignar'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-red-400 font-semibold">{item.days_overdue}d vencida</span>
                  <button onClick={() => updateInstanceMutation.mutate({ id: item.id, data: { status: 'completada' } })} className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20">Completar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proximas a vencer */}
      {torre?.proximas?.length > 0 && (
        <div className="card border-orange-500/20 bg-orange-900/5">
          <h3 className="text-sm font-semibold text-orange-400 flex items-center gap-2 mb-3">
            <Zap size={14} /> Proximas a Vencer ({torre.proximas.length})
          </h3>
          <div className="space-y-2">
            {torre.proximas.map(item => (
              <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/50 border border-slate-700">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-8 rounded-full" style={{ background: item.color }} />
                  <div>
                    <p className="text-sm text-white">{item.title}</p>
                    <p className="text-[10px] text-slate-500">{item.due_date} | {item.category} | {item.assigned_to || 'Sin asignar'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateInstanceMutation.mutate({ id: item.id, data: { status: 'en_proceso' } })} className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">Iniciar</button>
                  <button onClick={() => updateInstanceMutation.mutate({ id: item.id, data: { status: 'completada' } })} className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20">Completar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Activities List */}
      <div className="card">
        <h3 className="text-sm font-semibold text-white mb-3">Actividades Recurrentes Activas ({activities?.length || 0})</h3>
        <div className="space-y-2">
          {activities?.map(a => (
            <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700 hover:border-brand-500/30 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-2 h-10 rounded-full" style={{ background: a.color }} />
                <div>
                  <p className="text-sm text-white font-medium">{a.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400">{FREQ_LABELS[a.frequency]}</span>
                    <span className="text-[10px] text-slate-600">{a.category}</span>
                    <span className="text-[10px] text-slate-600">{a.scope}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: PRIORITY_COLORS[a.priority] + '20', color: PRIORITY_COLORS[a.priority] }}>{a.priority}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                {a.assigned_to && <p className="text-xs text-slate-400">{a.assigned_to.full_name}</p>}
                <p className="text-[10px] text-slate-600">Desde: {a.start_date}</p>
              </div>
            </div>
          ))}
          {(!activities || activities.length === 0) && (
            <p className="text-sm text-slate-500 text-center py-8">No hay actividades recurrentes configuradas. Crea una para empezar.</p>
          )}
        </div>
      </div>
    </div>
  )
}
