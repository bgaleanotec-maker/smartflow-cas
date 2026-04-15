import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, DollarSign, Clock, User, MessageSquare, Loader2, FileText, Pencil, Trash2, X, AlertTriangle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { incidentsAPI, demandsAPI, adminAPI, usersAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import VoiceInputButton from '../../components/voice/VoiceInputButton'
import clsx from 'clsx'

const SEVERITY_COLORS = {
  critico: '#ef4444', alto: '#f97316', medio: '#eab308', bajo: '#22c55e'
}

function EditIncidentModal({ incident, onClose }) {
  const qc = useQueryClient()
  const { data: categories } = useQuery({
    queryKey: ['incident-categories'],
    queryFn: () => adminAPI.incidentCategories().then(r => r.data),
  })
  const { data: businesses } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => adminAPI.businesses().then(r => r.data),
  })
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersAPI.list().then(r => r.data?.items || r.data || []),
  })

  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: {
      title: incident.title || '',
      description: incident.description || '',
      severity: incident.severity || 'medio',
      status: incident.status || 'abierto',
      category_id: incident.category_id || '',
      business_id: incident.business_id || '',
      responsible_id: incident.responsible_id || incident.responsible?.id || '',
      affected_users_count: incident.affected_users_count || 0,
      has_economic_impact: incident.has_economic_impact || false,
      economic_impact_amount: incident.economic_impact_amount || '',
      economic_impact_description: incident.economic_impact_description || '',
    }
  })
  const hasEconomicImpact = watch('has_economic_impact')

  const mutation = useMutation({
    mutationFn: (data) => incidentsAPI.update(incident.id, {
      ...data,
      has_economic_impact: data.has_economic_impact === 'true' || data.has_economic_impact === true,
      affected_users_count: parseInt(data.affected_users_count) || 0,
      category_id: data.category_id ? parseInt(data.category_id) : null,
      business_id: data.business_id ? parseInt(data.business_id) : null,
      responsible_id: data.responsible_id ? parseInt(data.responsible_id) : null,
      economic_impact_amount: data.economic_impact_amount ? parseFloat(data.economic_impact_amount) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['incidents'])
      qc.invalidateQueries(['incident', String(incident.id)])
      toast.success('Incidente actualizado')
      onClose()
    },
    onError: (err) => {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail)
        ? detail.map(d => d.msg).join(', ')
        : (typeof detail === 'string' ? detail : 'Error al actualizar incidente')
      toast.error(msg)
    },
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Pencil size={16} className="text-blue-400" /> Editar incidente {incident.incident_number}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-6 space-y-4">
          <div>
            <label className="label">Título *</label>
            <input {...register('title', { required: true })} className="input" />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea {...register('description')} className="input h-20 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Severidad</label>
              <select {...register('severity')} className="input">
                <option value="bajo">Bajo</option>
                <option value="medio">Medio</option>
                <option value="alto">Alto</option>
                <option value="critico">Crítico</option>
              </select>
            </div>
            <div>
              <label className="label">Estado</label>
              <select {...register('status')} className="input">
                <option value="abierto">Abierto</option>
                <option value="en_investigacion">En investigación</option>
                <option value="resuelto">Resuelto</option>
                <option value="cerrado">Cerrado</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Categoría</label>
              <select {...register('category_id')} className="input">
                <option value="">Sin categoría</option>
                {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Negocio</label>
              <select {...register('business_id')} className="input">
                <option value="">Sin negocio</option>
                {businesses?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Responsable</label>
            <select {...register('responsible_id')} className="input">
              <option value="">Sin asignar</option>
              {users?.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Usuarios afectados</label>
            <input {...register('affected_users_count')} type="number" min="0" className="input" />
          </div>
          <div className="flex items-center gap-3">
            <input {...register('has_economic_impact')} type="checkbox" id="eco-edit" className="w-4 h-4 accent-brand-500" />
            <label htmlFor="eco-edit" className="text-sm text-slate-300">¿Tiene impacto económico?</label>
          </div>
          {hasEconomicImpact && (
            <div>
              <label className="label">Monto estimado ($)</label>
              <input {...register('economic_impact_amount')} type="number" step="0.01" className="input" placeholder="0.00" />
              <textarea {...register('economic_impact_description')} className="input mt-2 h-16 resize-none" placeholder="Describe el impacto económico..." />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={isSubmitting || mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function IncidentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [comment, setComment] = useState('')
  const [newStatus, setNewStatus] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

  const deleteMutation = useMutation({
    mutationFn: () => incidentsAPI.delete(id),
    onSuccess: () => {
      toast.success('Incidente eliminado')
      navigate('/incidents')
    },
    onError: (err) => toast.error(err?.response?.data?.detail || 'Error al eliminar incidente'),
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
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => setShowEdit(true)}
              className="btn-ghost text-sm flex items-center gap-1.5 text-blue-400 hover:text-blue-300"
            >
              <Pencil size={14} /> Editar
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="btn-ghost text-sm flex items-center gap-1.5 text-red-400 hover:text-red-300"
            >
              <Trash2 size={14} /> Eliminar
            </button>
          </div>
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

      {showEdit && (
        <EditIncidentModal incident={incident} onClose={() => setShowEdit(false)} />
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-900/50 rounded-xl w-full max-w-sm shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
              <h3 className="font-semibold text-slate-100">¿Eliminar incidente?</h3>
            </div>
            <p className="text-sm text-slate-400 mb-2">
              <span className="font-mono text-slate-300">{incident.incident_number}</span> — {incident.title}
            </p>
            <p className="text-xs text-slate-500 mb-6">Esta acción no se puede deshacer.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn-secondary">Cancelar</button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
