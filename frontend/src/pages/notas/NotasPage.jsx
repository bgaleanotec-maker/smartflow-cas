import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import {
  NotebookPen, Plus, X, Search, Loader2, Check, Pin, Trash2,
  Mic, Eye, Pencil, Bot, Sparkles, FolderOpen, ChevronLeft,
  Network, Link2, ArrowDownToLine, RefreshCw,
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
  graph: (params = {}) => api.get('/notes/graph', { params }),
  resolve: (title) => api.get('/notes/resolve', { params: { title } }),
}

// ─── Wiki-links y #tags en el markdown (estilo Obsidian) ─────────────────────
function preprocessObsidian(md) {
  if (!md) return md
  return md
    .replace(/\[\[([^\[\]|#]+?)(?:\|([^\[\]]*))?\]\]/g, (_, target, alias) =>
      `[${(alias || target).trim()}](#wikilink=${encodeURIComponent(target.trim())})`)
    .replace(/(^|\s)#([\wáéíóúñÁÉÍÓÚÑ][\w\-áéíóúñÁÉÍÓÚÑ]{1,40})/g,
      (_, pre, tag) => `${pre}[#${tag}](#notetag=${encodeURIComponent(tag)})`)
}

// ─── Grafo de conocimiento (fuerzas, estilo Obsidian) ────────────────────────
function computeLayout(nodes, edges, W, H) {
  const pos = new Map()
  const idx = new Map(nodes.map((n, i) => [n.id, i]))
  nodes.forEach((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2
    pos.set(n.id, {
      x: W / 2 + Math.cos(a) * Math.min(W, H) * 0.32 + (Math.random() - 0.5) * 40,
      y: H / 2 + Math.sin(a) * Math.min(W, H) * 0.32 + (Math.random() - 0.5) * 40,
      vx: 0, vy: 0,
    })
  })
  const links = edges.filter(e => idx.has(e.from) && idx.has(e.to))
  for (let iter = 0; iter < 260; iter++) {
    const t = 1 - iter / 260
    // repulsión
    for (const a of nodes) {
      const pa = pos.get(a.id)
      for (const b of nodes) {
        if (a.id === b.id) continue
        const pb = pos.get(b.id)
        let dx = pa.x - pb.x, dy = pa.y - pb.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) d2 = 1
        const f = 2600 / d2
        pa.vx += dx * f * 0.01
        pa.vy += dy * f * 0.01
      }
      // gravedad al centro
      pa.vx += (W / 2 - pa.x) * 0.004
      pa.vy += (H / 2 - pa.y) * 0.004
    }
    // resortes
    for (const e of links) {
      const pa = pos.get(e.from), pb = pos.get(e.to)
      const dx = pb.x - pa.x, dy = pb.y - pa.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (d - 110) * 0.012
      pa.vx += (dx / d) * f; pa.vy += (dy / d) * f
      pb.vx -= (dx / d) * f; pb.vy -= (dy / d) * f
    }
    for (const n of nodes) {
      const p = pos.get(n.id)
      p.x += Math.max(-14, Math.min(14, p.vx)) * t
      p.y += Math.max(-14, Math.min(14, p.vy)) * t
      p.vx *= 0.6; p.vy *= 0.6
      p.x = Math.max(30, Math.min(W - 30, p.x))
      p.y = Math.max(24, Math.min(H - 24, p.y))
    }
  }
  return pos
}

function GraphView({ spaceId, onOpenNote }) {
  const [data, setData] = useState(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const dragRef = useRef(null)
  const W = 1200, H = 800

  const load = useCallback(() => {
    notesAPI.graph(spaceId ? { space_id: spaceId } : {}).then(r => setData(r.data)).catch(() => {})
  }, [spaceId])
  useEffect(() => { load() }, [load])

  const layout = data ? computeLayout(data.nodes, data.edges, W, H) : null
  const degree = {}
  data?.edges.forEach(e => {
    degree[e.from] = (degree[e.from] || 0) + 1
    degree[e.to] = (degree[e.to] || 0) + 1
  })

  const onWheel = (e) => {
    const k = Math.max(0.4, Math.min(3, view.k * (e.deltaY < 0 ? 1.12 : 0.9)))
    setView(v => ({ ...v, k }))
  }
  const onDown = (e) => { dragRef.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y } }
  const onMove = (e) => {
    if (!dragRef.current) return
    setView(v => ({ ...v, x: dragRef.current.ox + (e.clientX - dragRef.current.sx) / v.k, y: dragRef.current.oy + (e.clientY - dragRef.current.sy) / v.k }))
  }
  const onUp = () => { dragRef.current = null }

  if (!data) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-emerald-400" /></div>
  }
  if (data.nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center">
        <div>
          <Network size={40} className="mx-auto text-slate-700 mb-3" />
          <p className="text-slate-500 text-sm">Tu grafo está vacío</p>
          <p className="text-slate-600 text-xs mt-1">Escribe notas con [[enlaces]] y #tags y aparecerán conectadas aquí</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 relative overflow-hidden bg-slate-950 select-none">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 text-[10px] text-slate-500 bg-slate-900/80 rounded-lg px-2.5 py-1.5 border border-slate-800">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-400" /> {data.notes_count} notas</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> {data.tags_count} tags</span>
        <button onClick={load} className="text-slate-400 hover:text-white ml-1" title="Actualizar"><RefreshCw size={11} /></button>
      </div>
      <p className="absolute bottom-2 left-3 z-10 text-[9px] text-slate-600">Rueda = zoom · arrastra = mover · clic en nodo = abrir nota</p>
      <svg
        viewBox={`0 0 ${W} ${H}`} className="w-full h-full cursor-grab active:cursor-grabbing"
        onWheel={onWheel} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
      >
        <g transform={`translate(${W / 2},${H / 2}) scale(${view.k}) translate(${-W / 2 + view.x},${-H / 2 + view.y})`}>
          {data.edges.map((e, i) => {
            const a = layout.get(e.from), b = layout.get(e.to)
            if (!a || !b) return null
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={e.type === 'tag' ? '#14532d' : '#334155'} strokeWidth={0.8} opacity={0.55} />
          })}
          {data.nodes.map(n => {
            const p = layout.get(n.id)
            const r = Math.min(26, 7 + (degree[n.id] || 0) * 2.2)
            const isTag = n.type === 'tag'
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`}
                className={n.note_id ? 'cursor-pointer' : ''}
                onClick={() => n.note_id && onOpenNote(n.note_id)}>
                <circle r={r} fill={isTag ? '#10b981' : '#94a3b8'}
                  stroke={isTag ? '#065f46' : '#475569'} strokeWidth={1.5}
                  opacity={0.92} />
                <text y={r + 13} textAnchor="middle"
                  fill={isTag ? '#6ee7b7' : '#cbd5e1'} fontSize={11.5}
                  style={{ pointerEvents: 'none' }}>
                  {n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
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
function AiPanel({ noteId, spaceId, noteTitle, onClose, onInsert }) {
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
    { label: '🪄 Dar formato .md', q: 'Reescribe el contenido con estructura markdown impecable: títulos ##, listas, checklists - [ ], negritas en lo clave. Conserva TODO el contenido. Devuelve SOLO el markdown, sin comentarios.' },
    { label: '✅ Pendientes', q: 'Extrae todos los pendientes, acuerdos y compromisos como checklist markdown - [ ]' },
    { label: '🔍 Analizar', q: 'Analiza el contenido: temas clave, riesgos y oportunidades' },
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
                ? <>
                    <article className="prose prose-invert prose-xs max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:text-white prose-code:text-amber-300">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </article>
                    {onInsert && !m.content.startsWith('⚠️') && (
                      <div className="flex gap-1.5 mt-1.5 pt-1.5 border-t border-slate-700/50">
                        <button onClick={() => onInsert(m.content, 'append')}
                          className="flex items-center gap-1 text-[10px] text-emerald-300 hover:text-emerald-200">
                          <ArrowDownToLine size={10} /> Insertar en la nota
                        </button>
                        <button onClick={() => onInsert(m.content, 'replace')}
                          className="flex items-center gap-1 text-[10px] text-amber-300/80 hover:text-amber-200 ml-2">
                          <RefreshCw size={10} /> Reemplazar nota
                        </button>
                      </div>
                    )}
                  </>
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
  const [view, setView] = useState('editor')            // editor | graph
  const [linkPickerOpen, setLinkPickerOpen] = useState(false)
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

  const renameSpace = async (s) => {
    const name = window.prompt('Nuevo nombre del espacio (ej: "10 - Legal"):', s.name)
    if (!name?.trim() || name === s.name) return
    await notesAPI.updateSpace(s.id, { name: name.trim() })
    qc.invalidateQueries({ queryKey: ['note-spaces'] })
  }

  // IA → aplicar respuesta directamente a la nota
  const applyAiText = useCallback((text, mode) => {
    setContent(prev => {
      const next = mode === 'replace' ? text : (prev ? prev.replace(/\s*$/, '') + '\n\n' + text : text)
      scheduleSave(title, next)
      return next
    })
    setMode('edit')
    toast.success(mode === 'replace' ? '↺ Nota reemplazada con la versión de la IA' : '⤵ Insertado en la nota')
  }, [scheduleSave, title])

  // Clic en [[wiki-link]] del preview: abrir la nota (o crearla si no existe)
  const openWikiLink = useCallback(async (target) => {
    try {
      const res = await notesAPI.resolve(target)
      setNoteId(res.data.id)
      setMode('preview')
    } catch {
      if (confirm(`La nota "${target}" no existe. ¿Crearla?`)) {
        const res = await notesAPI.create({ title: target, content: '', space_id: spaceId })
        qc.invalidateQueries({ queryKey: ['notes'] })
        setNoteId(res.data.id)
        setMode('edit')
      }
    }
  }, [spaceId, qc])

  const insertWikiLink = (n) => {
    const text = `[[${n.title}]]`
    setContent(prev => {
      const ta = textareaRef.current
      let next
      if (ta && mode === 'edit') {
        const s = ta.selectionStart
        next = prev.slice(0, s) + text + prev.slice(ta.selectionEnd)
        setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + text.length }, 0)
      } else {
        next = (prev || '') + text
      }
      scheduleSave(title, next)
      return next
    })
    setLinkPickerOpen(false)
  }

  const mdComponents = {
    a: ({ href, children }) => {
      if (href?.startsWith('#wikilink=')) {
        const target = decodeURIComponent(href.slice(10))
        return (
          <a onClick={e => { e.preventDefault(); openWikiLink(target) }}
            className="text-cyan-300 underline decoration-dotted cursor-pointer hover:text-cyan-200">
            {children}
          </a>
        )
      }
      if (href?.startsWith('#notetag=')) {
        const tag = decodeURIComponent(href.slice(9))
        return (
          <a onClick={e => { e.preventDefault(); setSearch('#' + tag); setMobilePane('list') }}
            className="text-emerald-300 no-underline cursor-pointer bg-emerald-500/10 px-1 rounded hover:bg-emerald-500/20">
            {children}
          </a>
        )
      }
      return <a href={href} target="_blank" rel="noreferrer">{children}</a>
    },
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
            onClick={() => { setSpaceId(null); setNoteId(null); setView('editor') }}
            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors ${!spaceId && view === 'editor' ? 'bg-amber-600/20 text-amber-200 font-medium' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            🗒️ Todas las notas
          </button>
          <button
            onClick={() => { setView('graph'); setMobilePane('editor') }}
            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex items-center gap-1.5 ${view === 'graph' ? 'bg-emerald-600/20 text-emerald-200 font-medium' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Network size={12} /> Grafo {spaceId ? '(espacio)' : ''}
          </button>
          {spaces.map(s => (
            <div key={s.id} className={`group flex items-center rounded-lg ${spaceId === s.id ? 'bg-amber-600/20' : 'hover:bg-slate-800'}`}>
              <button
                onClick={() => { setSpaceId(s.id); setNoteId(null); setView('editor') }}
                className={`flex-1 text-left px-2.5 py-2 text-xs truncate ${spaceId === s.id ? 'text-amber-200 font-medium' : 'text-slate-400'}`}
                title={s.project_name ? `Vinculado a ${s.project_name}` : s.name}
              >
                {s.emoji} {s.name}
                <span className="text-slate-600 ml-1">{s.notes_count}</span>
              </button>
              <button onClick={() => renameSpace(s)} className="p-1 text-slate-700 hover:text-amber-300 opacity-0 group-hover:opacity-100" title="Renombrar">
                <Pencil size={10} />
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

      {/* ── Panel 3: Editor / Grafo ── */}
      <div className={`flex-1 min-w-0 flex-col ${mobilePane === 'editor' ? 'flex' : 'hidden lg:flex'}`}>
        {view === 'graph' ? (
          <GraphView
            spaceId={spaceId}
            onOpenNote={(id) => { setNoteId(id); setView('editor'); setMode('preview') }}
          />
        ) : !noteId ? (
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

              {/* Insertar [[wiki-link]] */}
              <div className="relative">
                <button onClick={() => setLinkPickerOpen(o => !o)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800 text-cyan-300 hover:bg-slate-700 text-[11px]"
                  title="Insertar enlace a otra nota [[así]]">
                  <Link2 size={11} /> [[·]]
                </button>
                {linkPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setLinkPickerOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 z-50 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                      {notes.filter(n => n.id !== noteId).map(n => (
                        <button key={n.id} onClick={() => insertWikiLink(n)}
                          className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 truncate">
                          🔗 {n.title}
                        </button>
                      ))}
                      {notes.length <= 1 && <p className="text-[10px] text-slate-500 p-3">Crea más notas para enlazarlas</p>}
                    </div>
                  </>
                )}
              </div>

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
                    <ReactMarkdown components={mdComponents}>
                      {preprocessObsidian(content) || '_Nota vacía — cambia a Editar o pulsa Dictar_'}
                    </ReactMarkdown>
                  </article>
                </div>
              )}

              {aiOpen && (
                <AiPanel
                  noteId={noteId}
                  spaceId={spaceId}
                  noteTitle={title}
                  onClose={() => setAiOpen(false)}
                  onInsert={applyAiText}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
