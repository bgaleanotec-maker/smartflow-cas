import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Zap, Users, MessageSquare, Star, TrendingUp,
  Loader2, X, Brain, AlertTriangle, CheckCircle, Heart,
  Smile, Meh, Frown, Flame, Target, Award, Lightbulb,
  BarChart3, Calendar, Shield,
} from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'
import { leanProAPI, aiAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const MOOD_ICONS = { feliz: Smile, neutral: Meh, preocupado: Frown, bloqueado: AlertTriangle }
const MOOD_COLORS = { feliz: 'text-green-400', neutral: 'text-yellow-400', preocupado: 'text-orange-400', bloqueado: 'text-red-400' }
const KAIZEN_STATUS = {
  propuesto: { label: 'Propuesto', color: 'bg-slate-500/10 text-slate-400' },
  aprobado: { label: 'Aprobado', color: 'bg-blue-500/10 text-blue-400' },
  en_progreso: { label: 'En Progreso', color: 'bg-yellow-500/10 text-yellow-400' },
  implementado: { label: 'Implementado', color: 'bg-green-500/10 text-green-400' },
  descartado: { label: 'Descartado', color: 'bg-red-500/10 text-red-400' },
}

function StandupForm({ onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ what_did: '', what_will: '', blockers: '', mood: 'neutral', energy_level: 3, scope: 'TODOS' })

  const mutation = useMutation({
    mutationFn: (data) => leanProAPI.createStandup(data),
    onSuccess: () => { qc.invalidateQueries(['lean-dashboard']); qc.invalidateQueries(['standups']); onClose(); toast.success('Standup registrado') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  return (
    <div className="card border-brand-500/30 bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="flex justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center"><MessageSquare size={16} className="text-brand-400" /></div>
          <h3 className="text-lg font-semibold text-white">Gerenciamiento Diario</h3>
        </div>
        <button onClick={onClose}><X size={18} className="text-slate-500" /></button>
      </div>
      <div className="space-y-4">
        <div>
          <label className="label text-xs flex items-center gap-1"><CheckCircle size={12} className="text-green-400" /> Que hice ayer / que complete</label>
          <textarea className="input w-full h-20" placeholder="Describe las tareas completadas..." value={form.what_did} onChange={e => setForm(p => ({ ...p, what_did: e.target.value }))} />
        </div>
        <div>
          <label className="label text-xs flex items-center gap-1"><Target size={12} className="text-blue-400" /> Que hare hoy</label>
          <textarea className="input w-full h-20" placeholder="Tareas planeadas para hoy..." value={form.what_will} onChange={e => setForm(p => ({ ...p, what_will: e.target.value }))} />
        </div>
        <div>
          <label className="label text-xs flex items-center gap-1"><AlertTriangle size={12} className="text-red-400" /> Impedimentos / Bloqueantes</label>
          <textarea className="input w-full h-16" placeholder="Algo que te bloquea? (deja vacio si no hay)" value={form.blockers} onChange={e => setForm(p => ({ ...p, blockers: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label text-xs">Estado de animo</label>
            <div className="flex gap-2 mt-1">
              {Object.entries(MOOD_ICONS).map(([mood, Icon]) => (
                <button key={mood} onClick={() => setForm(p => ({ ...p, mood }))}
                  className={`p-2 rounded-lg border transition-all ${form.mood === mood ? 'border-brand-500 bg-brand-500/10' : 'border-slate-700 hover:border-slate-600'}`}>
                  <Icon size={20} className={MOOD_COLORS[mood]} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label text-xs">Energia (1-5)</label>
            <div className="flex gap-1 mt-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setForm(p => ({ ...p, energy_level: n }))}
                  className={`w-9 h-9 rounded-lg border text-sm font-bold transition-all ${form.energy_level >= n ? 'border-brand-500 bg-brand-500/20 text-brand-400' : 'border-slate-700 text-slate-600'}`}>{n}</button>
              ))}
            </div>
          </div>
        </div>
        <select className="input" value={form.scope} onChange={e => setForm(p => ({ ...p, scope: e.target.value }))}>
          <option value="TODOS">Todos</option><option value="CAS">CAS</option><option value="BO">BO</option>
        </select>
        <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending} className="btn-primary w-full">
          {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Registrar Standup'}
        </button>
      </div>
    </div>
  )
}

export default function LeanProPage() {
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [showStandup, setShowStandup] = useState(false)
  const [showRetro, setShowRetro] = useState(false)
  const [showKaizen, setShowKaizen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const { data: dashboard } = useQuery({ queryKey: ['lean-dashboard'], queryFn: () => leanProAPI.dashboard().then(r => r.data) })
  const { data: standups } = useQuery({ queryKey: ['standups'], queryFn: () => leanProAPI.listStandups({}).then(r => r.data) })
  const { data: myStandup } = useQuery({ queryKey: ['my-standup'], queryFn: () => leanProAPI.myStandup().then(r => r.data) })
  const { data: kaizens } = useQuery({ queryKey: ['kaizens'], queryFn: () => leanProAPI.listKaizen({}).then(r => r.data) })
  const { data: retros } = useQuery({ queryKey: ['retros'], queryFn: () => leanProAPI.listRetros({}).then(r => r.data) })

  const kaizenMutation = useMutation({
    mutationFn: (data) => leanProAPI.createKaizen(data),
    onSuccess: () => { qc.invalidateQueries(['kaizens']); qc.invalidateQueries(['lean-dashboard']); setShowKaizen(false); toast.success('Mejora propuesta') },
  })

  const retroMutation = useMutation({
    mutationFn: (data) => leanProAPI.createRetro(data),
    onSuccess: () => { qc.invalidateQueries(['retros']); qc.invalidateQueries(['lean-dashboard']); setShowRetro(false); toast.success('Retrospectiva creada') },
  })

  const [retroForm, setRetroForm] = useState({ title: '', retro_date: new Date().toISOString().split('T')[0], went_well: '', to_improve: '', action_items: '', kudos: '' })
  const [kaizenForm, setKaizenForm] = useState({ title: '', description: '', category: 'proceso', impact: 'medio', effort: 'medio' })

  const standup = dashboard?.standup || {}
  const kaizen = dashboard?.kaizen || {}
  const velocity = dashboard?.velocity || []

  const TABS = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'standup', label: 'Standup Diario', icon: MessageSquare },
    { id: 'kaizen', label: 'Kaizen Board', icon: Lightbulb },
    { id: 'retro', label: 'Retrospectivas', icon: Award },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Lean Pro</h1>
            <p className="text-slate-400 text-sm">Gestion Agil, Scrum & Gerenciamiento Diario</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!myStandup?.submitted && (
            <button onClick={() => setShowStandup(true)} className="btn-primary flex items-center gap-2 animate-pulse">
              <MessageSquare size={14} /> Mi Standup
            </button>
          )}
          {myStandup?.submitted && (
            <span className="text-xs px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
              <CheckCircle size={12} /> Standup OK
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 pb-px overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}><Icon size={14} />{tab.label}</button>
          )
        })}
      </div>

      {/* Standup Form */}
      {showStandup && <StandupForm onClose={() => setShowStandup(false)} />}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="card text-center"><MessageSquare size={18} className="mx-auto mb-1 text-brand-400" /><p className="text-2xl font-bold text-white">{standup.today_count || 0}</p><p className="text-[10px] text-slate-500">Standups Hoy</p></div>
            <div className="card text-center"><Heart size={18} className="mx-auto mb-1 text-pink-400" /><p className="text-2xl font-bold text-white">{standup.avg_energy || '-'}/5</p><p className="text-[10px] text-slate-500">Energia Equipo</p></div>
            <div className="card text-center"><AlertTriangle size={18} className="mx-auto mb-1 text-red-400" /><p className="text-2xl font-bold text-red-400">{standup.blockers?.length || 0}</p><p className="text-[10px] text-slate-500">Bloqueantes</p></div>
            <div className="card text-center"><Lightbulb size={18} className="mx-auto mb-1 text-yellow-400" /><p className="text-2xl font-bold text-yellow-400">{kaizen.pending || 0}</p><p className="text-[10px] text-slate-500">Mejoras Pendientes</p></div>
            <div className="card text-center"><Shield size={18} className="mx-auto mb-1 text-green-400" /><p className="text-2xl font-bold text-green-400">{kaizen.implementation_rate || 0}%</p><p className="text-[10px] text-slate-500">Tasa Implementacion</p></div>
          </div>

          {standup.blockers?.length > 0 && (
            <div className="card border-red-500/20 bg-red-900/5">
              <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2 mb-3"><AlertTriangle size={14} /> Bloqueantes Reportados Hoy</h3>
              {standup.blockers.map((b, i) => (
                <div key={i} className="p-2 rounded bg-red-500/5 border border-red-500/10 mb-2">
                  <p className="text-xs text-slate-500">{b.user}</p>
                  <p className="text-sm text-red-300">{b.blocker}</p>
                </div>
              ))}
            </div>
          )}

          {velocity.length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-white mb-4">Velocity (Ultimos Sprints)</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={velocity}>
                    <XAxis dataKey="sprint_id" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#fff' }} />
                    <Bar dataKey="planned" fill="#6366f1" name="Planificado" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" fill="#22c55e" name="Completado" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Standup Tab */}
      {activeTab === 'standup' && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">Standups de Hoy ({standups?.length || 0})</h3>
            {!myStandup?.submitted && <button onClick={() => setShowStandup(true)} className="btn-primary text-sm"><Plus size={14} /> Mi Standup</button>}
          </div>
          {standups?.map(s => {
            const MoodIcon = MOOD_ICONS[s.mood] || Meh
            return (
              <div key={s.id} className="card hover:border-brand-500/20 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold">{s.user?.full_name?.slice(0, 2).toUpperCase()}</div>
                    <div><p className="text-sm font-medium text-white">{s.user?.full_name}</p><p className="text-[10px] text-slate-600">{s.user?.role} | {s.scope}</p></div>
                  </div>
                  <MoodIcon size={18} className={MOOD_COLORS[s.mood] || 'text-slate-400'} />
                </div>
                {s.what_did && <div className="mb-2"><p className="text-[10px] text-green-400 mb-0.5">Completado:</p><p className="text-xs text-slate-300">{s.what_did}</p></div>}
                {s.what_will && <div className="mb-2"><p className="text-[10px] text-blue-400 mb-0.5">Hoy:</p><p className="text-xs text-slate-300">{s.what_will}</p></div>}
                {s.blockers && <div className="p-2 rounded bg-red-500/5 border border-red-500/10"><p className="text-[10px] text-red-400 mb-0.5">Bloqueante:</p><p className="text-xs text-red-300">{s.blockers}</p></div>}
              </div>
            )
          })}
          {(!standups || standups.length === 0) && <p className="text-sm text-slate-500 text-center py-8">Nadie ha registrado su standup hoy.</p>}
        </div>
      )}

      {/* Kaizen Tab */}
      {activeTab === 'kaizen' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">Board de Mejora Continua (Kaizen)</h3>
            <button onClick={() => setShowKaizen(!showKaizen)} className="btn-primary text-sm"><Plus size={14} /> Proponer Mejora</button>
          </div>
          {showKaizen && (
            <div className="card border-yellow-500/30">
              <div className="space-y-3">
                <input className="input w-full" placeholder="Titulo de la mejora *" value={kaizenForm.title} onChange={e => setKaizenForm(p => ({ ...p, title: e.target.value }))} />
                <textarea className="input w-full h-16" placeholder="Descripcion..." value={kaizenForm.description} onChange={e => setKaizenForm(p => ({ ...p, description: e.target.value }))} />
                <div className="grid grid-cols-3 gap-3">
                  <select className="input" value={kaizenForm.category} onChange={e => setKaizenForm(p => ({ ...p, category: e.target.value }))}>
                    <option value="proceso">Proceso</option><option value="herramienta">Herramienta</option><option value="comunicacion">Comunicacion</option><option value="calidad">Calidad</option><option value="eficiencia">Eficiencia</option>
                  </select>
                  <select className="input" value={kaizenForm.impact} onChange={e => setKaizenForm(p => ({ ...p, impact: e.target.value }))}>
                    <option value="alto">Impacto Alto</option><option value="medio">Impacto Medio</option><option value="bajo">Impacto Bajo</option>
                  </select>
                  <select className="input" value={kaizenForm.effort} onChange={e => setKaizenForm(p => ({ ...p, effort: e.target.value }))}>
                    <option value="bajo">Esfuerzo Bajo</option><option value="medio">Esfuerzo Medio</option><option value="alto">Esfuerzo Alto</option>
                  </select>
                </div>
                <button onClick={() => kaizenForm.title && kaizenMutation.mutate(kaizenForm)} className="btn-primary">Proponer</button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {kaizens?.map(k => (
              <div key={k.id} className="card hover:border-yellow-500/20 transition-all">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb size={14} className="text-yellow-400" />
                      <p className="text-sm font-medium text-white">{k.title}</p>
                    </div>
                    {k.description && <p className="text-xs text-slate-500 mb-2">{k.description}</p>}
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${KAIZEN_STATUS[k.status]?.color}`}>{KAIZEN_STATUS[k.status]?.label}</span>
                      <span className="text-[10px] text-slate-600">{k.category}</span>
                      <span className="text-[10px] text-slate-600">Impacto: {k.impact}</span>
                      <span className="text-[10px] text-slate-600">Esfuerzo: {k.effort}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600">{k.proposed_by?.full_name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retro Tab */}
      {activeTab === 'retro' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">Retrospectivas ({retros?.length || 0})</h3>
            <button onClick={() => setShowRetro(!showRetro)} className="btn-primary text-sm"><Plus size={14} /> Nueva Retro</button>
          </div>
          {showRetro && (
            <div className="card border-purple-500/30">
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <input className="input" placeholder="Titulo *" value={retroForm.title} onChange={e => setRetroForm(p => ({ ...p, title: e.target.value }))} />
                  <input type="date" className="input" value={retroForm.retro_date} onChange={e => setRetroForm(p => ({ ...p, retro_date: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs text-green-400">Que salio bien</label>
                  <textarea className="input w-full h-16" value={retroForm.went_well} onChange={e => setRetroForm(p => ({ ...p, went_well: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs text-orange-400">Que mejorar</label>
                  <textarea className="input w-full h-16" value={retroForm.to_improve} onChange={e => setRetroForm(p => ({ ...p, to_improve: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs text-blue-400">Acciones concretas</label>
                  <textarea className="input w-full h-16" value={retroForm.action_items} onChange={e => setRetroForm(p => ({ ...p, action_items: e.target.value }))} />
                </div>
                <div>
                  <label className="label text-xs text-pink-400">Kudos / Reconocimientos</label>
                  <textarea className="input w-full h-12" value={retroForm.kudos} onChange={e => setRetroForm(p => ({ ...p, kudos: e.target.value }))} />
                </div>
                <button onClick={() => retroForm.title && retroMutation.mutate(retroForm)} className="btn-primary">Crear Retrospectiva</button>
              </div>
            </div>
          )}
          {retros?.map(r => (
            <div key={r.id} className="card">
              <div className="flex justify-between mb-3">
                <h4 className="text-sm font-semibold text-white">{r.title}</h4>
                <span className="text-xs text-slate-500">{r.retro_date}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {r.went_well && <div className="p-2 rounded bg-green-500/5 border border-green-500/10"><p className="text-[10px] text-green-400 mb-1">Bien</p><p className="text-xs text-slate-300">{r.went_well}</p></div>}
                {r.to_improve && <div className="p-2 rounded bg-orange-500/5 border border-orange-500/10"><p className="text-[10px] text-orange-400 mb-1">Mejorar</p><p className="text-xs text-slate-300">{r.to_improve}</p></div>}
                {r.action_items && <div className="p-2 rounded bg-blue-500/5 border border-blue-500/10"><p className="text-[10px] text-blue-400 mb-1">Acciones</p><p className="text-xs text-slate-300">{r.action_items}</p></div>}
                {r.kudos && <div className="p-2 rounded bg-pink-500/5 border border-pink-500/10"><p className="text-[10px] text-pink-400 mb-1">Kudos</p><p className="text-xs text-slate-300">{r.kudos}</p></div>}
              </div>
              <p className="text-[10px] text-slate-600 mt-2">Facilitador: {r.facilitator?.full_name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
