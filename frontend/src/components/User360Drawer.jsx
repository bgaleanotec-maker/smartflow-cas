import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Flame, X, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { dashboardAPI, quickTasksAPI } from '../services/api'

const SOURCE_LABEL = { recurrente: 'Recurrente', rapida: 'Rápida', proyecto: 'Proyecto' }

export default
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

