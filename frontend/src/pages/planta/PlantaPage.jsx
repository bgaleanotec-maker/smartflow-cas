import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Factory, Loader2, X, Maximize2, Minimize2, Pencil, Flame,
  Palmtree, ShieldCheck, Clock, CalendarDays,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { dashboardAPI, usersAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import User360Drawer from '../../components/User360Drawer'

// ─── Estilos del semáforo industrial ─────────────────────────────────────────
const LIGHT = {
  rojo: {
    ring: 'ring-red-500', glow: 'shadow-[0_0_24px_rgba(239,68,68,0.35)]',
    dot: 'bg-red-500', label: 'Crítico', text: 'text-red-400',
    border: 'border-red-800/50',
  },
  amarillo: {
    ring: 'ring-amber-400', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.25)]',
    dot: 'bg-amber-400', label: 'Atención', text: 'text-amber-400',
    border: 'border-amber-700/40',
  },
  verde: {
    ring: 'ring-emerald-500', glow: 'shadow-[0_0_16px_rgba(16,185,129,0.2)]',
    dot: 'bg-emerald-500', label: 'Al día', text: 'text-emerald-400',
    border: 'border-slate-800',
  },
}

const AVAILABILITY = {
  disponible: null,
  vacaciones: { icon: Palmtree, label: 'Vacaciones', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/40' },
  incapacidad: { icon: ShieldCheck, label: 'Incapacidad', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
  viaje: { icon: CalendarDays, label: 'En viaje', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/40' },
}

function timeAgo(iso) {
  if (!iso) return 'Nunca'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 3600) return `hace ${Math.max(1, Math.round(diff / 60))} min`
  if (diff < 86400) return `hace ${Math.round(diff / 3600)} h`
  return `hace ${Math.round(diff / 86400)} días`
}

// ─── Modal admin: configurar puesto ──────────────────────────────────────────
function StationConfigModal({ station, users, onClose }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    position_title: station.position_title || '',
    availability: station.availability || 'disponible',
    backup_user_id: station.backup_user_id || '',
  })

  const saveMut = useMutation({
    mutationFn: () => usersAPI.update(station.user_id, {
      position_title: form.position_title.trim() || null,
      availability: form.availability,
      backup_user_id: form.backup_user_id ? parseInt(form.backup_user_id) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planta'] })
      toast.success('🏭 Puesto de trabajo actualizado')
      onClose()
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white text-sm">🏭 Puesto de {station.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); saveMut.mutate() }} className="p-5 space-y-3">
          <div>
            <label className="label">Puesto de trabajo</label>
            <input
              value={form.position_title}
              onChange={e => setForm(f => ({ ...f, position_title: e.target.value }))}
              className="input" placeholder="Ej: Liquidaciones, Saturación…" autoFocus
            />
          </div>
          <div>
            <label className="label">Disponibilidad</label>
            <select value={form.availability} onChange={e => setForm(f => ({ ...f, availability: e.target.value }))} className="input">
              <option value="disponible">✅ Disponible</option>
              <option value="vacaciones">🏖️ Vacaciones</option>
              <option value="incapacidad">🏥 Incapacidad</option>
              <option value="viaje">✈️ En viaje</option>
            </select>
          </div>
          <div>
            <label className="label">Backup (quién lo cubre)</label>
            <select value={form.backup_user_id} onChange={e => setForm(f => ({ ...f, backup_user_id: e.target.value }))} className="input">
              <option value="">Sin backup</option>
              {users.filter(u => u.user_id !== station.user_id).map(u => (
                <option key={u.user_id} value={u.user_id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saveMut.isPending} className="btn-primary flex-1">
              {saveMut.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tarjeta de puesto ───────────────────────────────────────────────────────
function StationCard({ s, presentation, isAdmin, onOpen, onConfig }) {
  const L = LIGHT[s.light] || LIGHT.verde
  const avail = AVAILABILITY[s.availability]
  const initials = s.name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  return (
    <div
      onClick={onOpen}
      className={`relative bg-slate-900 border ${L.border} rounded-2xl p-4 cursor-pointer
        transition-all hover:scale-[1.02] hover:${L.glow} ${s.light !== 'verde' ? L.glow : ''}`}
    >
      {/* Config (admin) */}
      {isAdmin && !presentation && (
        <button
          onClick={e => { e.stopPropagation(); onConfig() }}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-slate-600 hover:text-white hover:bg-slate-800 z-10"
          title="Configurar puesto"
        >
          <Pencil size={13} />
        </button>
      )}

      {/* Avatar + semáforo */}
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          <div className={`w-14 h-14 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 ring-2 ${L.ring} flex items-center justify-center text-base font-bold text-white`}>
            {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : initials}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${L.dot} border-2 border-slate-900 ${s.light === 'rojo' ? 'animate-pulse' : ''}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`font-semibold text-white truncate ${presentation ? 'text-base' : 'text-sm'}`}>{s.name}</p>
          <p className="text-[11px] text-cyan-300/90 truncate font-medium">
            {s.position_title || <span className="text-slate-600 italic">Sin puesto asignado</span>}
          </p>
          <p className={`text-[10px] ${L.text} font-semibold`}>{L.label}</p>
        </div>
      </div>

      {/* Chips estado */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {avail && (
          <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${avail.cls}`}>
            <avail.icon size={10} /> {avail.label}
            {s.backup && <span className="opacity-80">→ {s.backup.split(' ')[0]}</span>}
          </span>
        )}
        {!avail && s.backup && (
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-700 text-slate-400">
            🛡️ Backup: {s.backup.split(' ')[0]}
          </span>
        )}
        {s.streak > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-300">
            <Flame size={10} /> {s.streak}
          </span>
        )}
        {s.level && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300" title={`${s.level.xp} XP`}>
            {s.level.icon} Nv {s.level.level}
          </span>
        )}
      </div>

      {/* Próximas entregas */}
      {s.entregas?.length > 0 && (
        <div className="mt-3 space-y-1">
          {s.entregas.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                e.days_overdue > 0 ? 'bg-red-500' : 'bg-slate-600'
              }`} />
              <span className="text-slate-400 truncate flex-1">{e.title}</span>
              <span className={`flex-shrink-0 font-mono ${e.days_overdue > 0 ? 'text-red-400 font-bold' : 'text-slate-500'}`}>
                {e.due_date?.slice(5)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800/70 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><Clock size={10} /> {timeAgo(s.last_login)}</span>
        <span>
          {s.vencidas > 0 && <span className="text-red-400 font-bold">{s.vencidas} vencidas · </span>}
          {s.pendientes} pend. · <span className="text-emerald-400">{s.completadas_semana} ✓</span>
        </span>
      </div>
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function PlantaPage() {
  const { user } = useAuthStore()
  const isAdmin = ['admin', 'leader', 'lider_sr'].includes(user?.role)
  const [presentation, setPresentation] = useState(false)
  const [user360, setUser360] = useState(null)
  const [configStation, setConfigStation] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['planta'],
    queryFn: () => dashboardAPI.planta().then(r => r.data),
    refetchInterval: presentation ? 45_000 : 120_000,
  })

  const togglePresentation = () => {
    if (!presentation) {
      document.documentElement.requestFullscreen?.().catch(() => {})
    } else {
      document.exitFullscreen?.().catch(() => {})
    }
    setPresentation(p => !p)
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={26} className="animate-spin text-brand-400" /></div>
  }

  const r = data?.resumen || {}
  const stations = data?.stations || []

  return (
    <div className={presentation ? 'fixed inset-0 z-50 bg-slate-950 overflow-y-auto p-8' : 'space-y-5'}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between mb-5">
        <div>
          <h1 className={`font-bold text-white flex items-center gap-2 ${presentation ? 'text-2xl' : 'text-xl'}`}>
            <Factory size={presentation ? 26 : 22} className="text-cyan-400" /> Planta de Operaciones
          </h1>
          <p className="text-sm text-slate-400 mt-0.5 capitalize">
            {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Resumen Andon */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
            <span className="flex items-center gap-1 text-sm font-bold text-red-400">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> {r.rojo ?? 0}
            </span>
            <span className="text-slate-700">·</span>
            <span className="flex items-center gap-1 text-sm font-bold text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> {r.amarillo ?? 0}
            </span>
            <span className="text-slate-700">·</span>
            <span className="flex items-center gap-1 text-sm font-bold text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {r.verde ?? 0}
            </span>
            {r.vacaciones > 0 && (
              <>
                <span className="text-slate-700">·</span>
                <span className="text-sm text-sky-300">🏖️ {r.vacaciones}</span>
              </>
            )}
          </div>

          <button
            onClick={togglePresentation}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              presentation ? 'bg-slate-800 text-white' : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            }`}
            title="Modo presentación para reuniones"
          >
            {presentation ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span className="hidden sm:inline">{presentation ? 'Salir' : 'Presentar'}</span>
          </button>
        </div>
      </div>

      {/* Grid de puestos */}
      <div className={`grid gap-4 ${
        presentation
          ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
      }`}>
        {stations.map(s => (
          <StationCard
            key={s.user_id}
            s={s}
            presentation={presentation}
            isAdmin={isAdmin}
            onOpen={() => !presentation && setUser360(s.user_id)}
            onConfig={() => setConfigStation(s)}
          />
        ))}
      </div>

      {stations.length === 0 && (
        <p className="text-center text-slate-500 py-16">No hay usuarios activos</p>
      )}

      {/* Modales */}
      {configStation && (
        <StationConfigModal
          station={configStation}
          users={stations}
          onClose={() => setConfigStation(null)}
        />
      )}
      {user360 && <User360Drawer userId={user360} onClose={() => setUser360(null)} />}
    </div>
  )
}
