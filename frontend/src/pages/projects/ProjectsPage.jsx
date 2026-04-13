import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, FolderKanban, Calendar, Users, ChevronRight } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { projectsAPI, usersAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import clsx from 'clsx'

const STATUS_LABELS = {
  planificacion: { label: 'Planificación', color: 'bg-slate-700 text-slate-300' },
  activo: { label: 'Activo', color: 'bg-green-900/50 text-green-400 border border-green-800' },
  pausado: { label: 'Pausado', color: 'bg-yellow-900/50 text-yellow-400' },
  cerrado: { label: 'Cerrado', color: 'bg-slate-800 text-slate-500' },
}

function ProjectCard({ project, onClick }) {
  const st = STATUS_LABELS[project.status] || STATUS_LABELS.planificacion
  return (
    <div
      onClick={onClick}
      className="card hover:border-slate-600 cursor-pointer transition-all hover:bg-slate-800/50 group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-3 h-3 rounded-full flex-shrink-0 mt-1"
            style={{ background: project.color }}
          />
          <h3 className="font-semibold text-white group-hover:text-brand-300 transition-colors">
            {project.name}
          </h3>
        </div>
        <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
      </div>

      {project.description && (
        <p className="text-sm text-slate-400 mb-3 line-clamp-2">{project.description}</p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <span className={clsx('badge', st.color)}>{st.label}</span>

        {project.due_date && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Calendar size={12} />
            {project.due_date}
          </span>
        )}

        {project.members?.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Users size={12} />
            {project.members.length} miembros
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>Progreso</span>
          <span>{project.progress}%</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${project.progress}%`, background: project.color }}
          />
        </div>
      </div>
    </div>
  )
}

function CreateProjectModal({ onClose }) {
  const qc = useQueryClient()
  const { data: users } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => usersAPI.list({ is_active: true, limit: 100 }).then(r => r.data),
  })

  const { register, handleSubmit, formState: { isSubmitting } } = useForm()

  const mutation = useMutation({
    mutationFn: (data) => projectsAPI.create({
      ...data,
      leader_id: data.leader_id ? parseInt(data.leader_id) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['projects'])
      toast.success('Proyecto creado')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al crear proyecto'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">Nuevo proyecto</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-6 space-y-4">
          <div>
            <label className="label">Nombre del proyecto *</label>
            <input {...register('name', { required: true })} className="input" placeholder="Ej: Automatización de Liquidaciones" />
          </div>
          <div>
            <label className="label">Descripción</label>
            <textarea {...register('description')} className="input h-20 resize-none" placeholder="Descripción del proyecto..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Fecha inicio</label>
              <input {...register('start_date')} type="date" className="input" />
            </div>
            <div>
              <label className="label">Fecha límite</label>
              <input {...register('due_date')} type="date" className="input" />
            </div>
          </div>
          <div>
            <label className="label">Líder del proyecto</label>
            <select {...register('leader_id')} className="input">
              <option value="">Seleccionar líder...</option>
              {users?.map(u => (
                <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Color</label>
            <input {...register('color')} type="color" defaultValue="#6366f1" className="h-10 w-full rounded-lg bg-slate-800 border border-slate-700 cursor-pointer" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">Crear proyecto</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const canCreate = ['admin', 'leader'].includes(user?.role)

  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects', search, statusFilter],
    queryFn: () => projectsAPI.list({ search, status: statusFilter || undefined }).then(r => r.data),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Proyectos</h1>
          <p className="text-slate-400 text-sm mt-0.5">{projects?.length ?? 0} proyectos</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus size={16} /> Nuevo proyecto
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proyectos..."
            className="input pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="">Todos los estados</option>
          <option value="planificacion">Planificación</option>
          <option value="activo">Activo</option>
          <option value="pausado">Pausado</option>
          <option value="cerrado">Cerrado</option>
        </select>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card animate-pulse h-40 bg-slate-900" />
          ))}
        </div>
      ) : projects?.length === 0 ? (
        <div className="text-center py-16">
          <FolderKanban size={48} className="mx-auto mb-3 text-slate-700" />
          <p className="text-slate-400">No hay proyectos aún</p>
          {canCreate && (
            <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">
              <Plus size={16} /> Crear primer proyecto
            </button>
          )}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects?.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => navigate(`/projects/${p.id}`)}
            />
          ))}
        </div>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
