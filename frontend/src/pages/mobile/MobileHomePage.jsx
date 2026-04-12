/**
 * MobileHomePage — Inicio rápido para móvil
 *
 * Diseñado para máxima velocidad de uso:
 *  - Saludo + fecha
 *  - Acciones rápidas (1 toque)
 *  - Recordatorios del día
 *  - Incidentes abiertos urgentes
 *  - Agregar recordatorio con voz
 */
import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell, Plus, Mic, MicOff, AlertTriangle, Zap, Mic2,
  FileText, CheckCircle2, Circle, Trash2, ChevronRight,
  TrendingUp, Timer, Calendar, Sun, Moon, Cloud, Loader2,
  X
} from 'lucide-react'
import { remindersAPI, incidentsAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Buenos días', icon: Sun }
  if (h < 18) return { text: 'Buenas tardes', icon: Cloud }
  return { text: 'Buenas noches', icon: Moon }
}

function formatDate() {
  return new Date().toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long'
  })
}

// ── Quick action button ───────────────────────────────────────────────────────
function QuickAction({ icon: Icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col items-center justify-center gap-2 rounded-2xl p-4 transition-all active:scale-95 border',
        color
      )}
    >
      <Icon size={24} />
      <span className="text-xs font-semibold text-center leading-tight">{label}</span>
    </button>
  )
}

