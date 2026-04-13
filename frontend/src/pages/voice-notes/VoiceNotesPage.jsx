/**
 * VoiceNotesPage — Notas de voz como tareas asignables
 * Líder puede grabar, transcribir y delegar a su equipo.
 * Vista personal: "Mis tareas" | "Delegué"
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Mic, MicOff, Square, Plus, CheckCircle2, Clock, AlertTriangle, User,
  Trash2, Edit3, ChevronDown, ChevronRight, Loader2, Send, X, Filter,
  ClipboardList, UserCheck, Zap, Volume2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { voiceNotesAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import api from '../../services/api'

const PRIORITY_COLOR = { baja: 'text-slate-400', media: 'text-blue-400', alta: 'text-amber-400', urgente: 'text-red-400' }
const PRIORITY_BG   = { baja: 'bg-slate-800', media: 'bg-blue-900/40', alta: 'bg-amber-900/40', urgente: 'bg-red-900/40' }
const STATUS_LABEL  = { pendiente: 'Pendiente', asignada: 'Asignada', completada: 'Completada' }
const STATUS_COLOR  = { pendiente: 'text-slate-400', asignada: 'text-brand-400', completada: 'text-green-400' }

// ─── Recorder Hook ────────────────────────────────────────────────────────────
function useVoiceRecorder(onResult) {
  const [recording, setRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const mr = useRef(null)
  const chunks = useRef([])
  const timer = useRef(null)

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true,
          sampleRate: { ideal: 16000 }, channelCount: { ideal: 1 } }
      })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      chunks.current = []
      mr.current = new MediaRecorder(stream, { mimeType: mimeType || undefined, audioBitsPerSecond: 128000 })
      mr.current.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data) }
      mr.current.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks.current, { type: mimeType || 'audio/webm' })
        onResult(blob)
        setDuration(0)
        clearInterval(timer.current)
      }
      mr.current.start(500)
      setRecording(true)
      timer.current = setInterval(() => setDuration(d => d + 1), 1000)
    } catch {
      toast.error('No se pudo acceder al micrófono')
    }
  }, [onResult])

  const stop = useCallback(() => {
    if (mr.current?.state === 'recording') mr.current.stop()
    setRecording(false)
  }, [])

  useEffect(() => () => { clearInterval(timer.current); if (mr.current?.state === 'recording') mr.current.stop() }, [])

  return { recording, duration, start, stop }
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────
function NoteCard({ note, users, onDone, onDelete, onEdit, onToActivity, isMe }) {
  const [expanded, setExpanded] = useState(false)
  const assignee = users.find(u => u.id === note.assigned_to_id)

  return (
    <div className={`rounded-xl border p-4 mb-3 transition-all ${PRIORITY_BG[note.priority]} border-slate-700/50`}>
      <div className="flex items-start gap-3">
        {/* Priority dot */}
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${note.priority === 'urgente' ? 'bg-red-400' : note.priority === 'alta' ? 'bg-amber-400' : note.priority === 'media' ? 'bg-blue-400' : 'bg-slate-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className={`font-medium text-sm leading-snug ${note.is_done ? 'line-through text-slate-500' : 'text-white'}`}>
              {note.title}
            </h4>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className={`text-xs ${STATUS_COLOR[note.status]}`}>{STATUS_LABEL[note.status]}</span>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
            <span className={PRIORITY_COLOR[note.priority]}>● {note.priority}</span>
            {assignee && (
              <span className="flex items-center gap-1">
                <User size={11} />
                {assignee.full_name?.split(' ')[0] || assignee.email}
              </span>
            )}
            {note.due_date && (
              <span className="flex items-center gap-1">
                <Clock size={11} />
                {new Date(note.due_date).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
              </span>
            )}
            <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-0.5 hover:text-slate-300">
              {expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>} Ver nota
            </button>
          </div>

          {/* Transcript */}
          {expanded && (
            <p className="mt-2 text-xs text-slate-400 bg-slate-900/60 rounded-lg p-2 leading-relaxed">
              {note.transcript}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!note.is_done && (
            <button onClick={() => onDone(note.id)} title="Marcar completada"
              className="p-1.5 rounded-lg text-slate-500 hover:text-green-400 hover:bg-green-900/20 transition-colors">
              <CheckCircle2 size={16}/>
            </button>
          )}
          {isMe && (
            <button onClick={() => onEdit(note)} title="Editar"
              className="p-1.5 rounded-lg text-slate-500 hover:text-brand-400 hover:bg-brand-900/20 transition-colors">
              <Edit3 size={16}/>
            </button>
          )}
          <button onClick={() => onToActivity(note)} title="Crear como actividad"
            className="p-1.5 rounded-lg text-slate-500 hover:text-purple-400 hover:bg-purple-900/20 transition-colors">
            <Zap size={16}/>
          </button>
          <button onClick={() => onDelete(note.id)} title="Eliminar"
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors">
            <Trash2 size={16}/>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── RecordModal ──────────────────────────────────────────────────────────────
function RecordModal({ users, currentUser, onClose, onSaved }) {
  const [step, setStep] = useState('record') // record | edit | save
  const [transcript, setTranscript] = useState('')
  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState(currentUser?.id?.toString() || '')
  const [priority, setPriority] = useState('media')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [transcribing, setTranscribing] = useState(false)

  const handleAudioBlob = useCallback(async (blob) => {
    setTranscribing(true)
    setStep('edit')
    try {
      const formData = new FormData()
      formData.append('file', blob, 'nota.webm')
      formData.append('language', 'es')
      const res = await api.post('/voice/transcribe-quick', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      const text = res.data?.text || ''
      setTranscript(text)
      setTitle(text.split('.')[0]?.substring(0, 80) || 'Nueva nota de voz')
    } catch {
      // Fallback: manual text
      setTranscript('')
      toast('No se pudo transcribir automáticamente. Escribe el texto.')
    } finally {
      setTranscribing(false)
    }
  }, [])

  const { recording, duration, start, stop } = useVoiceRecorder(handleAudioBlob)

  const handleSave = async () => {
    if (!transcript.trim()) { toast.error('La nota no puede estar vacía'); return }
    setSaving(true)
    try {
      await voiceNotesAPI.create({
        transcript: transcript.trim(),
        title: title.trim() || transcript.substring(0, 80),
        assigned_to_id: assignedTo ? parseInt(assignedTo) : null,
        priority,
        due_date: dueDate || null,
      })
      toast.success('Nota guardada')
      onSaved()
      onClose()
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Mic size={18} className="text-brand-400"/>
            {step === 'record' ? 'Grabar nota de voz' : 'Editar y asignar'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>

        <div className="p-4 space-y-4">
          {/* Step 1: Record */}
          {step === 'record' && (
            <div className="text-center py-6">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 transition-all ${recording ? 'bg-red-500/20 ring-4 ring-red-500/40 animate-pulse' : 'bg-brand-600/20'}`}>
                {recording ? <MicOff size={32} className="text-red-400"/> : <Mic size={32} className="text-brand-400"/>}
              </div>
              {recording && <p className="text-2xl font-mono text-white mb-2">{fmt(duration)}</p>}
              <p className="text-sm text-slate-400 mb-4">
                {recording ? 'Grabando... presiona para detener' : 'Presiona para empezar a grabar'}
              </p>
              <button onClick={recording ? stop : start}
                className={`px-8 py-3 rounded-xl font-semibold transition-all ${recording ? 'bg-red-600 hover:bg-red-700 text-white' : 'btn-primary'}`}>
                {recording ? <>
                  <Square size={16} className="inline mr-2"/>Detener y transcribir
                </> : <>
                  <Mic size={16} className="inline mr-2"/>Iniciar grabación
                </>}
              </button>
              <div className="mt-3">
                <button onClick={() => setStep('edit')} className="text-xs text-slate-500 hover:text-slate-300 underline">
                  Escribir nota directamente
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Edit & assign */}
          {step === 'edit' && (
            <>
              {transcribing && (
                <div className="flex items-center gap-2 text-brand-400 text-sm">
                  <Loader2 size={14} className="animate-spin"/> Transcribiendo con OpenAI Whisper...
                </div>
              )}
              <div>
                <label className="label">Título de la tarea</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  className="input" placeholder="Ej: Revisar informe de ventas"/>
              </div>
              <div>
                <label className="label">Nota / Transcripción</label>
                <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
                  className="input min-h-[80px] resize-none" placeholder="Texto de la nota..."/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Asignar a</label>
                  <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="input">
                    <option value="">Sin asignar</option>
                    <option value={currentUser?.id}>Yo mismo</option>
                    {users.filter(u => u.id !== currentUser?.id).map(u => (
                      <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Prioridad</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)} className="input">
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Fecha límite (opcional)</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input"/>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'edit' && (
          <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
            <button onClick={() => setStep('record')} className="btn-secondary px-4 py-2 text-sm">
              <Mic size={14} className="inline mr-1"/> Re-grabar
            </button>
            <button onClick={handleSave} disabled={saving || !transcript.trim()} className="btn-primary px-4 py-2 text-sm">
              {saving ? <Loader2 size={14} className="animate-spin inline mr-1"/> : <Send size={14} className="inline mr-1"/>}
              Guardar tarea
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── EditModal ────────────────────────────────────────────────────────────────
function EditModal({ note, users, onClose, onSaved }) {
  const [title, setTitle] = useState(note.title || '')
  const [assignedTo, setAssignedTo] = useState(note.assigned_to_id?.toString() || '')
  const [priority, setPriority] = useState(note.priority || 'media')
  const [dueDate, setDueDate] = useState(note.due_date ? note.due_date.substring(0,10) : '')
  const [status, setStatus] = useState(note.status || 'pendiente')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await voiceNotesAPI.update(note.id, {
        title, priority, status,
        assigned_to_id: assignedTo ? parseInt(assignedTo) : null,
        due_date: dueDate || null,
      })
      toast.success('Nota actualizada')
      onSaved(); onClose()
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="font-semibold text-white">Editar tarea de voz</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="label">Título</label>
            <input value={title} onChange={e=>setTitle(e.target.value)} className="input"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Asignar a</label>
              <select value={assignedTo} onChange={e=>setAssignedTo(e.target.value)} className="input">
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select value={priority} onChange={e=>setPriority(e.target.value)} className="input">
                {['baja','media','alta','urgente'].map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estado</label>
              <select value={status} onChange={e=>setStatus(e.target.value)} className="input">
                {['pendiente','asignada','completada'].map(s=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fecha límite</label>
              <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className="input"/>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2 text-sm">
            {saving ? <Loader2 size={14} className="animate-spin inline mr-1"/> : null}Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VoiceNotesPage() {
  const { user } = useAuthStore()
  const [notes, setNotes] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('mis')   // mis | delegue | todas
  const [showDone, setShowDone] = useState(false)
  const [filterPriority, setFilterPriority] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editNote, setEditNote] = useState(null)

  const load = useCallback(async () => {
    try {
      const [notesRes, usersRes] = await Promise.all([
        voiceNotesAPI.list({ include_done: showDone }),
        api.get('/users'),
      ])
      setNotes(notesRes.data)
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.items || [])
    } catch { toast.error('Error cargando notas') }
    finally { setLoading(false) }
  }, [showDone])

  useEffect(() => { load() }, [load])

  const handleDone = async (id) => {
    await voiceNotesAPI.done(id)
    toast.success('Marcada como completada')
    load()
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta nota?')) return
    await voiceNotesAPI.delete(id)
    toast.success('Nota eliminada')
    load()
  }

  const handleToActivity = async (note) => {
    try {
      await api.post('/activities', {
        title: note.title || note.transcript.substring(0, 100),
        description: note.transcript,
        frequency: 'unica',
        category: 'gestion',
        priority: note.priority || 'media',
        scope: 'TODOS',
        start_date: new Date().toISOString().split('T')[0],
        assigned_to_id: note.assigned_to_id || null,
        notify_channel: 'sistema',
        notify_before_value: 1,
        notify_before_unit: 'dias',
        escalate_after_hours: 24,
      })
      toast.success('Nota convertida en actividad ✓')
      await voiceNotesAPI.update(note.id, { status: 'completada', is_done: true })
      load()
    } catch (e) {
      toast.error('Error al crear actividad: ' + (e.response?.data?.detail || e.message))
    }
  }

  // Filter logic
  const filtered = notes.filter(n => {
    if (filterPriority && n.priority !== filterPriority) return false
    if (tab === 'mis') return n.assigned_to_id === user?.id || (!n.assigned_to_id && n.user_id === user?.id)
    if (tab === 'delegue') return n.user_id === user?.id && n.assigned_to_id && n.assigned_to_id !== user?.id
    return true
  })

  // KPIs
  const kpis = {
    total: notes.length,
    pendientes: notes.filter(n => n.status === 'pendiente').length,
    asignadas: notes.filter(n => n.status === 'asignada').length,
    urgentes: notes.filter(n => n.priority === 'urgente' && !n.is_done).length,
    completadas: notes.filter(n => n.is_done).length,
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Volume2 size={22} className="text-brand-400"/> Notas de Voz
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">Grabá, transcribí y asigná tareas desde tu voz</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
          <Plus size={16}/> Nueva nota
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total', value: kpis.total, icon: ClipboardList, color: 'text-slate-300' },
          { label: 'Pendientes', value: kpis.pendientes, icon: Clock, color: 'text-blue-400' },
          { label: 'Asignadas', value: kpis.asignadas, icon: UserCheck, color: 'text-brand-400' },
          { label: 'Urgentes', value: kpis.urgentes, icon: Zap, color: 'text-red-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-3 flex items-center gap-3">
            <Icon size={20} className={color}/>
            <div>
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + filters */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
          {[
            { id: 'mis', label: 'Mis tareas', icon: User },
            { id: 'delegue', label: 'Delegué', icon: UserCheck },
            { id: 'todas', label: 'Todas', icon: ClipboardList },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${tab === id ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Icon size={14}/>{label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300">
            <option value="">Prioridad</option>
            {['baja','media','alta','urgente'].map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={() => setShowDone(!showDone)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${showDone ? 'bg-green-900/30 border-green-700 text-green-400' : 'border-slate-700 text-slate-400 hover:text-white'}`}>
            {showDone ? 'Ocultar completadas' : 'Ver completadas'}
          </button>
        </div>
      </div>

      {/* Notes list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-brand-400"/></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Volume2 size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm">No hay notas en esta vista.</p>
          <button onClick={() => setShowModal(true)} className="mt-4 text-brand-400 hover:text-brand-300 text-sm underline">
            Crear primera nota
          </button>
        </div>
      ) : (
        <div>
          {filtered.map(note => (
            <NoteCard key={note.id} note={note} users={users}
              onDone={handleDone} onDelete={handleDelete} onEdit={setEditNote}
              onToActivity={handleToActivity}
              isMe={note.user_id === user?.id}/>
          ))}
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <RecordModal users={users} currentUser={user}
          onClose={() => setShowModal(false)} onSaved={load}/>
      )}
      {editNote && (
        <EditModal note={editNote} users={users}
          onClose={() => setEditNote(null)} onSaved={load}/>
      )}
    </div>
  )
}
