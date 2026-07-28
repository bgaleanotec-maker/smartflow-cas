import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, TrendingUp, Loader2, Star, CheckCircle2, Crown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { dashboardAPI, tasksAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { celebrate } from '../mi-espacio/MiEspacioPage'

const VIEW_ALL = ['admin', 'leader', 'lider_sr', 'directivo']

// Anillo grande animado del avance ponderado
function BigRing({ pct, size = 170 }) {
  const r = (size - 18) / 2
  const c = 2 * Math.PI * r
  const color = pct >= 100 ? '#10b981' : pct >= 70 ? '#22d3ee' : pct >= 40 ? '#818cf8' : '#f59e0b'
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth="13" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth="13" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (Math.min(100, pct) / 100) * c}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1), stroke .5s' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold text-white">{pct}%</span>
        <span className="text-[10px] text-slate-400 mt-0.5">avance ponderado</span>
      </div>
    </div>
  )
}

function WeightStars({ value, editable, onChange }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <button
          key={s} type="button" disabled={!editable}
          onClick={() => editable && onChange(s)}
          className={editable ? 'hover:scale-125 transition-transform' : 'cursor-default'}
          title={`Peso ${s}`}
        >
          <Star size={13} className={s <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-700'} />
        </button>
      ))}
    </div>
  )
}

export default function ProjectAnalyticsPage() {
  const { id: projectId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const isLeader = VIEW_ALL.includes(user?.role)
  const [savingId, setSavingId] = useState(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['project-analytics', projectId],
    queryFn: () => dashboardAPI.projectAnalytics(projectId).then(r => r.data),
  })

  const updateMut = useMutation({
    mutationFn: ({ taskId, patch }) => tasksAPI.update(taskId, patch),
    onMutate: ({ taskId }) => setSavingId(taskId),
    onSuccess: (_res, { patch }) => {
      queryClient.invalidateQueries({ queryKey: ['project-analytics', projectId] })
      if (patch.progress_pct === 100) {
        celebrate()
        toast.success('🎉 ¡Actividad al 100%!')
      }
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Sin permiso para actualizar'),
    onSettled: () => setSavingId(null),
  })

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin text-brand-400" /></div>
  }
  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-400">{error.response?.data?.detail || 'No se pudo cargar la analítica'}</p>
        <button onClick={() => navigate('/projects')} className="btn-secondary mt-4">Volver a proyectos</button>
      </div>
    )
  }

  const tasks = data?.tasks || []
  const canEditTask = (t) => isLeader || t.assignee_id === user?.id

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/projects/${projectId}`)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
          <ArrowLeft size={17} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp size={20} className="text-cyan-400" /> Analítica — {data?.project?.name}
          </h1>
          <p className="text-sm text-slate-400 flex items-center gap-2">
            {data?.project?.leader && <><Crown size={12} className="text-amber-400" /> {data.project.leader} ·</>}
            <span>{data?.tasks_done}/{data?.tasks_count} actividades completadas</span>
          </p>
        </div>
      </div>

      {/* Hero: anillo + resumen */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 border border-slate-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-8">
        <BigRing pct={data?.overall_pct ?? 0} />
        <div className="flex-1 w-full space-y-2">
          <p className="text-sm text-slate-300 font-medium mb-3">
            Cada actividad aporta según su <b className="text-amber-300">peso ⭐</b> y su <b className="text-cyan-300">% de avance</b>
          </p>
          {/* mini barras por tarea (vista rápida) */}
          {tasks.slice(0, 6).map(t => (
            <div key={t.id} className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 w-40 truncate">{t.title}</span>
              <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${t.is_done ? 'bg-emerald-500' : 'bg-gradient-to-r from-indigo-500 to-cyan-400'}`}
                  style={{ width: `${t.progress_pct}%` }}
                />
              </div>
              <span className="text-[11px] font-bold text-white w-10 text-right">{t.progress_pct}%</span>
              <span className="text-[10px] text-amber-400/80 w-8">×{t.weight}⭐</span>
            </div>
          ))}
          {tasks.length > 6 && <p className="text-[10px] text-slate-600">+{tasks.length - 6} más abajo…</p>}
        </div>
      </div>

      {/* Tabla editable */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">Actividades del proyecto</h3>
          <span className="text-[10px] text-slate-500">
            {isLeader ? '⭐ peso: solo líderes · % avance: líder o asignado' : 'Puedes actualizar el % de tus actividades'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-slate-500 uppercase">
                <th className="text-left px-4 py-2 font-medium">Actividad</th>
                <th className="text-left px-2 py-2 font-medium">Responsable</th>
                <th className="text-center px-2 py-2 font-medium">Peso</th>
                <th className="text-center px-2 py-2 font-medium">Aporta</th>
                <th className="text-left px-2 py-2 font-medium w-56">% Avance</th>
                <th className="text-center px-2 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tasks.map(t => (
                <tr key={t.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-2.5 text-slate-200">
                    <span className="flex items-center gap-2">
                      {t.is_done && <CheckCircle2 size={13} className="text-emerald-400 flex-shrink-0" />}
                      <span className={t.is_done ? 'line-through decoration-emerald-500/50 text-slate-400' : ''}>{t.title}</span>
                    </span>
                    {t.due_date && <span className="text-[10px] text-slate-600 block">{t.due_date}</span>}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-slate-400 truncate max-w-[130px]">{t.assignee || '—'}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex justify-center">
                      <WeightStars
                        value={t.weight}
                        editable={isLeader && savingId !== t.id}
                        onChange={(w) => updateMut.mutate({ taskId: t.id, patch: { weight: w } })}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center text-[11px] text-amber-300/90 font-semibold">{t.contribution_pct}%</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="range" min="0" max="100" step="5"
                        defaultValue={t.progress_pct}
                        disabled={!canEditTask(t) || t.is_done || savingId === t.id}
                        onMouseUp={e => {
                          const v = parseInt(e.target.value)
                          if (v !== t.progress_pct) updateMut.mutate({ taskId: t.id, patch: { progress_pct: v } })
                        }}
                        onTouchEnd={e => {
                          const v = parseInt(e.target.value)
                          if (v !== t.progress_pct) updateMut.mutate({ taskId: t.id, patch: { progress_pct: v } })
                        }}
                        className="flex-1 accent-cyan-400 disabled:opacity-40"
                      />
                      <span className="text-xs font-bold text-white w-9 text-right">
                        {savingId === t.id ? <Loader2 size={11} className="animate-spin inline" /> : `${t.progress_pct}%`}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      t.is_done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'
                    }`}>{t.status}</span>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-slate-500 text-sm">
                  Este proyecto aún no tiene actividades — créalas en el detalle del proyecto
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
