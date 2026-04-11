import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Check, HelpCircle, Info,
  Plus, Trash2, Save, Send,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { demandsAPI, demandAdminAPI } from '../../services/api'
import VoiceInputButton from '../../components/voice/VoiceInputButton'

const STEPS = [
  { id: 1, title: 'Datos Basicos', desc: 'Nombre de la iniciativa y area solicitante' },
  { id: 2, title: 'Enfoque', desc: 'Tipo de solucion y aplicaciones involucradas' },
  { id: 3, title: 'Situacion y Pilares', desc: 'Contexto actual e impacto estrategico' },
  { id: 4, title: 'Procesos y Usuarios', desc: 'Impacto en procesos y usuarios/clientes' },
  { id: 5, title: 'Riesgo y Cumplimiento', desc: 'Riesgo operacional, SOX y regulatorio' },
  { id: 6, title: 'Beneficio Economico', desc: 'Ahorros e ingresos esperados' },
  { id: 7, title: 'Responsables y Fechas', desc: 'Sponsor, lider y deadlines' },
  { id: 8, title: 'Requerimientos', desc: 'Requerimientos funcionales detallados' },
  { id: 9, title: 'Revision y Envio', desc: 'Revisa y envia tu demanda' },
]

function HelpTip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative inline-block ml-1">
      <button type="button" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} className="text-slate-500 hover:text-slate-300">
        <HelpCircle size={13} />
      </button>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 text-xs bg-slate-700 text-slate-200 rounded-lg shadow-lg border border-slate-600">
          {text}
        </div>
      )}
    </div>
  )
}

function FormField({ label, required, help, children }) {
  return (
    <div>
      <label className="label text-xs mb-1 flex items-center gap-1">
        {label}
        {required && <span className="text-red-400">*</span>}
        {help && <HelpTip text={help} />}
      </label>
      {children}
    </div>
  )
}

