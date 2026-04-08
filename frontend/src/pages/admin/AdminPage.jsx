import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Building2, Tag, AlertCircle, BarChart3,
  Key, Mail, MessageCircle, Send, Brain, Smartphone,
  Eye, EyeOff, CheckCircle, XCircle, Loader2, Settings2, Trash2,
  ChevronDown, ChevronUp, Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { adminAPI, demandAdminAPI } from '../../services/api'

const ICON_MAP = { Mail, MessageCircle, Send, Brain, Smartphone, Key }

const CATALOG_TYPES = [
  { type: 'vicepresidencia', label: 'Vicepresidencias' },
  { type: 'enfoque', label: 'Enfoques' },
  { type: 'pilares', label: 'Pilares Estrategicos' },
  { type: 'procesos', label: 'Mejoras en Procesos' },
  { type: 'usuarios_impactados', label: 'Usuarios Impactados' },
  { type: 'riesgo', label: 'Riesgo Operacional' },
  { type: 'aplicacion', label: 'Aplicaciones' },
]

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-brand-400" />
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ─── Integrations Manager ───────────────────────────────────────────────────

function ServiceConfigForm({ service, onClose }) {
  const qc = useQueryClient()
  const [formValues, setFormValues] = useState({})
  const [showPasswords, setShowPasswords] = useState({})
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const updateMutation = useMutation({
    mutationFn: (data) => adminAPI.updateIntegration(service.service_name, data),
    onSuccess: () => {
      qc.invalidateQueries(['integrations'])
      toast.success('Configuracion guardada')
      setFormValues({})
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al guardar'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => adminAPI.deleteIntegration(service.service_name),
    onSuccess: () => {
      qc.invalidateQueries(['integrations'])
      toast.success('Configuracion eliminada')
      onClose()
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await adminAPI.testIntegration(service.service_name)
      setTestResult(res.data)
    } catch {
      setTestResult({ success: false, message: 'Error al probar conexion' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = () => {
    if (Object.keys(formValues).length === 0) {
      toast.error('No hay cambios para guardar')
      return
    }
    updateMutation.mutate({ values: formValues, is_active: true })
  }

  const handleDelete = () => {
    if (window.confirm('¿Eliminar toda la configuracion de este servicio?')) {
      deleteMutation.mutate()
    }
  }

  const getValueForField = (keyName) => {
    const existing = service.values.find(v => v.key_name === keyName)
    return existing
  }

  return (
    <div className="mt-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700 space-y-4">
      {service.fields.map((field) => {
        const existing = getValueForField(field.key_name)
        const isPassword = field.field_type === 'password'
        const showPw = showPasswords[field.key_name]
        const isEditing = field.key_name in formValues

        return (
          <div key={field.key_name}>
            <label className="label text-xs mb-1 flex items-center gap-2">
              {field.label}
              {field.required && <span className="text-red-400">*</span>}
              {existing?.has_value && !isEditing && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                  {existing.source === 'env' ? 'ENV' : 'DB'}
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={isPassword && !showPw ? 'password' : 'text'}
                  className="input w-full pr-10"
                  placeholder={
                    existing?.has_value
                      ? existing.masked_value || 'Configurado'
                      : field.placeholder
                  }
                  value={formValues[field.key_name] ?? ''}
                  onChange={(e) =>
                    setFormValues((prev) => ({ ...prev, [field.key_name]: e.target.value }))
                  }
                  onFocus={() => {
                    if (!(field.key_name in formValues)) {
                      setFormValues((prev) => ({ ...prev, [field.key_name]: '' }))
                    }
                  }}
                />
                {isPassword && (
                  <button
                    type="button"
                    onClick={() =>
                      setShowPasswords((prev) => ({
                        ...prev,
                        [field.key_name]: !prev[field.key_name],
                      }))
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {/* Test result */}
      {testResult && (
        <div
          className={`flex items-center gap-2 p-2.5 rounded-lg text-sm ${
            testResult.success
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}
        >
          {testResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {testResult.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-700">
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending || Object.keys(formValues).length === 0}
          className="btn-primary text-sm px-4 py-1.5"
        >
          {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Guardar'}
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="btn-ghost text-sm px-3 py-1.5 flex items-center gap-1.5"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Probar Conexion
        </button>
        {service.is_configured && (
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="ml-auto text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
          >
            <Trash2 size={13} />
            Eliminar
          </button>
        )}
        <button
          onClick={onClose}
          className="ml-auto text-sm text-slate-500 hover:text-slate-300"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}

function IntegrationsManager() {
  const [editingService, setEditingService] = useState(null)

  const { data: services, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => adminAPI.integrations().then((r) => r.data),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-slate-500">
        <Loader2 size={20} className="animate-spin mr-2" />
        Cargando integraciones...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {services?.map((svc) => {
        const IconComp = ICON_MAP[svc.icon] || Key
        const isExpanded = editingService === svc.service_name

        return (
          <div
            key={svc.service_name}
            className="rounded-lg border border-slate-700 bg-slate-800/50 overflow-hidden"
          >
            <div
              className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-800 transition-colors"
              onClick={() =>
                setEditingService(isExpanded ? null : svc.service_name)
              }
            >
              <div className="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
                <IconComp size={18} className="text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{svc.display_name}</p>
                <p className="text-xs text-slate-500 truncate">{svc.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {svc.is_configured ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1">
                    <CheckCircle size={10} />
                    Conectado
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">
                    Sin configurar
                  </span>
                )}
                {isExpanded ? (
                  <ChevronUp size={14} className="text-slate-500" />
                ) : (
                  <ChevronDown size={14} className="text-slate-500" />
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="px-3 pb-3">
                <ServiceConfigForm
                  service={svc}
                  onClose={() => setEditingService(null)}
                />
              </div>
            )}
          </div>
        )
      })}

      {(!services || services.length === 0) && (
        <p className="text-sm text-slate-500 text-center py-4">
          No hay integraciones disponibles
        </p>
      )}
    </div>
  )
}

// ─── Business Manager ───────────────────────────────────────────────────────

function BusinessManager() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')

  const { data: businesses } = useQuery({
    queryKey: ['businesses'],
    queryFn: () => adminAPI.businesses().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => adminAPI.createBusiness({ name, color }),
    onSuccess: () => {
      qc.invalidateQueries(['businesses'])
      setName('')
      toast.success('Negocio creado')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nombre del negocio..."
          className="input flex-1"
        />
        <input
          type="color"
          value={color}
          onChange={e => setColor(e.target.value)}
          className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer"
        />
        <button
          onClick={() => name.trim() && createMutation.mutate()}
          disabled={!name.trim()}
          className="btn-primary px-3"
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="space-y-1.5">
        {businesses?.map(b => (
          <div
            key={b.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800"
          >
            <div className="w-3 h-3 rounded-full" style={{ background: b.color }} />
            <span className="text-sm text-slate-300 flex-1">{b.name}</span>
            {!b.is_active && <span className="text-xs text-slate-600">Inactivo</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Incident Category Manager ──────────────────────────────────────────────

function IncidentCategoryManager() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#ef4444')

  const { data: categories } = useQuery({
    queryKey: ['incident-categories'],
    queryFn: () => adminAPI.incidentCategories().then(r => r.data),
  })

  const handleCreate = async () => {
    if (!name.trim()) return
    try {
      const params = new URLSearchParams({ name, color })
      await fetch(`/api/v1/admin/incident-categories?${params}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${JSON.parse(localStorage.getItem('smartflow-auth') || '{}')?.state?.accessToken}`,
        },
      })
      qc.invalidateQueries(['incident-categories'])
      setName('')
      toast.success('Categoria creada')
    } catch {
      toast.error('Error al crear categoria')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de categoria..." className="input flex-1" />
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer" />
        <button onClick={handleCreate} disabled={!name.trim()} className="btn-primary px-3">
          <Plus size={15} />
        </button>
      </div>
      <div className="space-y-1.5">
        {categories?.map(c => (
          <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800">
            <div className="w-3 h-3 rounded-full" style={{ background: c.color }} />
            <span className="text-sm text-slate-300">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Demand Catalog Manager ─────────────────────────────────────────────────

function DemandCatalogManager() {
  const qc = useQueryClient()
  const [selectedType, setSelectedType] = useState('vicepresidencia')
  const [newName, setNewName] = useState('')

  const { data: catalogs } = useQuery({
    queryKey: ['demand-catalogs', selectedType],
    queryFn: () => demandAdminAPI.catalogs({ catalog_type: selectedType }).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => demandAdminAPI.createCatalog({ catalog_type: selectedType, name: newName }),
    onSuccess: () => {
      qc.invalidateQueries(['demand-catalogs', selectedType])
      setNewName('')
      toast.success('Opcion creada')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => demandAdminAPI.deleteCatalog(id),
    onSuccess: () => {
      qc.invalidateQueries(['demand-catalogs', selectedType])
      toast.success('Opcion desactivada')
    },
  })

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {CATALOG_TYPES.map(ct => (
          <button
            key={ct.type}
            onClick={() => setSelectedType(ct.type)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
              selectedType === ct.type
                ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                : 'border-slate-700 text-slate-500 hover:border-slate-600'
            }`}
          >
            {ct.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder={`Nueva opcion para ${CATALOG_TYPES.find(c => c.type === selectedType)?.label}...`}
          className="input flex-1 text-sm"
          onKeyDown={e => e.key === 'Enter' && newName.trim() && createMutation.mutate()}
        />
        <button
          onClick={() => newName.trim() && createMutation.mutate()}
          disabled={!newName.trim()}
          className="btn-primary px-3"
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="space-y-1.5 max-h-60 overflow-y-auto">
        {catalogs?.map(c => (
          <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800">
            <span className="text-sm text-slate-300">{c.name}</span>
            <div className="flex items-center gap-2">
              {!c.is_active && <span className="text-xs text-red-400">Inactivo</span>}
              {c.is_active && (
                <button
                  onClick={() => deleteMutation.mutate(c.id)}
                  className="text-xs text-slate-600 hover:text-red-400"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Custom Field Manager ───────────────────────────────────────────────────

function CustomFieldManager() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ field_name: '', field_label: '', field_type: 'text', is_required: false, help_text: '' })

  const { data: fields } = useQuery({
    queryKey: ['demand-custom-fields'],
    queryFn: () => demandAdminAPI.customFields().then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: () => demandAdminAPI.createCustomField(form),
    onSuccess: () => {
      qc.invalidateQueries(['demand-custom-fields'])
      setForm({ field_name: '', field_label: '', field_type: 'text', is_required: false, help_text: '' })
      setShowForm(false)
      toast.success('Campo creado')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => demandAdminAPI.deleteCustomField(id),
    onSuccess: () => {
      qc.invalidateQueries(['demand-custom-fields'])
      toast.success('Campo desactivado')
    },
  })

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-500">{fields?.length || 0} campos personalizados</p>
        <button onClick={() => setShowForm(!showForm)} className="btn-ghost text-xs flex items-center gap-1">
          <Plus size={12} /> Nuevo Campo
        </button>
      </div>
      {showForm && (
        <div className="p-3 rounded-lg border border-slate-700 bg-slate-800/50 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className="input text-sm" placeholder="Nombre interno (ej: campo_extra)" value={form.field_name} onChange={e => setForm(p => ({ ...p, field_name: e.target.value }))} />
            <input className="input text-sm" placeholder="Etiqueta visible" value={form.field_label} onChange={e => setForm(p => ({ ...p, field_label: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className="input text-sm" value={form.field_type} onChange={e => setForm(p => ({ ...p, field_type: e.target.value }))}>
              <option value="text">Texto</option>
              <option value="textarea">Texto largo</option>
              <option value="number">Numero</option>
              <option value="date">Fecha</option>
              <option value="select">Seleccion</option>
              <option value="multiselect">Seleccion multiple</option>
              <option value="boolean">Si/No</option>
              <option value="email">Email</option>
              <option value="url">URL</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={form.is_required} onChange={e => setForm(p => ({ ...p, is_required: e.target.checked }))} />
              Obligatorio
            </label>
          </div>
          <input className="input text-sm w-full" placeholder="Texto de ayuda para el usuario" value={form.help_text} onChange={e => setForm(p => ({ ...p, help_text: e.target.value }))} />
          <button onClick={() => form.field_name && form.field_label && createMutation.mutate()} className="btn-primary text-sm">Crear Campo</button>
        </div>
      )}
      <div className="space-y-1.5">
        {fields?.map(f => (
          <div key={f.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800">
            <div>
              <span className="text-sm text-slate-300">{f.field_label}</span>
              <span className="text-xs text-slate-600 ml-2">({f.field_type})</span>
              {f.is_required && <span className="text-xs text-red-400 ml-1">*</span>}
            </div>
            {f.is_active && (
              <button onClick={() => deleteMutation.mutate(f.id)} className="text-xs text-slate-600 hover:text-red-400">
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Admin Page ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminAPI.stats().then(r => r.data),
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuracion Admin</h1>
        <p className="text-slate-400 text-sm mt-0.5">Gestiona catalogos, negocios, integraciones y configuraciones del sistema</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total usuarios', value: stats.total_users, color: 'text-brand-400' },
            { label: 'Usuarios activos', value: stats.active_users, color: 'text-green-400' },
            { label: 'Proyectos activos', value: stats.active_projects, color: 'text-blue-400' },
            { label: 'Incidentes abiertos', value: stats.open_incidents, color: 'text-red-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card text-center">
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Demand Config */}
      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard title="Catalogos de Demanda" icon={Tag}>
          <DemandCatalogManager />
        </SectionCard>
        <SectionCard title="Campos Personalizados (Form Builder)" icon={Settings2}>
          <CustomFieldManager />
        </SectionCard>
      </div>

      {/* Integrations */}
      <SectionCard title="Integraciones y API Keys" icon={Settings2}>
        <IntegrationsManager />
      </SectionCard>

      <div className="grid md:grid-cols-2 gap-6">
        <SectionCard title="Negocios" icon={Building2}>
          <BusinessManager />
        </SectionCard>

        <SectionCard title="Categorias de Incidentes" icon={AlertCircle}>
          <IncidentCategoryManager />
        </SectionCard>
      </div>
    </div>
  )
}
