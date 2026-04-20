import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useRef, useCallback, useEffect } from 'react'
import ErrorBoundary from '../ErrorBoundary'
import {
  LayoutDashboard, FolderKanban, AlertTriangle, Timer,
  Users, Settings, LogOut, ChevronLeft, ChevronRight,
  Bell, Search, Menu, X, FileText, BarChart3, Newspaper, Landmark,
  Plane, LayoutGrid, Zap, TrendingUp, Crown, Mic2, MoreHorizontal,
  Mic, Home, MessageSquareMore, Volume2, BookOpen, ListTodo, Plus,
  Radio, Star,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { usePomodoroStore } from '../../stores/pomodoroStore'
import clsx from 'clsx'
import VoiceAIPanel from '../voice/VoiceAIPanel'
import QuickChatPanel from '../mobile/QuickChatPanel'
import toast from 'react-hot-toast'
import { quickTasksAPI, voiceNotesAPI, adminAPI, usersAPI, novedadesAPI } from '../../services/api'

// ─── QuickTaskCreateModal ─────────────────────────────────────────────────────

function QuickTaskCreateModal({ onClose }) {
  const [form, setForm] = useState({
    title: '', business_id: '', priority: 'media', due_date: '',
    assigned_to_id: '', estimated_minutes: '',
  })
  const [businesses, setBusinesses] = useState([])
  const [users, setUsers] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminAPI.businesses().then(r => {
      const data = Array.isArray(r.data) ? r.data : r.data?.items || []
      setBusinesses(data)
    }).catch(() => {})
    usersAPI.list({ is_active: true, limit: 100 }).then(r => {
      setUsers(Array.isArray(r.data) ? r.data : r.data?.items || [])
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('El título es obligatorio')
    setSaving(true)
    try {
      await quickTasksAPI.create({
        title: form.title.trim(),
        business_id: form.business_id ? parseInt(form.business_id) : null,
        assigned_to_id: form.assigned_to_id ? parseInt(form.assigned_to_id) : null,
        priority: form.priority,
        estimated_minutes: form.estimated_minutes ? parseInt(form.estimated_minutes) : null,
        due_date: form.due_date || null,
      })
      toast.success('Tarea creada')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear tarea')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <ListTodo size={15} className="text-amber-400" /> Tarea rápida
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="label">Título *</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="input"
              placeholder="¿Qué hay que hacer?"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Prioridad</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="input">
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <div>
              <label className="label">Vencimiento</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input" />
            </div>
          </div>
          {businesses.length > 0 && (
            <div>
              <label className="label">Empresa</label>
              <select value={form.business_id} onChange={e => setForm(f => ({ ...f, business_id: e.target.value }))} className="input">
                <option value="">Sin empresa</option>
                {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          {users.length > 0 && (
            <div>
              <label className="label">Asignar a</label>
              <select value={form.assigned_to_id} onChange={e => setForm(f => ({ ...f, assigned_to_id: e.target.value }))} className="input">
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Tiempo estimado (min)</label>
            <input
              type="number" min="1"
              value={form.estimated_minutes}
              onChange={e => setForm(f => ({ ...f, estimated_minutes: e.target.value }))}
              className="input" placeholder="Ej: 30"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Creando...' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── QuickVoiceNoteModal ──────────────────────────────────────────────────────

function QuickVoiceNoteModal({ onClose }) {
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [title, setTitle] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const [saving, setSaving] = useState(false)
  const mrRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  useEffect(() => () => {
    clearInterval(timerRef.current)
    if (mrRef.current?.state === 'recording') mrRef.current.stop()
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      chunksRef.current = []
      mrRef.current = new MediaRecorder(stream, { mimeType: mimeType || undefined })
      mrRef.current.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mrRef.current.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        clearInterval(timerRef.current)
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        setTranscribing(true)
        try {
          const formData = new FormData()
          formData.append('file', blob, 'note.webm')
          const { default: api } = await import('../../services/api')
          const res = await api.post('/voice/transcribe-quick', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 30000,
          })
          const text = res.data?.transcript || res.data?.text || ''
          setTranscript(text)
          if (!title && text) setTitle(text.slice(0, 60))
        } catch {
          toast.error('No se pudo transcribir el audio')
        } finally {
          setTranscribing(false)
        }
      }
      mrRef.current.start(500)
      setRecording(true)
      setDuration(0)
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } catch {
      toast.error('No se pudo acceder al micrófono')
    }
  }, [title])

  const stopRecording = useCallback(() => {
    if (mrRef.current?.state === 'recording') mrRef.current.stop()
    setRecording(false)
  }, [])

  const handleSave = async () => {
    if (!transcript.trim()) return toast.error('La transcripción está vacía')
    setSaving(true)
    try {
      await voiceNotesAPI.create({
        transcript: transcript.trim(),
        title: title.trim() || transcript.slice(0, 60),
        priority: 'media',
        status: 'pendiente',
      })
      toast.success('Nota de voz guardada')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar nota')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Mic size={15} className="text-violet-400" /> Nota de voz rápida
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Record button */}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={transcribing}
              className={clsx(
                'w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95',
                recording
                  ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/40 animate-pulse'
                  : 'bg-gradient-to-br from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-violet-600/30'
              )}
            >
              {recording ? <span className="w-5 h-5 bg-white rounded-sm" /> : <Mic size={24} className="text-white" />}
            </button>
            {recording && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                {fmt(duration)}
              </div>
            )}
            {transcribing && (
              <p className="text-violet-400 text-sm animate-pulse">Transcribiendo...</p>
            )}
            {!recording && !transcribing && !transcript && (
              <p className="text-slate-500 text-sm">Toca para grabar</p>
            )}
          </div>

          {/* Transcript */}
          {transcript && (
            <>
              <div>
                <label className="label">Título</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="input text-sm"
                  placeholder="Título de la nota..."
                />
              </div>
              <div>
                <label className="label">Transcripción</label>
                <textarea
                  value={transcript}
                  onChange={e => setTranscript(e.target.value)}
                  className="input h-24 resize-none text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                  {saving ? 'Guardando...' : 'Guardar nota'}
                </button>
              </div>
            </>
          )}

          {!transcript && !recording && !transcribing && (
            <button onClick={onClose} className="btn-secondary w-full">Cerrar</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── QuickNovedadModal ─────────────────────────────────────────────────────────

function StarPicker({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(s => (
        <button key={s} type="button" onClick={() => onChange(s)}
          className="transition-transform hover:scale-110">
          <Star size={20} className={s <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
        </button>
      ))}
    </div>
  )
}

function QuickNovedadModal({ onClose }) {
  const [form, setForm] = useState({
    title: '', description: '', business_id: '',
    has_economic_impact: false, economic_impact_amount: '',
    impact_type: 'OTRO', importance_stars: 3,
    impact_sentiment: 'neutral',
    has_reproceso: false, reproceso_hours: '', reproceso_status: 'sin_iniciar',
  })
  const [businesses, setBusinesses] = useState([])
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    adminAPI.businesses().then(r => {
      const data = Array.isArray(r.data) ? r.data : r.data?.items || []
      setBusinesses(data)
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('El título es obligatorio')
    setSaving(true)
    try {
      await novedadesAPI.create({
        title: form.title.trim(),
        description: form.description.trim() || null,
        business_id: form.business_id ? parseInt(form.business_id) : null,
        has_economic_impact: form.has_economic_impact,
        economic_impact_amount: form.has_economic_impact && form.economic_impact_amount ? Number(form.economic_impact_amount) : null,
        impact_type: form.impact_type,
        importance_stars: form.importance_stars,
        impact_sentiment: form.impact_sentiment,
        has_reproceso: form.has_reproceso,
        reproceso_hours: form.has_reproceso && form.reproceso_hours ? Number(form.reproceso_hours) : null,
        reproceso_status: form.reproceso_status,
      })
      toast.success('Novedad operativa registrada')
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar novedad')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Radio size={15} className="text-indigo-400" /> Novedad Operativa
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="label">Título *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)}
              className="input" placeholder="¿Qué ocurrió?" autoFocus />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              className="input resize-none h-20" placeholder="Detalla la novedad..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Negocio</label>
              <select value={form.business_id} onChange={e => set('business_id', e.target.value)} className="input">
                <option value="">Sin negocio</option>
                {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tipo</label>
              <select value={form.impact_type} onChange={e => set('impact_type', e.target.value)} className="input">
                <option value="OPEX">OPEX</option>
                <option value="ON">ON</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Sentimiento del impacto</label>
            <select value={form.impact_sentiment} onChange={e => set('impact_sentiment', e.target.value)} className="input">
              <option value="positivo">✅ Positivo</option>
              <option value="neutral">➖ Neutral</option>
              <option value="negativo">❌ Negativo</option>
            </select>
          </div>
          <div>
            <label className="label">Importancia</label>
            <StarPicker value={form.importance_stars} onChange={v => set('importance_stars', v)} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded accent-indigo-500"
              checked={form.has_economic_impact} onChange={e => set('has_economic_impact', e.target.checked)} />
            <span className="text-sm text-slate-300">Genera impacto económico</span>
          </label>
          {form.has_economic_impact && (
            <input type="number" min="0" step="1000" className="input"
              placeholder="Monto COP estimado"
              value={form.economic_impact_amount}
              onChange={e => set('economic_impact_amount', e.target.value)} />
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded accent-orange-500"
              checked={form.has_reproceso} onChange={e => set('has_reproceso', e.target.checked)} />
            <span className="text-sm text-slate-300">Generó reproceso</span>
          </label>
          {form.has_reproceso && (
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="0" step="0.5" className="input"
                placeholder="Horas reproceso"
                value={form.reproceso_hours}
                onChange={e => set('reproceso_hours', e.target.value)} />
              <select value={form.reproceso_status} onChange={e => set('reproceso_status', e.target.value)} className="input">
                <option value="sin_iniciar">🔴 Sin iniciar</option>
                <option value="en_proceso">🟡 En proceso</option>
                <option value="subsanado">🟢 Subsanado</option>
              </select>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/executive', icon: Crown, label: 'Vista Directiva', badge: 'VP', roles: ['admin', 'directivo'] },
  { to: '/torre-control', icon: Plane, label: 'Torre de Control' },
  { to: '/lean-pro', icon: Zap, label: 'Lean Pro' },
  { to: '/centro-info', icon: LayoutGrid, label: 'Centro Info' },
  { to: '/demands', icon: FileText, label: 'Demandas' },
  { to: '/demands/dashboard', icon: BarChart3, label: 'Dashboard Demandas', roles: ['admin', 'leader', 'herramientas'] },
  { to: '/novedades', icon: Radio, label: 'Novedades Operativas' },
  { to: '/hechos', icon: Newspaper, label: 'Hechos Relevantes' },
  { to: '/premisas', icon: Landmark, label: 'Premisas' },
  { to: '/bp', icon: TrendingUp, label: 'Plan de Negocio', cas: true },
  { to: '/epics', icon: BookOpen, label: 'Épicas' },
  { to: '/projects', icon: FolderKanban, label: 'Proyectos' },
  { to: '/incidents', icon: AlertTriangle, label: 'Incidentes' },
  { to: '/pomodoro', icon: Timer, label: 'Pomodoro' },
  { to: '/meetings', icon: Mic2, label: 'Reuniones' },
  { to: '/voice-notes', icon: Volume2, label: 'Notas de Voz' },
  { to: '/quick-tasks', icon: ListTodo, label: 'Tareas Rápidas' },
]

const adminItems = [
  { to: '/admin/users', icon: Users, label: 'Usuarios' },
  { to: '/admin', icon: Settings, label: 'Configuración' },
]


export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  const [quickChatOpen, setQuickChatOpen] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const [quickVoiceOpen, setQuickVoiceOpen] = useState(false)
  const [quickTaskOpen, setQuickTaskOpen] = useState(false)
  const [quickNovedadOpen, setQuickNovedadOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const { isRunning, formatTime, sessionType } = usePomodoroStore()
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const filteredNavItems = navItems.filter(item => !item.roles || item.roles.includes(user?.role))

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={clsx('flex items-center gap-3 px-4 py-5 border-b border-slate-800', collapsed && 'justify-center')}>
        <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0">
          SF
        </div>
        {!collapsed && <span className="font-bold text-lg text-white">SmartFlow</span>}
      </div>

      {/* Pomodoro indicator */}
      {isRunning && (
        <div className={clsx(
          'mx-3 mt-3 rounded-lg p-2 flex items-center gap-2 text-xs',
          sessionType === 'trabajo' ? 'bg-brand-900/50 border border-brand-700 text-brand-300' : 'bg-green-900/50 border border-green-700 text-green-300'
        )}>
          <div className="w-2 h-2 rounded-full bg-current animate-pulse flex-shrink-0" />
          {!collapsed && (
            <span className="font-mono font-semibold">{formatTime()}</span>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {filteredNavItems.map(({ to, icon: Icon, label, cas, badge }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? badge ? 'bg-amber-700/30 text-amber-200 border border-amber-700/40' : 'bg-brand-600 text-white'
                  : badge ? 'text-amber-400/80 hover:text-amber-200 hover:bg-amber-900/20' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              )
            }
          >
            <Icon size={18} className="flex-shrink-0" />
            {!collapsed && (
              <span className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="truncate">{label}</span>
                {cas && (
                  <span className="text-[9px] font-bold px-1 py-0 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30 flex-shrink-0">
                    CAS
                  </span>
                )}
                {badge && (
                  <span className="text-[9px] font-bold px-1 py-0 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">
                    {badge}
                  </span>
                )}
              </span>
            )}
          </NavLink>
        ))}

        {['admin', 'leader'].includes(user?.role) && (
          <>
            <div className={clsx('px-3 pt-4 pb-1', collapsed && 'hidden')}>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Admin
              </span>
            </div>
            {adminItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  )
                }
              >
                <Icon size={18} className="flex-shrink-0" />
                {!collapsed && label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* User area */}
      <div className="px-3 pb-4 border-t border-slate-800 pt-3">
        <div className={clsx('flex items-center gap-3 px-2 py-2 rounded-lg', collapsed && 'justify-center')}>
          <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {user?.full_name?.slice(0, 2).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-100 truncate">{user?.full_name}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
            </div>
          )}
        </div>
        <button
          onClick={handleLogout}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-red-900/20 transition-colors mt-1',
            collapsed && 'justify-center'
          )}
        >
          <LogOut size={16} />
          {!collapsed && 'Cerrar sesión'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-[100dvh] bg-slate-950 overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <aside
        className={clsx(
          'hidden lg:flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-200 flex-shrink-0 relative',
          collapsed ? 'w-16' : 'w-64'
        )}
      >
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-1/2 -translate-y-1/2 translate-x-full w-5 h-10 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-r-md flex items-center justify-center text-slate-400 hover:text-slate-100 transition-colors z-10"
          style={{ left: collapsed ? '3.5rem' : '15rem' }}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-slate-900/95 backdrop-blur-lg border-b border-slate-800 flex items-center justify-between px-4 safe-top">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          aria-label="Abrir menú"
        >
          <Menu size={20} />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-brand-600 rounded-md flex items-center justify-center font-bold text-[10px]">
            SF
          </div>
          <span className="font-bold text-white text-sm">SmartFlow</span>
        </div>

        <div className="flex items-center gap-1">
          {isRunning && (
            <span className={clsx(
              'text-xs font-mono font-semibold px-2 py-0.5 rounded-md border',
              sessionType === 'trabajo' ? 'bg-brand-900/50 border-brand-700 text-brand-300' : 'bg-green-900/50 border-green-700 text-green-300'
            )}>
              {formatTime()}
            </span>
          )}
          <button className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors relative" aria-label="Notificaciones">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-500 rounded-full" />
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Desktop header */}
        <header className="hidden lg:flex items-center gap-4 px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                placeholder="Buscar proyectos, tareas, incidentes..."
                className="input pl-9 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-ghost p-2 relative" aria-label="Notificaciones">
              <Bell size={18} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-brand-500 rounded-full" />
            </button>
          </div>
        </header>

        {/* Page content — top padding for mobile topbar, bottom padding for mobile bottom nav */}
        <main className="flex-1 overflow-auto p-4 lg:p-6 pt-[72px] lg:pt-4 pb-[88px] lg:pb-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* ── Mobile bottom navigation ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 safe-bottom">
        <div className="flex items-center justify-around h-[60px]">
          {/* Inicio móvil */}
          <NavLink
            to="/mobile"
            className={({ isActive }) =>
              clsx('mobile-nav-item', isActive && 'active')
            }
          >
            <Home size={20} />
            <span>Inicio</span>
          </NavLink>

          {/* BP */}
          <NavLink
            to="/bp"
            className={({ isActive }) =>
              clsx('mobile-nav-item', isActive && 'active')
            }
          >
            <TrendingUp size={20} />
            <span>BP</span>
          </NavLink>

          {/* Center: ARIA mic button */}
          <button
            onClick={() => setVoicePanelOpen(true)}
            className="flex flex-col items-center justify-center -mt-5"
            aria-label="Abrir ARIA"
          >
            <div className="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-brand-500 to-purple-600 shadow-lg shadow-brand-600/40 flex items-center justify-center transition-transform active:scale-95">
              <Mic size={22} className="text-white" />
            </div>
            <span className="text-[10px] font-medium text-brand-400 mt-0.5">ARIA</span>
          </button>

          {/* Chat rápido IA */}
          <button
            onClick={() => setQuickChatOpen(true)}
            className={clsx('mobile-nav-item', quickChatOpen && 'active')}
          >
            <MessageSquareMore size={20} />
            <span>Chat IA</span>
          </button>

          {/* Más */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={clsx('mobile-nav-item', drawerOpen && 'text-brand-400')}
          >
            <MoreHorizontal size={20} />
            <span>Más</span>
          </button>
        </div>
      </nav>

      {/* ── Mobile nav drawer (full nav) ── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer from bottom */}
          <div className="relative z-10 bg-slate-900 rounded-t-2xl border-t border-slate-700 max-h-[85vh] flex flex-col animate-slide-up">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-600 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-brand-600 rounded-md flex items-center justify-center font-bold text-xs">SF</div>
                <span className="font-bold text-white">SmartFlow</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search in drawer */}
            <div className="px-4 py-3 border-b border-slate-800">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  placeholder="Buscar..."
                  className="input pl-9 py-2"
                />
              </div>
            </div>

            {/* Nav items */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {filteredNavItems.map(({ to, icon: Icon, label, cas, badge }) => {
                const isActive = location.pathname === to || location.pathname.startsWith(to + '/')
                return (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setDrawerOpen(false)}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors',
                      isActive
                        ? badge ? 'bg-amber-700/30 text-amber-200 border border-amber-700/40' : 'bg-brand-600 text-white'
                        : badge ? 'text-amber-400/80 hover:text-amber-200 hover:bg-amber-900/20' : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800'
                    )}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    <span className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="truncate">{label}</span>
                      {cas && (
                        <span className="text-[9px] font-bold px-1 py-0 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30 flex-shrink-0">CAS</span>
                      )}
                      {badge && (
                        <span className="text-[9px] font-bold px-1 py-0 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">{badge}</span>
                      )}
                    </span>
                  </NavLink>
                )
              })}

              {['admin', 'leader'].includes(user?.role) && (
                <>
                  <div className="px-3 pt-3 pb-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</span>
                  </div>
                  {adminItems.map(({ to, icon: Icon, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => setDrawerOpen(false)}
                      className={({ isActive }) =>
                        clsx(
                          'flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors',
                          isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800'
                        )
                      }
                    >
                      <Icon size={18} className="flex-shrink-0" />
                      {label}
                    </NavLink>
                  ))}
                </>
              )}
            </div>

            {/* User + logout */}
            <div className="px-4 py-4 border-t border-slate-800 safe-bottom">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-full bg-brand-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {user?.full_name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-100 truncate">{user?.full_name}</p>
                  <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
                </div>
              </div>
              <button
                onClick={() => { setDrawerOpen(false); handleLogout() }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-red-400 hover:bg-red-900/20 border border-slate-700 transition-colors"
              >
                <LogOut size={15} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Action Button (Speed Dial) ── */}
      <div className="fixed bottom-24 right-4 lg:bottom-8 lg:right-6 z-40 flex flex-col items-end gap-2">
        {/* Sub-buttons (shown when fabOpen) */}
        {fabOpen && (
          <>
            {/* Quick Voice Note */}
            <button
              onClick={() => { setFabOpen(false); setQuickVoiceOpen(true) }}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-3 py-2 rounded-full shadow-lg transition-all animate-fade-in"
            >
              <Mic size={15} /> Nota de voz
            </button>
            {/* Quick Task */}
            <button
              onClick={() => { setFabOpen(false); setQuickTaskOpen(true) }}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-3 py-2 rounded-full shadow-lg transition-all animate-fade-in"
            >
              <ListTodo size={15} /> Tarea rápida
            </button>
            {/* Quick Novedad */}
            <button
              onClick={() => { setFabOpen(false); setQuickNovedadOpen(true) }}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-full shadow-lg transition-all animate-fade-in"
            >
              <Radio size={15} /> Novedad operativa
            </button>
          </>
        )}
        {/* Main FAB button */}
        <button
          onClick={() => setFabOpen(!fabOpen)}
          className={clsx(
            'w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all active:scale-95',
            fabOpen
              ? 'bg-slate-700 rotate-45'
              : 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/30'
          )}
          aria-label="Acceso rápido"
        >
          <Plus size={22} className="text-white" />
        </button>
      </div>

      {/* Backdrop for FAB */}
      {fabOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setFabOpen(false)} />
      )}

      {/* Quick modals from FAB */}
      {quickTaskOpen && (
        <QuickTaskCreateModal onClose={() => setQuickTaskOpen(false)} />
      )}
      {quickVoiceOpen && (
        <QuickVoiceNoteModal onClose={() => setQuickVoiceOpen(false)} />
      )}
      {quickNovedadOpen && (
        <QuickNovedadModal onClose={() => setQuickNovedadOpen(false)} />
      )}

      {/* ── Voice AI Panel (chat + voz + reuniones) ── */}
      <VoiceAIPanel
        currentUser={user}
        externalOpen={voicePanelOpen}
        onExternalClose={() => setVoicePanelOpen(false)}
      />

      {/* ── Quick Chat IA Panel ── */}
      {quickChatOpen && (
        <QuickChatPanel onClose={() => setQuickChatOpen(false)} />
      )}
    </div>
  )
}