export default function DemandFormPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    title: '', vicepresidencia_id: '', telefono_contacto: '',
    enfoque: '[]', aplicaciones: '[]',
    situacion_actual: '',
    pilares_estrategicos_id: '', justificacion_pilares: '',
    mejoras_procesos_id: '', descripcion_procesos: '',
    usuarios_impactados_id: '', detalle_clientes_impactados: '',
    reduce_riesgo_id: '', explicacion_riesgo: '',
    oportunidad_negocio: '',
    beneficio_tipo: '', beneficio_monto_estimado: '',
    sponsor_name: '', lider_proceso_name: '',
    responsable_negocio_name: '', responsable_negocio_email: '',
    impacta_sox: null, sox_detalle: '',
    es_regulatorio: null, regulatorio_detalle: '',
    tiene_deadline: false, fecha_deadline: '',
    impacto_no_ejecutar: '',
    detalle_requerimientos: '', migracion_datos: '',
  })
  const [requirements, setRequirements] = useState([])
  const [selectedEnfoques, setSelectedEnfoques] = useState([])
  const [selectedApps, setSelectedApps] = useState([])

  // Load catalogs
  const { data: catalogs } = useQuery({
    queryKey: ['demand-catalogs'],
    queryFn: () => demandAdminAPI.catalogs().then(r => r.data),
  })

  const getCatalog = (type) => (catalogs || []).filter(c => c.catalog_type === type && c.is_active !== false)

  const createMutation = useMutation({
    mutationFn: (data) => demandsAPI.create(data),
    onSuccess: (res) => {
      toast.success('Demanda creada exitosamente')
      navigate(`/demands/${res.data.id}`)
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al crear demanda'),
  })

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

  const handleEnfoqueToggle = (id) => {
    setSelectedEnfoques(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      set('enfoque', JSON.stringify(next))
      return next
    })
  }

  const handleAppToggle = (id) => {
    setSelectedApps(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      set('aplicaciones', JSON.stringify(next))
      return next
    })
  }

  const addRequirement = () => {
    setRequirements(prev => [...prev, {
      item_number: prev.length + 1,
      modulo_impactado: '', descripcion_requerimiento: '',
      quien: '', que: '', criterios_aceptacion: '', observaciones: '',
    }])
  }

  const updateReq = (idx, field, value) => {
    setRequirements(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }

  const removeReq = (idx) => {
    setRequirements(prev => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, item_number: i + 1 })))
  }

  const handleSubmit = (asDraft = false) => {
    const data = {
      ...form,
      vicepresidencia_id: form.vicepresidencia_id ? Number(form.vicepresidencia_id) : null,
      pilares_estrategicos_id: form.pilares_estrategicos_id ? Number(form.pilares_estrategicos_id) : null,
      mejoras_procesos_id: form.mejoras_procesos_id ? Number(form.mejoras_procesos_id) : null,
      usuarios_impactados_id: form.usuarios_impactados_id ? Number(form.usuarios_impactados_id) : null,
      reduce_riesgo_id: form.reduce_riesgo_id ? Number(form.reduce_riesgo_id) : null,
      beneficio_monto_estimado: form.beneficio_monto_estimado ? Number(form.beneficio_monto_estimado) : null,
      fecha_deadline: form.fecha_deadline || null,
    }
    createMutation.mutate(data)
  }

  const canNext = () => {
    if (step === 1) return form.title.trim().length > 0
    return true
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/demands')} className="text-sm text-slate-500 hover:text-slate-300 flex items-center gap-1 mb-2">
          <ChevronLeft size={14} /> Volver a demandas
        </button>
        <h1 className="text-2xl font-bold text-white">Nueva Demanda de TI</h1>
        <p className="text-slate-400 text-sm mt-0.5">Completa el formulario paso a paso. Los campos con * son obligatorios.</p>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex-1">
            <div className={`h-1.5 rounded-full transition-all ${
              s.id < step ? 'bg-brand-500' : s.id === step ? 'bg-brand-400' : 'bg-slate-800'
            }`} />
            <p className={`text-[9px] mt-1 truncate ${s.id === step ? 'text-brand-400' : 'text-slate-600'}`}>
              {s.title}
            </p>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="card min-h-[400px]">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white">{STEPS[step - 1].title}</h2>
          <p className="text-xs text-slate-500">{STEPS[step - 1].desc}</p>
        </div>

        <div className="space-y-4">
          {step === 1 && (
            <>
              <FormField label="Nombre de la Iniciativa" required help="Describe brevemente la iniciativa o necesidad que tienes">
                <input className="input w-full" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ej: Integracion de datos para Nuevos Negocios 2026" />
              </FormField>
              <FormField label="Vicepresidencia solicitante" required help="Selecciona la vicepresidencia que solicita esta iniciativa">
                <select className="input w-full" value={form.vicepresidencia_id} onChange={e => set('vicepresidencia_id', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {getCatalog('vicepresidencia').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FormField>
              <FormField label="Telefono de contacto" help="Numero de contacto para consultas sobre esta demanda">
                <input className="input w-full" value={form.telefono_contacto} onChange={e => set('telefono_contacto', e.target.value)} placeholder="Ej: 3001234567" />
              </FormField>
            </>
          )}

          {step === 2 && (
            <>
              <FormField label="Enfoque de la iniciativa" required help="Selecciona uno o mas enfoques que crees aplican para tu necesidad">
                <div className="space-y-2 mt-1">
                  {getCatalog('enfoque').map(c => (
                    <label key={c.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedEnfoques.includes(c.id) ? 'border-brand-500 bg-brand-500/10' : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}>
                      <input type="checkbox" checked={selectedEnfoques.includes(c.id)} onChange={() => handleEnfoqueToggle(c.id)} className="mt-0.5" />
                      <span className="text-sm text-slate-300">{c.name}</span>
                    </label>
                  ))}
                </div>
              </FormField>
            </>
          )}

          {step === 3 && (
            <>
              <FormField label="Situacion actual" required help="Describe la situacion actual que genera dificultades en el proceso que deseas mejorar o cambiar">
                <div className="relative">
                  <textarea className="input w-full h-32 pr-10" value={form.situacion_actual} onChange={e => set('situacion_actual', e.target.value)} placeholder="Describe detalladamente la situacion actual..." />
                  <VoiceInputButton onText={(t) => set('situacion_actual', form.situacion_actual ? form.situacion_actual + ' ' + t : t)} className="absolute bottom-2 right-2" />
                </div>
              </FormField>
              <FormField label="Pilares estrategicos impactados" help="Cuantos pilares estrategicos esta impactando esta iniciativa">
                <select className="input w-full" value={form.pilares_estrategicos_id} onChange={e => set('pilares_estrategicos_id', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {getCatalog('pilares').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FormField>
              <FormField label="Justificacion de impacto en pilares" help="Describe como impacta en los pilares estrategicos e indicadores">
                <div className="relative">
                  <textarea className="input w-full h-24 pr-10" value={form.justificacion_pilares} onChange={e => set('justificacion_pilares', e.target.value)} placeholder="Describe como impacta y por que..." />
                  <VoiceInputButton onText={(t) => set('justificacion_pilares', form.justificacion_pilares ? form.justificacion_pilares + ' ' + t : t)} className="absolute bottom-2 right-2" />
                </div>
              </FormField>
            </>
          )}

          {step === 4 && (
            <>
              <FormField label="Mejoras en procesos" help="Cuantas mejoras en los procesos esta impactando">
                <select className="input w-full" value={form.mejoras_procesos_id} onChange={e => set('mejoras_procesos_id', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {getCatalog('procesos').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FormField>
              <FormField label="Descripcion de procesos impactados" help="Describe exactamente a que procesos va a impactar y por que">
                <textarea className="input w-full h-24" value={form.descripcion_procesos} onChange={e => set('descripcion_procesos', e.target.value)} />
              </FormField>
              <FormField label="Usuarios/clientes impactados" help="Cuantos usuarios y/o clientes se impactan al ejecutar esta iniciativa">
                <select className="input w-full" value={form.usuarios_impactados_id} onChange={e => set('usuarios_impactados_id', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {getCatalog('usuarios_impactados').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FormField>
              <FormField label="Detalle de clientes impactados" help="Numero y/o porcentaje de clientes impactados, segmentos">
                <textarea className="input w-full h-24" value={form.detalle_clientes_impactados} onChange={e => set('detalle_clientes_impactados', e.target.value)} placeholder="Segmentos: Hogar, Comercial, Institucionales..." />
              </FormField>
            </>
          )}

          {step === 5 && (
            <>
              <FormField label="Riesgo operacional" help="Esta iniciativa reduce el riesgo operacional?">
                <select className="input w-full" value={form.reduce_riesgo_id} onChange={e => set('reduce_riesgo_id', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {getCatalog('riesgo').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FormField>
              <FormField label="Explicacion de riesgo" help="Explica como la iniciativa va a reducir o no el riesgo operacional">
                <textarea className="input w-full h-24" value={form.explicacion_riesgo} onChange={e => set('explicacion_riesgo', e.target.value)} />
              </FormField>
              <FormField label="Impacta controles o procesos SOX?" help="La iniciativa impacta algun control o proceso SOX dentro de la compania">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={form.impacta_sox === true} onChange={() => set('impacta_sox', true)} /> <span className="text-sm text-slate-300">Si</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={form.impacta_sox === false} onChange={() => set('impacta_sox', false)} /> <span className="text-sm text-slate-300">No</span>
                  </label>
                </div>
              </FormField>
              {form.impacta_sox && (
                <FormField label="Detalle SOX">
                  <textarea className="input w-full h-20" value={form.sox_detalle} onChange={e => set('sox_detalle', e.target.value)} />
                </FormField>
              )}
              <FormField label="Proviene de ente regulatorio o auditoria?" help="La iniciativa proviene de una solicitud de un ente regulatorio o de un plan de accion de auditoria">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={form.es_regulatorio === true} onChange={() => set('es_regulatorio', true)} /> <span className="text-sm text-slate-300">Si</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={form.es_regulatorio === false} onChange={() => set('es_regulatorio', false)} /> <span className="text-sm text-slate-300">No</span>
                  </label>
                </div>
              </FormField>
            </>
          )}

          {step === 6 && (
            <>
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300 flex items-start gap-2">
                <Info size={16} className="mt-0.5 flex-shrink-0" />
                <span>Indica si esta iniciativa es una oportunidad de negocio con ahorros en costos y/o crecimiento en ingresos. Esto ayuda a priorizar las demandas.</span>
              </div>
              <FormField label="Tipo de beneficio economico">
                <select className="input w-full" value={form.beneficio_tipo} onChange={e => set('beneficio_tipo', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  <option value="ahorro_costo">Ahorro en costos</option>
                  <option value="aumento_ingreso">Aumento de ingresos</option>
                  <option value="ambos">Ambos</option>
                  <option value="ninguno">Ninguno</option>
                </select>
              </FormField>
              {form.beneficio_tipo && form.beneficio_tipo !== 'ninguno' && (
                <FormField label="Monto estimado (COP)" help="Monto estimado del ahorro o ingreso">
                  <input type="number" className="input w-full" value={form.beneficio_monto_estimado} onChange={e => set('beneficio_monto_estimado', e.target.value)} placeholder="0" />
                </FormField>
              )}
              <FormField label="Descripcion de la oportunidad" help="Describe cuales son los ahorros o cuales serian los ingresos cuantitativamente">
                <div className="relative">
                  <textarea className="input w-full h-24 pr-10" value={form.oportunidad_negocio} onChange={e => set('oportunidad_negocio', e.target.value)} />
                  <VoiceInputButton onText={(t) => set('oportunidad_negocio', form.oportunidad_negocio ? form.oportunidad_negocio + ' ' + t : t)} className="absolute bottom-2 right-2" />
                </div>
              </FormField>
            </>
          )}

          {step === 7 && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Sponsor (Responsable del Area)" required>
                  <input className="input w-full" value={form.sponsor_name} onChange={e => set('sponsor_name', e.target.value)} />
                </FormField>
                <FormField label="Lider de Proceso" required>
                  <input className="input w-full" value={form.lider_proceso_name} onChange={e => set('lider_proceso_name', e.target.value)} />
                </FormField>
                <FormField label="Responsable por parte de negocio">
                  <input className="input w-full" value={form.responsable_negocio_name} onChange={e => set('responsable_negocio_name', e.target.value)} />
                </FormField>
                <FormField label="Email del responsable">
                  <input type="email" className="input w-full" value={form.responsable_negocio_email} onChange={e => set('responsable_negocio_email', e.target.value)} />
                </FormField>
              </div>
              <FormField label="Tiene deadline/fecha de lanzamiento?">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={form.tiene_deadline === true} onChange={() => set('tiene_deadline', true)} /> <span className="text-sm text-slate-300">Si</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={form.tiene_deadline === false} onChange={() => set('tiene_deadline', false)} /> <span className="text-sm text-slate-300">No</span>
                  </label>
                </div>
              </FormField>
              {form.tiene_deadline && (
                <FormField label="Fecha" required>
                  <input type="date" className="input w-full" value={form.fecha_deadline} onChange={e => set('fecha_deadline', e.target.value)} />
                </FormField>
              )}
              <FormField label="Impacto de no ejecutar la iniciativa" help="Describe el impacto de no ejecutar la iniciativa y/o de no cumplir el deadline">
                <div className="relative">
                  <textarea className="input w-full h-24 pr-10" value={form.impacto_no_ejecutar} onChange={e => set('impacto_no_ejecutar', e.target.value)} />
                  <VoiceInputButton onText={(t) => set('impacto_no_ejecutar', form.impacto_no_ejecutar ? form.impacto_no_ejecutar + ' ' + t : t)} className="absolute bottom-2 right-2" />
                </div>
              </FormField>
            </>
          )}

          {step === 8 && (
            <>
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300 flex items-start gap-2 mb-4">
                <Info size={16} className="mt-0.5 flex-shrink-0" />
                <span>Detalla los requerimientos funcionales. Puedes agregar tantos como necesites. Cada requerimiento se seguira individualmente.</span>
              </div>
              {requirements.map((req, idx) => (
                <div key={idx} className="p-4 rounded-lg border border-slate-700 bg-slate-800/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-brand-400">RF-{String(req.item_number).padStart(3, '0')}</span>
                    <button onClick={() => removeReq(idx)} className="text-red-400 hover:text-red-300"><Trash2 size={14} /></button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">Modulo impactado</label>
                      <input className="input w-full text-sm" value={req.modulo_impactado} onChange={e => updateReq(idx, 'modulo_impactado', e.target.value)} placeholder="Ej: Data Lake / BigQuery" />
                    </div>
                    <div>
                      <label className="label text-xs">Quien</label>
                      <input className="input w-full text-sm" value={req.quien} onChange={e => updateReq(idx, 'quien', e.target.value)} placeholder="Responsables" />
                    </div>
                  </div>
                  <div>
                    <label className="label text-xs">Descripcion del requerimiento</label>
                    <div className="relative">
                      <textarea className="input w-full text-sm h-20 pr-10" value={req.descripcion_requerimiento} onChange={e => updateReq(idx, 'descripcion_requerimiento', e.target.value)} />
                      <VoiceInputButton onText={(t) => updateReq(idx, 'descripcion_requerimiento', req.descripcion_requerimiento ? req.descripcion_requerimiento + ' ' + t : t)} className="absolute bottom-2 right-2" />
                    </div>
                  </div>
                  <div>
                    <label className="label text-xs">Que se necesita</label>
                    <textarea className="input w-full text-sm h-16" value={req.que} onChange={e => updateReq(idx, 'que', e.target.value)} />
                  </div>
                  <div>
                    <label className="label text-xs">Criterios de aceptacion</label>
                    <textarea className="input w-full text-sm h-16" value={req.criterios_aceptacion} onChange={e => updateReq(idx, 'criterios_aceptacion', e.target.value)} />
                  </div>
                </div>
              ))}
              <button onClick={addRequirement} className="btn-ghost w-full flex items-center justify-center gap-2 py-3 border border-dashed border-slate-700">
                <Plus size={14} /> Agregar Requerimiento
              </button>
              <FormField label="Necesidades de migracion de datos" help="Incluye las necesidades respecto a migracion de datos entre sistemas. Indica N/A si no aplica">
                <textarea className="input w-full h-20" value={form.migracion_datos} onChange={e => set('migracion_datos', e.target.value)} placeholder="N/A si no aplica" />
              </FormField>
            </>
          )}

          {step === 9 && (
            <>
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-300">
                <p className="font-semibold mb-1">Revision final</p>
                <p>Revisa que la informacion sea correcta antes de enviar.</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-500">Titulo</span>
                  <span className="text-white font-medium">{form.title || '-'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-500">Sponsor</span>
                  <span className="text-white">{form.sponsor_name || '-'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-500">Lider de Proceso</span>
                  <span className="text-white">{form.lider_proceso_name || '-'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-500">Beneficio economico</span>
                  <span className="text-white">{form.beneficio_tipo || 'No especificado'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-500">Deadline</span>
                  <span className="text-white">{form.tiene_deadline ? form.fecha_deadline || 'Si' : 'No'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-500">Requerimientos funcionales</span>
                  <span className="text-white">{requirements.length}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => step > 1 && setStep(step - 1)}
          disabled={step === 1}
          className="btn-ghost flex items-center gap-1"
        >
          <ChevronLeft size={16} /> Anterior
        </button>
        <span className="text-xs text-slate-500">Paso {step} de {STEPS.length}</span>
        {step < STEPS.length ? (
          <button
            onClick={() => canNext() && setStep(step + 1)}
            disabled={!canNext()}
            className="btn-primary flex items-center gap-1"
          >
            Siguiente <ChevronRight size={16} />
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => handleSubmit(true)}
              disabled={createMutation.isPending}
              className="btn-ghost flex items-center gap-1"
            >
              <Save size={14} /> Guardar Borrador
            </button>
            <button
              onClick={() => handleSubmit(false)}
              disabled={createMutation.isPending}
              className="btn-primary flex items-center gap-1"
            >
              <Send size={14} /> Enviar Demanda
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
