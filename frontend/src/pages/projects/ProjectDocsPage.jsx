import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import {
  ArrowLeft, BookOpen, Plus, Trash2, Eye, Pencil, Check, Loader2,
  Workflow, Code2, Table2, ListChecks, Bot, Copy, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api, { projectsAPI, flowsAPI } from '../../services/api'

// ─── API local ───────────────────────────────────────────────────────────────
const docsAPI = {
  list: (projectId) => api.get(`/project-docs/project/${projectId}`),
  create: (data) => api.post('/project-docs', data),
  get: (id) => api.get(`/project-docs/${id}`),
  update: (id, data) => api.patch(`/project-docs/${id}`, data),
  delete: (id) => api.delete(`/project-docs/${id}`),
}

// Plantillas de inserción rápida (asistente de escritura)
const SNIPPETS = [
  {
    icon: Code2, label: 'Código',
    text: '\n```python\n# Tu código aquí\ndef proceso():\n    pass\n```\n',
  },
  {
    icon: Table2, label: 'Tabla',
    text: '\n| Campo | Tipo | Descripción |\n|---|---|---|\n| id | int | Identificador |\n',
  },
  {
    icon: ListChecks, label: 'Checklist',
    text: '\n- [ ] Paso 1\n- [ ] Paso 2\n- [ ] Paso 3\n',
  },
]

const STARTER = `## Objetivo

Describe aquí el objetivo de esta sección.

## Detalle

- Punto clave 1
- Punto clave 2

\`\`\`sql
-- Ejemplo de código
SELECT * FROM tabla;
\`\`\`
`

export default function ProjectDocsPage() {
  const { id: projectId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeId, setActiveId] = useState(null)
  const [mode, setMode] = useState('edit')          // edit | preview
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [saveState, setSaveState] = useState('saved')
  const [flowPickerOpen, setFlowPickerOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const saveTimer = useRef(null)
  const textareaRef = useRef(null)

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsAPI.get(projectId).then(r => r.data),
  })

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['project-docs', projectId],
    queryFn: () => docsAPI.list(projectId).then(r => r.data),
  })

  const { data: flows = [] } = useQuery({
    queryKey: ['project-flows', projectId],
    queryFn: () => flowsAPI.list({ project_id: projectId }).then(r => r.data),
  })

  // Cargar doc activo
  useEffect(() => {
    if (!activeId && docs.length > 0) setActiveId(docs[0].id)
  }, [docs, activeId])

  useEffect(() => {
    if (!activeId) return
    docsAPI.get(activeId).then(r => {
      setContent(r.data.content || '')
      setTitle(r.data.title || '')
      setSaveState('saved')
    }).catch(() => toast.error('No se pudo cargar la sección'))
  }, [activeId])

  // Autosave
  const scheduleSave = useCallback((newContent, newTitle) => {
    setSaveState('dirty')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveState('saving')
      try {
        await docsAPI.update(activeId, { content: newContent, title: newTitle })
        setSaveState('saved')
        queryClient.invalidateQueries({ queryKey: ['project-docs', projectId] })
      } catch {
        setSaveState('dirty')
        toast.error('Error al guardar')
      }
    }, 1500)
  }, [activeId, projectId, queryClient])

  const onContentChange = (v) => { setContent(v); scheduleSave(v, title) }
  const onTitleChange = (v) => { setTitle(v); scheduleSave(content, v) }

  const createMut = useMutation({
    mutationFn: () => docsAPI.create({ project_id: parseInt(projectId), title: 'Nueva sección', content: STARTER }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['project-docs', projectId] })
      setActiveId(res.data.id)
      setMode('edit')
      toast.success('📄 Sección creada')
    },
  })

  const deleteMut = useMutation({
    mutationFn: (docId) => docsAPI.delete(docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-docs', projectId] })
      setActiveId(null)
      toast.success('Sección eliminada')
    },
  })

  const insertAtCursor = (text) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const newContent = content.slice(0, start) + text + content.slice(ta.selectionEnd)
    onContentChange(newContent)
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + text.length }, 0)
  }

  const insertFlow = (flow) => {
    insertAtCursor(`\n> 🔀 **Flujo BPMN:** [${flow.name}](/flujos/${flow.id})\n`)
    setFlowPickerOpen(false)
    toast.success('Flujo insertado en el documento')
  }

  const exportUrl = `${api.defaults.baseURL}/project-docs/project/${projectId}/export`

  const copyAiInfo = () => {
    navigator.clipboard.writeText(
      `GET ${exportUrl}\nAuthorization: Bearer <tu_token>\n\n` +
      `Devuelve JSON con: project, docs[] (markdown), flows[] (BPMN, agrega ?include_flows_xml=true para el XML) ` +
      `y consolidated_markdown (todo el proyecto en un solo markdown listo para darle de contexto a un LLM).`
    )
    toast.success('📋 Instrucciones copiadas al portapapeles')
  }

  return (
    <div className="fixed inset-0 lg:relative lg:inset-auto flex flex-col h-full lg:h-[calc(100dvh-6rem)] bg-slate-950 z-40 lg:z-0 rounded-none lg:rounded-2xl overflow-hidden border border-slate-800">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 flex-wrap">
        <button onClick={() => navigate(`/projects/${projectId}`)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" title="Volver al proyecto">
          <ArrowLeft size={17} />
        </button>
        <BookOpen size={16} className="text-cyan-400" />
        <span className="font-semibold text-white text-sm truncate max-w-[200px]">
          {project?.name || 'Documentación'}
        </span>

        <span className="flex items-center gap-1.5 text-xs px-2">
          {saveState === 'saving' && <Loader2 size={13} className="animate-spin text-amber-400" />}
          {saveState === 'saved' && <Check size={13} className="text-emerald-400" />}
        </span>

        <div className="flex-1" />

        {/* Modo */}
        <div className="flex items-center rounded-lg bg-slate-800/70 p-0.5">
          <button
            onClick={() => setMode('edit')}
            className={`px-2.5 py-1.5 rounded-md text-xs flex items-center gap-1 ${mode === 'edit' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            <Pencil size={12} /> Editar
          </button>
          <button
            onClick={() => setMode('preview')}
            className={`px-2.5 py-1.5 rounded-md text-xs flex items-center gap-1 ${mode === 'preview' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            <Eye size={12} /> Vista
          </button>
        </div>

        {/* Conectar IA */}
        <button
          onClick={() => setAiOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-600 text-white text-xs font-medium"
          title="Conectar con tu API de IA"
        >
          <Bot size={13} /> <span className="hidden sm:inline">Conectar IA</span>
        </button>
      </div>

      {/* Panel IA */}
      {aiOpen && (
        <div className="bg-violet-950/40 border-b border-violet-800/40 px-4 py-3 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-violet-200 font-medium mb-1">🤖 Endpoint para tu API de IA (JSON estructurado del proyecto completo):</p>
              <code className="block bg-slate-900 rounded-lg px-3 py-2 text-violet-300 overflow-x-auto whitespace-nowrap">
                GET {exportUrl}
              </code>
              <p className="text-violet-400/70 mt-1.5">
                Incluye <b>consolidated_markdown</b> (todo listo como contexto para un LLM) · agrega <code>?include_flows_xml=true</code> para el XML BPMN · requiere header <code>Authorization: Bearer</code>
              </p>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button onClick={copyAiInfo} className="p-2 rounded-lg bg-violet-600/40 hover:bg-violet-600/70 text-violet-200" title="Copiar instrucciones">
                <Copy size={13} />
              </button>
              <button onClick={() => setAiOpen(false)} className="p-2 rounded-lg text-violet-400 hover:text-white" title="Cerrar">
                <X size={13} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* ── Sidebar de secciones ── */}
        <div className="w-52 flex-shrink-0 bg-slate-900/60 border-r border-slate-800 flex flex-col">
          <div className="p-2.5">
            <button
              onClick={() => createMut.mutate()}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-cyan-600/20 border border-cyan-600/40 text-cyan-300 text-xs font-medium hover:bg-cyan-600/35 transition-colors"
            >
              <Plus size={13} /> Nueva sección
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            {isLoading ? (
              <p className="text-xs text-slate-600 text-center py-4">Cargando…</p>
            ) : docs.length === 0 ? (
              <p className="text-[11px] text-slate-600 text-center py-4 px-2">
                Crea la primera sección: objetivo, arquitectura, procesos, código…
              </p>
            ) : docs.map(d => (
              <div
                key={d.id}
                className={`group flex items-center gap-1 rounded-lg transition-colors ${
                  activeId === d.id ? 'bg-cyan-600/20 border border-cyan-700/40' : 'hover:bg-slate-800 border border-transparent'
                }`}
              >
                <button
                  onClick={() => setActiveId(d.id)}
                  className={`flex-1 text-left px-2.5 py-2 text-xs truncate ${activeId === d.id ? 'text-cyan-200 font-medium' : 'text-slate-300'}`}
                >
                  {d.title}
                </button>
                <button
                  onClick={() => confirm(`¿Eliminar "${d.title}"?`) && deleteMut.mutate(d.id)}
                  className="p-1.5 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>

          {/* Flujos del proyecto */}
          {flows.length > 0 && (
            <div className="border-t border-slate-800 p-2.5">
              <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1.5 flex items-center gap-1">
                <Workflow size={10} /> Flujos del proyecto
              </p>
              {flows.slice(0, 4).map(f => (
                <button
                  key={f.id}
                  onClick={() => navigate(`/flujos/${f.id}`)}
                  className="w-full text-left text-[11px] text-slate-400 hover:text-cyan-300 truncate py-0.5"
                >
                  🔀 {f.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Editor / Preview ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!activeId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <BookOpen size={36} className="mx-auto text-slate-700 mb-3" />
                <p className="text-slate-500 text-sm">Selecciona o crea una sección</p>
              </div>
            </div>
          ) : (
            <>
              {/* Título + snippets */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800/60 flex-wrap">
                <input
                  value={title}
                  onChange={e => onTitleChange(e.target.value)}
                  className="bg-transparent text-white font-semibold text-base focus:outline-none focus:bg-slate-800 rounded-lg px-2 py-1 flex-1 min-w-[140px]"
                  placeholder="Título de la sección"
                />
                {mode === 'edit' && (
                  <div className="flex items-center gap-1">
                    {SNIPPETS.map(s => (
                      <button
                        key={s.label}
                        onClick={() => insertAtCursor(s.text)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-800/70 text-slate-400 hover:text-white text-[11px]"
                        title={`Insertar ${s.label}`}
                      >
                        <s.icon size={12} /> {s.label}
                      </button>
                    ))}
                    <div className="relative">
                      <button
                        onClick={() => setFlowPickerOpen(o => !o)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-cyan-900/40 text-cyan-300 hover:bg-cyan-900/70 text-[11px]"
                        title="Insertar flujo BPMN"
                      >
                        <Workflow size={12} /> Flujo
                      </button>
                      {flowPickerOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setFlowPickerOpen(false)} />
                          <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                            {flows.length === 0 ? (
                              <p className="text-[11px] text-slate-500 p-3">No hay flujos en este proyecto — créalos en el módulo Flujos y asócialos aquí</p>
                            ) : flows.map(f => (
                              <button
                                key={f.id}
                                onClick={() => insertFlow(f)}
                                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 truncate"
                              >
                                🔀 {f.name}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Cuerpo */}
              {mode === 'edit' ? (
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={e => onContentChange(e.target.value)}
                  className="flex-1 bg-slate-950 text-slate-200 font-mono text-[13px] leading-relaxed p-4 focus:outline-none resize-none"
                  placeholder="Escribe en Markdown: ## títulos, ```código```, tablas, listas, [links](url)…"
                  spellCheck={false}
                />
              ) : (
                <div className="flex-1 overflow-y-auto p-5">
                  <article className="prose prose-invert prose-sm max-w-3xl
                    prose-headings:text-white prose-a:text-cyan-400 prose-code:text-amber-300
                    prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800
                    prose-blockquote:border-cyan-600 prose-blockquote:text-slate-300
                    prose-table:text-sm prose-th:text-slate-300 prose-td:text-slate-400">
                    <ReactMarkdown>{content || '_Sección vacía — cambia a Editar para escribir_'}</ReactMarkdown>
                  </article>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
