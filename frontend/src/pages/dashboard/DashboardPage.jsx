import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Target, Loader2, CheckCircle2, TrendingUp,
  Flame, Trophy, ChevronRight, Users2, Activity, Gift, X, Zap, Plus,
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, AreaChart, Area,
} from 'recharts'
import toast from 'react-hot-toast'
import { dashboardAPI, challengesAPI, quickTasksAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

// ─── Vista 360 de usuario (drawer) ───────────────────────────────────────────

function User360Drawer({ userId, onClose }) {
  const queryClient = useQueryClient()
  const [assignOpen, setAssignOpen] = useState(false)
  const [form, setForm] = useState({ title: '', priority: 'media', due_date: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['user-360', userId],
    queryFn: () => dashboardAPI.user360(userId).then(r => r.data),
  })

  const assignMut = useMutation({
    mutationFn: () => quickTasksAPI.create({
      title: form.title.trim(),
      assigned_to_id: userId,
      priority: form.priority,
      due_date: form.due_date || null,
    }),
    onSuccess: () => {
      toast.success(`⚡ Tarea asignada a ${data?.user?.name?.split(' ')[0]}`)
      setForm({ title: '', priority: 'media', due_date: '' })
      setAssignOpen(false)
      queryClient.invalidateQueries({ queryKey: ['user-360', userId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-gerencial'] })
    },
    onError: () => toast.error('No se pudo asignar la tarea'),
  })

  const g = data?.gamification
  const kpis = data?.kpis || {}
  const items = data?.items || []
  const overdue = items.filter(i => i.days_overdue > 0)
  const today = items.filter(i => i.days_overdue === 0 && i.due_date === data?.date)
  const upcoming = items.filter(i => i.days_overdue === 0 && i.due_date !== data?.date)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-slate-900 border-l border-slate-700 h-full overflow-y-auto animate-slide-up lg:animate-none">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="animate-spin text-brand-400" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-5 z-10">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-brand-700 flex items-center justify-center text-lg font-bold text-white">
                    {data?.user?.name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="font-bold text-white">{data?.user?.name}</h2>
                    <p className="text-xs text-slate-400 capitalize">{data?.user?.role} · {data?.user?.email}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
                  <X size={16} />
                </button>
              </div>

              {/* Gamification chips */}
              {g && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="text-xs bg-slate-800 border border-slate-700 rounded-full px-2.5 py-1 text-slate-200">
                    {g.level?.icon} Nivel {g.level?.level} · {g.level?.xp} XP
                  </span>
                  {g.streak > 0 && (
                    <span className="text-xs bg-orange-500/10 border border-orange-500/30 rounded-full px-2.5 py-1 text-orange-300 flex items-center gap-1">
                      <Flame size={11} /> {g.streak} días
                    </span>
                  )}
                  <span className="text-xs bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2.5 py-1 text-emerald-300">
                    ✓ {g.week} esta semana
                  </span>
                </div>
              )}

              {/* Asignar tarea rápida */}
              {assignOpen ? (
                <form
                  onSubmit={e => { e.preventDefault(); if (form.title.trim()) assignMut.mutate() }}
                  className="mt-3 space-y-2 bg-slate-800/60 border border-slate-700 rounded-xl p-3"
                >
                  <input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    className="input py-1.5 text-sm" placeholder="¿Qué tarea le asignas?" autoFocus
                  />
                  <div className="flex gap-2">
                    <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="input py-1.5 text-xs flex-1">
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                    <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input py-1.5 text-xs flex-1" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAssignOpen(false)} className="btn-secondary flex-1 py-1.5 text-xs">Cancelar</button>
                    <button type="submit" disabled={assignMut.isPending} className="btn-primary flex-1 py-1.5 text-xs">
                      {assignMut.isPending ? 'Asignando…' : 'Asignar'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setAssignOpen(true)}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-sm font-medium hover:bg-amber-500/25 transition-colors"
                >
                  <Plus size={14} /> Asignar tarea rápida
                </button>
              )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-4 gap-2 p-4">
              {[
                { label: 'Vencidas', value: kpis.vencidas, cls: 'text-red-400' },
                { label: 'Hoy', value: kpis.vencen_hoy, cls: 'text-amber-400' },
                { label: 'Pendientes', value: kpis.total_pendientes, cls: 'text-slate-300' },
                { label: '✓ Semana', value: kpis.completadas_semana, cls: 'text-emerald-400' },
              ].map(k => (
                <div key={k.label} className="bg-slate-800/60 rounded-xl p-2 text-center">
                  <p className={`text-lg font-bold ${k.cls}`}>{k.value ?? 0}</p>
                  <p className="text-[9px] text-slate-500">{k.label}</p>
                </div>
              ))}
            </div>

            {/* Listas */}
            <div className="px-4 pb-6 space-y-4">
              {[
                { title: `🔴 Vencidas (${overdue.length})`, list: overdue },
                { title: `🟡 Para hoy (${today.length})`, list: today },
                { title: `⏭️ Próximas (${upcoming.length})`, list: upcoming.slice(0, 10) },
              ].map(sec => sec.list.length > 0 && (
                <div key={sec.title}>
                  <p className="text-xs font-semibold text-slate-400 mb-1.5">{sec.title}</p>
                  <div className="space-y-1.5">
                    {sec.list.map((i, idx) => (
                      <div key={idx} className={`px-3 py-2 rounded-xl border text-xs ${
                        i.days_overdue > 0 ? 'bg-red-950/20 border-red-900/30' : 'bg-slate-800/50 border-slate-700/50'
                      }`}>
                        <p className="text-slate-200 truncate">{i.title}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {SOURCE_LABEL[i.source]}
                          {i.due_date && ` · ${i.due_date}`}
                          {i.days_overdue > 0 && <span className="text-red-400 font-semibold"> · {i.days_overdue}d vencida</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-center text-sm text-emerald-400/80 py-6">✨ Sin pendientes</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Colores con intención (psicología: rojo SOLO vencidas, ámbar=hoy, verde=logro)
const C = {
  red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6',
  green: '#10b981', slate: '#475569', violet: '#8b5cf6', cyan: '#06b6d4',
}

function KpiTile({ icon: Icon, label, value, color, bg }) {
  return (
    <div className={`text-left p-4 rounded-2xl border transition-all hover:scale-[1.02] ${bg}`}>
      <div className="flex items-center justify-between">
        <Icon size={18} style={{ color }} />
        <span className="text-2xl font-bold text-white">{value}</span>
      </div>
      <p className="text-xs mt-1.5" style={{ color }}>{label}</p>
    </div>
  )
}

const SOURCE_LABEL = { recurrente: 'Recurrente', rapida: 'Rápida', proyecto: 'Proyecto' }

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canSeeUsage = ['admin', 'leader', 'lider_sr'].includes(user?.role)
  const [user360, setUser360] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-gerencial'],
    queryFn: () => dashboardAPI.gerencial().then(r => r.data),
    refetchInterval: 90_000,
  })

  const { data: game } = useQuery({
    queryKey: ['gamification'],
    queryFn: () => dashboardAPI.gamification().then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: activeChallenges = [] } = useQuery({
    queryKey: ['challenges-active'],
    queryFn: () => challengesAPI.list().then(r =>
      (r.data || []).filter(c => c.status === 'en_curso')
    ),
    staleTime: 5 * 60 * 1000,
  })

  const { data: usage } = useQuery({
    queryKey: ['usage-stats'],
    queryFn: () => challengesAPI.usageStats().then(r => r.data),
    enabled: canSeeUsage,
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={26} className="animate-spin text-brand-400" />
      </div>
    )
  }

  const kpis = data?.kpis || {}
  const team = (data?.team || []).filter(r => r.pendientes > 0 || r.completadas_semana > 0)
  const gameByUser = Object.fromEntries((game?.ranking || []).map(r => [r.user_id, r]))
  const ranking = (game?.ranking || []).filter(r => r.week > 0).slice(0, 5)

  const donutData = [
    { name: 'Vencidas', value: kpis.vencidas || 0, color: C.red },
    { name: 'Hoy', value: kpis.vencen_hoy || 0, color: C.amber },
    { name: 'En proceso', value: kpis.en_proceso || 0, color: C.blue },
    {
      name: 'Al día',
      value: Math.max(0, (kpis.total_pendientes || 0) - (kpis.vencidas || 0) - (kpis.vencen_hoy || 0) - (kpis.en_proceso || 0)),
      color: C.slate,
    },
  ].filter(d => d.value > 0)

  const barData = team.slice(0, 10).map(r => ({
    name: r.name?.split(' ')[0] || '—',
    Vencidas: r.vencidas,
    Hoy: r.hoy,
    'Al día': Math.max(0, r.pendientes - r.vencidas - r.hoy),
  }))

  const today = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Gestión Diaria</h1>
        <p className="text-sm text-slate-400 capitalize">{today}</p>
      </div>

      {/* ── Retos activos (banner motivacional) ── */}
      {activeChallenges.length > 0 && (
        <button
          onClick={() => navigate('/retos')}
          className="w-full text-left bg-gradient-to-r from-amber-950/60 to-slate-900 border border-amber-700/40 rounded-2xl p-4 hover:border-amber-500/60 transition-all group"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">{activeChallenges[0].emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-200 flex items-center gap-2">
                Reto activo: {activeChallenges[0].title}
                {activeChallenges.length > 1 && (
                  <span className="text-[10px] bg-amber-500/20 px-1.5 rounded-full">+{activeChallenges.length - 1} más</span>
                )}
              </p>
              <p className="text-xs text-amber-400/70 flex items-center gap-2 mt-0.5">
                {activeChallenges[0].prize && <><Gift size={11} /> {activeChallenges[0].prize} ·</>}
                <span>⏳ {activeChallenges[0].days_left} días restantes</span>
              </p>
            </div>
            <ChevronRight size={18} className="text-amber-500 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiTile icon={AlertTriangle} label="Vencidas" value={kpis.vencidas ?? 0}
          color={C.red} bg="bg-red-950/30 border-red-900/40" />
        <KpiTile icon={Target} label="Vencen hoy" value={kpis.vencen_hoy ?? 0}
          color={C.amber} bg="bg-amber-950/30 border-amber-900/40" />
        <KpiTile icon={Activity} label="En proceso" value={kpis.en_proceso ?? 0}
          color={C.blue} bg="bg-blue-950/30 border-blue-900/40" />
        <KpiTile icon={CheckCircle2} label="Completadas hoy" value={kpis.completadas_hoy ?? 0}
          color={C.green} bg="bg-emerald-950/30 border-emerald-900/40" />
        <KpiTile icon={TrendingUp} label="Semana" value={kpis.completadas_semana ?? 0}
          color={C.violet} bg="bg-violet-950/30 border-violet-900/40 col-span-2 lg:col-span-1" />
      </div>

      {/* ── Gráficos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donut estado */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Estado general</h3>
          {donutData.length === 0 ? (
            <p className="text-xs text-slate-600 py-10 text-center">Sin pendientes 🎉</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={donutData} dataKey="value" innerRadius={48} outerRadius={72} paddingAngle={3} strokeWidth={0}>
                  {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
            {donutData.map(d => (
              <span key={d.name} className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} /> {d.name} ({d.value})
              </span>
            ))}
          </div>
        </div>

        {/* Barras por persona */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-300 mb-2">Carga por persona</h3>
          {barData.length === 0 ? (
            <p className="text-xs text-slate-600 py-10 text-center">Sin datos</p>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={barData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#1e293b', opacity: 0.5 }}
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
                />
                <Bar dataKey="Vencidas" stackId="a" fill={C.red} />
                <Bar dataKey="Hoy" stackId="a" fill={C.amber} />
                <Bar dataKey="Al día" stackId="a" fill={C.slate} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Semáforo del equipo ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
          <Users2 size={15} className="text-brand-400" />
          <h3 className="text-sm font-semibold text-slate-300">Equipo — ¿en qué va cada quien?</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-500 uppercase">
                <th className="text-left px-4 py-2 font-medium">Persona</th>
                <th className="text-center px-2 py-2 font-medium">Vencidas</th>
                <th className="text-center px-2 py-2 font-medium">Hoy</th>
                <th className="text-center px-2 py-2 font-medium">En proceso</th>
                <th className="text-center px-2 py-2 font-medium">Pendientes</th>
                <th className="text-center px-2 py-2 font-medium">✓ Semana</th>
                <th className="text-center px-2 py-2 font-medium">Racha</th>
                <th className="text-center px-2 py-2 font-medium">Nivel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {team.map(r => {
                const g = gameByUser[r.user_id]
                const status = r.vencidas > 0 ? '🔴' : r.hoy > 0 ? '🟡' : '🟢'
                return (
                  <tr
                    key={r.user_id ?? 'none'}
                    onClick={() => r.user_id && setUser360(r.user_id)}
                    className={`hover:bg-slate-800/40 transition-colors ${r.user_id ? 'cursor-pointer' : ''}`}
                    title={r.user_id ? 'Ver vista 360 y asignar tareas' : ''}
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 text-slate-200">
                        <span>{status}</span> {r.name}
                        {r.user_id && <ChevronRight size={12} className="text-slate-600" />}
                      </span>
                    </td>
                    <td className="text-center px-2 py-2.5">
                      {r.vencidas > 0
                        ? <span className="inline-block min-w-[24px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-bold text-xs">{r.vencidas}</span>
                        : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="text-center px-2 py-2.5">
                      {r.hoy > 0
                        ? <span className="inline-block min-w-[24px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold text-xs">{r.hoy}</span>
                        : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="text-center px-2 py-2.5 text-blue-400">{r.en_proceso || <span className="text-slate-700">—</span>}</td>
                    <td className="text-center px-2 py-2.5 text-slate-300">{r.pendientes}</td>
                    <td className="text-center px-2 py-2.5 text-emerald-400 font-semibold">{r.completadas_semana || <span className="text-slate-700">—</span>}</td>
                    <td className="text-center px-2 py-2.5">
                      {g?.streak > 0 ? (
                        <span className="text-orange-400 text-xs font-semibold flex items-center justify-center gap-0.5">
                          <Flame size={11} /> {g.streak}
                        </span>
                      ) : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="text-center px-2 py-2.5 text-xs">
                      {g ? <span title={`${g.level.xp} XP`}>{g.level.icon} {g.level.level}</span> : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Ranking semanal + listas ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ranking */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Trophy size={14} className="text-amber-400" /> Ranking de la semana
          </h3>
          {ranking.length === 0 ? (
            <p className="text-xs text-slate-600 py-6 text-center">Aún nadie ha completado tareas esta semana</p>
          ) : (
            <div className="space-y-2">
              {ranking.map((r, i) => (
                <div key={r.user_id} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${
                  i === 0 ? 'bg-amber-950/40 border border-amber-800/40' : 'bg-slate-800/50'
                }`}>
                  <span className="text-lg w-7 text-center">{r.medal || i + 1}</span>
                  <span className="flex-1 text-sm text-slate-200 truncate">{r.name}</span>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white leading-none">{r.week}</p>
                    <p className="text-[9px] text-slate-500">esta semana</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Vencidas */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <AlertTriangle size={14} /> Vencidas ({data?.vencidas?.length || 0})
          </h3>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {(data?.vencidas || []).length === 0 ? (
              <p className="text-xs text-emerald-400/80 py-6 text-center">✨ Cero vencidas — equipo al día</p>
            ) : (data.vencidas.slice(0, 20)).map((i, idx) => (
              <button
                key={idx}
                onClick={() => navigate(i.link)}
                className="w-full text-left px-3 py-2 rounded-xl bg-red-950/20 border border-red-900/30 hover:border-red-700/50 transition-colors"
              >
                <p className="text-xs text-slate-200 truncate">{i.title}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {i.owner} · {SOURCE_LABEL[i.source]} ·{' '}
                  <span className="text-red-400 font-semibold">{i.days_overdue}d vencida</span>
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Hoy */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
            <Target size={14} /> Vencen hoy ({data?.hoy?.length || 0})
          </h3>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {(data?.hoy || []).length === 0 ? (
              <p className="text-xs text-slate-600 py-6 text-center">Nada vence hoy</p>
            ) : (data.hoy.slice(0, 20)).map((i, idx) => (
              <button
                key={idx}
                onClick={() => navigate(i.link)}
                className="w-full text-left px-3 py-2 rounded-xl bg-amber-950/20 border border-amber-900/30 hover:border-amber-700/50 transition-colors"
              >
                <p className="text-xs text-slate-200 truncate">{i.title}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{i.owner} · {SOURCE_LABEL[i.source]}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Uso de la app (admin / líderes) ── */}
      {canSeeUsage && usage && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <Activity size={14} className="text-cyan-400" /> Uso de la aplicación
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 bg-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-white">{usage.active_today}</p>
                  <p className="text-[10px] text-slate-500">activos hoy</p>
                </div>
                <div className="flex-1 bg-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-white">{usage.active_week}</p>
                  <p className="text-[10px] text-slate-500">activos (7 días)</p>
                </div>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 mb-1.5">Módulos más usados (30 días)</p>
                {(usage.top_pages || []).slice(0, 5).map(p => (
                  <div key={p.path} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="text-slate-400 flex-1 truncate">{p.path}</span>
                    <span className="text-slate-300 font-semibold">{p.hits}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-2">
              <p className="text-[11px] text-slate-500 mb-1">Actividad diaria (14 días)</p>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={usage.daily || []} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                  <defs>
                    <linearGradient id="usageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.cyan} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={C.cyan} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false}
                    tickFormatter={d => d?.slice(5)} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }} />
                  <Area type="monotone" dataKey="events" name="Eventos" stroke={C.cyan} strokeWidth={2} fill="url(#usageGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Vista 360 de usuario ── */}
      {user360 && <User360Drawer userId={user360} onClose={() => setUser360(null)} />}
    </div>
  )
}
