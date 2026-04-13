import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { authAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'

const schema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const navigate = useNavigate()
  const { login } = useAuthStore()

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
      setIsInstallable(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false)
    }
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstallable(false)
      toast.success('¡App instalada! Búscala en tu pantalla de inicio.')
    }
  }

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data) => {
    try {
      const res = await authAPI.login(data)
      const { access_token, refresh_token } = res.data

      // Temporarily set token so authAPI.me() can use it
      useAuthStore.getState().setTokens(access_token, refresh_token)
      const meRes = await authAPI.me()
      const user = meRes.data

      login(user, access_token, refresh_token)

      if (user.must_change_password) {
        navigate('/change-password')
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al iniciar sesión'
      toast.error(msg)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-brand-600 rounded-2xl flex items-center justify-center font-bold text-2xl mx-auto mb-4">
            SF
          </div>
          <h1 className="text-2xl font-bold text-white">SmartFlow</h1>
          <p className="text-slate-400 text-sm mt-1">Gestión de equipos, proyectos e incidentes</p>
        </div>

        {/* Form */}
        <div className="card">
          <h2 className="text-lg font-semibold text-white mb-6">Iniciar sesión</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Correo electrónico</label>
              <input
                {...register('email')}
                type="email"
                className="input"
                placeholder="tu@empresa.com"
                autoComplete="email"
              />
              {errors.email && (
                <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="label">Contraseña</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full py-2.5"
            >
              {isSubmitting ? (
                <><Loader2 size={16} className="animate-spin" /> Iniciando sesión...</>
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </form>
        </div>

        {/* PWA Install Banner */}
        {isInstallable && (
          <div className="mt-4 bg-brand-900/30 border border-brand-700/50 rounded-xl p-4 text-center">
            <p className="text-sm text-brand-300 font-medium mb-2">📱 Instalar SmartFlow como app</p>
            <p className="text-xs text-slate-400 mb-3">Acceso rápido desde tu pantalla de inicio</p>
            <button
              onClick={handleInstall}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors"
            >
              ⬇️ Instalar app móvil
            </button>
          </div>
        )}

        {/* Siempre visible: link de instrucciones */}
        <div className="mt-4 bg-slate-800/50 rounded-xl p-3 text-center">
          <p className="text-xs text-slate-400 mb-1.5">📱 <strong className="text-slate-300">¿Quieres la app en tu celular?</strong></p>
          <p className="text-xs text-slate-500">Chrome → menú (⋮) → "Agregar a pantalla de inicio"</p>
        </div>

        <div className="text-center mt-6 space-y-2">
          <a
            href="/manual-smartflow.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-400 hover:text-brand-300 underline"
          >
            Descargar Manual de Usuario (PDF)
          </a>
          <p className="text-xs text-slate-600">
            SmartFlow v2.0 · Tu cuenta es gestionada por el administrador
          </p>
        </div>
      </div>
    </div>
  )
}