// ── Reminder item ─────────────────────────────────────────────────────────────
function ReminderItem({ reminder, onToggle, onDelete }) {
  const priorityDot = {
    alta: 'bg-red-500',
    media: 'bg-yellow-500',
    baja: 'bg-green-500',
  }[reminder.priority] || 'bg-slate-500'

  const isOverdue = reminder.due_date && new Date(reminder.due_date) < new Date() && !reminder.is_done

  return (
    <div className={clsx(
      'flex items-start gap-3 p-3 rounded-xl border transition-all',
      reminder.is_done
        ? 'bg-slate-900/40 border-slate-800/50 opacity-60'
        : isOverdue
        ? 'bg-red-900/20 border-red-800/40'
        : 'bg-slate-800/60 border-slate-700/50'
    )}>
      <button
        onClick={() => onToggle(reminder)}
        className="mt-0.5 flex-shrink-0 transition-transform active:scale-90"
      >
        {reminder.is_done
          ? <CheckCircle2 size={20} className="text-green-500" />
          : <Circle size={20} className="text-slate-500" />
        }
      </button>

      <div className="flex-1 min-w-0">
        <p className={clsx(
          'text-sm font-medium leading-snug',
          reminder.is_done ? 'text-slate-500 line-through' : 'text-slate-100'
        )}>
          {reminder.title}
        </p>
        {reminder.note && (
          <p className="text-xs text-slate-500 mt-0.5 truncate">{reminder.note}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', priorityDot)} />
          {reminder.due_date && (
            <span className={clsx(
              'text-[11px]',
              isOverdue ? 'text-red-400 font-semibold' : 'text-slate-500'
            )}>
              {isOverdue ? '⚠ ' : ''}
              {new Date(reminder.due_date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onDelete(reminder.id)}
        className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-colors flex-shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ── Add reminder sheet ────────────────────────────────────────────────────────
function AddReminderSheet({ onClose, onSaved }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('media')
  const [isListening, setIsListening] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const srRef = useRef(null)

  const startVoice = useCallback(() => {
    if (!SpeechRecognition) { toast.error('Sin reconocimiento de voz'); return }
    const sr = new SpeechRecognition()
    sr.lang = 'es-CO'
    sr.continuous = false
    sr.interimResults = false
    srRef.current = sr
    sr.onstart = () => setIsListening(true)
    sr.onend = () => setIsListening(false)
    sr.onresult = (e) => {
      const t = e.results[0][0].transcript
      setTitle(t)
    }
    sr.onerror = () => setIsListening(false)
    sr.start()
  }, [])

  const save = async () => {
    if (!title.trim()) return
    setIsSaving(true)
    try {
      await remindersAPI.create({ title: title.trim(), priority })
      toast.success('Recordatorio guardado ✓')
      onSaved()
      onClose()
    } catch {
      toast.error('Error al guardar')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full bg-slate-900 rounded-t-2xl border-t border-slate-700 p-5 animate-slide-up">
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>
        <h3 className="text-base font-semibold text-white mb-4">Nuevo recordatorio</h3>

        {/* Voice input */}
        <div className="relative mb-3">
          <input
            autoFocus
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="¿Qué debes recordar?"
            className="w-full bg-slate-800 text-white placeholder-slate-500 text-sm rounded-xl px-4 py-3 pr-12 border border-slate-700 focus:border-brand-500 focus:outline-none"
          />
          <button
            onPointerDown={startVoice}
            className={clsx(
              'absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors',
              isListening ? 'text-red-400 bg-red-900/30 animate-pulse' : 'text-slate-400 hover:text-brand-400'
            )}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
        </div>

        {/* Priority */}
        <div className="flex gap-2 mb-4">
          {[['alta', 'text-red-400 border-red-700/50', 'bg-red-900/30 border-red-600'],
            ['media', 'text-yellow-400 border-yellow-700/50', 'bg-yellow-900/30 border-yellow-600'],
            ['baja', 'text-green-400 border-green-700/50', 'bg-green-900/30 border-green-600']
          ].map(([p, inactive, active]) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={clsx(
                'flex-1 py-2 rounded-xl border text-xs font-semibold capitalize transition-all',
                priority === p ? active + ' text-white' : 'bg-slate-800 border-slate-700 ' + inactive
              )}
            >
              {p}
            </button>
          ))}
        </div>

        <button
          onClick={save}
          disabled={!title.trim() || isSaving}
          className="w-full py-3 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
          Guardar recordatorio
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MobileHomePage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [showAddReminder, setShowAddReminder] = useState(false)
  const firstName = user?.full_name?.split(' ')[0] || 'equipo'
  const { text: greetText, icon: GreetIcon } = getGreeting()

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: reminders = [], isLoading: loadingR } = useQuery({
    queryKey: ['reminders'],
    queryFn: () => remindersAPI.list(false).then(r => r.data),
    refetchInterval: 60000,
  })

  const { data: incidentsData } = useQuery({
    queryKey: ['incidents-urgent'],
    queryFn: () => incidentsAPI.list({ limit: 5, status: 'open' }).then(r => r.data),
    refetchInterval: 120000,
  })

  const urgentIncidents = (incidentsData?.items || incidentsData || [])
    .filter(i => i.severity === 'critical' || i.severity === 'high' || i.severity === 'Crítica' || i.severity === 'Alta')
    .slice(0, 3)

  // ── Mutations ─────────────────────────────────────────────────────────────
  const toggleMut = useMutation({
    mutationFn: (r) => remindersAPI.update(r.id, { is_done: !r.is_done }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reminders'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => remindersAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reminders'] })
      toast.success('Eliminado')
    },
  })

  const pendingReminders = reminders.filter(r => !r.is_done)
  const overdueCount = pendingReminders.filter(r => r.due_date && new Date(r.due_date) < new Date()).length

  return (
    <div className="space-y-5 pb-4">

      {/* ── Greeting ── */}
      <div className="bg-gradient-to-br from-brand-900/40 to-slate-800/60 rounded-2xl p-5 border border-brand-800/30">
        <div className="flex items-center gap-2 mb-1">
          <GreetIcon size={16} className="text-brand-300" />
          <span className="text-xs text-brand-300 capitalize">{formatDate()}</span>
        </div>
        <h1 className="text-xl font-bold text-white">{greetText}, {firstName}</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {pendingReminders.length > 0
            ? `Tienes ${pendingReminders.length} recordatorio${pendingReminders.length > 1 ? 's' : ''} pendiente${pendingReminders.length > 1 ? 's' : ''}`
            : urgentIncidents.length > 0
            ? `${urgentIncidents.length} incidente${urgentIncidents.length > 1 ? 's' : ''} urgente${urgentIncidents.length > 1 ? 's' : ''}`
            : 'Todo al día 🎉'}
        </p>
        {overdueCount > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-red-400 text-xs font-semibold">
            <AlertTriangle size={12} />
            {overdueCount} vencido{overdueCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Acciones rápidas</h2>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction
            icon={Bell}
            label="Recordar"
            color="bg-indigo-900/40 border-indigo-800/40 text-indigo-300 hover:bg-indigo-900/60"
            onClick={() => setShowAddReminder(true)}
          />
          <QuickAction
            icon={Mic2}
            label="Reunión"
            color="bg-purple-900/40 border-purple-800/40 text-purple-300 hover:bg-purple-900/60"
            onClick={() => navigate('/meetings')}
          />
          <QuickAction
            icon={AlertTriangle}
            label="Incidente"
            color="bg-red-900/40 border-red-800/40 text-red-300 hover:bg-red-900/60"
            onClick={() => navigate('/incidents')}
          />
          <QuickAction
            icon={FileText}
            label="Demanda"
            color="bg-amber-900/40 border-amber-800/40 text-amber-300 hover:bg-amber-900/60"
            onClick={() => navigate('/demands/new')}
          />
          <QuickAction
            icon={Zap}
            label="Standup"
            color="bg-yellow-900/40 border-yellow-800/40 text-yellow-300 hover:bg-yellow-900/60"
            onClick={() => navigate('/lean-pro')}
          />
          <QuickAction
            icon={TrendingUp}
            label="Plan BP"
            color="bg-green-900/40 border-green-800/40 text-green-300 hover:bg-green-900/60"
            onClick={() => navigate('/bp')}
          />
          <QuickAction
            icon={Timer}
            label="Pomodoro"
            color="bg-orange-900/40 border-orange-800/40 text-orange-300 hover:bg-orange-900/60"
            onClick={() => navigate('/pomodoro')}
          />
          <QuickAction
            icon={Calendar}
            label="Dashboard"
            color="bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-700/60"
            onClick={() => navigate('/dashboard')}
          />
        </div>
      </div>

      {/* ── Reminders ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Recordatorios
            {pendingReminders.length > 0 && (
              <span className="ml-2 bg-brand-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {pendingReminders.length}
              </span>
            )}
          </h2>
          <button
            onClick={() => setShowAddReminder(true)}
            className="flex items-center gap-1 text-xs text-brand-400 font-semibold hover:text-brand-300 transition-colors"
          >
            <Plus size={14} /> Nuevo
          </button>
        </div>

        {loadingR ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="text-slate-600 animate-spin" />
          </div>
        ) : pendingReminders.length === 0 ? (
          <div className="text-center py-6 text-slate-600">
            <Bell size={28} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin recordatorios pendientes</p>
            <button
              onClick={() => setShowAddReminder(true)}
              className="mt-2 text-xs text-brand-400 font-semibold hover:text-brand-300"
            >
              + Agregar uno
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingReminders.map(r => (
              <ReminderItem
                key={r.id}
                reminder={r}
                onToggle={(r) => toggleMut.mutate(r)}
                onDelete={(id) => deleteMut.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Urgent Incidents ── */}
      {urgentIncidents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Incidentes urgentes
            </h2>
            <button
              onClick={() => navigate('/incidents')}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
            >
              Ver todos <ChevronRight size={12} />
            </button>
          </div>
          <div className="space-y-2">
            {urgentIncidents.map(inc => (
              <button
                key={inc.id}
                onClick={() => navigate(`/incidents/${inc.id}`)}
                className="w-full flex items-center gap-3 p-3 bg-red-900/20 border border-red-800/30 rounded-xl text-left hover:bg-red-900/30 transition-colors active:scale-[0.98]"
              >
                <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100 font-medium truncate">{inc.title}</p>
                  <p className="text-xs text-red-400 capitalize">{inc.severity}</p>
                </div>
                <ChevronRight size={14} className="text-slate-600 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Add reminder sheet ── */}
      {showAddReminder && (
        <AddReminderSheet
          onClose={() => setShowAddReminder(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['reminders'] })}
        />
      )}
    </div>
  )
}
