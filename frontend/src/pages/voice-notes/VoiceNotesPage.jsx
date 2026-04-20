/**
 * VoiceNotesPage — Notas de voz con transcripción automática
 * • Transcripción server (OpenAI Whisper / Groq) con fallback a Web Speech API del browser
 * • Asociación a proyecto y tarea
 * • Concepto Inbox para notas sin asignar
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Mic, MicOff, Square, Plus, CheckCircle2, Clock, AlertTriangle, User,
  Trash2, Edit3, ChevronDown, ChevronRight, Loader2, Send, X, Filter,
  ClipboardList, UserCheck, Zap, Volume2, FolderOpen, Link2, Inbox,
  LayoutList, Radio, Star,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { voiceNotesAPI, projectsAPI, tasksAPI, novedadesAPI, adminAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import api from '../../services/api'

const PRIORITY_COLOR = { baja: 'text-slate-400', media: 'text-blue-400', alta: 'text-amber-400', urgente: 'text-red-400' }
const PRIORITY_BG   = { baja: 'bg-slate-800', media: 'bg-blue-900/30', alta: 'bg-amber-900/30', urgente: 'bg-red-900/30' }
const STATUS_LABEL  = { pendiente: 'Pendiente', asignada: 'Asignada', completada: 'Completada' }
const STATUS_COLOR  = { pendiente: 'text-slate-400', asignada: 'text-indigo-400', completada: 'text-green-400' }

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

// ─── Web Speech API dictation (fallback sin API keys) ─────────────────────────
function useSpeechDictation(onResult) {
  const [listening, setListening] = useState(false)
  const srRef = useRef(null)

  const start = useCallback((currentText) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { toast.error('Tu navegador no soporta dictado'); return }
    const sr = new SR()
    sr.lang = 'es-CO'
    sr.continuous = true
    sr.interimResults = false
    sr.onresult = (e) => {
      const text = Array.from(e.results).map(r => r[0].transcript).join(' ')
      onResult((currentText ? currentText + ' ' : '') + text)
    }
    sr.onerror = () => { setListening(false); toast.error('Error en dictado') }
    sr.onend = () => setListening(false)
    sr.start()
    srRef.current = sr
    setListening(true)
  }, [onResult])

  const stop = useCallback(() => {
    srRef.current?.stop()
    setListening(false)
  }, [])

  return { listening, start, stop }
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────
function NoteCard({ note, users, projects, tasks, onDone, onDelete, onEdit, onToTask, isMe }) {
  const [expanded, setExpanded] = useState(false)
  const assignee  = users.find(u => u.id === note.assigned_to_id)
  const project   = projects.find(p => p.id === note.project_id)
  const task      = tasks.find(t => t.id === note.task_id)
  const isInbox   = !note.project_id && !note.task_id

  return (
    <div className={`rounded-xl border p-4 mb-3 transition-all ${PRIORITY_BG[note.priority]} border-slate-700/50`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
          note.priority === 'urgente' ? 'bg-red-400' :
          note.priority === 'alta'    ? 'bg-amber-400' :
          note.priority === 'media'   ? 'bg-blue-400' : 'bg-slate-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className={`font-medium text-sm leading-snug ${note.is_done ? 'line-through text-slate-500' : 'text-white'}`}>
              {note.title}
            </h4>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isInbox && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 flex items-center gap-1">
                  <Inbox size={9}/> Inbox
                </span>
              )}
              <span className={`text-xs ${STATUS_COLOR[note.status]}`}>{STATUS_LABEL[note.status]}</span>
            </div>
          </div>

          {/* Badges proyecto/tarea */}
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {project && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-300">
                <FolderOpen size={9}/> {project.name}
              </span>
            )}
            {task && (
              <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-900/50 text-violet-300">
                <Link2 size={9}/> {task.task_number} · {task.title?.substring(0, 30)}
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-400">
            <span className={PRIORITY_COLOR[note.priority]}>● {note.priority}</span>
            {assignee && (
              <span className="flex items-center gap-1">
                <User size={11}/>{assignee.full_name?.split(' ')[0]}
              </span>
            )}
            {note.due_date && (
              <span className="flex items-center gap-1">
                <Clock size={11}/>
                {new Date(note.due_date).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
              </span>
            )}
            <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-0.5 hover:text-slate-300">
              {expanded ? <ChevronDown size={12}/> : <ChevronRight size={12}/>} Ver nota
            </button>
          </div>

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
            <button onClick={() => onEdit(note)} title="Editar nota"
              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-indigo-900/20 transition-colors">
              <Edit3 size={16}/>
            </button>
          )}
          <button onClick={() => onToTask(note)} title="Convertir en tarea de proyecto"
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

// ─── Shared: Project + Task selectors ─────────────────────────────────────────
function ProjectTaskSelectors({ projects, projectTasks, projectId, taskId, onProjectChange, onTaskChange }) {
  return (
    <div className="grid grid-cols-1 gap-3">
      <div>
        <label className="label flex items-center gap-1.5">
          <FolderOpen size={12} className="text-indigo-400"/> Vincular a proyecto (opcional)
        </label>
        <select value={projectId} onChange={e => { onProjectChange(e.target.value); onTaskChange('') }} className="input">
          <option value="">— Sin proyecto (Inbox) —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {projectId && (
        <div>
          <label className="label flex items-center gap-1.5">
            <Link2 size={12} className="text-violet-400"/> Vincular a tarea (opcional)
          </label>
          <select value={taskId} onChange={e => onTaskChange(e.target.value)} className="input">
            <option value="">— Sin tarea específica —</option>
            {projectTasks.map(t => (
              <option key={t.id} value={t.id}>{t.task_number} · {t.title}</option>
            ))}
          </select>
          {projectTasks.length === 0 && (
            <p className="text-xs text-slate-500 mt-1">No hay tareas en este proyecto</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── RecordModal ──────────────────────────────────────────────────────────────
function RecordModal({ users, projects, currentUser, onClose, onSaved }) {
  const [step, setStep]             = useState('record')
  const [transcript, setTranscript] = useState('')
  const [title, setTitle]           = useState('')
  const [assignedTo, setAssignedTo] = useState(currentUser?.id?.toString() || '')
  const [priority, setPriority]     = useState('media')
  const [dueDate, setDueDate]       = useState('')
  const [projectId, setProjectId]   = useState('')
  const [taskId, setTaskId]         = useState('')
  const [projectTasks, setProjectTasks] = useState([])
  const [saving, setSaving]         = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeSource, setTranscribeSource] = useState(null) // 'server' | 'browser' | 'manual'
  // Novedad operativa link
  const [asNovedad, setAsNovedad]       = useState(false)
  const [novImpactType, setNovImpactType] = useState('OTRO')
  const [novStars, setNovStars]         = useState(3)
  const [novBusinessId, setNovBusinessId] = useState('')
  const [novHasEco, setNovHasEco]       = useState(false)
  const [novEcoAmount, setNovEcoAmount] = useState('')
  const [businesses, setBusinesses]     = useState([])

  useEffect(() => {
    adminAPI.businesses().then(r => {
      setBusinesses(Array.isArray(r.data) ? r.data : r.data?.items || [])
    }).catch(() => {})
  }, [])

  // Load tasks when project changes
  useEffect(() => {
    if (!projectId) { setProjectTasks([]); setTaskId(''); return }
    tasksAPI.list({ project_id: projectId, limit: 200 })
      .then(r => setProjectTasks(r.data?.items || r.data || []))
      .catch(() => setProjectTasks([]))
  }, [projectId])

  // Web Speech API fallback
  const handleSpeechResult = useCallback((text) => {
    setTranscript(text)
    if (!title) setTitle(text.split('.')[0]?.substring(0, 80) || 'Nueva nota')
    setTranscribeSource('browser')
  }, [title])
  const { listening, start: startDictation, stop: stopDictation } = useSpeechDictation(handleSpeechResult)

  // Server transcription
  const handleAudioBlob = useCallback(async (blob) => {
    setTranscribing(true)
    setStep('edit')
    try {
      const formData = new FormData()
      formData.append('file', blob, 'nota.webm')
      formData.append('language', 'es')
      const res = await api.post('/voice/transcribe-quick', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000,
      })
      const text = res.data?.text?.trim() || ''
      if (text) {
        setTranscript(text)
        setTitle(text.split('.')[0]?.substring(0, 80) || 'Nueva nota de voz')
        setTranscribeSource('server')
      } else {
        // Server returned empty — activate browser dictation automatically
        setTranscribeSource('browser_fallback')
        toast('Transcripción automática no disponible. Usa el dictado por voz o escribe el texto.', { icon: '🎙️' })
      }
    } catch {
      setTranscribeSource('browser_fallback')
      toast('No se pudo conectar con el servidor de transcripción. Usa el dictado o escribe.', { icon: '🎙️' })
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
        project_id: projectId ? parseInt(projectId) : null,
        task_id: taskId ? parseInt(taskId) : null,
        priority,
        due_date: dueDate || null,
      })
      // Also create novedad if requested
      if (asNovedad && title.trim()) {
        try {
          await novedadesAPI.create({
            title: title.trim() || transcript.substring(0, 120),
            description: transcript.trim(),
            business_id: novBusinessId ? parseInt(novBusinessId) : null,
            has_economic_impact: novHasEco,
            economic_impact_amount: novHasEco && novEcoAmount ? Number(novEcoAmount) : null,
            impact_type: novImpactType,
            importance_stars: novStars,
          })
          toast.success('Nota y novedad guardadas')
        } catch { toast.success('Nota guardada (novedad falló)') }
      } else {
        toast.success('Nota guardada')
      }
      onSaved(); onClose()
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Mic size={18} className="text-indigo-400"/>
            {step === 'record' ? 'Nueva nota de voz' : 'Editar y vincular'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Step 1: Record */}
          {step === 'record' && (
            <div className="text-center py-4">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 transition-all ${
                recording ? 'bg-red-500/20 ring-4 ring-red-500/40 animate-pulse' : 'bg-indigo-600/20'
              }`}>
                {recording ? <MicOff size={32} className="text-red-400"/> : <Mic size={32} className="text-indigo-400"/>}
              </div>
              {recording && <p className="text-2xl font-mono text-white mb-2">{fmt(duration)}</p>}
              <p className="text-sm text-slate-400 mb-4">
                {recording ? 'Grabando… presiona para detener y transcribir' : 'Presiona para grabar tu nota de voz'}
              </p>
              <button onClick={recording ? stop : start}
                className={`px-8 py-3 rounded-xl font-semibold transition-all ${
                  recording ? 'bg-red-600 hover:bg-red-700 text-white' : 'btn-primary'
                }`}>
                {recording
                  ? <><Square size={16} className="inline mr-2"/>Detener y transcribir</>
                  : <><Mic size={16} className="inline mr-2"/>Iniciar grabación</>}
              </button>
              <div className="mt-4 border-t border-slate-800 pt-4">
                <p className="text-xs text-slate-500 mb-2">¿No quieres grabar?</p>
                <button onClick={() => setStep('edit')} className="text-xs text-indigo-400 hover:text-indigo-300 underline">
                  Escribir nota directamente
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Edit & assign */}
          {step === 'edit' && (
            <>
              {/* Transcription status */}
              {transcribing && (
                <div className="flex items-center gap-2 text-indigo-400 text-sm bg-indigo-900/20 rounded-lg px-3 py-2">
                  <Loader2 size={14} className="animate-spin"/>
                  Transcribiendo con OpenAI Whisper…
                </div>
              )}
              {transcribeSource === 'server' && (
                <div className="flex items-center gap-2 text-green-400 text-xs bg-green-900/20 rounded-lg px-3 py-1.5">
                  ✓ Transcripción automática completada
                </div>
              )}
              {(transcribeSource === 'browser_fallback' || transcribeSource === 'browser') && (
                <div className="flex items-center justify-between gap-2 bg-amber-900/20 border border-amber-800/50 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-amber-400 text-xs">
                    <Radio size={12}/>
                    {transcribeSource === 'browser' ? 'Dictado por voz activo' : 'Transcripción automática no disponible'}
                  </div>
                  <button
                    onClick={() => listening ? stopDictation() : startDictation(transcript)}
                    className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                      listening ? 'bg-red-600 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'
                    }`}
                  >
                    {listening ? <><MicOff size={11}/> Detener</> : <><Mic size={11}/> Dictar</>}
                  </button>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="label">Título de la tarea</label>
                <input value={title} onChange={e => setTitle(e.target.value)}
                  className="input" placeholder="Ej: Revisar informe de ventas"/>
              </div>

              {/* Transcript */}
              <div>
                <label className="label">Nota / Transcripción</label>
                <div className="relative">
                  <textarea value={transcript} onChange={e => setTranscript(e.target.value)}
                    className="input min-h-[80px] resize-none pr-10"
                    placeholder={listening ? 'Dictando… habla ahora' : 'Texto de la nota…'}/>
                  {!transcribing && (
                    <button
                      onClick={() => listening ? stopDictation() : startDictation(transcript)}
                      title={listening ? 'Detener dictado' : 'Dictar con voz'}
                      className={`absolute right-2 top-2 p-1.5 rounded-lg transition-colors ${
                        listening ? 'text-red-400 bg-red-900/30' : 'text-slate-500 hover:text-indigo-400'
                      }`}>
                      {listening ? <MicOff size={14}/> : <Mic size={14}/>}
                    </button>
                  )}
                </div>
                {!transcribing && !transcript && (
                  <p className="text-xs text-slate-500 mt-1">
                    💡 Configura tu API key de OpenAI/Groq en Admin → Integraciones para transcripción automática
                  </p>
                )}
              </div>

              {/* Assign + Priority */}
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

              {/* Date */}
              <div>
                <label className="label">Fecha límite (opcional)</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input"/>
              </div>

              {/* Project + Task */}
              <ProjectTaskSelectors
                projects={projects}
                projectTasks={projectTasks}
                projectId={projectId}
                taskId={taskId}
                onProjectChange={setProjectId}
                onTaskChange={setTaskId}
              />

              {/* ── Registrar también como Novedad Operativa ── */}
              <div className="border border-slate-700 rounded-xl p-3 space-y-2 bg-slate-800/40">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded accent-indigo-500"
                    checked={asNovedad} onChange={e => setAsNovedad(e.target.checked)} />
                  <span className="text-sm text-slate-300 flex items-center gap-1.5">
                    <Radio size={13} className="text-indigo-400" />
                    Registrar también como <strong className="text-indigo-300">Novedad Operativa</strong>
                  </span>
                </label>
                {asNovedad && (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <select value={novBusinessId} onChange={e => setNovBusinessId(e.target.value)} className="input text-xs py-1.5">
                        <option value="">Sin negocio</option>
                        {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <select value={novImpactType} onChange={e => setNovImpactType(e.target.value)} className="input text-xs py-1.5">
                        <option value="OPEX">OPEX</option>
                        <option value="ON">ON</option>
                        <option value="OTRO">Otro</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Importancia:</span>
                      <div className="flex gap-0.5">
                        {[1,2,3,4,5].map(s => (
                          <button key={s} type="button" onClick={() => setNovStars(s)}
                            className="transition-transform hover:scale-110">
                            <Star size={16} className={s <= novStars ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" className="w-3.5 h-3.5 rounded accent-indigo-500"
                        checked={novHasEco} onChange={e => setNovHasEco(e.target.checked)} />
                      <span className="text-xs text-slate-400">Impacto económico</span>
                    </label>
                    {novHasEco && (
                      <input type="number" className="input text-xs py-1.5" placeholder="Monto COP"
                        value={novEcoAmount} onChange={e => setNovEcoAmount(e.target.value)} />
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {step === 'edit' && (
          <div className="flex justify-end gap-2 p-4 border-t border-slate-700 flex-shrink-0">
            <button onClick={() => setStep('record')} className="btn-secondary px-4 py-2 text-sm">
              <Mic size={14} className="inline mr-1"/> Re-grabar
            </button>
            <button onClick={handleSave} disabled={saving || !transcript.trim()} className="btn-primary px-4 py-2 text-sm">
              {saving ? <Loader2 size={14} className="animate-spin inline mr-1"/> : <Send size={14} className="inline mr-1"/>}
              Guardar nota
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── EditModal ────────────────────────────────────────────────────────────────
function EditModal({ note, users, projects, onClose, onSaved }) {
  const [title, setTitle]           = useState(note.title || '')
  const [assignedTo, setAssignedTo] = useState(note.assigned_to_id?.toString() || '')
  const [priority, setPriority]     = useState(note.priority || 'media')
  const [dueDate, setDueDate]       = useState(note.due_date ? note.due_date.substring(0, 10) : '')
  const [status, setStatus]         = useState(note.status || 'pendiente')
  const [projectId, setProjectId]   = useState(note.project_id?.toString() || '')
  const [taskId, setTaskId]         = useState(note.task_id?.toString() || '')
  const [projectTasks, setProjectTasks] = useState([])
  const [saving, setSaving]         = useState(false)

  useEffect(() => {
    if (!projectId) { setProjectTasks([]); return }
    tasksAPI.list({ project_id: projectId, limit: 200 })
      .then(r => setProjectTasks(r.data?.items || r.data || []))
      .catch(() => setProjectTasks([]))
  }, [projectId])

  const handleSave = async () => {
    setSaving(true)
    try {
      await voiceNotesAPI.update(note.id, {
        title, priority, status,
        assigned_to_id: assignedTo ? parseInt(assignedTo) : null,
        project_id: projectId ? parseInt(projectId) : null,
        task_id: taskId ? parseInt(taskId) : null,
        due_date: dueDate || null,
      })
      toast.success('Nota actualizada')
      onSaved(); onClose()
    } catch { toast.error('Error al guardar') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-700 flex-shrink-0">
          <h3 className="font-semibold text-white">Editar nota de voz</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="label">Título</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input"/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Asignar a</label>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="input">
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Prioridad</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="input">
                {['baja','media','alta','urgente'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Estado</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="input">
                {['pendiente','asignada','completada'].map(s =>
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fecha límite</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input"/>
            </div>
          </div>
          <ProjectTaskSelectors
            projects={projects}
            projectTasks={projectTasks}
            projectId={projectId}
            taskId={taskId}
            onProjectChange={(v) => { setProjectId(v); setTaskId('') }}
            onTaskChange={setTaskId}
          />
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-700 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2 text-sm">
            {saving ? <Loader2 size={14} className="animate-spin inline mr-1"/> : null}Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Convert to Task modal ────────────────────────────────────────────────────
function ConvertToTaskModal({ note, projects, users, statuses, onClose, onDone }) {
  const [projectId, setProjectId] = useState(note.project_id?.toString() || '')
  const [projectTasks, setProjectTasks] = useState([])
  const [title, setTitle]         = useState(note.title || note.transcript.substring(0, 80))
  const [assignedTo, setAssignedTo] = useState(note.assigned_to_id?.toString() || '')
  const [priority, setPriority]   = useState(note.priority || 'media')
  const [dueDate, setDueDate]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [taskStatuses, setTaskStatuses] = useState([])

  useEffect(() => {
    api.get('/admin/task-statuses').then(r => setTaskStatuses(r.data?.items || r.data || [])).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!projectId) { toast.error('Selecciona un proyecto'); return }
    setSaving(true)
    try {
      const defaultStatus = taskStatuses.find(s => !s.is_done_state)
      await api.post('/tasks', {
        title,
        description: note.transcript,
        project_id: parseInt(projectId),
        assignee_id: assignedTo ? parseInt(assignedTo) : null,
        priority: priority,
        due_date: dueDate || null,
        status_id: defaultStatus?.id || null,
      })
      // Mark note as done and update project link
      await voiceNotesAPI.update(note.id, {
        project_id: parseInt(projectId),
        status: 'completada',
        is_done: true,
      })
      toast.success('Tarea creada en el proyecto ✓')
      onDone()
      onClose()
    } catch (e) {
      toast.error('Error: ' + (e.response?.data?.detail || e.message))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Zap size={16} className="text-purple-400"/> Convertir en tarea
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18}/></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="label">Título de la tarea</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input"/>
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <FolderOpen size={12} className="text-indigo-400"/> Proyecto <span className="text-red-400">*</span>
            </label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="input">
              <option value="">Selecciona un proyecto</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Asignar a</label>
              <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="input">
                <option value="">Sin asignar</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Fecha límite</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input"/>
            </div>
          </div>
          <div className="bg-slate-800 rounded-lg p-3">
            <p className="text-xs text-slate-400 font-medium mb-1">Descripción (del transcript):</p>
            <p className="text-xs text-slate-500 line-clamp-3">{note.transcript}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !projectId} className="btn-primary px-4 py-2 text-sm">
            {saving ? <Loader2 size={14} className="animate-spin inline mr-1"/> : <Zap size={14} className="inline mr-1"/>}
            Crear tarea
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VoiceNotesPage() {
  const { user } = useAuthStore()
  const [notes, setNotes]           = useState([])
  const [users, setUsers]           = useState([])
  const [projects, setProjects]     = useState([])
  const [tasks, setTasks]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [tab, setTab]               = useState('inbox')  // inbox | mis | delegue | todas
  const [showDone, setShowDone]     = useState(false)
  const [filterPriority, setFilterPriority] = useState('')
  const [showModal, setShowModal]   = useState(false)
  const [editNote, setEditNote]     = useState(null)
  const [convertNote, setConvertNote] = useState(null)

  const load = useCallback(async () => {
    try {
      const [notesRes, usersRes, projectsRes] = await Promise.all([
        voiceNotesAPI.list({ include_done: showDone }),
        api.get('/users'),
        projectsAPI.list({ limit: 100 }),
      ])
      const notesList = notesRes.data || []
      setNotes(notesList)
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.items || [])
      const projList = Array.isArray(projectsRes.data) ? projectsRes.data : projectsRes.data?.items || []
      setProjects(projList)

      // Load tasks for all project IDs referenced by notes
      const projectIds = [...new Set(notesList.filter(n => n.project_id).map(n => n.project_id))]
      if (projectIds.length > 0) {
        const taskResults = await Promise.all(
          projectIds.map(pid => tasksAPI.list({ project_id: pid, limit: 200 }).then(r => r.data?.items || r.data || []))
        )
        setTasks(taskResults.flat())
      }
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

  // Filter logic
  const filtered = notes.filter(n => {
    if (filterPriority && n.priority !== filterPriority) return false
    if (tab === 'inbox')   return !n.project_id && !n.task_id && !n.is_done
    if (tab === 'mis')     return n.assigned_to_id === user?.id || (!n.assigned_to_id && n.user_id === user?.id)
    if (tab === 'delegue') return n.user_id === user?.id && n.assigned_to_id && n.assigned_to_id !== user?.id
    return true
  })

  // KPIs
  const inboxCount = notes.filter(n => !n.project_id && !n.task_id && !n.is_done).length
  const kpis = {
    inbox:      inboxCount,
    pendientes: notes.filter(n => n.status === 'pendiente').length,
    asignadas:  notes.filter(n => n.status === 'asignada').length,
    urgentes:   notes.filter(n => n.priority === 'urgente' && !n.is_done).length,
  }

  const TABS = [
    { id: 'inbox',   label: 'Inbox',      icon: Inbox,       badge: kpis.inbox > 0 ? kpis.inbox : null },
    { id: 'mis',     label: 'Mis tareas', icon: User },
    { id: 'delegue', label: 'Delegué',    icon: UserCheck },
    { id: 'todas',   label: 'Todas',      icon: LayoutList },
  ]

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Volume2 size={22} className="text-indigo-400"/> Notas de Voz
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">Grabá, transcribí y vinculá a proyectos y tareas</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
          <Plus size={16}/> Nueva nota
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Inbox',      value: kpis.inbox,      icon: Inbox,         color: inboxCount > 0 ? 'text-amber-400' : 'text-slate-400' },
          { label: 'Pendientes', value: kpis.pendientes,  icon: Clock,         color: 'text-blue-400' },
          { label: 'Asignadas',  value: kpis.asignadas,   icon: UserCheck,     color: 'text-indigo-400' },
          { label: 'Urgentes',   value: kpis.urgentes,    icon: AlertTriangle, color: 'text-red-400' },
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

      {/* Inbox callout */}
      {inboxCount > 0 && tab !== 'inbox' && (
        <div
          className="mb-4 flex items-center gap-3 bg-amber-900/20 border border-amber-800/50 rounded-xl px-4 py-2.5 cursor-pointer hover:bg-amber-900/30 transition-colors"
          onClick={() => setTab('inbox')}
        >
          <Inbox size={16} className="text-amber-400 flex-shrink-0"/>
          <p className="text-sm text-amber-300">
            Tienes <strong>{inboxCount}</strong> nota{inboxCount !== 1 ? 's' : ''} en el inbox sin vincular a un proyecto
          </p>
          <span className="ml-auto text-xs text-amber-500">Ver →</span>
        </div>
      )}

      {/* Tabs + filters */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex bg-slate-800 rounded-lg p-1 gap-1 flex-wrap">
          {TABS.map(({ id, label, icon: Icon, badge }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${
                tab === id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}>
              <Icon size={13}/>{label}
              {badge != null && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-300">
            <option value="">Prioridad</option>
            {['baja','media','alta','urgente'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <button onClick={() => setShowDone(!showDone)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              showDone ? 'bg-green-900/30 border-green-700 text-green-400' : 'border-slate-700 text-slate-400 hover:text-white'
            }`}>
            {showDone ? 'Ocultar completadas' : 'Ver completadas'}
          </button>
        </div>
      </div>

      {/* Tab description */}
      {tab === 'inbox' && (
        <p className="text-xs text-slate-500 mb-3 flex items-center gap-1.5">
          <Inbox size={11}/> Notas sin vincular a proyecto o tarea — procésalas asignándolas o convirtiéndolas en tareas
        </p>
      )}

      {/* Notes list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-indigo-400"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Volume2 size={40} className="mx-auto mb-3 opacity-30"/>
          <p className="text-sm">
            {tab === 'inbox' ? '¡Inbox vacío! Todas las notas están vinculadas.' : 'No hay notas en esta vista.'}
          </p>
          <button onClick={() => setShowModal(true)} className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm underline">
            Crear nueva nota
          </button>
        </div>
      ) : (
        <div>
          {filtered.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              users={users}
              projects={projects}
              tasks={tasks}
              onDone={handleDone}
              onDelete={handleDelete}
              onEdit={setEditNote}
              onToTask={setConvertNote}
              isMe={note.user_id === user?.id}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <RecordModal
          users={users}
          projects={projects}
          currentUser={user}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
      {editNote && (
        <EditModal
          note={editNote}
          users={users}
          projects={projects}
          onClose={() => setEditNote(null)}
          onSaved={load}
        />
      )}
      {convertNote && (
        <ConvertToTaskModal
          note={convertNote}
          projects={projects}
          users={users}
          onClose={() => setConvertNote(null)}
          onDone={load}
        />
      )}
    </div>
  )
}
