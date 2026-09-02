import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import {
  NotebookPen, Plus, X, Search, Loader2, Check, Pin, Trash2,
  Mic, Eye, Pencil, Bot, Sparkles, FolderOpen, ChevronLeft,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api, { projectsAPI } from '../../services/api'

const notesAPI = {
  spaces: () => api.get('/notes/spaces'),
  createSpace: (d) => api.post('/notes/spaces', d),
  updateSpace: (id, d) => api.patch(`/notes/spaces/${id}`, d),
  deleteSpace: (id) => api.delete(`/notes/spaces/${id}`),
  list: (params = {}) => api.get('/notes', { params }),
  create: (d) => api.post('/notes', d),
  get: (id) => api.get(`/notes/${id}`),
  update: (id, d) => api.patch(`/notes/${id}`, d),
  delete: (id) => api.delete(`/notes/${id}`),
  transcribe: (formData) => api.post('/notes/transcribe', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000,
  }),
  ask: (d) => api.post('/notes/ask', d, { timeout: 90000 }),
}

const SPACE_EMOJIS = ['📓', '📁', '🚀', '💡', '🏦', '📊', '🧠', '🎯', '🔧', '📌', '⭐', '🗂️']

function timeAgo(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `hace ${Math.round(diff / 60)}m`
  if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

// ─── Dictado: Web Speech API (gratis) con respaldo Gemini ────────────────────
function useDictation(onText) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recRef = useRef(null)
  const mrRef = useRef(null)
  const chunksRef = useRef([])

  const stop = useCallback(() => {
    recRef.current?.stop?.()
    if (mrRef.current?.state === 'recording') mrRef.current.stop()
    setRecording(false)
  }, [])

  const start = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      // Dictado en vivo del navegador (Chrome/Edge) — gratis e instantáneo
      const rec = new SR()
      recRef.current = rec
      rec.lang = 'es-CO'
      rec.continuous = true
      rec.interimResults = false
      rec.onresult = (e) => {
        const text = Array.from(e.results).slice(e.resultIndex).map(r => r[0].transcript).join(' ')
        if (text.trim()) onText(text.trim() + ' ')
      }
      rec.onerror = (e) => {
        if (e.error === 'not-allowed') toast.error('Permite el micrófono en el navegador')
        setRecording(false)
      }
      rec.onend = () => setRecording(false)
      rec.start()
      setRecording(true)
      toast('🎙️ Dictando… habla y el texto aparece en la nota', { icon: '🎙️' })
      return
    }
    // Respaldo: grabar y transcribir con Gemini
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const mr = new MediaRecorder(stream)
      mrRef.current = mr
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        setTranscribing(true)
        try {
          const fd = new FormData()
          fd.append('file', blob, 'nota.webm')
          const res = await notesAPI.transcribe(fd)
          onText(res.data.text + ' ')
          toast.success('🎙️ Transcrito con Gemini')
        } catch (err) {
          toast.error(err.response?.data?.detail || 'No se pudo transcribir')
        } finally {
          setTranscribing(false)
        }
      }
      mr.start()
      setRecording(true)
      toast('🎙️ Grabando… detén para transcribir', { icon: '🎙️' })
    } catch {
      toast.error('No se pudo acceder al micrófono')
    }
  }, [onText])

  return { recording, transcribing, start, stop }
}

