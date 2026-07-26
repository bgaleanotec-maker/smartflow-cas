import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Flame, Zap, CheckCircle2, Clock, AlertTriangle, ChevronRight,
  Trophy, Target, Repeat, ListTodo, FolderKanban, Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { dashboardAPI, quickTasksAPI, activitiesAPI } from '../../services/api'

// ─── Celebración (dopamina por feedback inmediato) ───────────────────────────
export function celebrate() {
  const emojis = ['🎉', '✨', '⭐', '💪', '🔥', '👏']
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden'
  document.body.appendChild(container)
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('div')
    p.textContent = emojis[Math.floor(Math.random() * emojis.length)]
    const size = 14 + Math.random() * 18
    const x = 20 + Math.random() * 60
    const delay = Math.random() * 0.3
    const dur = 1.2 + Math.random() * 0.8
    p.style.cssText = `position:absolute;left:${x}%;top:45%;font-size:${size}px;opacity:0;
      animation: confetti-pop ${dur}s ${delay}s ease-out forwards`
    container.appendChild(p)
  }
  if (!document.getElementById('confetti-style')) {
    const style = document.createElement('style')
    style.id = 'confetti-style'
    style.textContent = `@keyframes confetti-pop {
      0% { opacity: 0; transform: translateY(0) scale(.5) rotate(0deg); }
      15% { opacity: 1; }
      100% { opacity: 0; transform: translateY(${Math.random() > 0.5 ? '-' : ''}220px) translateX(${(Math.random() - 0.5) * 300}px) scale(1.2) rotate(${(Math.random() - 0.5) * 240}deg); }
    }`
    document.head.appendChild(style)
  }
  setTimeout(() => container.remove(), 2600)
}

// ─── Anillo de progreso (efecto gradiente de meta) ───────────────────────────
function ProgressRing({ done, total, size = 110 }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth="9" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={pct >= 100 ? '#10b981' : pct >= 50 ? '#22d3ee' : '#6366f1'}
          strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.4,0,.2,1), stroke .5s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{pct}%</span>
        <span className="text-[10px] text-slate-400">{done}/{total} hoy</span>
      </div>
    </div>
  )
}

