import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays, Plus, X, Loader2, Pencil, Trash2, Repeat, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api, { adminAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const cronogramaAPI = {
  list: (params = {}) => api.get('/cronograma', { params }),
  create: (data) => api.post('/cronograma', data),
  update: (id, data) => api.patch(`/cronograma/${id}`, data),
  delete: (id) => api.delete(`/cronograma/${id}`),
}

export const CATEGORIES = {
  junta: { label: 'Junta', emoji: '🏛️', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  comite: { label: 'Comité', emoji: '👔', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/40' },
  liquidacion: { label: 'Liquidación', emoji: '💰', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
  entrega: { label: 'Entrega', emoji: '📦', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40' },
  capacitacion: { label: 'Capacitación', emoji: '🎓', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  otro: { label: 'Otro', emoji: '📌', cls: 'bg-slate-600/20 text-slate-300 border-slate-600/40' },
}

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function countdown(d) {
  if (d === 0) return { text: '🔥 HOY', cls: 'bg-red-500/20 text-red-300 border-red-500/50 animate-pulse font-bold' }
  if (d === 1) return { text: 'Mañana', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40 font-semibold' }
  if (d < 0) return { text: `hace ${-d}d`, cls: 'bg-slate-700/40 text-slate-500 border-slate-700' }
  if (d <= 7) return { text: `en ${d} días`, cls: 'bg-amber-500/10 text-amber-400/90 border-amber-600/30' }
  return { text: `en ${d} días`, cls: 'bg-slate-800 text-slate-400 border-slate-700' }
}

function EventModal({ event, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    title: event?.title || '',
    description: event?.description || '',
    date: event?.original_date || event?.date || '',
    time: event?.time || '',
    category: event?.category || 'junta',
    repeat_monthly: event?.repeat_monthly || false,
    business_id: event?.business_id ? String(event.business_id) : '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const { data: businesses = [] } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => adminAPI.businesses().then(r => Array.isArray(r.data) ? r.data : r.data?.items || []),
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        date: form.date,
        time: form.time || null,
        category: form.category,
        emoji: CATEGORIES[form.category]?.emoji || '📌',
        repeat_monthly: form.repeat_monthly,
        business_id: form.business_id ? parseInt(form.business_id) : null,
      }
      return event ? cronogramaAPI.update(event.id, payload) : cronogramaAPI.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cronograma'] })
      toast.success(event ? '📅 Fecha actualizada' : '📅 Fecha agregada al cronograma')
      onClose()
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al guardar'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <CalendarDays size={15} className="text-cyan-400" /> {event ? 'Editar fecha' : 'Nueva fecha clave'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (form.title.trim() && form.date) saveMut.mutate() }} className="p-5 space-y-3">
          <div>
            <label className="label">Título *</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} className="input"
              placeholder="Ej: Junta directiva, Liquidación OE…" autoFocus />
          </div>
          <div>
            <label className="label">Tipo</label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.entries(CATEGORIES).map(([key, c]) => (
                <button
                  key={key} type="button" onClick={() => set('category', key)}
                  className={`px-2 py-1.5 rounded-lg text-[11px] border transition-all ${
                    form.category === key ? c.cls + ' ring-1 ring-current' : 'border-slate-700 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Fecha *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Hora</label>
              <input type="time" value={form.time} onChange={e => set('time', e.target.value)} className="input" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.repeat_monthly} onChange={e => set('repeat_monthly', e.target.checked)}
              className="w-4 h-4 rounded accent-cyan-500" />
            <span className="text-sm text-slate-300">🔁 Se repite el mismo día cada mes</span>
          </label>
          <div>
            <label className="label">Negocio (opcional)</label>
            <select value={form.business_id} onChange={e => set('business_id', e.target.value)} className="input">
              <option value="">Todo el equipo</option>
              {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Notas</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              className="input h-16 resize-none" placeholder="Agenda, enlace, sala…" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saveMut.isPending} className="btn-primary flex-1">
              {saveMut.isPending ? 'Guardando…' : event ? 'Guardar' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function CronogramaPage() {
  const { user } = useAuthStore()
  const canManage = ['admin', 'leader', 'lider_sr'].includes(user?.role)
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editEvent, setEditEvent] = useState(null)

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['cronograma'],
    queryFn: () => cronogramaAPI.list().then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  })

  const deleteMut = useMutation({
    mutationFn: (id) => cronogramaAPI.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cronograma'] }); toast.success('Fecha eliminada') },
  })

  // Agrupar por mes (de la fecha efectiva)
  const byMonth = events.reduce((acc, e) => {
    const [y, m] = e.date.split('-')
    const key = `${y}-${m}`
    acc[key] = acc[key] || { label: `${MONTHS[parseInt(m) - 1]} ${y}`, list: [] }
    acc[key].list.push(e)
    return acc
  }, {})

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarDays size={22} className="text-cyan-400" /> Cronograma
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Fechas clave del equipo: juntas, comités, liquidaciones y entregas
          </p>
        </div>
        {canManage && (
          <button onClick={() => { setEditEvent(null); setModalOpen(true) }} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Agregar fecha
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-cyan-400" /></div>
      ) : events.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-700 rounded-2xl">
          <CalendarDays size={40} className="mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">El cronograma está vacío</p>
          <p className="text-slate-500 text-sm mt-1">
            {canManage ? 'Agrega las juntas, comités y liquidaciones del equipo' : 'Cuando el líder agregue fechas clave aparecerán aquí'}
          </p>
        </div>
      ) : (
        Object.entries(byMonth).map(([key, month]) => (
          <section key={key}>
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">{month.label}</h2>
            <div className="space-y-2">
              {month.list.map(e => {
                const cat = CATEGORIES[e.category] || CATEGORIES.otro
                const cd = countdown(e.days_left)
                const [, , day] = e.date.split('-')
                return (
                  <div
                    key={e.id}
                    className={`group flex items-center gap-4 p-3.5 rounded-2xl border transition-all ${
                      e.is_today
                        ? 'bg-red-950/30 border-red-800/60 shadow-lg shadow-red-900/20'
                        : e.is_past ? 'bg-slate-900/40 border-slate-800/60 opacity-60' : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Día grande */}
                    <div className="flex-shrink-0 w-12 text-center">
                      <p className={`text-2xl font-extrabold leading-none ${e.is_today ? 'text-red-300' : 'text-white'}`}>{parseInt(day)}</p>
                      <p className="text-[9px] text-slate-500 uppercase">{month.label.split(' ')[0].slice(0, 3)}</p>
                    </div>

                    <div className="text-2xl flex-shrink-0">{e.emoji}</div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${e.is_past ? 'text-slate-500' : 'text-white'}`}>{e.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-[10px] px-2 py-0 rounded-full border ${cat.cls}`}>{cat.label}</span>
                        {e.time && (
                          <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Clock size={9} /> {e.time}</span>
                        )}
                        {e.repeat_monthly && (
                          <span className="text-[10px] text-cyan-400/80 flex items-center gap-0.5"><Repeat size={9} /> cada mes</span>
                        )}
                        {e.business && (
                          <span className="text-[10px]" style={{ color: e.business_color || '#94a3b8' }}>● {e.business}</span>
                        )}
                      </div>
                      {e.description && <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{e.description}</p>}
                    </div>

                    <span className={`flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full border ${cd.cls}`}>{cd.text}</span>

                    {canManage && (
                      <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditEvent(e); setModalOpen(true) }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800" title="Editar"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => confirm(`¿Eliminar "${e.title}" del cronograma?`) && deleteMut.mutate(e.id)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/30" title="Eliminar"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        ))
      )}

      {modalOpen && <EventModal event={editEvent} onClose={() => setModalOpen(false)} />}
    </div>
  )
}
