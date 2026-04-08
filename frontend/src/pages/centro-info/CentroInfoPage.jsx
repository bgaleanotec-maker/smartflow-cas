import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, BarChart3, PieChart as PieIcon, TrendingUp, FileText, Hash,
  Type, List, Target, Loader2, X, Edit3, Trash2, Eye, Brain,
  LayoutGrid, Settings2,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts'
import toast from 'react-hot-toast'
import { dashboardBuilderAPI, aiAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const WIDGET_TYPES = [
  { type: 'kpi', label: 'KPI', icon: Hash, desc: 'Numero grande con etiqueta' },
  { type: 'chart_bar', label: 'Barras', icon: BarChart3, desc: 'Grafico de barras' },
  { type: 'chart_pie', label: 'Torta', icon: PieIcon, desc: 'Grafico circular' },
  { type: 'chart_line', label: 'Lineas', icon: TrendingUp, desc: 'Tendencia temporal' },
  { type: 'text', label: 'Texto', icon: Type, desc: 'Texto libre o markdown' },
  { type: 'list', label: 'Lista', icon: List, desc: 'Lista de items' },
  { type: 'progress', label: 'Progreso', icon: Target, desc: 'Barra de progreso' },
]

const DATA_SOURCES = [
  { source: 'activities', label: 'Actividades' },
  { source: 'demands', label: 'Demandas' },
  { source: 'incidents', label: 'Incidentes' },
  { source: 'projects', label: 'Proyectos' },
  { source: 'custom', label: 'Personalizado' },
]

const COLORS = ['#6366f1', '#22c55e', '#ef4444', '#eab308', '#3b82f6', '#f97316', '#8b5cf6', '#14b8a6']

function WidgetRenderer({ widget, data }) {
  if (widget.widget_type === 'kpi') {
    const value = data?.total || data?.pendientes || 0
    return (
      <div className="text-center py-4">
        <div className="w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center" style={{ background: widget.color + '20' }}>
          <Hash size={18} style={{ color: widget.color }} />
        </div>
        <p className="text-3xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-500 mt-1">{widget.title}</p>
      </div>
    )
  }
  if (widget.widget_type === 'chart_bar' && data?.by_status) {
    const chartData = Object.entries(data.by_status).map(([k, v]) => ({ name: k, value: v }))
    return (
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 9 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 12 }} />
            <Bar dataKey="value" fill={widget.color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }
  if (widget.widget_type === 'chart_pie' && data?.by_status) {
    const chartData = Object.entries(data.by_status).map(([k, v], i) => ({ name: k, value: v, fill: COLORS[i % COLORS.length] }))
    return (
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart><Pie data={chartData} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
            {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
          </Pie><Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff', fontSize: 12 }} /></PieChart>
        </ResponsiveContainer>
      </div>
    )
  }
  if (widget.widget_type === 'progress') {
    const pct = data?.total ? Math.round((data.completadas || 0) / data.total * 100) : 0
    return (
      <div className="py-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-400">{widget.title}</span>
          <span className="text-white font-bold">{pct}%</span>
        </div>
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: widget.color }} />
        </div>
      </div>
    )
  }
  if (widget.widget_type === 'text') {
    return <div className="text-sm text-slate-300 whitespace-pre-wrap py-2">{widget.custom_content || widget.description || 'Sin contenido'}</div>
  }
  return <p className="text-xs text-slate-500 py-4 text-center">Widget: {widget.widget_type}</p>
}

