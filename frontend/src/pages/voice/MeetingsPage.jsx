import { useState, useEffect } from 'react'
import {
  Mic2, Plus, Clock, Users, FileText, ChevronRight,
  Loader2, Radio, CheckCircle, AlertCircle, XCircle, X,
  Calendar, Tag, Zap,
} from 'lucide-react'
import { voiceAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import clsx from 'clsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min ${s}s`
  return `${s}s`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  recording: { label: 'Grabando', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: Radio },
  processing: { label: 'Procesando', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Loader2 },
  completed: { label: 'Completada', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: CheckCircle },
  failed: { label: 'Fallida', color: 'bg-red-800/20 text-red-500 border-red-800/30', icon: XCircle },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.completed
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.color}`}>
      <Icon size={10} className={status === 'processing' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  )
}

function TypeBadge({ type }) {
  if (type === 'aria_chat') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
        <Zap size={10} />
        ARIA Chat
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-500/20 text-brand-400 border border-brand-500/30">
      <Users size={10} />
      Reunión
    </span>
  )
}

// ─── Meeting detail drawer ────────────────────────────────────────────────────

function MeetingDetailDrawer({ meeting, onClose }) {
  if (!meeting) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-2xl h-full bg-slate-900 sm:border-l border-slate-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-lg font-bold text-slate-100 truncate">{meeting.title}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <TypeBadge type={meeting.meeting_type} />
              <StatusBadge status={meeting.status} />
              <span className="text-xs text-slate-500">{formatDate(meeting.started_at)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-800/50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Duración</p>
              <p className="font-semibold text-slate-100">{formatDuration(meeting.duration_seconds)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Fragmentos</p>
              <p className="font-semibold text-slate-100">{meeting.chunks?.length || 0}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Acciones</p>
              <p className="font-semibold text-slate-100">{meeting.ai_action_items?.length || 0}</p>
            </div>
          </div>

          {/* AI Summary */}
          {meeting.ai_summary && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Resumen IA
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">{meeting.ai_summary}</p>
            </div>
          )}

          {/* Action items */}
          {meeting.ai_action_items?.length > 0 && (
            <div className="bg-amber-900/10 border border-amber-700/30 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">
                Acciones a seguir ({meeting.ai_action_items.length})
              </h3>
              <ul className="space-y-2">
                {meeting.ai_action_items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 mt-0.5',
                      item.priority === 'alta' ? 'bg-red-900/60 text-red-400' :
                      item.priority === 'media' ? 'bg-amber-900/60 text-amber-400' :
                      'bg-slate-800 text-slate-400'
                    )}>
                      {item.priority || 'media'}
                    </span>
                    <span className="text-slate-300">
                      {item.text}
                      {item.owner_mentioned && (
                        <span className="text-slate-500 ml-1">— {item.owner_mentioned}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Decisions */}
          {meeting.ai_decisions?.length > 0 && (
            <div className="bg-brand-900/10 border border-brand-700/30 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-3">
                Decisiones ({meeting.ai_decisions.length})
              </h3>
              <ul className="space-y-2">
                {meeting.ai_decisions.map((d, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-300">
                    <span className="text-brand-500 flex-shrink-0">•</span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Key topics */}
          {meeting.ai_key_topics?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Temas clave
              </h3>
              <div className="flex flex-wrap gap-2">
                {meeting.ai_key_topics.map((t, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-400">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Full transcript */}
          {meeting.full_transcript && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Transcripción completa
              </h3>
              <div className="bg-slate-800/30 rounded-xl p-4 space-y-3 max-h-80 overflow-y-auto">
                {meeting.chunks?.length > 0
                  ? meeting.chunks.map((c) => (
                      <div key={c.id} className="flex gap-2 text-sm">
                        <span className="text-slate-500 flex-shrink-0 font-mono text-[11px] pt-0.5">
                          {c.speaker_name || 'Usuario'}:
                        </span>
                        <p className="text-slate-300">{c.text}</p>
                      </div>
                    ))
                  : <pre className="text-xs text-slate-400 whitespace-pre-wrap">{meeting.full_transcript}</pre>
                }
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Meeting card ─────────────────────────────────────────────────────────────

function MeetingCard({ meeting, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-4 sm:p-4 transition-all group active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <TypeBadge type={meeting.meeting_type} />
            <StatusBadge status={meeting.status} />
          </div>
          <h3 className="font-semibold text-slate-100 truncate">{meeting.title}</h3>
          {meeting.ai_summary && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
              {meeting.ai_summary.slice(0, 120)}{meeting.ai_summary.length > 120 ? '...' : ''}
            </p>
          )}
          <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar size={10} />
              {formatDate(meeting.started_at)}
            </span>
            {meeting.duration_seconds && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {formatDuration(meeting.duration_seconds)}
              </span>
            )}
            {meeting.ai_action_items?.length > 0 && (
              <span className="flex items-center gap-1 text-amber-500">
                <Tag size={10} />
                {meeting.ai_action_items.length} acciones
              </span>
            )}
          </div>
        </div>
        <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0 mt-1" />
      </div>
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MeetingsPage() {
  const { user } = useAuthStore()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedMeeting, setSelectedMeeting] = useState(null)
  const [stats, setStats] = useState({ total: 0, totalHours: 0, totalActions: 0 })

  const isLeader = ['admin', 'leader'].includes(user?.role)

  const loadMeetings = async () => {
    setLoading(true)
    try {
      const params = {}
      if (filterType) params.meeting_type = filterType
      if (filterStatus) params.status = filterStatus

      let data
      if (isLeader) {
        const res = await voiceAPI.teamMeetings(params)
        data = res.data
      } else {
        const res = await voiceAPI.listMeetings(params)
        data = res.data
      }

      setMeetings(data)

      // Compute stats
      const totalHoursSec = data.reduce((acc, m) => acc + (m.duration_seconds || 0), 0)
      const totalActions = data.reduce((acc, m) => acc + (m.ai_action_items?.length || 0), 0)
      setStats({
        total: data.length,
        totalHours: (totalHoursSec / 3600).toFixed(1),
        totalActions,
      })
    } catch {
      // Silently ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMeetings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterStatus])

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Mic2 size={22} className="text-brand-400" />
            Reuniones &amp; Transcripciones
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Historial de reuniones grabadas y conversaciones con ARIA
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 sm:p-4 text-center">
          <p className="text-2xl sm:text-3xl font-bold text-slate-100">{stats.total}</p>
          <p className="text-xs text-slate-500 mt-1">Total</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 sm:p-4 text-center">
          <p className="text-2xl sm:text-3xl font-bold text-brand-400">{stats.totalHours}h</p>
          <p className="text-xs text-slate-500 mt-1">Grabadas</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 sm:p-4 text-center">
          <p className="text-2xl sm:text-3xl font-bold text-amber-400">{stats.totalActions}</p>
          <p className="text-xs text-slate-500 mt-1">Acciones</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500"
        >
          <option value="">Todos los tipos</option>
          <option value="aria_chat">ARIA Chat</option>
          <option value="meeting">Reunión</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-brand-500"
        >
          <option value="">Todos los estados</option>
          <option value="recording">Grabando</option>
          <option value="processing">Procesando</option>
          <option value="completed">Completadas</option>
          <option value="failed">Fallidas</option>
        </select>
        {(filterType || filterStatus) && (
          <button
            onClick={() => { setFilterType(''); setFilterStatus('') }}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            <X size={12} /> Limpiar filtros
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-500" />
        </div>
      ) : meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
            <Mic2 size={28} className="text-slate-600" />
          </div>
          <h3 className="text-slate-400 font-medium mb-1">Sin reuniones aún</h3>
          <p className="text-sm text-slate-600 max-w-xs">
            Usa el botón de micrófono en la esquina inferior derecha para iniciar una sesión con ARIA o grabar una reunión.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              onClick={() => setSelectedMeeting(m)}
            />
          ))}
        </div>
      )}

      {/* Detail drawer */}
      {selectedMeeting && (
        <MeetingDetailDrawer
          meeting={selectedMeeting}
          onClose={() => setSelectedMeeting(null)}
        />
      )}
    </div>
  )
}
