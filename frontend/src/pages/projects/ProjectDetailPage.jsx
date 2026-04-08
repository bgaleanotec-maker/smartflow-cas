import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ArrowLeft, Users, Calendar, MoreVertical } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { projectsAPI, tasksAPI, adminAPI } from '../../services/api'
import clsx from 'clsx'

// Simple Kanban Board
function KanbanBoard({ tasks, statuses, projectId }) {
  const qc = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: ({ taskId, statusId }) => tasksAPI.update(taskId, { status_id: statusId }),
    onSuccess: () => qc.invalidateQueries(['project-tasks', projectId]),
  })

  const tasksByStatus = (statusId) => tasks?.filter(t => t.status_id === statusId) || []

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {statuses?.map(status => (
        <div key={status.id} className="flex-shrink-0 w-72">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full" style={{ background: status.color }} />
            <span className="text-sm font-medium text-slate-300">{status.name}</span>
            <span className="badge bg-slate-800 text-slate-500 ml-auto">
              {tasksByStatus(status.id).length}
            </span>
          </div>
          <div className="space-y-2 min-h-24">
            {tasksByStatus(status.id).map(task => (
              <div
                key={task.id}
                className="card py-3 cursor-pointer hover:border-slate-600 transition-all"
              >
                <p className="text-sm font-medium text-slate-200 mb-1">{task.title}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{task.task_number}</span>
                  {task.assignee && (
                    <div className="w-6 h-6 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold">
                      {task.assignee.full_name?.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                {/* Move buttons */}
                <div className="flex gap-1 mt-2">
                  {statuses.filter(s => s.id !== status.id).slice(0, 2).map(s => (
                    <button
                      key={s.id}
                      onClick={() => updateMutation.mutate({ taskId: task.id, statusId: s.id })}
                      className="text-xs px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      → {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <AddTaskButton projectId={projectId} statusId={status.id} />
          </div>
        </div>
      ))}
    </div>
  )
}

function AddTaskButton({ projectId, statusId }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const { register, handleSubmit, reset } = useForm()

  const mutation = useMutation({
    mutationFn: (data) => tasksAPI.create({ ...data, project_id: projectId, status_id: statusId }),
    onSuccess: () => {
      qc.invalidateQueries(['project-tasks', projectId])
      reset()
      setOpen(false)
      toast.success('Tarea creada')
    },
  })

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 justify-center"
      >
        <Plus size={13} /> Agregar tarea
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="card py-2 px-3 space-y-2">
      <input
        {...register('title', { required: true })}
        className="input text-sm py-1.5"
        placeholder="Título de la tarea..."
        autoFocus
      />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary text-xs py-1 px-3">Crear</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost text-xs py-1 px-3">Cancelar</button>
      </div>
    </form>
  )
}

export default function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsAPI.get(id).then(r => r.data),
  })

  const { data: tasks } = useQuery({
    queryKey: ['project-tasks', id],
    queryFn: () => tasksAPI.list({ project_id: id, limit: 200 }).then(r => r.data),
  })

  const { data: statuses } = useQuery({
    queryKey: ['task-statuses'],
    queryFn: () => adminAPI.taskStatuses().then(r => r.data),
  })

  if (!project) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/projects')} className="btn-ghost p-2 mt-0.5">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full" style={{ background: project.color }} />
            <h1 className="text-2xl font-bold text-white">{project.name}</h1>
          </div>
          {project.description && (
            <p className="text-slate-400 text-sm mt-1 ml-7">{project.description}</p>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-4 ml-12">
        {project.leader && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Users size={14} />
            <span>Líder: <strong className="text-slate-200">{project.leader.full_name}</strong></span>
          </div>
        )}
        {project.due_date && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Calendar size={14} />
            <span>Vence: <strong className="text-slate-200">{project.due_date}</strong></span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>Progreso: <strong className="text-slate-200">{project.progress}%</strong></span>
        </div>
      </div>

      {/* Kanban */}
      <div>
        <h2 className="font-semibold text-white mb-4">Tablero Kanban</h2>
        <KanbanBoard tasks={tasks} statuses={statuses} projectId={id} />
      </div>
    </div>
  )
}