const SOURCE_META = {
  recurrente: { icon: Repeat, label: 'Recurrente', color: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  rapida: { icon: ListTodo, label: 'Rápida', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  proyecto: { icon: FolderKanban, label: 'Proyecto', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
}

function TaskRow({ item, onComplete, completing }) {
  const navigate = useNavigate()
  const meta = SOURCE_META[item.source] || SOURCE_META.rapida
  const Icon = meta.icon
  const overdue = item.days_overdue > 0
  const canComplete = item.source === 'rapida' || item.source === 'recurrente'

  return (
    <div className={`group flex items-center gap-3 p-3 rounded-xl border transition-all hover:scale-[1.01] ${
      overdue ? 'bg-red-950/30 border-red-900/40' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
    }`}>
      {/* Botón completar (victoria inmediata) */}
      {canComplete ? (
        <button
          onClick={() => onComplete(item)}
          disabled={completing}
          className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-slate-600 hover:border-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center justify-center group/check"
          title="Marcar como completada"
        >
          <CheckCircle2 size={14} className="opacity-0 group-hover/check:opacity-100 text-emerald-400 transition-opacity" />
        </button>
      ) : (
        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
          <Icon size={14} className="text-slate-600" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] px-1.5 py-0 rounded border ${meta.color}`}>{meta.label}</span>
          {item.project && <span className="text-[10px] text-slate-500 truncate">{item.project}</span>}
          {overdue ? (
            <span className="text-[10px] font-semibold text-red-400">
              {item.days_overdue} {item.days_overdue === 1 ? 'día vencida' : 'días vencida'}
            </span>
          ) : item.due_date ? (
            <span className="text-[10px] text-slate-500">{item.due_date}</span>
          ) : null}
        </div>
      </div>

      <button
        onClick={() => navigate(item.link)}
        className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-all"
        title="Ir al módulo"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  )
}

export default function MiEspacioPage() {
  const queryClient = useQueryClient()
  const [completingId, setCompletingId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['mi-espacio'],
    queryFn: () => dashboardAPI.miEspacio().then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data: game } = useQuery({
    queryKey: ['gamification'],
    queryFn: () => dashboardAPI.gamification().then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['mi-espacio'] })
    queryClient.invalidateQueries({ queryKey: ['gamification'] })
  }

  const completeMut = useMutation({
    mutationFn: async (item) => {
      if (item.source === 'rapida') return quickTasksAPI.done(item.id)
      if (item.source === 'recurrente') return activitiesAPI.updateInstance(item.id, { status: 'completada' })
      throw new Error('unsupported')
    },
    onMutate: (item) => setCompletingId(item.id),
    onSuccess: () => {
      celebrate()
      const msgs = ['💪 ¡Excelente!', '🚀 ¡Una menos!', '⭐ ¡Bien hecho!', '🔥 ¡Sigue así!']
      toast.success(msgs[Math.floor(Math.random() * msgs.length)] + ' +XP')
      refresh()
    },
    onError: () => toast.error('No se pudo completar la tarea'),
    onSettled: () => setCompletingId(null),
  })

  if (isLoading) {
    return <div className="text-slate-500 text-sm py-16 text-center">Cargando tu espacio…</div>
  }

  const kpis = data?.kpis || {}
  const items = data?.items || []
  const overdue = items.filter(i => i.days_overdue > 0)
  const todayItems = items.filter(i => i.days_overdue === 0 && i.due_date === data?.date)
  const upcoming = items.filter(i => i.days_overdue === 0 && i.due_date !== data?.date)
  const me = game?.me
  const level = me?.level

  const doneToday = kpis.completadas_hoy || 0
  const totalToday = doneToday + todayItems.length + overdue.length

  const hour = new Date().getHours()
  const greeting = hour < 12 ? '☀️ Buenos días' : hour < 18 ? '🌤️ Buenas tardes' : '🌙 Buenas noches'

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* ── Hero gamificado ── */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/60 border border-slate-800 rounded-2xl p-5 lg:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <ProgressRing done={doneToday} total={Math.max(totalToday, 1)} />

          <div className="flex-1 min-w-0">
            <p className="text-slate-400 text-sm">{greeting},</p>
            <h1 className="text-xl font-bold text-white truncate">{data?.user}</h1>

            {level && (
              <div className="mt-2.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-lg">{level.icon}</span>
                  <span className="font-semibold text-white">Nivel {level.level} — {level.name}</span>
                  <span className="text-xs text-slate-400">{level.xp} XP</span>
                </div>
                {level.next_xp && (
                  <div className="mt-1.5 max-w-xs">
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full transition-all duration-700"
                        style={{ width: `${level.progress_pct}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {level.next_xp - level.xp} XP para {level.next_name}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Racha + semana */}
          <div className="flex sm:flex-col gap-3">
            <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-xl px-3 py-2">
              <Flame size={18} className="text-orange-400" />
              <div>
                <p className="text-lg font-bold text-white leading-none">{me?.streak ?? 0}</p>
                <p className="text-[10px] text-orange-300/80">días de racha</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">
              <Zap size={18} className="text-emerald-400" />
              <div>
                <p className="text-lg font-bold text-white leading-none">{me?.week ?? 0}</p>
                <p className="text-[10px] text-emerald-300/80">esta semana</p>
              </div>
            </div>
          </div>
        </div>

        {/* Insignias */}
        {me?.badges?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-800">
            {me.badges.map(b => (
              <span key={b.id} className="flex items-center gap-1.5 text-xs bg-slate-800/80 border border-slate-700 rounded-full px-3 py-1 text-slate-300">
                <span>{b.icon}</span> {b.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Vencidas (rojo, solo aquí — evita fatiga de alarma) ── */}
      {overdue.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-400 mb-2">
            <AlertTriangle size={15} /> Vencidas ({overdue.length}) — recupéralas y suma XP extra
          </h2>
          <div className="space-y-2">
            {overdue.map(i => (
              <TaskRow key={`${i.source}-${i.id}`} item={i} onComplete={completeMut.mutate} completing={completingId === i.id} />
            ))}
          </div>
        </section>
      )}

      {/* ── Hoy (foco del día — regla de pocas cosas visibles) ── */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-400 mb-2">
          <Target size={15} /> Para hoy ({todayItems.length})
        </h2>
        {todayItems.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl">
            {overdue.length === 0 ? (
              <>
                <Sparkles size={26} className="mx-auto text-emerald-400 mb-2" />
                <p className="text-emerald-300 font-medium text-sm">¡Día despejado! Nada vence hoy 🎉</p>
              </>
            ) : (
              <p className="text-slate-500 text-sm">Nada nuevo vence hoy — enfócate en recuperar las vencidas 💪</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {todayItems.map(i => (
              <TaskRow key={`${i.source}-${i.id}`} item={i} onComplete={completeMut.mutate} completing={completingId === i.id} />
            ))}
          </div>
        )}
      </section>

      {/* ── Próximas ── */}
      {upcoming.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-400 mb-2">
            <Clock size={15} /> Próximas ({upcoming.length})
          </h2>
          <div className="space-y-2">
            {upcoming.slice(0, 15).map(i => (
              <TaskRow key={`${i.source}-${i.id}`} item={i} onComplete={completeMut.mutate} completing={completingId === i.id} />
            ))}
            {upcoming.length > 15 && (
              <p className="text-xs text-slate-600 text-center pt-1">+{upcoming.length - 15} más…</p>
            )}
          </div>
        </section>
      )}

      {/* ── Completadas esta semana (principio del progreso) ── */}
      {data?.completadas_semana?.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-400 mb-2">
            <Trophy size={15} /> Logros de la semana ({data.completadas_semana.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {data.completadas_semana.slice(0, 12).map((i, idx) => (
              <span key={idx} className="text-xs bg-emerald-950/40 border border-emerald-900/50 text-emerald-300/90 rounded-full px-3 py-1 line-through decoration-emerald-500/50 truncate max-w-[220px]">
                {i.title}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
