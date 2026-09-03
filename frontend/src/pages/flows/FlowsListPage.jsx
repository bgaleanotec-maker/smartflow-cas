import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Workflow, Plus, X, Copy, Archive, FolderKanban, Clock, Search, Upload,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { flowsAPI, projectsAPI } from '../../services/api'

// ─── Plantillas de inicio ─────────────────────────────────────────────────────

const TPL_EMPTY = null // el backend crea el BPMN vacío

const TPL_BASIC = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:startEvent id="Start_1" name="Inicio">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Actividad 1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:exclusiveGateway id="Gw_1" name="¿Aprobado?">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
      <bpmn:outgoing>Flow_4</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_2" name="Continuar proceso">
      <bpmn:incoming>Flow_3</bpmn:incoming>
      <bpmn:outgoing>Flow_5</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_3" name="Ajustar y reintentar">
      <bpmn:incoming>Flow_4</bpmn:incoming>
    </bpmn:task>
    <bpmn:endEvent id="End_1" name="Fin">
      <bpmn:incoming>Flow_5</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Gw_1"/>
    <bpmn:sequenceFlow id="Flow_3" name="Sí" sourceRef="Gw_1" targetRef="Task_2"/>
    <bpmn:sequenceFlow id="Flow_4" name="No" sourceRef="Gw_1" targetRef="Task_3"/>
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Task_2" targetRef="End_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="s_Start_1" bpmnElement="Start_1"><dc:Bounds x="152" y="202" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_Task_1" bpmnElement="Task_1"><dc:Bounds x="240" y="180" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_Gw_1" bpmnElement="Gw_1" isMarkerVisible="true"><dc:Bounds x="395" y="195" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_Task_2" bpmnElement="Task_2"><dc:Bounds x="500" y="180" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_Task_3" bpmnElement="Task_3"><dc:Bounds x="370" y="300" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_End_1" bpmnElement="End_1"><dc:Bounds x="652" y="202" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="e_Flow_1" bpmnElement="Flow_1"><di:waypoint x="188" y="220"/><di:waypoint x="240" y="220"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e_Flow_2" bpmnElement="Flow_2"><di:waypoint x="340" y="220"/><di:waypoint x="395" y="220"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e_Flow_3" bpmnElement="Flow_3"><di:waypoint x="445" y="220"/><di:waypoint x="500" y="220"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e_Flow_4" bpmnElement="Flow_4"><di:waypoint x="420" y="245"/><di:waypoint x="420" y="300"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e_Flow_5" bpmnElement="Flow_5"><di:waypoint x="600" y="220"/><di:waypoint x="652" y="220"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

const TPL_LANES = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collab_1">
    <bpmn:participant id="Pool_1" name="Proceso CAS / BO" processRef="Process_1"/>
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_1" name="CAS">
        <bpmn:flowNodeRef>Start_1</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>Task_1</bpmn:flowNodeRef>
      </bpmn:lane>
      <bpmn:lane id="Lane_2" name="BO">
        <bpmn:flowNodeRef>Task_2</bpmn:flowNodeRef>
        <bpmn:flowNodeRef>End_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="Start_1" name="Inicio">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Registrar solicitud">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:task>
    <bpmn:task id="Task_2" name="Procesar en back office">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:task>
    <bpmn:endEvent id="End_1" name="Fin">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1"/>
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="Task_2"/>
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_2" targetRef="End_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collab_1">
      <bpmndi:BPMNShape id="s_Pool_1" bpmnElement="Pool_1" isHorizontal="true"><dc:Bounds x="129" y="80" width="600" height="330"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_Lane_1" bpmnElement="Lane_1" isHorizontal="true"><dc:Bounds x="159" y="80" width="570" height="165"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_Lane_2" bpmnElement="Lane_2" isHorizontal="true"><dc:Bounds x="159" y="245" width="570" height="165"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_Start_1" bpmnElement="Start_1"><dc:Bounds x="212" y="142" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_Task_1" bpmnElement="Task_1"><dc:Bounds x="300" y="120" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_Task_2" bpmnElement="Task_2"><dc:Bounds x="450" y="285" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_End_1" bpmnElement="End_1"><dc:Bounds x="612" y="307" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="e_Flow_1" bpmnElement="Flow_1"><di:waypoint x="248" y="160"/><di:waypoint x="300" y="160"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e_Flow_2" bpmnElement="Flow_2"><di:waypoint x="400" y="160"/><di:waypoint x="425" y="160"/><di:waypoint x="425" y="325"/><di:waypoint x="450" y="325"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e_Flow_3" bpmnElement="Flow_3"><di:waypoint x="550" y="325"/><di:waypoint x="612" y="325"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

const TEMPLATES = [
  { id: 'empty', name: 'Lienzo vacío', desc: 'Empieza desde cero', xml: TPL_EMPTY, emoji: '⬜' },
  { id: 'basic', name: 'Proceso con decisión', desc: 'Inicio → actividad → compuerta → fin', xml: TPL_BASIC, emoji: '🔀' },
  { id: 'lanes', name: 'Swimlanes CAS / BO', desc: 'Pool con carriles por equipo', xml: TPL_LANES, emoji: '🏊' },
]

// ─── Crear flujo (modal) ──────────────────────────────────────────────────────

