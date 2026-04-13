import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Pause, Square, SkipForward, Coffee, Brain } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { pomodoroAPI, tasksAPI } from '../../services/api'
import api from '../../services/api'
import { usePomodoroStore } from '../../stores/pomodoroStore'
import clsx from 'clsx'

const SESSION_TYPES = [
  { value: 'trabajo', label: 'Trabajo', duration: 25, icon: Brain, color: 'brand' },
  { value: 'descanso_corto', label: 'Descanso corto', duration: 5, icon: Coffee, color: 'green' },
  { value: 'descanso_largo', label: 'Descanso largo', duration: 15, icon: Coffee, color: 'blue' },
]

export default function PomodoroPage() {
  const [selectedType, setSelectedType] = useState('trabajo')
  const [selectedTaskId, setSelectedTaskId] = useState(null)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [selectedActivityId, setSelectedActivityId] = useState(null)
  const [searchParams] = useSearchParams()
  const qc = useQueryClient()

  const {
    isRunning, isPaused, timeLeft, totalTime, currentSessionId,
    formatTime, getProgress, startTimer, pauseTimer, resumeTimer, stopTimer,
    pomodoroCount, workDuration, shortBreakDuration, longBreakDuration,
    setConfig,
  } = usePomodoroStore()

  const { data: myTasks } = useQuery({
    queryKey: ['my-tasks-pomodoro'],
    queryFn: () => tasksAPI.myTasks({ limit: 30 }).then(r => r.data),
  })

  const { data: projects } = useQuery({
    queryKey: ['projects-pomodoro'],
    queryFn: () => api.get('/projects').then(r => r.data),
  })

  const { data: myActivities } = useQuery({
    queryKey: ['activities-pomodoro'],
    queryFn: () => api.get('/activities').then(r => r.data),
  })

  const { data: stats } = useQuery({
    queryKey: ['pomodoro-stats'],
    queryFn: () => pomodoroAPI.stats().then(r => r.data),
  })

  const startMutation = useMutation({
    mutationFn: (data) => pomodoroAPI.start(data),
    onSuccess: (res) => {
      const session = res.data
      startTimer(session.id, selectedType)
      toast.success('¡Sesión iniciada! Enfócate 🍅')
    },
    onError: () => toast.error('Error al iniciar sesión'),
  })

  const completeMutation = useMutation({
    mutationFn: (id) => pomodoroAPI.complete(id),
    onSuccess: () => {
      stopTimer()
      qc.invalidateQueries(['pomodoro-stats'])
      toast.success('¡Sesión completada! 🎉')
    },
  })

  const interruptMutation = useMutation({
    mutationFn: (id) => pomodoroAPI.interrupt(id),
    onSuccess: () => {
      stopTimer()
      toast('Sesión interrumpida', { icon: '⏸' })
    },
  })

  useEffect(() => {
    const activityId = searchParams.get('activity_id')
    const activityName = searchParams.get('activity_name')
    if (activityId) {
      setSelectedActivityId(activityId)
      toast(`Pomodoro listo para: ${activityName || 'actividad'}`, { icon: '🍅' })
    }
  }, [searchParams])

  const handleStart = () => {
    const type = SESSION_TYPES.find(t => t.value === selectedType)
    startMutation.mutate({
      task_id: selectedTaskId || null,
      project_id: selectedProjectId ? parseInt(selectedProjectId) : null,
      activity_id: selectedActivityId ? parseInt(selectedActivityId) : null,
      duration_minutes: type.duration,
      session_type: selectedType,
    })
  }

  const handleComplete = () => {
    if (currentSessionId) completeMutation.mutate(currentSessionId)
  }

  const handleStop = () => {
    if (currentSessionId) interruptMutation.mutate(currentSessionId)
    else stopTimer()
  }

  const progress = getProgress()
  const circumference = 2 * Math.PI * 100
  const strokeDashoffset = circumference - (progress / 100) * circumference

  const currentType = SESSION_TYPES.find(t => t.value === selectedType) || SESSION_TYPES[0]

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Pomodoro</h1>
        <p className="text-slate-400 text-sm mt-0.5">Técnica de gestión del tiempo para máxima productividad</p>
      </div>

      {/* Session type selector */}
      {!isRunning && !isPaused && (
        <div className="flex gap-2">
          {SESSION_TYPES.map(type => (
            <button
              key={type.value}
              onClick={() => setSelectedType(type.value)}
              className={clsx(
                'flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors',
                selectedType === type.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      )}

      {/* Timer circle */}
      <div className="card flex flex-col items-center py-10">
        <div className="relative">
          <svg width="240" height="240" className="-rotate-90">
            <circle
              cx="120" cy="120" r="100"
              fill="none" stroke="#1e293b" strokeWidth="10"
            />
            <circle
              cx="120" cy="120" r="100"
              fill="none"
              stroke={isRunning ? '#6366f1' : isPaused ? '#f59e0b' : '#334155'}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-mono font-bold text-white">{formatTime()}</span>
            <span className="text-sm text-slate-400 mt-1">{currentType.label}</span>
            {isPaused && <span className="text-xs text-amber-400 mt-1">Pausado</span>}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mt-8">
          {!isRunning && !isPaused ? (
            <button
              onClick={handleStart}
              disabled={startMutation.isPending}
              className="btn-primary px-8 py-3 text-base"
            >
              <Play size={20} />
              Iniciar
            </button>
          ) : (
            <>
              {isRunning ? (
                <button onClick={pauseTimer} className="btn-secondary px-6 py-3">
                  <Pause size={18} /> Pausar
                </button>
              ) : (
                <button onClick={resumeTimer} className="btn-secondary px-6 py-3">
                  <Play size={18} /> Reanudar
                </button>
              )}
              <button onClick={handleComplete} className="btn-primary px-6 py-3">
                <SkipForward size={18} /> Completar
              </button>
              <button onClick={handleStop} className="btn-ghost px-4 py-3 text-red-400 hover:bg-red-900/20">
                <Square size={18} />
              </button>
            </>
          )}
        </div>

        {/* Stats row */}
        <div className="flex gap-6 mt-6 text-center">
          <div>
            <p className="text-2xl font-bold text-white">{pomodoroCount}</p>
            <p className="text-xs text-slate-500">Hoy</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{stats?.pomodoros_this_week ?? 0}</p>
            <p className="text-xs text-slate-500">Esta semana</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">
              {Math.floor((stats?.minutes_focused_today ?? 0) / 60)}h
              {(stats?.minutes_focused_today ?? 0) % 60}m
            </p>
            <p className="text-xs text-slate-500">Enfocado hoy</p>
          </div>
        </div>
      </div>

      {/* Task selector */}
      {(!isRunning && !isPaused) && (
        <div className="card">
          <h3 className="font-medium text-white mb-3">Trabajar en...</h3>
          <div className="space-y-3">
            {/* Selector: Proyecto */}
            <div>
              <label className="label text-xs">Proyecto (opcional)</label>
              <select
                value={selectedProjectId || ''}
                onChange={e => { setSelectedProjectId(e.target.value || null); setSelectedTaskId(null); setSelectedActivityId(null); }}
                className="input w-full text-sm"
              >
                <option value="">Sin proyecto específico</option>
                {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Selector: Actividad recurrente */}
            <div>
              <label className="label text-xs">Actividad recurrente (opcional)</label>
              <select
                value={selectedActivityId || ''}
                onChange={e => { setSelectedActivityId(e.target.value || null); setSelectedProjectId(null); }}
                className="input w-full text-sm"
              >
                <option value="">Sin actividad específica</option>
                {myActivities?.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
            </div>

            {/* Selector: Tarea */}
            <div>
              <label className="label text-xs">Tarea (opcional)</label>
              <select
                value={selectedTaskId || ''}
                onChange={(e) => setSelectedTaskId(e.target.value ? parseInt(e.target.value) : null)}
                className="input w-full text-sm"
              >
                <option value="">Sin tarea específica</option>
                {myTasks?.map(task => (
                  <option key={task.id} value={task.id}>
                    [{task.task_number}] {task.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Config */}
      {!isRunning && !isPaused && (
        <div className="card">
          <h3 className="font-medium text-white mb-3">Configuración</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { key: 'workDuration', label: 'Trabajo (min)', value: workDuration },
              { key: 'shortBreakDuration', label: 'Descanso corto', value: shortBreakDuration },
              { key: 'longBreakDuration', label: 'Descanso largo', value: longBreakDuration },
            ].map(({ key, label, value }) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={value}
                  onChange={(e) => setConfig({ [key]: parseInt(e.target.value) })}
                  className="input text-center"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
