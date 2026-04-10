import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Trash2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { bpAPI } from '../../../services/api'

const PRESET_COLORS = [
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#10b981', label: 'Verde' },
  { hex: '#f59e0b', label: 'Ámbar' },
  { hex: '#ef4444', label: 'Rojo' },
  { hex: '#8b5cf6', label: 'Violeta' },
  { hex: '#06b6d4', label: 'Cyan' },
]

const STATUS_OPTIONS = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'alcanzado', label: 'Alcanzado' },
  { value: 'perdido', label: 'Perdido' },
]

export default function BPMilestoneModal({ bpId, milestone, onClose, onSaved }) {
  const qc = useQueryClient()
  const isEdit = !!milestone?.id

  const [form, setForm] = useState({
    title: '',
    description: '',
    target_date: '',
    color: '#6366f1',
    status: 'pendiente',
    order_index: 0,
  })

  useEffect(() => {
    if (milestone) {
      setForm({
        title: milestone.title || '',
        description: milestone.description || '',
        target_date: milestone.target_date || '',
        color: milestone.color || '#6366f1',
        status: milestone.status || 'pendiente',
        order_index: milestone.order_index || 0,
      })
    }
  }, [milestone])

  const createMutation = useMutation({
    mutationFn: (data) => bpAPI.createMilestone(bpId, data),
    onSuccess: () => {
      qc.invalidateQueries(['bp-milestones', String(bpId)])
      toast.success('Hito creado')
      onSaved?.()
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const updateMutation = useMutation({
    mutationFn: (data) => bpAPI.updateMilestone(bpId, milestone.id, data),
    onSuccess: () => {
      qc.invalidateQueries(['bp-milestones', String(bpId)])
      toast.success('Hito actualizado')
      onSaved?.()
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => bpAPI.deleteMilestone(bpId, milestone.id),
    onSuccess: () => {
      qc.invalidateQueries(['bp-milestones', String(bpId)])
      toast.success('Hito eliminado')
      onSaved?.()
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('El título es obligatorio')
    if (!form.target_date) return toast.error('La fecha objetivo es obligatoria')
    const payload = {
      ...form,
      order_index: parseInt(form.order_index) || 0,
    }
    if (isEdit) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  const isMutating = createMutation.isPending || updateMutation.isPending

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-slate-100">
            {isEdit ? 'Editar Hito' : 'Nuevo Hito'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className="label">Título *</label>
            <input
              type="text"
              className="input"
              placeholder="Ej: Lanzamiento Q2 2026"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="label">Descripción</label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="Descripción del hito..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {/* Date + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha objetivo *</label>
              <input
                type="date"
                className="input"
                value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                required
              />
            </div>
            {isEdit && (
              <div>
                <label className="label">Estado</label>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Color picker */}
          <div>
            <label className="label">Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={c.label}
                  onClick={() => setForm({ ...form, color: c.hex })}
                  className={clsx(
                    'w-7 h-7 rounded-full transition-all border-2',
                    form.color === c.hex ? 'border-white scale-110' : 'border-transparent opacity-70 hover:opacity-100',
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
              {/* Custom color */}
              <div className="relative">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent p-0 opacity-0 absolute inset-0"
                />
                <div
                  className="w-7 h-7 rounded-full border-2 border-dashed border-slate-500 flex items-center justify-center text-slate-400 text-xs cursor-pointer hover:border-slate-300 transition-colors"
                  title="Color personalizado"
                >
                  +
                </div>
              </div>
              <span className="text-xs text-slate-500 font-mono">{form.color}</span>
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div
              className="w-4 h-4 rotate-45 flex-shrink-0"
              style={{ backgroundColor: form.color }}
            />
            <span className="text-sm text-slate-300 font-medium">
              {form.title || 'Vista previa del hito'}
            </span>
            {form.target_date && (
              <span className="text-xs text-slate-500 ml-auto">
                {new Date(form.target_date + 'T00:00:00').toLocaleDateString('es-CO', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {isEdit && (
              <button
                type="button"
                onClick={() => { if (window.confirm('¿Eliminar este hito?')) deleteMutation.mutate() }}
                disabled={deleteMutation.isPending}
                className="btn-secondary text-red-400 hover:text-red-300 border-red-500/30 px-3 flex items-center gap-1.5"
              >
                {deleteMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isMutating}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {isMutating && <Loader2 size={13} className="animate-spin" />}
              {isEdit ? 'Actualizar' : 'Crear Hito'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
