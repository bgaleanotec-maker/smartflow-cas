import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, UserCheck, UserX, KeyRound, Edit2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import { usersAPI, adminAPI } from '../../services/api'
import clsx from 'clsx'

const ROLE_BADGES = {
  admin: 'bg-purple-900/50 text-purple-400 border border-purple-800',
  leader: 'bg-brand-900/50 text-brand-400 border border-brand-800',
  member: 'bg-slate-800 text-slate-400',
  negocio: 'bg-emerald-900/50 text-emerald-400 border border-emerald-800',
  herramientas: 'bg-amber-900/50 text-amber-400 border border-amber-800',
}

const TEAM_BADGES = {
  BO: 'bg-blue-900/50 text-blue-400',
  CAS: 'bg-green-900/50 text-green-400',
}

function CreateUserModal({ onClose }) {
  const qc = useQueryClient()
  const { data: businesses } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => adminAPI.businesses().then(r => r.data),
  })

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { role: 'member', contract_type: 'indefinido' }
  })

  const contractType = watch('contract_type')

  const mutation = useMutation({
    mutationFn: (data) => usersAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries(['users'])
      toast.success('Usuario creado. Se enviará email con credenciales.')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al crear usuario'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="font-semibold text-white">Crear usuario</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">✕</button>
        </div>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Nombre completo *</label>
              <input {...register('full_name', { required: true })} className="input" placeholder="Juan Pérez García" />
            </div>
            <div>
              <label className="label">Correo electrónico *</label>
              <input {...register('email', { required: true })} type="email" className="input" placeholder="juan@empresa.com" />
              {errors.email && <p className="text-xs text-red-400 mt-1">Requerido</p>}
            </div>
            <div>
              <label className="label">Teléfono / WhatsApp</label>
              <input {...register('phone')} className="input" placeholder="+57 300 000 0000" />
            </div>
            <div>
              <label className="label">Rol</label>
              <select {...register('role')} className="input">
                <option value="member">Miembro</option>
                <option value="leader">Líder</option>
                <option value="admin">Admin</option>
                <option value="negocio">Negocio</option>
                <option value="herramientas">Herramientas</option>
              </select>
            </div>
            <div>
              <label className="label">Equipo</label>
              <select {...register('team')} className="input">
                <option value="">Sin equipo</option>
                <option value="BO">BO (Back Office)</option>
                <option value="CAS">CAS</option>
              </select>
            </div>
            <div>
              <label className="label">Negocio principal</label>
              <select {...register('main_business_id')} className="input">
                <option value="">Sin negocio</option>
                {businesses?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Negocio secundario</label>
              <select {...register('secondary_business_id')} className="input">
                <option value="">Sin negocio</option>
                {businesses?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tipo de contrato</label>
              <select {...register('contract_type')} className="input">
                <option value="indefinido">Indefinido</option>
                <option value="fijo">Fijo</option>
                <option value="temporal">Temporal</option>
              </select>
            </div>
            <div>
              <label className="label">Fecha inicio contrato</label>
              <input {...register('contract_start_date')} type="date" className="input" />
            </div>
            {contractType !== 'indefinido' && (
              <div>
                <label className="label">Fecha renovación</label>
                <input {...register('contract_renewal_date')} type="date" className="input" />
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
              <Plus size={15} /> Crear usuario
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function UsersPage() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const { data: users, isLoading } = useQuery({
    queryKey: ['users', search, roleFilter, teamFilter],
    queryFn: () => usersAPI.list({
      search,
      role: roleFilter || undefined,
      team: teamFilter || undefined,
      limit: 100,
    }).then(r => r.data),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id) => usersAPI.deactivate(id),
    onSuccess: () => { qc.invalidateQueries(['users']); toast.success('Usuario desactivado') },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: (id) => usersAPI.resetPassword(id),
    onSuccess: (res) => {
      toast.success(`Contraseña temporal: ${res.data.temp_password}`, { duration: 8000 })
    },
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Gestión de Usuarios</h1>
          <p className="text-slate-400 text-sm mt-0.5">{users?.length ?? 0} usuarios</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> Crear usuario
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuario..." className="input pl-9" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="input w-auto">
          <option value="">Todos los roles</option>
          <option value="admin">Admin</option>
          <option value="leader">Líder</option>
          <option value="member">Miembro</option>
          <option value="negocio">Negocio</option>
          <option value="herramientas">Herramientas</option>
        </select>
        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} className="input w-auto">
          <option value="">Todos los equipos</option>
          <option value="BO">BO</option>
          <option value="CAS">CAS</option>
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Usuario</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rol</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Equipo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Negocio</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contrato</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users?.map(user => (
                <tr key={user.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {user.full_name?.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-100">{user.full_name}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('badge', ROLE_BADGES[user.role])}>{user.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    {user.team && <span className={clsx('badge', TEAM_BADGES[user.team])}>{user.team}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {user.main_business?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    —
                  </td>
                  <td className="px-4 py-3">
                    {user.is_active ? (
                      <span className="badge bg-green-900/30 text-green-400">Activo</span>
                    ) : (
                      <span className="badge bg-slate-800 text-slate-500">Inactivo</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => resetPasswordMutation.mutate(user.id)}
                        className="btn-ghost p-1.5 text-slate-500 hover:text-amber-400"
                        title="Resetear contraseña"
                      >
                        <KeyRound size={14} />
                      </button>
                      {user.is_active && (
                        <button
                          onClick={() => {
                            if (confirm(`¿Desactivar a ${user.full_name}?`))
                              deactivateMutation.mutate(user.id)
                          }}
                          className="btn-ghost p-1.5 text-slate-500 hover:text-red-400"
                          title="Desactivar usuario"
                        >
                          <UserX size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {isLoading && (
            <div className="py-12 text-center text-slate-500">Cargando usuarios...</div>
          )}
          {!isLoading && users?.length === 0 && (
            <div className="py-12 text-center text-slate-500">No hay usuarios</div>
          )}
        </div>
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
