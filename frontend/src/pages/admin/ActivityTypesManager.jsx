/**
 * ActivityTypesManager — Admin UI to configure activity-type catalogs per team.
 * CAS → [BP, Juntas, BK, ...]   BO → [Liquidaciones, Provisiones, Notas, ...]
 * Stored via PUT /admin/activity-types as { CAS: [...], BO: [...] }
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Save, Loader2, Layers } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { adminAPI } from '../../services/api'

const TEAMS = [
  { key: 'CAS', label: 'CAS', color: '#6366f1', badge: 'bg-indigo-900/40 text-indigo-300 border-indigo-600/30' },
  { key: 'BO',  label: 'BO',  color: '#0ea5e9', badge: 'bg-sky-900/40 text-sky-300 border-sky-600/30' },
]

function TeamColumn({ team, types, onChange }) {
  const [newType, setNewType] = useState('')

  const add = () => {
    const v = newType.trim()
    if (!v) return
    if (types.includes(v)) { toast.error('Ya existe'); return }
    onChange([...types, v])
    setNewType('')
  }

  const remove = (t) => onChange(types.filter(x => x !== t))

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className={clsx('px-2 py-0.5 rounded text-xs font-bold border', team.badge)}>{team.label}</span>
        <span className="text-xs text-slate-500">{types.length} tipos</span>
      </div>
      <div className="flex gap-2 mb-3">
        <input
          value={newType}
          onChange={e => setNewType(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder={`Nuevo tipo para ${team.label}...`}
          className="input flex-1 text-sm"
        />
        <button onClick={add} disabled={!newType.trim()} className="btn-primary px-3"><Plus size={15} /></button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {types.length === 0 && <p className="text-xs text-slate-600">Sin tipos configurados</p>}
        {types.map(t => (
          <span key={t} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-slate-700/70 text-slate-200 border border-slate-600/50">
            <Layers size={10} className="text-slate-400" />
            {t}
            <button onClick={() => remove(t)} className="text-slate-500 hover:text-red-400 ml-0.5"><X size={11} /></button>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function ActivityTypesManager() {
  const qc = useQueryClient()
  const [local, setLocal] = useState({ CAS: [], BO: [] })
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const { data: saved, isLoading } = useQuery({
    queryKey: ['activity-types'],
    queryFn: () => adminAPI.getActivityTypes().then(r => r.data),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (saved && !loaded) {
      setLocal({ CAS: saved.CAS || [], BO: saved.BO || [] })
      setLoaded(true)
    }
  }, [saved, loaded])

  const saveMutation = useMutation({
    mutationFn: (config) => adminAPI.saveActivityTypes(config),
    onSuccess: () => {
      qc.invalidateQueries(['activity-types'])
      toast.success('Tipos de actividad guardados')
      setDirty(false)
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al guardar'),
  })

  const handleChange = (teamKey, types) => {
    setLocal(prev => ({ ...prev, [teamKey]: types }))
    setDirty(true)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-8 text-slate-500">
      <Loader2 size={18} className="animate-spin mr-2" /> Cargando...
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-400">
          Define los tipos de actividad que verá cada equipo al crear una tarea.
        </p>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-xs text-amber-400">● Sin guardar</span>}
          <button
            onClick={() => saveMutation.mutate(local)}
            disabled={saveMutation.isPending || !dirty}
            className="btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
          >
            {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Guardar
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {TEAMS.map(team => (
          <TeamColumn
            key={team.key}
            team={team}
            types={local[team.key] || []}
            onChange={(types) => handleChange(team.key, types)}
          />
        ))}
      </div>
    </div>
  )
}
