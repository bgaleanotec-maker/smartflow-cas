import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Trophy, Plus, X, Gift, Calendar, Pause, Play, Trash2, Crown,
  ChevronDown, ChevronUp, Sparkles,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { challengesAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const EMOJI_OPTIONS = ['🏆', '🚀', '🔥', '💡', '🎯', '⚡', '🧠', '🎮', '📊', '🛠️', '🌟', '🏅']
const METRICS = [
  { value: 'tareas_completadas', label: 'Tareas completadas en el periodo' },
  { value: 'puntualidad', label: 'Entregas a tiempo' },
  { value: 'libre', label: 'Evaluación manual del admin' },
]

const STATUS_STYLE = {
  en_curso: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  proximo: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
  finalizado: 'bg-slate-600/20 text-slate-400 border-slate-600/40',
  pausado: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
}
const STATUS_LABEL = { en_curso: 'En curso', proximo: 'Próximo', finalizado: 'Finalizado', pausado: 'Pausado' }

function CreateChallengeModal({ onClose }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: '', description: '', prize: '', emoji: '🏆',
    metric: 'tareas_completadas', start_date: '', end_date: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const createMut = useMutation({
    mutationFn: (data) => challengesAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      toast.success('🏆 Reto lanzado — ¡que empiece la competencia!')
      onClose()
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al crear el reto'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('El título es obligatorio')
    if (!form.start_date || !form.end_date) return toast.error('Define las fechas del reto')
    createMut.mutate({
      ...form,
      title: form.title.trim(),
      description: form.description.trim() || null,
      prize: form.prize.trim() || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Trophy size={16} className="text-amber-400" /> Lanzar reto
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="label">Título del reto *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="input" placeholder="Ej: Desafío BI Marketing" autoFocus />
          </div>
          <div>
            <label className="label">¿En qué consiste?</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              className="input h-20 resize-none"
              placeholder="Describe el reto, las reglas y cómo se gana..." />
          </div>
          <div>
            <label className="label">🎁 Premio</label>
            <input value={form.prize} onChange={e => set('prize', e.target.value)}
              className="input" placeholder="Ej: Boletas dobles a cine" />
          </div>
          <div>
            <label className="label">Emoji</label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} type="button" onClick={() => set('emoji', e)}
                  className={`text-xl p-1.5 rounded-lg transition-all ${form.emoji === e ? 'bg-amber-500/20 ring-1 ring-amber-500 scale-110' : 'hover:bg-slate-800'}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Métrica de ganador</label>
            <select value={form.metric} onChange={e => set('metric', e.target.value)} className="input">
              {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Inicio *</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Fin *</label>
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className="input" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary flex-1">
              {createMut.isPending ? 'Lanzando...' : '🚀 Lanzar reto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ChallengeCard({ challenge, isAdmin }) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)

  const { data: detail } = useQuery({
    queryKey: ['challenge', challenge.id],
    queryFn: () => challengesAPI.get(challenge.id).then(r => r.data),
    enabled: expanded,
  })

  const updateMut = useMutation({
    mutationFn: (data) => challengesAPI.update(challenge.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      queryClient.invalidateQueries({ queryKey: ['challenge', challenge.id] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => challengesAPI.delete(challenge.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenges'] })
      toast.success('Reto eliminado')
    },
  })

  const leaderboard = detail?.leaderboard || []

  return (
    <div className={`bg-slate-900 border rounded-2xl overflow-hidden transition-all ${
      challenge.status === 'en_curso' ? 'border-amber-600/40 shadow-lg shadow-amber-900/10' : 'border-slate-800'
    }`}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="text-4xl">{challenge.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-white">{challenge.title}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_STYLE[challenge.status]}`}>
                {STATUS_LABEL[challenge.status]}
              </span>
              {challenge.status === 'en_curso' && challenge.days_left != null && (
                <span className="text-[10px] text-amber-400 font-semibold">
                  ⏳ {challenge.days_left} {challenge.days_left === 1 ? 'día restante' : 'días restantes'}
                </span>
              )}
            </div>
            {challenge.description && (
              <p className="text-sm text-slate-400 mt-1">{challenge.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2.5 text-xs text-slate-500 flex-wrap">
              {challenge.prize && (
                <span className="flex items-center gap-1.5 text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1">
                  <Gift size={12} /> {challenge.prize}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar size={12} /> {challenge.start_date} → {challenge.end_date}
              </span>
              {challenge.winner && (
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <Crown size={12} /> Ganador: {challenge.winner}
                </span>
              )}
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => updateMut.mutate({ is_active: !challenge.is_active })}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                title={challenge.is_active ? 'Pausar' : 'Activar / desplegar'}
              >
                {challenge.is_active ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                onClick={() => confirm('¿Eliminar este reto?') && deleteMut.mutate()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-900/30"
                title="Eliminar"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Leaderboard toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-3 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Tabla de posiciones
        </button>

        {expanded && (
          <div className="mt-3 space-y-1.5">
            {leaderboard.length === 0 ? (
              <p className="text-xs text-slate-600 py-2">Aún no hay puntuaciones — ¡completa tareas para puntear!</p>
            ) : leaderboard.slice(0, 10).map(r => (
              <div key={r.user_id} className={`flex items-center gap-3 px-3 py-2 rounded-xl ${
                r.position <= 3 ? 'bg-amber-950/30 border border-amber-900/30' : 'bg-slate-800/50'
              }`}>
                <span className="w-7 text-center font-bold text-sm">
                  {r.medal || <span className="text-slate-500">{r.position}</span>}
                </span>
                <span className="flex-1 text-sm text-slate-200 truncate">{r.name}</span>
                <span className="text-sm font-bold text-white">{r.completadas}</span>
                <span className="text-[10px] text-slate-500">tareas</span>
                {isAdmin && challenge.status === 'finalizado' && !challenge.winner && (
                  <button
                    onClick={() => updateMut.mutate({ winner_id: r.user_id })}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-300 border border-emerald-600/40 hover:bg-emerald-600/40"
                  >
                    Declarar ganador
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function RetosPage() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [createOpen, setCreateOpen] = useState(false)

  const { data: challenges = [], isLoading } = useQuery({
    queryKey: ['challenges', isAdmin],
    queryFn: () => challengesAPI.list(isAdmin ? { all: true } : {}).then(r => r.data),
  })

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Trophy size={22} className="text-amber-400" /> Retos
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Desafíos tipo hackathon con premios reales — compite completando tareas
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2 self-start">
            <Plus size={16} /> Lanzar reto
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-slate-500 text-sm py-10 text-center">Cargando retos…</div>
      ) : challenges.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-700 rounded-2xl">
          <Sparkles size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">No hay retos activos</p>
          <p className="text-slate-500 text-sm mt-1">
            {isAdmin
              ? 'Lanza un desafío con premio para motivar al equipo 🎁'
              : 'Cuando el admin lance un reto aparecerá aquí'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {challenges.map(c => (
            <ChallengeCard key={c.id} challenge={c} isAdmin={isAdmin} />
          ))}
        </div>
      )}

      {createOpen && <CreateChallengeModal onClose={() => setCreateOpen(false)} />}
    </div>
  )
}
