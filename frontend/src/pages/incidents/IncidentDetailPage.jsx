import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, DollarSign, Clock, User, MessageSquare, Loader2, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { incidentsAPI, demandsAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import VoiceInputButton from '../../components/voice/VoiceInputButton'
import clsx from 'clsx'

const SEVERITY_COLORS = {
  critico: '#ef4444', alto: '#f97316', medio: '#eab308', bajo: '#22c55e'
}

export default function IncidentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [comment, setComment] = useState('')
  const [newStatus, setNewStatus] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')

  const { data: incident, isLoading } = useQuery({
    queryKey: ['incident', id],
    queryFn: () => incidentsAPI.get(id).then(r => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: (data) => incidentsAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries(['incident', id])
      toast.success('Incidente actualizado')
      setNewStatus('')
    },
  })

  const commentMutation = useMutation({
    mutationFn: (c) => incidentsAPI.addComment(id, c),
    onSuccess: () => {
      qc.invalidateQueries(['incident', id])
      setComment('')
      toast.success('Comentario agregado')
    },
  })

  useEffect(() => {
    if (incident) {
      setRootCause(incident.root_cause || '')
      setResolutionNotes(incident.resolution_notes || '')
    }
  }, [incident])

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="animate-spin text-brand-400" size={28} />
    </div>
  )

  if (!incident) return <div>Incidente no encontrado</div>

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/incidents')} className="btn-ghost p-2 mt-0.5">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-mono text-slate-500">{incident.incident_number}</span>
            <span
              className="badge text-xs font-semibold"
              style={{ background: SEVERITY_COLORS[incident.severity] + '30', color: SEVERITY_COLORS[incident.severity], border: `1px solid ${SEVERITY_COLORS[incident.severity]}50` }}
            >
              {incident.severity.toUpperCase()}
            </span>
          </div>
          <h1 className="text-xl font-bold text-white">{incident.title}</h1>
        </div>
      </div>

      {/* Change status */}
      <div className="card">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-slate-400">Estado actual:</span>
          <span className="badge bg-slate-800 text-slate-300">{incident.status.replace('_', ' ')}</span>
          <select
            value={newStatus}
            onChange={e => setNewStatus(e.target.value)}
            className="input w-auto text-sm py-1"
          >
            <option value="">Cambiar estado...</option>
            <option value="en_investigacion">En investigación</option>
            <option value="resuelto">Resuelto</option>
            <option value="cerrado">Cerrado</option>
          </select>
          {newStatus && (
            <button
              onClick={() => updateMutation.mutate({ status: newStatus })}
              className="btn-primary py-1.5 text-sm"
            >
              Actualizar
            </button>
          )}
          <div className="ml-auto">
            <button
              onClick={async () => {
                if (!window.confirm('¿Escalar este incidente a una Gestion de Demanda?')) return
                try {
                  const res = await demandsAPI.create({
                    title: `[Escalado] ${incident.title}`,
                    situacion_actual: incident.description || '',
                    source_incident_id: incident.id,
                  })
                  toast.success('Demanda creada desde incidente')
                  navigate(`/demands/${res.data.id}`)
                } catch (err) {
                  toast.error('Error al crear demanda')
                }
              }}
              className="btn-ghost py-1.5 text-sm flex items-center gap-1 text-brand-400 hover:text-brand-300"
            >
              <FileText size={14} />
              Escalar a Demanda
            </button>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h3 className="font-medium text-white text-sm">Detalles</h3>
          {incident.description && <p className="text-sm text-slate-400">{incident.description}</p>}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Usuarios afectados</span>
              <span className="text-white">{incident.affected_users_count}</span>
            </div>
            {incident.detection_date && (
              <div className="flex justify-between">
                <span className="text-slate-500">Detectado</span>
                <span className="text-white">{new Date(incident.detection_date).toLocaleString('es-CO')}</span>
              </div>
            )}
            {incident.resolution_date && (
              <div className="flex justify-between">
                <span className="text-slate-500">Resuelto</span>
                <span className="text-green-400">{new Date(incident.resolution_date).toLocaleString('es-CO')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Economic impact */}
          {incident.has_economic_impact && (
            <div className="card border-amber-800/50 bg-amber-900/10">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={16} className="text-amber-400" />
                <h3 className="font-medium text-amber-400 text-sm">Impacto Económico</h3>
              </div>
              {incident.economic_impact_amount && (
                <p className="text-2xl font-bold text-white">
                  ${parseFloat(incident.economic_impact_amount).toLocaleString('es-CO')}
                </p>
              )}
              {incident.economic_impact_description && (
                <p className="text-xs text-slate-400 mt-1">{incident.economic_impact_description}</p>
              )}
            </div>
          )}

          {/* Responsible */}
          <div className="card">
            <h3 className="font-medium text-white text-sm mb-2">Responsables</h3>
            <div className="space-y-2">
              {incident.reporter && (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs">
                    {incident.reporter.full_name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs text-slate-300">{incident.reporter.full_name}</p>
                    <p className="text-xs text-slate-500">Reporter</p>
                  </div>
                </div>
              )}
              {incident.responsible && (
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-brand-700 flex items-center justify-center text-xs">
                    {incident.responsible.full_name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs text-slate-300">{incident.responsible.full_name}</p>
                    <p className="text-xs text-slate-500">Responsable</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Root cause & resolution */}
      <div className="card space-y-4">
        <div>
          <label className="label">Causa raíz</label>
          <div className="relative">
            <textarea
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
              onBlur={(e) => {
                if (e.target.value !== incident.root_cause)
                  updateMutation.mutate({ root_cause: e.target.value })
              }}
              className="input h-24 resize-none text-sm pr-10"
              placeholder="Análisis de causa raíz..."
            />
            <VoiceInputButton onText={(t) => setRootCause(p => p ? p + ' ' + t : t)} className="absolute bottom-2 right-2" />
          </div>
        </div>
        <div>
          <label className="label">Notas de resolución</label>
          <div className="relative">
            <textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              onBlur={(e) => {
                if (e.target.value !== incident.resolution_notes)
                  updateMutation.mutate({ resolution_notes: e.target.value })
              }}
              className="input h-24 resize-none text-sm pr-10"
              placeholder="Pasos tomados para resolver..."
            />
            <VoiceInputButton onText={(t) => setResolutionNotes(p => p ? p + ' ' + t : t)} className="absolute bottom-2 right-2" />
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card">
        <h3 className="font-medium text-white mb-4">Timeline</h3>
        <div className="space-y-3">
          {incident.timeline?.map(entry => (
            <div key={entry.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs flex-shrink-0">
                {entry.user?.full_name?.slice(0, 2).toUpperCase() || '?'}
              </div>
              <div>
                <p className="text-xs text-slate-300">
                  <strong>{entry.user?.full_name || 'Sistema'}</strong>{' '}
                  {entry.action === 'comment' ? 'comentó:' : entry.description}
                </p>
                {entry.action === 'comment' && entry.description && (
                  <p className="text-sm text-slate-400 mt-0.5 bg-slate-800 rounded-lg px-3 py-2">
                    {entry.description}
                  </p>
                )}
                <p className="text-xs text-slate-600 mt-0.5">
                  {new Date(entry.created_at).toLocaleString('es-CO')}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Add comment */}
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="flex gap-2">
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Agregar comentario..."
              className="input flex-1 text-sm"
              onKeyDown={e => {
                if (e.key === 'Enter' && comment.trim()) {
                  commentMutation.mutate(comment)
                }
              }}
            />
            <button
              onClick={() => comment.trim() && commentMutation.mutate(comment)}
              disabled={!comment.trim() || commentMutation.isPending}
              className="btn-secondary px-4"
            >
              <MessageSquare size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
