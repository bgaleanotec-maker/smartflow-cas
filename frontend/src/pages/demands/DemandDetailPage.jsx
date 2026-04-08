import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, FileText, Clock, MessageSquare, CalendarDays,
  DollarSign, GitBranch, Send, User, CheckCircle, AlertTriangle,
  Plus, Save, Loader2, Edit3, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { demandsAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const STATUS_CONFIG = {
  borrador: { label: 'Borrador', color: 'bg-slate-500/10 text-slate-400' },
  enviada: { label: 'Enviada', color: 'bg-blue-500/10 text-blue-400' },
  en_evaluacion: { label: 'En Evaluacion', color: 'bg-yellow-500/10 text-yellow-400' },
  aprobada: { label: 'Aprobada', color: 'bg-green-500/10 text-green-400' },
  en_ejecucion: { label: 'En Ejecucion', color: 'bg-brand-500/10 text-brand-400' },
  pausada: { label: 'Pausada', color: 'bg-orange-500/10 text-orange-400' },
  rechazada: { label: 'Rechazada', color: 'bg-red-500/10 text-red-400' },
  cerrada: { label: 'Cerrada', color: 'bg-emerald-500/10 text-emerald-400' },
}

const STATUS_FLOW = ['borrador', 'enviada', 'en_evaluacion', 'aprobada', 'en_ejecucion', 'cerrada']

const TABS = [
  { id: 'info', label: 'Informacion', icon: FileText },
  { id: 'requirements', label: 'Requerimientos', icon: CheckCircle },
  { id: 'timeline', label: 'Timeline', icon: Clock },
  { id: 'meetings', label: 'Reuniones', icon: CalendarDays },
  { id: 'economic', label: 'Economico', icon: DollarSign },
  { id: 'relations', label: 'Relaciones', icon: GitBranch },
]

function InfoRow({ label, value }) {
  if (!value && value !== 0 && value !== false) return null
  return (
    <div className="flex justify-between py-2 border-b border-slate-800/50">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-white text-right max-w-[60%]">{String(value)}</span>
    </div>
  )
}

export default function DemandDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('info')
  const [comment, setComment] = useState('')
  const [radicado, setRadicado] = useState('')
  const [meetingForm, setMeetingForm] = useState({ title: '', content: '', meeting_date: '' })
  const [showMeetingForm, setShowMeetingForm] = useState(false)

  const { data: demand, isLoading } = useQuery({
    queryKey: ['demand', id],
    queryFn: () => demandsAPI.get(id).then(r => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: (data) => demandsAPI.update(id, data),
    onSuccess: () => { qc.invalidateQueries(['demand', id]); toast.success('Actualizado') },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const timelineMutation = useMutation({
    mutationFn: (data) => demandsAPI.addTimeline(id, data),
    onSuccess: () => { qc.invalidateQueries(['demand', id]); setComment(''); toast.success('Comentario agregado') },
  })

  const meetingMutation = useMutation({
    mutationFn: (data) => demandsAPI.addMeetingNote(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['demand', id])
      setShowMeetingForm(false)
      setMeetingForm({ title: '', content: '', meeting_date: '' })
      toast.success('Nota de reunion agregada')
    },
  })

  const canManage = ['admin', 'leader', 'herramientas'].includes(user?.role)
  const isOwner = demand?.created_by_id === user?.id

  if (isLoading) return <div className="text-center py-12 text-slate-500"><Loader2 className="animate-spin mx-auto" /></div>
  if (!demand) return <div className="text-center py-12 text-slate-500">Demanda no encontrada</div>

  const statusCfg = STATUS_CONFIG[demand.status] || STATUS_CONFIG.borrador

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/demands')} className="text-sm text-slate-500 hover:text-slate-300 flex items-center gap-1 mb-2">
          <ChevronLeft size={14} /> Demandas
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-mono text-slate-500">{demand.demand_number}</span>
              {demand.radicado && (
                <span className="text-sm font-mono text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded">{demand.radicado}</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
            </div>
            <h1 className="text-xl font-bold text-white">{demand.title}</h1>
            <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
              {demand.created_by && <span>Creado por: {demand.created_by.full_name}</span>}
              {demand.assigned_to && <span>Asignado a: {demand.assigned_to.full_name}</span>}
              <span>{new Date(demand.created_at).toLocaleDateString('es-CO')}</span>
            </div>
          </div>

          {/* Quick actions */}
          {canManage && (
            <div className="flex flex-wrap gap-2">
              {!demand.radicado && (
                <div className="flex gap-1">
                  <input
                    className="input text-sm py-1 w-32"
                    placeholder="Radicado..."
                    value={radicado}
                    onChange={e => setRadicado(e.target.value)}
                  />
                  <button
                    onClick={() => radicado && updateMutation.mutate({ radicado })}
                    className="btn-primary text-sm px-2 py-1"
                  >
                    <Save size={12} />
                  </button>
                </div>
              )}
              <select
                value={demand.status}
                onChange={e => updateMutation.mutate({ status: e.target.value })}
                className="input text-sm py-1"
              >
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-800 pb-px">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === 'info' && (
          <div className="space-y-1">
            <InfoRow label="Vicepresidencia" value={demand.vicepresidencia?.name} />
            <InfoRow label="Telefono" value={demand.telefono_contacto} />
            <InfoRow label="Sponsor" value={demand.sponsor_name} />
            <InfoRow label="Lider de Proceso" value={demand.lider_proceso_name} />
            <InfoRow label="Responsable Negocio" value={demand.responsable_negocio_name} />
            <InfoRow label="Email Responsable" value={demand.responsable_negocio_email} />
            <InfoRow label="Pilares Estrategicos" value={demand.pilares_estrategicos?.name} />
            <InfoRow label="Mejoras en Procesos" value={demand.mejoras_procesos?.name} />
            <InfoRow label="Usuarios Impactados" value={demand.usuarios_impactados?.name} />
            <InfoRow label="Riesgo Operacional" value={demand.reduce_riesgo?.name} />
            <InfoRow label="Impacta SOX" value={demand.impacta_sox ? 'Si' : demand.impacta_sox === false ? 'No' : null} />
            <InfoRow label="Regulatorio" value={demand.es_regulatorio ? 'Si' : demand.es_regulatorio === false ? 'No' : null} />
            <InfoRow label="Deadline" value={demand.fecha_deadline} />
            {demand.situacion_actual && (
              <div className="pt-3">
                <h3 className="text-xs text-slate-500 mb-1">Situacion Actual</h3>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{demand.situacion_actual}</p>
              </div>
            )}
            {demand.justificacion_pilares && (
              <div className="pt-3">
                <h3 className="text-xs text-slate-500 mb-1">Justificacion Pilares</h3>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{demand.justificacion_pilares}</p>
              </div>
            )}
            {demand.impacto_no_ejecutar && (
              <div className="pt-3">
                <h3 className="text-xs text-slate-500 mb-1">Impacto de No Ejecutar</h3>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{demand.impacto_no_ejecutar}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'requirements' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">{demand.requirements?.length || 0} Requerimientos Funcionales</h3>
            </div>
            {demand.requirements?.map(req => (
              <div key={req.id} className="p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-brand-400">RF-{String(req.item_number).padStart(3, '0')}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    req.status === 'completado' ? 'bg-green-500/10 text-green-400' :
                    req.status === 'en_progreso' ? 'bg-blue-500/10 text-blue-400' :
                    req.status === 'cancelado' ? 'bg-red-500/10 text-red-400' :
                    'bg-slate-500/10 text-slate-400'
                  }`}>{req.status}</span>
                </div>
                {req.modulo_impactado && <p className="text-xs text-slate-500 mb-1">Modulo: {req.modulo_impactado}</p>}
                {req.descripcion_requerimiento && <p className="text-sm text-slate-300 whitespace-pre-wrap">{req.descripcion_requerimiento}</p>}
                {req.criterios_aceptacion && (
                  <div className="mt-2 pt-2 border-t border-slate-700">
                    <p className="text-xs text-slate-500 mb-1">Criterios de Aceptacion:</p>
                    <p className="text-xs text-slate-400 whitespace-pre-wrap">{req.criterios_aceptacion}</p>
                  </div>
                )}
              </div>
            ))}
            {(!demand.requirements || demand.requirements.length === 0) && (
              <p className="text-sm text-slate-500 text-center py-6">No hay requerimientos funcionales</p>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="space-y-4">
            {/* Add comment */}
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Agregar comentario, solicitar informacion..."
                onKeyDown={e => e.key === 'Enter' && comment.trim() && timelineMutation.mutate({ action: 'comment', description: comment })}
              />
              <button
                onClick={() => comment.trim() && timelineMutation.mutate({ action: 'comment', description: comment })}
                disabled={!comment.trim()}
                className="btn-primary px-3"
              >
                <Send size={14} />
              </button>
            </div>
            {/* Timeline entries */}
            <div className="space-y-3">
              {demand.timeline?.map(entry => (
                <div key={entry.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {entry.action === 'status_change' ? <Clock size={12} className="text-yellow-400" /> :
                     entry.action === 'comment' ? <MessageSquare size={12} className="text-blue-400" /> :
                     entry.action === 'assignment' ? <User size={12} className="text-brand-400" /> :
                     <Edit3 size={12} className="text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{entry.user_name || 'Sistema'}</span>
                      <span className="text-xs text-slate-600">{new Date(entry.created_at).toLocaleString('es-CO')}</span>
                    </div>
                    <p className="text-sm text-slate-400 mt-0.5">{entry.description}</p>
                  </div>
                </div>
              ))}
              {(!demand.timeline || demand.timeline.length === 0) && (
                <p className="text-sm text-slate-500 text-center py-4">Sin actividad registrada</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'meetings' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Notas de Reunion</h3>
              <button onClick={() => setShowMeetingForm(!showMeetingForm)} className="btn-ghost text-sm flex items-center gap-1">
                <Plus size={14} /> Nueva Nota
              </button>
            </div>
            {showMeetingForm && (
              <div className="p-4 rounded-lg border border-slate-700 bg-slate-800/50 space-y-3">
                <input className="input w-full text-sm" placeholder="Titulo de la reunion" value={meetingForm.title} onChange={e => setMeetingForm(p => ({ ...p, title: e.target.value }))} />
                <input type="datetime-local" className="input w-full text-sm" value={meetingForm.meeting_date} onChange={e => setMeetingForm(p => ({ ...p, meeting_date: e.target.value }))} />
                <textarea className="input w-full text-sm h-24" placeholder="Notas, acuerdos, tareas..." value={meetingForm.content} onChange={e => setMeetingForm(p => ({ ...p, content: e.target.value }))} />
                <button
                  onClick={() => meetingForm.title && meetingForm.meeting_date && meetingMutation.mutate(meetingForm)}
                  disabled={!meetingForm.title || !meetingForm.meeting_date}
                  className="btn-primary text-sm"
                >
                  Guardar Nota
                </button>
              </div>
            )}
            {demand.meeting_notes?.map(note => (
              <div key={note.id} className="p-4 rounded-lg border border-slate-700 bg-slate-800/50">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-white">{note.title}</h4>
                  <span className="text-xs text-slate-500">{new Date(note.meeting_date).toLocaleDateString('es-CO')}</span>
                </div>
                {note.content && <p className="text-sm text-slate-400 whitespace-pre-wrap">{note.content}</p>}
                {note.created_by_name && <p className="text-xs text-slate-600 mt-2">Por: {note.created_by_name}</p>}
              </div>
            ))}
            {(!demand.meeting_notes || demand.meeting_notes.length === 0) && !showMeetingForm && (
              <p className="text-sm text-slate-500 text-center py-4">No hay notas de reunion</p>
            )}
          </div>
        )}

        {activeTab === 'economic' && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="text-center p-4 rounded-lg bg-slate-800">
                <p className="text-xs text-slate-500">Tipo de Beneficio</p>
                <p className="text-lg font-bold text-white mt-1 capitalize">{demand.beneficio_tipo?.replace('_', ' ') || 'No definido'}</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-slate-800">
                <p className="text-xs text-slate-500">Monto Estimado</p>
                <p className="text-lg font-bold text-green-400 mt-1">
                  {demand.beneficio_monto_estimado ? `$${Number(demand.beneficio_monto_estimado).toLocaleString('es-CO')}` : '-'}
                </p>
              </div>
              <div className="text-center p-4 rounded-lg bg-slate-800">
                <p className="text-xs text-slate-500">Monto Real</p>
                <p className="text-lg font-bold text-brand-400 mt-1">
                  {demand.beneficio_monto_real ? `$${Number(demand.beneficio_monto_real).toLocaleString('es-CO')}` : 'Pendiente'}
                </p>
              </div>
            </div>
            {canManage && (
              <div className="p-4 rounded-lg border border-slate-700">
                <h4 className="text-sm font-medium text-white mb-2">Actualizar Monto Real</h4>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="input flex-1 text-sm"
                    placeholder="Monto real en COP"
                    id="beneficio-real"
                  />
                  <button
                    onClick={() => {
                      const val = document.getElementById('beneficio-real').value
                      if (val) updateMutation.mutate({ beneficio_monto_real: Number(val) })
                    }}
                    className="btn-primary text-sm"
                  >
                    Actualizar
                  </button>
                </div>
              </div>
            )}
            {demand.oportunidad_negocio && (
              <div>
                <h4 className="text-xs text-slate-500 mb-1">Descripcion de Oportunidad</h4>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{demand.oportunidad_negocio}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'relations' && (
          <div className="space-y-4">
            {demand.parent_demand_id && (
              <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                <p className="text-xs text-slate-500 mb-1">Demanda Padre</p>
                <button onClick={() => navigate(`/demands/${demand.parent_demand_id}`)} className="text-sm text-brand-400 hover:text-brand-300">
                  Ver demanda padre #{demand.parent_demand_id}
                </button>
              </div>
            )}
            {demand.children_count > 0 && (
              <div>
                <h4 className="text-sm font-medium text-white mb-2">Demandas Hijas ({demand.children_count})</h4>
                <p className="text-xs text-slate-500">Las demandas hijas se muestran en la lista principal filtradas por padre.</p>
              </div>
            )}
            {demand.related_project_id && (
              <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                <p className="text-xs text-slate-500 mb-1">Proyecto Asociado</p>
                <button onClick={() => navigate(`/projects/${demand.related_project_id}`)} className="text-sm text-brand-400 hover:text-brand-300">
                  Ver proyecto #{demand.related_project_id}
                </button>
              </div>
            )}
            {demand.source_incident_id && (
              <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/50">
                <p className="text-xs text-slate-500 mb-1">Incidente de Origen</p>
                <button onClick={() => navigate(`/incidents/${demand.source_incident_id}`)} className="text-sm text-brand-400 hover:text-brand-300">
                  Ver incidente #{demand.source_incident_id}
                </button>
              </div>
            )}
            {canManage && (
              <div className="p-3 rounded-lg border border-dashed border-slate-700">
                <p className="text-xs text-slate-500">Puedes asociar esta demanda a un proyecto desde el campo "related_project_id" al editar la demanda.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
