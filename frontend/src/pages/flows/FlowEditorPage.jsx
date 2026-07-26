import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import BpmnModeler from 'bpmn-js/lib/Modeler'
import minimapModule from 'diagram-js-minimap'
import {
  ArrowLeft, Download, Undo2, Redo2, ZoomIn, ZoomOut, Maximize,
  Check, Loader2, Image as ImageIcon, Trash2, ChevronDown, Palette,
  Smile, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { flowsAPI } from '../../services/api'

// Estilos de bpmn-js
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import 'diagram-js-minimap/assets/diagram-js-minimap.css'
import './bpmn-editor.css'

// ─── Biblioteca multimedia: badges de sistemas empresariales ─────────────────
function makeBadge(text, bg, fg = '#ffffff') {
  const w = Math.max(64, text.length * 13 + 24)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="30">
    <rect width="${w}" height="30" rx="7" fill="${bg}"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
      font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="${fg}">${text}</text>
  </svg>`
  return { src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, w, h: 30 }
}

const MEDIA_BADGES = [
  { name: 'SAP',        ...makeBadge('SAP', '#0070c0') },
  { name: 'Excel',      ...makeBadge('Excel', '#107C41') },
  { name: 'Power BI',   ...makeBadge('Power BI', '#F2C811', '#1e293b') },
  { name: 'Outlook',    ...makeBadge('Outlook', '#0F6CBD') },
  { name: 'Teams',      ...makeBadge('Teams', '#6264A7') },
  { name: 'WhatsApp',   ...makeBadge('WhatsApp', '#25D366', '#0b3d1e') },
  { name: 'Salesforce', ...makeBadge('Salesforce', '#00A1E0') },
  { name: 'Word',       ...makeBadge('Word', '#2B579A') },
  { name: 'SharePoint', ...makeBadge('SharePoint', '#036C70') },
  { name: 'Oracle',     ...makeBadge('Oracle', '#C74634') },
  { name: 'CRM',        ...makeBadge('CRM', '#7c3aed') },
  { name: 'ERP',        ...makeBadge('ERP', '#0e7490') },
  { name: 'Base Datos', ...makeBadge('🗄️ BD', '#334155') },
  { name: 'API',        ...makeBadge('⚙️ API', '#1e293b') },
  { name: 'Email',      ...makeBadge('✉️ Email', '#b45309') },
  { name: 'Web',        ...makeBadge('🌐 Web', '#0369a1') },
  { name: 'Vanti',      ...makeBadge('Vanti', '#e11d48') },
  { name: 'SmartFlow',  ...makeBadge('SmartFlow', '#4f46e5') },
]

const RECENT_KEY = 'flow-media-recent'
function loadRecents() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
function saveRecent(item) {
  const list = [item, ...loadRecents().filter(r => r.src !== item.src)].slice(0, 12)
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch { /* lleno */ }
  return list
}

// ─── Paleta de colores (psicología del color: llenos suaves, bordes definidos) ─
const COLORS = [
  { name: 'Predeterminado', fill: null, stroke: null },
  { name: 'Azul',     fill: '#dbeafe', stroke: '#1d4ed8' },
  { name: 'Verde',    fill: '#dcfce7', stroke: '#15803d' },
  { name: 'Ámbar',    fill: '#fef3c7', stroke: '#b45309' },
  { name: 'Rojo',     fill: '#fee2e2', stroke: '#b91c1c' },
  { name: 'Violeta',  fill: '#ede9fe', stroke: '#6d28d9' },
  { name: 'Cian',     fill: '#cffafe', stroke: '#0e7490' },
  { name: 'Rosa',     fill: '#fce7f3', stroke: '#be185d' },
  { name: 'Gris',     fill: '#f1f5f9', stroke: '#475569' },
]

const EMOJIS = [
  '✅','📋','📧','📞','💰','⚠️','🔁','👤','👥','🏦','📊','📁','🕐','🔔','💡','🚀',
  '🔒','📝','🖥️','📱','🤝','🎯','⭐','❗','🔍','⚙️','📦','🧾','💳','🏷️',
]

const TYPE_NAMES = {
  'bpmn:Task': 'Tarea', 'bpmn:UserTask': 'Tarea de usuario', 'bpmn:ServiceTask': 'Tarea de servicio',
  'bpmn:ManualTask': 'Tarea manual', 'bpmn:ScriptTask': 'Tarea de script', 'bpmn:SendTask': 'Tarea de envío',
  'bpmn:StartEvent': 'Evento de inicio', 'bpmn:EndEvent': 'Evento de fin',
  'bpmn:IntermediateThrowEvent': 'Evento intermedio', 'bpmn:IntermediateCatchEvent': 'Evento intermedio',
  'bpmn:ExclusiveGateway': 'Compuerta exclusiva (XOR)', 'bpmn:ParallelGateway': 'Compuerta paralela (AND)',
  'bpmn:InclusiveGateway': 'Compuerta inclusiva (OR)', 'bpmn:EventBasedGateway': 'Compuerta de eventos',
  'bpmn:SequenceFlow': 'Flujo de secuencia', 'bpmn:MessageFlow': 'Flujo de mensaje',
  'bpmn:Participant': 'Pool / Participante', 'bpmn:Lane': 'Carril (Lane)',
  'bpmn:SubProcess': 'Subproceso', 'bpmn:DataObjectReference': 'Objeto de datos',
  'bpmn:DataStoreReference': 'Almacén de datos', 'bpmn:TextAnnotation': 'Anotación',
  'bpmn:Group': 'Grupo',
}

export default function FlowEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const containerRef = useRef(null)
  const modelerRef = useRef(null)
  const overlayMapRef = useRef({})          // { elementId: { src, w, h } }
  const overlayIdsRef = useRef({})          // { elementId: overlayId } (para remover)
  const saveTimerRef = useRef(null)
  const fileInputRef = useRef(null)

  const [flow, setFlow] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState('saved')  // saved | dirty | saving
  const [selected, setSelected] = useState(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [nameEdit, setNameEdit] = useState('')
  const [mediaOpen, setMediaOpen] = useState(false)
  const [recents, setRecents] = useState(loadRecents)

  // ── Overlays de imagen ──────────────────────────────────────────────────────
  const addImageOverlay = useCallback((elementId, data) => {
    const modeler = modelerRef.current
    if (!modeler) return
    const overlays = modeler.get('overlays')
    const registry = modeler.get('elementRegistry')
    const el = registry.get(elementId)
    if (!el) return
    // quitar overlay anterior
    if (overlayIdsRef.current[elementId]) {
      try { overlays.remove(overlayIdsRef.current[elementId]) } catch { /* ignore */ }
    }
    const oid = overlays.add(elementId, 'flow-img', {
      position: { top: -data.h - 8, left: (el.width - data.w) / 2 },
      html: `<img src="${data.src}" style="width:${data.w}px;height:${data.h}px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none" />`,
    })
    overlayIdsRef.current[elementId] = oid
  }, [])

  const removeImageOverlay = useCallback((elementId) => {
    const modeler = modelerRef.current
    if (!modeler) return
    const overlays = modeler.get('overlays')
    if (overlayIdsRef.current[elementId]) {
      try { overlays.remove(overlayIdsRef.current[elementId]) } catch { /* ignore */ }
      delete overlayIdsRef.current[elementId]
    }
    delete overlayMapRef.current[elementId]
  }, [])

  // ── Guardado ────────────────────────────────────────────────────────────────
  const doSave = useCallback(async () => {
    const modeler = modelerRef.current
    if (!modeler) return
    setSaveState('saving')
    try {
      const { xml } = await modeler.saveXML({ format: true })
      const { svg } = await modeler.saveSVG()
      // limpiar overlays de elementos eliminados
      const registry = modeler.get('elementRegistry')
      const cleanOverlays = {}
      for (const [elId, data] of Object.entries(overlayMapRef.current)) {
        if (registry.get(elId)) cleanOverlays[elId] = data
      }
      overlayMapRef.current = cleanOverlays
      await flowsAPI.update(id, {
        bpmn_xml: xml,
        overlays: JSON.stringify(cleanOverlays),
        thumbnail: svg.length < 400000 ? svg : null,
      })
      setSaveState('saved')
    } catch (err) {
      console.error(err)
      setSaveState('dirty')
      toast.error('No se pudo guardar el flujo')
    }
  }, [id])

  const scheduleSave = useCallback(() => {
    setSaveState('dirty')
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(doSave, 2000)
  }, [doSave])

  // ── Inicialización ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function init() {
      setLoading(true)
      try {
        const res = await flowsAPI.get(id)
        if (cancelled) return
        const flowData = res.data
        setFlow(flowData)
        setNameEdit(flowData.name)

        const modeler = new BpmnModeler({
          container: containerRef.current,
          keyboard: { bindTo: document },
          additionalModules: [minimapModule],
        })
        modelerRef.current = modeler

        await modeler.importXML(flowData.bpmn_xml)
        if (cancelled) { modeler.destroy(); return }
        modeler.get('canvas').zoom('fit-viewport', 'auto')

        // restaurar imágenes
        try {
          const savedOverlays = flowData.overlays ? JSON.parse(flowData.overlays) : {}
          overlayMapRef.current = savedOverlays
          for (const [elId, data] of Object.entries(savedOverlays)) {
            addImageOverlay(elId, data)
          }
        } catch { /* overlays corruptos: ignorar */ }

        // eventos
        modeler.on('commandStack.changed', scheduleSave)
        modeler.on('selection.changed', (e) => {
          setSelected(e.newSelection?.[0] || null)
          setEmojiOpen(false)
        })

        setLoading(false)
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          toast.error('No se pudo cargar el flujo')
          navigate('/flujos')
        }
      }
    }

    init()
    return () => {
      cancelled = true
      clearTimeout(saveTimerRef.current)
      if (modelerRef.current) {
        modelerRef.current.destroy()
        modelerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ── Acciones de toolbar ─────────────────────────────────────────────────────
  const cmd = (fn) => () => {
    const m = modelerRef.current
    if (m) fn(m)
  }

  const zoomIn = cmd(m => m.get('canvas').zoom(Math.min(4, m.get('canvas').zoom() + 0.2)))
  const zoomOut = cmd(m => m.get('canvas').zoom(Math.max(0.2, m.get('canvas').zoom() - 0.2)))
  const zoomFit = cmd(m => m.get('canvas').zoom('fit-viewport', 'auto'))
  const undo = cmd(m => m.get('commandStack').undo())
  const redo = cmd(m => m.get('commandStack').redo())

  const saveName = async () => {
    if (!nameEdit.trim() || nameEdit === flow?.name) return
    try {
      await flowsAPI.update(id, { name: nameEdit.trim() })
      setFlow(f => ({ ...f, name: nameEdit.trim() }))
      toast.success('Nombre actualizado')
    } catch {
      toast.error('No se pudo renombrar')
    }
  }

  // ── Color / emoji / imagen del elemento seleccionado ───────────────────────
  const applyColor = (color) => {
    const m = modelerRef.current
    if (!m || !selected) return
    m.get('modeling').setColor([selected], {
      fill: color.fill, stroke: color.stroke,
    })
  }

  const applyEmoji = (emoji) => {
    const m = modelerRef.current
    if (!m || !selected) return
    const current = selected.businessObject?.name || ''
    const cleaned = current.replace(/^\p{Extended_Pictographic}️?\s*/u, '')
    m.get('modeling').updateLabel(selected, `${emoji} ${cleaned}`.trim())
    setEmojiOpen(false)
  }

  // Aplica una imagen/badge de la biblioteca al elemento seleccionado
  const attachMedia = (item) => {
    if (!selected) return toast.error('Selecciona primero un elemento del diagrama')
    const data = { src: item.src, w: item.w, h: item.h }
    overlayMapRef.current[selected.id] = data
    addImageOverlay(selected.id, data)
    scheduleSave()
    toast.success(`✨ ${item.name || 'Imagen'} añadido al elemento`)
  }

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selected) return
    if (file.size > 500 * 1024) return toast.error('Imagen muy grande (máx 500 KB)')
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxW = 120
        const scale = Math.min(1, maxW / img.width)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const data = { src: reader.result, w, h }
        overlayMapRef.current[selected.id] = data
        addImageOverlay(selected.id, data)
        setRecents(saveRecent({ name: file.name.replace(/\.\w+$/, ''), ...data }))
        scheduleSave()
        toast.success('🖼️ Imagen añadida al elemento')
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  const download = (content, filename, mime) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const fileName = (ext) => `${(flow?.name || 'flujo').replace(/[^\w\sáéíóúñ-]/gi, '').trim().replace(/\s+/g, '_')}.${ext}`

  // SVG con las imágenes de overlays incrustadas en coordenadas del diagrama
  const buildAugmentedSVG = async () => {
    const m = modelerRef.current
    const { svg } = await m.saveSVG()
    const entries = Object.entries(overlayMapRef.current)
    if (entries.length === 0) return svg

    const registry = m.get('elementRegistry')
    const parser = new DOMParser()
    const doc = parser.parseFromString(svg, 'image/svg+xml')
    const root = doc.documentElement

    // Ampliar el viewBox para que quepan imágenes que sobresalen por arriba
    const vb = (root.getAttribute('viewBox') || '0 0 100 100').split(/\s+/).map(Number)
    let [vx, vy, vw, vh] = vb
    let minY = vy

    for (const [elId, data] of entries) {
      const el = registry.get(elId)
      if (!el) continue
      const x = el.x + (el.width - data.w) / 2
      const y = el.y - data.h - 8
      minY = Math.min(minY, y)
      const imgNode = doc.createElementNS('http://www.w3.org/2000/svg', 'image')
      imgNode.setAttribute('href', data.src)
      imgNode.setAttribute('x', x)
      imgNode.setAttribute('y', y)
      imgNode.setAttribute('width', data.w)
      imgNode.setAttribute('height', data.h)
      root.appendChild(imgNode)
    }
    if (minY < vy) {
      const diff = vy - minY
      vy = minY
      vh += diff
      root.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`)
      root.setAttribute('height', vh)
    }
    return new XMLSerializer().serializeToString(doc)
  }

  const exportBPMN = async () => {
    try {
      const { xml } = await modelerRef.current.saveXML({ format: true })
      download(xml, fileName('bpmn'), 'application/xml')
      toast.success('📄 BPMN 2.0 exportado — compatible con Camunda, Bizagi, etc.')
    } catch { toast.error('Error al exportar') }
    setExportOpen(false)
  }

  const exportSVG = async () => {
    try {
      const svg = await buildAugmentedSVG()
      download(svg, fileName('svg'), 'image/svg+xml')
      toast.success('🎨 SVG exportado')
    } catch { toast.error('Error al exportar') }
    setExportOpen(false)
  }

  const exportPNG = async () => {
    try {
      const svg = await buildAugmentedSVG()
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      const scale = 2.5 // alta resolución
      const canvas = document.createElement('canvas')
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => {
        download(blob, fileName('png'), 'image/png')
        toast.success('🖼️ PNG en alta resolución exportado')
      }, 'image/png')
    } catch (e) {
      console.error(e)
      toast.error('Error al exportar PNG')
    }
    setExportOpen(false)
  }

  const selectedHasImage = selected && overlayMapRef.current[selected.id]
  const isShape = selected && selected.type !== 'bpmn:SequenceFlow' && !selected.waypoints

  return (
    <div className="fixed inset-0 lg:relative lg:inset-auto flex flex-col h-full lg:h-[calc(100dvh-6rem)] bg-slate-950 z-40 lg:z-0 rounded-none lg:rounded-2xl overflow-hidden border border-slate-800">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800 flex-wrap">
        <button onClick={() => navigate('/flujos')} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" title="Volver">
          <ArrowLeft size={17} />
        </button>

        <input
          value={nameEdit}
          onChange={e => setNameEdit(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => e.key === 'Enter' && e.target.blur()}
          className="bg-transparent text-white font-semibold text-sm px-2 py-1 rounded-lg hover:bg-slate-800 focus:bg-slate-800 focus:outline-none min-w-0 flex-1 max-w-xs"
        />

        {/* Save state */}
        <span className="flex items-center gap-1.5 text-xs px-2">
          {saveState === 'saving' && <><Loader2 size={13} className="animate-spin text-amber-400" /><span className="text-amber-400 hidden sm:inline">Guardando…</span></>}
          {saveState === 'saved' && <><Check size={13} className="text-emerald-400" /><span className="text-emerald-400 hidden sm:inline">Guardado</span></>}
          {saveState === 'dirty' && <span className="text-slate-500 hidden sm:inline">Sin guardar</span>}
        </span>

        <div className="flex-1" />

        {/* Undo / Redo */}
        <div className="flex items-center rounded-lg bg-slate-800/70 p-0.5">
          <button onClick={undo} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700" title="Deshacer (Ctrl+Z)"><Undo2 size={15} /></button>
          <button onClick={redo} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700" title="Rehacer (Ctrl+Y)"><Redo2 size={15} /></button>
        </div>

        {/* Zoom */}
        <div className="flex items-center rounded-lg bg-slate-800/70 p-0.5">
          <button onClick={zoomOut} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700" title="Alejar"><ZoomOut size={15} /></button>
          <button onClick={zoomFit} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700" title="Ajustar a pantalla"><Maximize size={15} /></button>
          <button onClick={zoomIn} className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700" title="Acercar"><ZoomIn size={15} /></button>
        </div>

        {/* Multimedia */}
        <button
          onClick={() => setMediaOpen(o => !o)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            mediaOpen ? 'bg-violet-600 text-white' : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
          }`}
          title="Biblioteca multimedia: logos de sistemas e imágenes"
        >
          <ImageIcon size={14} /> <span className="hidden sm:inline">Multimedia</span>
        </button>

        {/* Export */}
        <div className="relative">
          <button
            onClick={() => setExportOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors"
          >
            <Download size={14} /> <span className="hidden sm:inline">Exportar</span> <ChevronDown size={13} />
          </button>
          {exportOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden w-56">
                <button onClick={exportPNG} className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2">
                  🖼️ PNG alta resolución
                </button>
                <button onClick={exportSVG} className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2">
                  🎨 SVG vectorial
                </button>
                <button onClick={exportBPMN} className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2">
                  📄 BPMN 2.0 (XML estándar)
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Canvas + panel ── */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Canvas (fondo blanco con puntos estilo Miro) */}
        <div
          ref={containerRef}
          className="flex-1 min-w-0"
          style={{
            background: '#fafafa',
            backgroundImage: 'radial-gradient(circle, #d4d4d8 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        {loading && (
          <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center z-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin text-cyan-400" />
              <span className="text-slate-400 text-sm">Cargando editor…</span>
            </div>
          </div>
        )}

        {/* ── Panel de propiedades (elemento seleccionado) ── */}
        {selected && !loading && (
          <div className="absolute top-3 right-3 z-30 w-64 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-2xl shadow-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                {TYPE_NAMES[selected.type] || selected.type?.replace('bpmn:', '')}
              </span>
              <button onClick={() => modelerRef.current?.get('selection').select(null)} className="text-slate-500 hover:text-slate-300">
                <X size={14} />
              </button>
            </div>

            {selected.businessObject?.name != null && (
              <p className="text-sm text-white font-medium truncate" title={selected.businessObject.name}>
                {selected.businessObject.name || <span className="text-slate-500 italic">Sin nombre — doble clic para editar</span>}
              </p>
            )}

            {isShape && (
              <>
                {/* Colores */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
                    <Palette size={12} /> Color
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COLORS.map(c => (
                      <button
                        key={c.name}
                        onClick={() => applyColor(c)}
                        title={c.name}
                        className="w-7 h-7 rounded-lg border-2 transition-transform hover:scale-110"
                        style={{
                          background: c.fill || '#ffffff',
                          borderColor: c.stroke || '#cbd5e1',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Emoji */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
                    <Smile size={12} /> Icono
                  </div>
                  {emojiOpen ? (
                    <div className="grid grid-cols-8 gap-1 max-h-28 overflow-y-auto pr-1">
                      {EMOJIS.map(e => (
                        <button key={e} onClick={() => applyEmoji(e)}
                          className="text-lg hover:scale-125 transition-transform">{e}</button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => setEmojiOpen(true)}
                      className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors">
                      Elegir icono…
                    </button>
                  )}
                </div>

                {/* Imagen */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
                    <ImageIcon size={12} /> Imagen
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                    >
                      {selectedHasImage ? 'Cambiar imagen' : 'Añadir imagen'}
                    </button>
                    {selectedHasImage && (
                      <button
                        onClick={() => { removeImageOverlay(selected.id); scheduleSave() }}
                        className="px-2.5 rounded-lg bg-red-900/40 hover:bg-red-900/70 text-red-300 transition-colors"
                        title="Quitar imagen"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Panel Multimedia ── */}
        {mediaOpen && !loading && (
          <div className="absolute top-3 left-3 lg:left-auto lg:right-3 lg:top-16 z-30 w-72 bg-slate-900/95 backdrop-blur border border-slate-700 rounded-2xl shadow-2xl p-4 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                <ImageIcon size={13} className="text-violet-400" /> Multimedia
              </span>
              <button onClick={() => setMediaOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X size={14} />
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mb-3">
              {selected ? 'Clic en un logo para añadirlo al elemento seleccionado' : '⚠️ Selecciona primero un elemento del diagrama'}
            </p>

            {/* Sistemas empresariales */}
            <p className="text-[11px] text-slate-400 font-medium mb-1.5">Sistemas</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {MEDIA_BADGES.map(b => (
                <button
                  key={b.name}
                  onClick={() => attachMedia(b)}
                  className="rounded-lg hover:scale-105 transition-transform ring-1 ring-slate-700 hover:ring-violet-500"
                  title={b.name}
                >
                  <img src={b.src} alt={b.name} style={{ height: 24 }} className="rounded-lg" />
                </button>
              ))}
            </div>

            {/* Subir logo propio */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 rounded-xl border border-dashed border-slate-600 text-slate-400 text-xs hover:border-violet-500 hover:text-violet-300 transition-colors"
            >
              + Subir logo o imagen propia (máx 500 KB)
            </button>

            {/* Recientes */}
            {recents.length > 0 && (
              <>
                <p className="text-[11px] text-slate-400 font-medium mt-3 mb-1.5">Mis imágenes recientes</p>
                <div className="flex flex-wrap gap-1.5">
                  {recents.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => attachMedia(r)}
                      className="rounded-lg hover:scale-105 transition-transform ring-1 ring-slate-700 hover:ring-violet-500 bg-white/90 p-0.5"
                      title={r.name}
                    >
                      <img src={r.src} alt={r.name} style={{ height: 28, maxWidth: 72, objectFit: 'contain' }} className="rounded" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      </div>

      {/* ── Tip bar ── */}
      <div className="px-4 py-1.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-500 hidden sm:block">
        💡 Arrastra desde la paleta izquierda · Doble clic para editar texto · Selecciona un elemento para color, icono o imagen · Guardado automático
      </div>
    </div>
  )
}