function WidgetCard({ widget }) {
  const { data } = useQuery({
    queryKey: ['widget-data', widget.data_source],
    queryFn: () => widget.data_source !== 'custom' ? dashboardBuilderAPI.getData(widget.data_source).then(r => r.data) : Promise.resolve(null),
    enabled: widget.data_source !== 'custom',
    staleTime: 60000,
  })

  const widthClass = widget.grid_width === 2 ? 'sm:col-span-2' : widget.grid_width >= 3 ? 'sm:col-span-3' : ''

  return (
    <div className={`card hover:border-brand-500/20 transition-all ${widthClass}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{widget.title}</h4>
        <div className="w-2 h-2 rounded-full" style={{ background: widget.color }} />
      </div>
      <WidgetRenderer widget={widget} data={data} />
    </div>
  )
}

export default function CentroInfoPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [showForm, setShowForm] = useState(false)
  const [editMode, setEditMode] = useState(false)

  const [form, setForm] = useState({
    title: '', widget_type: 'kpi', data_source: 'activities',
    color: '#6366f1', scope: 'TODOS', custom_content: '', grid_width: 1,
  })

  const { data: widgets, isLoading } = useQuery({
    queryKey: ['dashboard-widgets'],
    queryFn: () => dashboardBuilderAPI.list().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data) => dashboardBuilderAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['dashboard-widgets'])
      setShowForm(false)
      setForm({ title: '', widget_type: 'kpi', data_source: 'activities', color: '#6366f1', scope: 'TODOS', custom_content: '', grid_width: 1 })
      toast.success('Widget creado')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => dashboardBuilderAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries(['dashboard-widgets'])
      toast.success('Widget eliminado')
    },
  })

  const canEdit = ['admin', 'leader', 'herramientas'].includes(user?.role)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <LayoutGrid size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Centro de Informacion</h1>
            <p className="text-slate-400 text-sm">Dashboard interactivo configurable - Vista gerencial transversal</p>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setEditMode(!editMode)} className={`btn-ghost text-sm flex items-center gap-1.5 ${editMode ? 'text-brand-400' : ''}`}>
              <Settings2 size={14} /> {editMode ? 'Listo' : 'Editar'}
            </button>
            <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
              <Plus size={16} /> Nuevo Widget
            </button>
          </div>
        )}
      </div>

      {/* Create Widget Form */}
      {showForm && (
        <div className="card border-brand-500/30">
          <div className="flex justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Crear Widget</h3>
            <button onClick={() => setShowForm(false)}><X size={18} className="text-slate-500" /></button>
          </div>
          <div className="space-y-3">
            <input className="input w-full" placeholder="Titulo del widget *" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />

            {/* Widget type selector */}
            <div>
              <label className="label text-xs mb-1">Tipo de Widget</label>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {WIDGET_TYPES.map(wt => {
                  const Icon = wt.icon
                  return (
                    <button key={wt.type} onClick={() => setForm(p => ({ ...p, widget_type: wt.type }))}
                      className={`p-2 rounded-lg text-center border transition-all ${form.widget_type === wt.type ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'border-slate-700 text-slate-500 hover:border-slate-600'}`}>
                      <Icon size={16} className="mx-auto mb-1" />
                      <p className="text-[9px]">{wt.label}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <select className="input" value={form.data_source} onChange={e => setForm(p => ({ ...p, data_source: e.target.value }))}>
                {DATA_SOURCES.map(ds => <option key={ds.source} value={ds.source}>{ds.label}</option>)}
              </select>
              <select className="input" value={form.scope} onChange={e => setForm(p => ({ ...p, scope: e.target.value }))}>
                <option value="TODOS">Todos</option>
                <option value="CAS">CAS</option>
                <option value="BO">BO</option>
              </select>
              <div className="flex gap-2">
                <select className="input flex-1" value={form.grid_width} onChange={e => setForm(p => ({ ...p, grid_width: Number(e.target.value) }))}>
                  <option value={1}>1 columna</option>
                  <option value={2}>2 columnas</option>
                  <option value={3}>3 columnas</option>
                </select>
                <input type="color" className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} />
              </div>
            </div>

            {form.widget_type === 'text' && (
              <textarea className="input w-full h-24" placeholder="Contenido del widget (texto, datos, informacion...)" value={form.custom_content} onChange={e => setForm(p => ({ ...p, custom_content: e.target.value }))} />
            )}

            <button onClick={() => form.title && createMutation.mutate(form)} disabled={!form.title} className="btn-primary">Crear Widget</button>
          </div>
        </div>
      )}

      {/* Widget Grid */}
      {isLoading ? (
        <div className="text-center py-20 text-slate-500"><Loader2 className="animate-spin mx-auto" size={24} /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {widgets?.map(w => (
            <div key={w.id} className="relative group">
              <WidgetCard widget={w} />
              {editMode && (
                <button onClick={() => deleteMutation.mutate(w.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {(!widgets || widgets.length === 0) && !isLoading && (
        <div className="text-center py-16 text-slate-500">
          <LayoutGrid size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg">Centro de Informacion Vacio</p>
          <p className="text-sm mt-1">Los coordinadores pueden crear widgets para visualizar datos de gestion.</p>
          <p className="text-xs mt-2 text-slate-600">KPIs, graficos, textos informativos, listas y barras de progreso.</p>
        </div>
      )}
    </div>
  )
}