function CreateFlowModal({ onClose, projects }) {
  const [form, setForm] = useState({ name: '', description: '', project_id: '', template: 'empty' })
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const createMut = useMutation({
    mutationFn: (data) => flowsAPI.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      toast.success('🎨 Flujo creado')
      navigate(`/flujos/${res.data.id}`)
    },
    onError: () => toast.error('Error al crear el flujo'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) return toast.error('El nombre es obligatorio')
    const tpl = TEMPLATES.find(t => t.id === form.template)
    createMut.mutate({
      name: form.name.trim(),
      description: form.description.trim() || null,
      project_id: form.project_id ? parseInt(form.project_id) : null,
      bpmn_xml: tpl?.xml || null,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Workflow size={16} className="text-cyan-400" /> Nuevo flujo BPMN
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Nombre *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input" placeholder="Ej: Proceso de liquidaciones" autoFocus
            />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="input h-16 resize-none" placeholder="¿Qué proceso representa?"
            />
          </div>
          <div>
            <label className="label">Proyecto asociado (opcional)</label>
            <select
              value={form.project_id}
              onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
              className="input"
            >
              <option value="">Sin proyecto</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Plantilla</label>
            <div className="grid grid-cols-3 gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id} type="button"
                  onClick={() => setForm(f => ({ ...f, template: t.id }))}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    form.template === t.id
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                      : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="text-2xl mb-1">{t.emoji}</div>
                  <div className="text-xs font-medium">{t.name}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary flex-1">
              {createMut.isPending ? 'Creando...' : 'Crear y abrir editor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function FlowsListPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── Importar .bpmn / .xml existente ─────────────────────────────────────────
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return toast.error('Archivo muy grande (máx 2 MB)')
    const text = await file.text()
    if (!text.includes('bpmn') || !text.includes('<')) {
      return toast.error('El archivo no parece un BPMN 2.0 válido (.bpmn o .xml)')
    }
    setImporting(true)
    try {
      const name = file.name.replace(/\.(bpmn|xml)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Flujo importado'
      const res = await flowsAPI.create({ name, bpmn_xml: text })
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      toast.success('📥 Flujo importado — abriendo editor')
      navigate(`/flujos/${res.data.id}`)
    } catch {
      toast.error('No se pudo importar el flujo')
    } finally {
      setImporting(false)
    }
  }

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ['flows'],
    queryFn: () => flowsAPI.list().then(r => r.data),
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-mini'],
    queryFn: () => projectsAPI.list().then(r => Array.isArray(r.data) ? r.data : r.data?.items || []),
  })

  const duplicateMut = useMutation({
    mutationFn: (id) => flowsAPI.duplicate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      toast.success('Flujo duplicado')
    },
  })

  const archiveMut = useMutation({
    mutationFn: (id) => flowsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] })
      toast.success('Flujo archivado')
    },
  })

  const filtered = flows.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.project_name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Workflow size={22} className="text-cyan-400" />
            Flujos BPMN
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Prototipa procesos con BPMN 2.0 — colores, iconos, imágenes y export profesional
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="btn-secondary flex items-center gap-2"
            title="Importar un archivo .bpmn o .xml existente (Camunda, Bizagi, Signavio, bpmn.io…)"
          >
            <Upload size={15} /> {importing ? 'Importando…' : 'Importar'}
          </button>
          <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Nuevo flujo
          </button>
        </div>
        <input
          ref={importInputRef} type="file" accept=".bpmn,.xml,application/xml,text/xml"
          className="hidden" onChange={handleImportFile}
        />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input pl-9 py-2 text-sm"
          placeholder="Buscar flujo o proyecto..."
        />
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-slate-500 text-sm py-10 text-center">Cargando flujos...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-700 rounded-2xl">
          <Workflow size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">Aún no hay flujos</p>
          <p className="text-slate-500 text-sm mt-1">Crea tu primer diagrama de proceso BPMN 2.0</p>
          <button onClick={() => setCreateOpen(true)} className="btn-primary mt-4 inline-flex items-center gap-2">
            <Plus size={15} /> Crear flujo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(f => (
            <div
              key={f.id}
              className="group bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-cyan-700/60 hover:shadow-lg hover:shadow-cyan-900/20 transition-all cursor-pointer"
              onClick={() => navigate(`/flujos/${f.id}`)}
            >
              {/* Thumbnail */}
              <div className="h-36 bg-white flex items-center justify-center overflow-hidden border-b border-slate-800">
                {f.thumbnail ? (
                  <div
                    className="w-full h-full [&>svg]:w-full [&>svg]:h-full [&>svg]:object-contain p-2"
                    dangerouslySetInnerHTML={{ __html: f.thumbnail }}
                  />
                ) : (
                  <Workflow size={36} className="text-slate-300" />
                )}
              </div>
              {/* Info */}
              <div className="p-4">
                <h3 className="font-semibold text-white text-sm truncate">{f.name}</h3>
                {f.progress_pct != null && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${f.progress_pct === 100 ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                        style={{ width: `${f.progress_pct}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-bold ${f.progress_pct === 100 ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {f.progress_pct}% · {f.tasks_done}/{f.tasks_total}
                    </span>
                  </div>
                )}
                {f.description && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{f.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2.5 text-[11px] text-slate-500">
                  {f.project_name && (
                    <span className="flex items-center gap-1 text-indigo-400">
                      <FolderKanban size={11} /> {f.project_name}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {f.updated_at ? new Date(f.updated_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) : ''}
                  </span>
                </div>
                {/* Actions */}
                <div className="flex gap-1.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={e => { e.stopPropagation(); duplicateMut.mutate(f.id) }}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                  >
                    <Copy size={12} /> Duplicar
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (confirm(`¿Archivar el flujo "${f.name}"?`)) archiveMut.mutate(f.id)
                    }}
                    className="flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-300 text-xs transition-colors"
                  >
                    <Archive size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {createOpen && <CreateFlowModal onClose={() => setCreateOpen(false)} projects={projects} />}
    </div>
  )
}
