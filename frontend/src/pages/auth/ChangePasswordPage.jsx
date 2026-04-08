import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const schema = z.object({
  current_password: z.string().min(1, 'Requerido'),
  new_password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirm: z.string(),
}).refine((d) => d.new_password === d.confirm, {
  message: 'Las contraseñas no coinciden',
  path: ['confirm'],
})

export default function ChangePasswordPage() {
  const navigate = useNavigate()
  const { updateUser } = useAuthStore()

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data) => {
    try {
      await authAPI.changePassword({
        current_password: data.current_password,
        new_password: data.new_password,
      })
      updateUser({ must_change_password: false })
      toast.success('Contraseña actualizada correctamente')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cambiar contraseña')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={24} />
          </div>
          <h1 className="text-xl font-bold text-white">Cambiar contraseña</h1>
          <p className="text-slate-400 text-sm mt-1">
            Por seguridad, debes cambiar tu contraseña temporal
          </p>
        </div>
        <div className="card">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Contraseña actual</label>
              <input {...register('current_password')} type="password" className="input" />
              {errors.current_password && (
                <p className="text-xs text-red-400 mt-1">{errors.current_password.message}</p>
              )}
            </div>
            <div>
              <label className="label">Nueva contraseña</label>
              <input {...register('new_password')} type="password" className="input" />
              {errors.new_password && (
                <p className="text-xs text-red-400 mt-1">{errors.new_password.message}</p>
              )}
            </div>
            <div>
              <label className="label">Confirmar contraseña</label>
              <input {...register('confirm')} type="password" className="input" />
              {errors.confirm && (
                <p className="text-xs text-red-400 mt-1">{errors.confirm.message}</p>
              )}
            </div>
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5">
              {isSubmitting ? (
                <><Loader2 size={16} className="animate-spin" /> Guardando...</>
              ) : 'Cambiar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