// ─── Panel IA ────────────────────────────────────────────────────────────────
function AiPanel({ noteId, spaceId, noteTitle, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [scope, setScope] = useState(noteId ? 'nota' : 'espacio')
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, thinking])

  const send = async (question) => {
    const q = (question || input).trim()
    if (!q || thinking) return
    setInput('')
    const history = messages.map(m => ({ role: m.role, content: m.content }))
    setMessages(m => [...m, { role: 'user', content: q }])
    setThinking(true)
    try {
      const res = await notesAPI.ask({
        question: q,
        note_id: scope === 'nota' ? noteId : null,
        space_id: scope !== 'nota' ? spaceId : null,
        history,
      })
      setMessages(m => [...m, { role: 'model', content: res.data.answer }])
    } catch (err) {
      setMessages(m => [...m, { role: 'model', content: `⚠️ ${err.response?.data?.detail || 'Error consultando la IA'}` }])
    } finally {
      setThinking(false)
    }
  }

  const QUICK = [
    { label: '📝 Resumir', q: 'Haz un resumen claro y corto' },
    { label: '🔍 Analizar', q: 'Analiza el contenido: temas clave, riesgos y oportunidades' },
    { label: '✅ Pendientes', q: 'Extrae todos los pendientes, acuerdos y compromisos como checklist' },
    { label: '🧠 Recordar', q: '¿Qué datos importantes debo recordar de aquí?' },
  ]

  return (
    <div className="w-80 flex-shrink-0 border-l border-slate-800 bg-slate-900/70 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800">
        <span className="text-xs font-semibold text-violet-300 flex items-center gap-1.5">
          <Bot size={13} /> IA de notas
        </span>
        <div className="flex items-center gap-1">
          {noteId && (
            <select value={scope} onChange={e => setScope(e.target.value)}
              className="bg-slate-800 text-[10px] text-slate-300 rounded-lg px-1.5 py-1 border border-slate-700">
              <option value="nota">Esta nota</option>
              <option value="espacio">Todo el espacio</option>
            </select>
          )}
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X size={13} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {messages.length === 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-slate-500 px-1">
              Sobre {scope === 'nota' ? <b className="text-slate-300">{noteTitle}</b> : 'todas las notas del espacio'}:
            </p>
            {QUICK.map(s => (
              <button key={s.label} onClick={() => send(s.q)}
                className="w-full text-left text-[11px] px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:border-violet-600/50 transition-colors">
                {s.label}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <div className={`max-w-[94%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
              m.role === 'user' ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-slate-800 text-slate-200 rounded-bl-sm border border-slate-700/60'
            }`}>
              {m.role === 'model'
                ? <article className="prose prose-invert prose-xs max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:text-white prose-code:text-amber-300">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </article>
                : m.content}
            </div>
          </div>
        ))}
        {thinking && <p className="text-violet-400 text-xs flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Leyendo tus notas…</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={e => { e.preventDefault(); send() }} className="p-2.5 border-t border-slate-800 flex gap-1.5">
        <input value={input} onChange={e => setInput(e.target.value)}
          className="input py-1.5 text-xs flex-1" placeholder="Pregunta a tus notas…" />
        <button type="submit" disabled={thinking || !input.trim()}
          className="px-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white">
          <Sparkles size={13} />
        </button>
      </form>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function NotasPage() {
  const qc = useQueryClient()
  const [spaceId, setSpaceId] = useState(null)       // null = todas
  const [noteId, setNoteId] = useState(null)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('edit')
  const [aiOpen, setAiOpen] = useState(false)
  const [newSpaceOpen, setNewSpaceOpen] = useState(false)
  const [spaceForm, setSpaceForm] = useState({ name: '', emoji: '📓', project_id: '' })
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saveState, setSaveState] = useState('saved')
  const [mobilePane, setMobilePane] = useState('list')  // list | editor (móvil)
  const saveTimer = useRef(null)
  const textareaRef = useRef(null)

  const { data: spaces = [] } = useQuery({
    queryKey: ['note-spaces'],
    queryFn: () => notesAPI.spaces().then(r => r.data),
  })
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes', spaceId, search],
    queryFn: () => notesAPI.list({ space_id: spaceId || undefined, search: search || undefined }).then(r => r.data),
  })
  const { data: projects = [] } = useQuery({
    queryKey: ['projects-mini'],
    queryFn: () => projectsAPI.list().then(r => Array.isArray(r.data) ? r.data : r.data?.items || []),
  })

  // Cargar nota seleccionada
  useEffect(() => {
    if (!noteId) return
    notesAPI.get(noteId).then(r => {
      setTitle(r.data.title || '')
      setContent(r.data.content || '')
      setSaveState('saved')
    }).catch(() => setNoteId(null))
  }, [noteId])

  const scheduleSave = useCallback((newTitle, newContent) => {
    if (!noteId) return
    setSaveState('dirty')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveState('saving')
      try {
        await notesAPI.update(noteId, { title: newTitle, content: newContent })
        setSaveState('saved')
        qc.invalidateQueries({ queryKey: ['notes'] })
      } catch { setSaveState('dirty'); toast.error('Error al guardar') }
    }, 1200)
  }, [noteId, qc])

  const onTitle = (v) => { setTitle(v); scheduleSave(v, content) }
  const onContent = (v) => { setContent(v); scheduleSave(title, v) }

  // Dictado: inserta texto al final del contenido
  const { recording, transcribing, start, stop } = useDictation(useCallback((text) => {
    setContent(prev => {
      const next = (prev ? prev.replace(/\s*$/, '') + '\n' : '') + text
      scheduleSave(title, next)
      return next
    })
  }, [scheduleSave, title]))

  const createNote = async (fromVoice = false) => {
    const res = await notesAPI.create({
      title: fromVoice ? `🎙️ Nota de voz ${new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}` : 'Nota sin título',
      content: '',
      space_id: spaceId,
      from_voice: fromVoice,
    })
    qc.invalidateQueries({ queryKey: ['notes'] })
    setNoteId(res.data.id)
    setMode('edit')
    setMobilePane('editor')
    if (fromVoice) setTimeout(start, 400)
  }

  const deleteNote = async () => {
    if (!confirm('¿Eliminar esta nota?')) return
    await notesAPI.delete(noteId)
    qc.invalidateQueries({ queryKey: ['notes'] })
    setNoteId(null)
    setMobilePane('list')
    toast.success('Nota eliminada')
  }

  const togglePin = async (n) => {
    await notesAPI.update(n.id, { is_pinned: !n.is_pinned })
    qc.invalidateQueries({ queryKey: ['notes'] })
  }

  const createSpace = async (e) => {
    e.preventDefault()
    if (!spaceForm.name.trim()) return
    await notesAPI.createSpace({
      name: spaceForm.name.trim(),
      emoji: spaceForm.emoji,
      project_id: spaceForm.project_id ? parseInt(spaceForm.project_id) : null,
    })
    qc.invalidateQueries({ queryKey: ['note-spaces'] })
    setNewSpaceOpen(false)
    setSpaceForm({ name: '', emoji: '📓', project_id: '' })
    toast.success('📓 Espacio creado')
  }

  const deleteSpace = async (s) => {
    if (!confirm(`¿Eliminar el espacio "${s.name}"? Las notas pasan a "Todas".`)) return
    await notesAPI.deleteSpace(s.id)
    qc.invalidateQueries({ queryKey: ['note-spaces'] })
    qc.invalidateQueries({ queryKey: ['notes'] })
    if (spaceId === s.id) setSpaceId(null)
  }

  const currentNote = notes.find(n => n.id === noteId)

  return (
    <div className="fixed inset-0 lg:relative lg:inset-auto flex h-full lg:h-[calc(100dvh-6rem)] bg-slate-950 z-40 lg:z-0 rounded-none lg:rounded-2xl overflow-hidden border border-slate-800">

      {/* ── Panel 1: Espacios ── */}
      <div className={`w-48 flex-shrink-0 bg-slate-900/70 border-r border-slate-800 flex-col ${mobilePane === 'list' ? 'hidden sm:flex' : 'hidden lg:flex'}`}>
        <div className="p-3 border-b border-slate-800">
          <h1 className="font-bold text-white text-sm flex items-center gap-1.5">
            <NotebookPen size={15} className="text-amber-400" /> Notas
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          <button
            onClick={() => { setSpaceId(null); setNoteId(null) }}
            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${!spaceId ? 'bg-amber-600/20 text-amber-200 font-medium' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            🗒️ Todas las notas
          </button>
          {spaces.map(s => (
            <div key={s.id} className={`group flex items-center rounded-lg ${spaceId === s.id ? 'bg-amber-600/20' : 'hover:bg-slate-800'}`}>
              <button
                onClick={() => { setSpaceId(s.id); setNoteId(null) }}
                className={`flex-1 text-left px-2.5 py-2 text-xs truncate ${spaceId === s.id ? 'text-amber-200 font-medium' : 'text-slate-400'}`}
                title={s.project_name ? `Vinculado a ${s.project_name}` : s.name}
              >
                {s.emoji} {s.name}
                <span className="text-slate-600 ml-1">{s.notes_count}</span>
              </button>
              <button onClick={() => deleteSpace(s)} className="p-1 text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100">
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
        <div className="p-2 border-t border-slate-800">
          {newSpaceOpen ? (
            <form onSubmit={createSpace} className="space-y-1.5">
              <div className="flex gap-1 flex-wrap">
                {SPACE_EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => setSpaceForm(f => ({ ...f, emoji: e }))}
                    className={`text-sm p-0.5 rounded ${spaceForm.emoji === e ? 'bg-amber-500/30 ring-1 ring-amber-500' : ''}`}>{e}</button>
                ))}
              </div>
              <input value={spaceForm.name} onChange={e => setSpaceForm(f => ({ ...f, name: e.target.value }))}
                className="input py-1 text-xs" placeholder="Nombre del espacio" autoFocus />
              <select value={spaceForm.project_id} onChange={e => setSpaceForm(f => ({ ...f, project_id: e.target.value }))}
                className="input py-1 text-[10px]">
                <option value="">Sin proyecto</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="flex gap-1">
                <button type="button" onClick={() => setNewSpaceOpen(false)} className="btn-secondary flex-1 py-1 text-[10px]">✕</button>
                <button type="submit" className="btn-primary flex-1 py-1 text-[10px]">Crear</button>
              </div>
            </form>
          ) : (
            <button onClick={() => setNewSpaceOpen(true)}
              className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-slate-700 text-slate-500 text-[11px] hover:border-amber-600 hover:text-amber-300 transition-colors">
              <FolderOpen size={11} /> Nuevo espacio
            </button>
          )}
        </div>
      </div>

      {/* ── Panel 2: Lista de notas ── */}
      <div className={`w-full sm:w-64 flex-shrink-0 bg-slate-900/40 border-r border-slate-800 flex-col ${mobilePane === 'list' ? 'flex' : 'hidden lg:flex'}`}>
        <div className="p-2.5 space-y-2 border-b border-slate-800">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="input pl-7 py-1.5 text-xs" placeholder="Buscar en mis notas…" />
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => createNote(false)} className="btn-primary flex-1 py-1.5 text-xs flex items-center justify-center gap-1">
              <Plus size={13} /> Nota
            </button>
            <button onClick={() => createNote(true)}
              className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-xl bg-red-600/80 hover:bg-red-600 text-white text-xs font-medium transition-colors"
              title="Nueva nota dictada por voz">
              <Mic size={13} /> Voz
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoading ? (
            <p className="text-xs text-slate-600 text-center py-6">Cargando…</p>
          ) : notes.length === 0 ? (
            <p className="text-[11px] text-slate-600 text-center py-8 px-3">
              {search ? 'Sin resultados' : 'Crea tu primera nota — texto o voz 🎙️'}
            </p>
          ) : notes.map(n => (
            <button
              key={n.id}
              onClick={() => { setNoteId(n.id); setMobilePane('editor') }}
              className={`w-full text-left p-2.5 rounded-xl border transition-colors ${
                noteId === n.id ? 'bg-amber-600/15 border-amber-700/50' : 'bg-slate-900/60 border-slate-800/60 hover:border-slate-700'
              }`}
            >
              <p className="text-xs font-medium text-slate-200 truncate flex items-center gap-1">
                {n.is_pinned && <Pin size={9} className="text-amber-400 flex-shrink-0" />}
                {n.from_voice && '🎙️ '}
                {n.title}
              </p>
              <p className="text-[10px] text-slate-500 truncate mt-0.5">{n.snippet || 'Sin contenido'}</p>
              <p className="text-[9px] text-slate-600 mt-1">{timeAgo(n.updated_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Panel 3: Editor ── */}
      <div className={`flex-1 min-w-0 flex-col ${mobilePane === 'editor' ? 'flex' : 'hidden lg:flex'}`}>
        {!noteId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <NotebookPen size={40} className="mx-auto text-slate-700 mb-3" />
              <p className="text-slate-500 text-sm">Selecciona o crea una nota</p>
              <p className="text-slate-600 text-xs mt-1">🎙️ El botón Voz dicta directo a texto</p>
            </div>
          </div>
        ) : (
          <>
            {/* Toolbar del editor */}
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800 flex-wrap">
              <button onClick={() => setMobilePane('list')} className="lg:hidden p-1.5 text-slate-400"><ChevronLeft size={16} /></button>
              <input
                value={title} onChange={e => onTitle(e.target.value)}
                className="bg-transparent text-white font-semibold text-sm focus:outline-none focus:bg-slate-800 rounded-lg px-2 py-1 flex-1 min-w-[120px]"
                placeholder="Título de la nota"
              />
              <span className="text-xs px-1">
                {saveState === 'saving' && <Loader2 size={12} className="animate-spin text-amber-400" />}
                {saveState === 'saved' && <Check size={12} className="text-emerald-400" />}
              </span>

              {/* Dictado */}
              <button
                onClick={recording ? stop : start}
                disabled={transcribing}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  recording ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Dictar por voz (se convierte en texto editable)"
              >
                {transcribing ? <Loader2 size={12} className="animate-spin" /> : <Mic size={12} />}
                {recording ? 'Detener' : transcribing ? 'Transcribiendo…' : 'Dictar'}
              </button>

              <div className="flex items-center rounded-lg bg-slate-800/70 p-0.5">
                <button onClick={() => setMode('edit')}
                  className={`px-2 py-1 rounded-md text-[11px] flex items-center gap-1 ${mode === 'edit' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>
                  <Pencil size={10} /> Editar
                </button>
                <button onClick={() => setMode('preview')}
                  className={`px-2 py-1 rounded-md text-[11px] flex items-center gap-1 ${mode === 'preview' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>
                  <Eye size={10} /> Vista
                </button>
              </div>

              <button onClick={() => setAiOpen(o => !o)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ${aiOpen ? 'bg-violet-600 text-white' : 'bg-violet-600/70 hover:bg-violet-600 text-white'}`}>
                <Bot size={12} /> IA
              </button>

              {currentNote && (
                <button onClick={() => togglePin(currentNote)} className={`p-1.5 rounded-lg ${currentNote.is_pinned ? 'text-amber-400' : 'text-slate-500 hover:text-amber-300'}`} title="Fijar arriba">
                  <Pin size={13} />
                </button>
              )}
              <button onClick={deleteNote} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400" title="Eliminar nota">
                <Trash2 size={13} />
              </button>
            </div>

            {/* Cuerpo */}
            <div className="flex-1 flex min-h-0">
              {mode === 'edit' ? (
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={e => onContent(e.target.value)}
                  className="flex-1 bg-slate-950 text-slate-200 text-[13px] leading-relaxed p-4 focus:outline-none resize-none font-mono"
                  placeholder={'Escribe en Markdown…\n\n## Título\n- lista\n- [ ] checklist\n**negrita** `código`\n\nO pulsa 🎙️ Dictar y habla.'}
                  spellCheck={false}
                />
              ) : (
                <div className="flex-1 overflow-y-auto p-5">
                  <article className="prose prose-invert prose-sm max-w-2xl
                    prose-headings:text-white prose-a:text-amber-400 prose-code:text-amber-300
                    prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800
                    prose-blockquote:border-amber-600 prose-li:my-0.5">
                    <ReactMarkdown>{content || '_Nota vacía — cambia a Editar o pulsa Dictar_'}</ReactMarkdown>
                  </article>
                </div>
              )}

              {aiOpen && (
                <AiPanel
                  noteId={noteId}
                  spaceId={spaceId}
                  noteTitle={title}
                  onClose={() => setAiOpen(false)}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
