import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Brain, Sparkles, Loader2, ChevronDown, ChevronUp, Send,
  BarChart3, TrendingUp, TrendingDown, AlertTriangle, RefreshCw,
  Save, Wand2, Target, DollarSign, Activity, Zap,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { ariaAPI } from '../../../services/api'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCOP(value) {
  if (value == null || value === 0) return '$0'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`
  return `${sign}$${abs.toLocaleString('es-CO')}`
}

function formatPct(value) {
  if (value == null) return '—'
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function ARIABadge() {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs bg-blue-900/40 text-blue-300 border border-blue-700/40 rounded px-1.5 py-0.5 font-medium">PhD · MIT Sloan</span>
      <span className="text-xs bg-red-900/40 text-red-300 border border-red-700/40 rounded px-1.5 py-0.5 font-medium">MBA · Harvard</span>
      <span className="text-xs bg-amber-900/40 text-amber-300 border border-amber-700/40 rounded px-1.5 py-0.5 font-medium">CFA Level III</span>
    </div>
  )
}

function SectionCard({ title, icon: Icon, children, defaultOpen = true, className = '' }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={clsx('bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden', className)}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2 text-slate-200 font-medium text-sm">
          {Icon && <Icon size={15} className="text-amber-400" />}
          {title}
        </div>
        {open ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// ─── Assumptions Form ─────────────────────────────────────────────────────────

function AssumptionsForm({ bp }) {
  const qc = useQueryClient()
  const businessId = bp?.business_id
  const year = bp?.year

  const { data: existing, isLoading } = useQuery({
    queryKey: ['aria-assumptions', businessId, year],
    queryFn: () => ariaAPI.getAssumptions(businessId, year).then((r) => r.data),
    enabled: !!businessId && !!year,
  })

  const [form, setForm] = useState({
    ipc_pct: '', gdp_growth_pct: '', trm_avg: '', banrep_rate_pct: '',
    market_growth_pct: '', client_growth_pct: '', churn_rate_pct: '', arpu_monthly: '',
    tariff_adjustment_pct: '', salary_increase_pct: '', energy_cost_change_pct: '',
    client_volume_current: '', client_volume_projected: '', client_volume_actual: '',
    notes: '',
  })

  useEffect(() => {
    if (existing) {
      setForm({
        ipc_pct: existing.ipc_pct ?? '',
        gdp_growth_pct: existing.gdp_growth_pct ?? '',
        trm_avg: existing.trm_avg ?? '',
        banrep_rate_pct: existing.banrep_rate_pct ?? '',
        market_growth_pct: existing.market_growth_pct ?? '',
        client_growth_pct: existing.client_growth_pct ?? '',
        churn_rate_pct: existing.churn_rate_pct ?? '',
        arpu_monthly: existing.arpu_monthly ?? '',
        tariff_adjustment_pct: existing.tariff_adjustment_pct ?? '',
        salary_increase_pct: existing.salary_increase_pct ?? '',
        energy_cost_change_pct: existing.energy_cost_change_pct ?? '',
        client_volume_current: existing.client_volume_current ?? '',
        client_volume_projected: existing.client_volume_projected ?? '',
        client_volume_actual: existing.client_volume_actual ?? '',
        notes: existing.notes ?? '',
      })
    }
  }, [existing])

  const saveMutation = useMutation({
    mutationFn: (data) => ariaAPI.saveAssumptions(data),
    onSuccess: () => {
      qc.invalidateQueries(['aria-assumptions', businessId, year])
      toast.success('Supuestos guardados')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al guardar'),
  })

  const generateMutation = useMutation({
    mutationFn: () => ariaAPI.generateAssumptions({
      business_id: businessId,
      year,
      business_name: bp?.business_name || 'negocio',
    }),
    onSuccess: (res) => {
      const d = res.data
      setForm({
        ipc_pct: d.ipc_pct ?? '',
        gdp_growth_pct: d.gdp_growth_pct ?? '',
        trm_avg: d.trm_avg ?? '',
        banrep_rate_pct: d.banrep_rate_pct ?? '',
        market_growth_pct: d.market_growth_pct ?? '',
        client_growth_pct: d.client_growth_pct ?? '',
        churn_rate_pct: d.churn_rate_pct ?? '',
        arpu_monthly: d.arpu_monthly ?? '',
        tariff_adjustment_pct: d.tariff_adjustment_pct ?? '',
        salary_increase_pct: d.salary_increase_pct ?? '',
        energy_cost_change_pct: d.energy_cost_change_pct ?? '',
        client_volume_current: d.client_volume_current ?? '',
        client_volume_projected: d.client_volume_projected ?? '',
        client_volume_actual: d.client_volume_actual ?? '',
        notes: d.notes ?? '',
      })
      toast.success('Supuestos generados por ARIA — revisa y guarda')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al generar'),
  })

  const handleSave = () => {
    const payload = {
      business_id: businessId,
      year,
      ...Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v === '' ? null : (k === 'notes' ? v : parseFloat(v))])
      ),
    }
    saveMutation.mutate(payload)
  }

  const fields = [
    { key: 'ipc_pct', label: 'IPC Colombia %', placeholder: '5.5' },
    { key: 'gdp_growth_pct', label: 'Crecimiento PIB %', placeholder: '2.1' },
    { key: 'trm_avg', label: 'TRM Promedio (COP/USD)', placeholder: '4200' },
    { key: 'banrep_rate_pct', label: 'Tasa Banrep %', placeholder: '9.75' },
    { key: 'market_growth_pct', label: 'Crecimiento Mercado %', placeholder: '3.0' },
    { key: 'client_growth_pct', label: 'Crecimiento Clientes %', placeholder: '4.5' },
    { key: 'churn_rate_pct', label: 'Tasa Churn %', placeholder: '2.0' },
    { key: 'arpu_monthly', label: 'ARPU Mensual COP', placeholder: '85000' },
    { key: 'tariff_adjustment_pct', label: 'Ajuste Tarifario %', placeholder: '6.0' },
    { key: 'salary_increase_pct', label: 'Incremento Salarial %', placeholder: '7.2' },
    { key: 'energy_cost_change_pct', label: 'Variación Costo Gas/Energía %', placeholder: '4.0' },
    { key: 'client_volume_current', label: 'Clientes Inicio Año', placeholder: '45000', isInt: true },
    { key: 'client_volume_projected', label: 'Clientes Proyectados', placeholder: '47500', isInt: true },
    { key: 'client_volume_actual', label: 'Clientes Real YTD', placeholder: '46200', isInt: true },
  ]

  return (
    <SectionCard title={`Supuestos ${year}`} icon={Target} defaultOpen={false}>
      {isLoading ? (
        <div className="flex items-center gap-2 py-2 text-slate-400 text-sm">
          <Loader2 size={14} className="animate-spin" /> Cargando...
        </div>
      ) : (
        <div className="space-y-4 mt-1">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fields.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs text-slate-400 mb-1">{label}</label>
                <input
                  type="number"
                  step="any"
                  className="input text-sm py-1.5"
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notas / Fuentes</label>
            <textarea
              className="input text-sm resize-none"
              rows={2}
              placeholder="Fuentes: Banrep, DANE, CREG, Bloomberg..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              className="btn-secondary text-sm flex items-center gap-1.5 border-amber-500/40 text-amber-400 hover:text-amber-300"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              Generar con ARIA
            </button>
            <button
              className="btn-primary text-sm flex items-center gap-1.5"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Guardar
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ─── Scenarios Panel ──────────────────────────────────────────────────────────

const SCENARIO_THEMES = {
  optimista: {
    bg: 'bg-emerald-950/40',
    border: 'border-emerald-600/40',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: TrendingUp,
    iconColor: 'text-emerald-400',
    label: 'Optimista',
  },
  base: {
    bg: 'bg-blue-950/40',
    border: 'border-blue-600/40',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    icon: Activity,
    iconColor: 'text-blue-400',
    label: 'Base',
  },
  pesimista: {
    bg: 'bg-red-950/40',
    border: 'border-red-600/40',
    badge: 'bg-red-500/20 text-red-300 border-red-500/30',
    icon: TrendingDown,
    iconColor: 'text-red-400',
    label: 'Pesimista',
  },
}

function ScenarioCard({ scenario }) {
  const theme = SCENARIO_THEMES[scenario.scenario_type] || SCENARIO_THEMES.base
  const Icon = theme.icon
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={clsx('rounded-xl border p-4 space-y-3', theme.bg, theme.border)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={16} className={theme.iconColor} />
          <span className="font-semibold text-slate-100 text-sm">{scenario.name}</span>
        </div>
        <span className={clsx('text-xs px-2 py-0.5 rounded-full border font-medium', theme.badge)}>
          P{Math.round(100 - (scenario.probability_pct || 50))} · {scenario.probability_pct}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-900/50 rounded-lg p-2">
          <p className="text-xs text-slate-500 mb-0.5">Ingresos</p>
          <p className="text-sm font-bold text-slate-100">{formatCOP(scenario.computed_ingresos)}</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-2">
          <p className="text-xs text-slate-500 mb-0.5">Costos</p>
          <p className="text-sm font-bold text-slate-100">{formatCOP(scenario.computed_costos)}</p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-2">
          <p className="text-xs text-slate-500 mb-0.5">Margen</p>
          <p className={clsx('text-sm font-bold', (scenario.computed_margen_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {formatPct(scenario.computed_margen_pct)}
          </p>
        </div>
        <div className="bg-slate-900/50 rounded-lg p-2">
          <p className="text-xs text-slate-500 mb-0.5">EBITDA est.</p>
          <p className="text-sm font-bold text-slate-100">{formatCOP(scenario.computed_ebitda)}</p>
        </div>
      </div>

      {scenario.key_assumptions && Object.keys(scenario.key_assumptions).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-1">Supuestos clave</p>
          <ul className="space-y-0.5">
            {Object.values(scenario.key_assumptions).slice(0, expanded ? 99 : 2).map((v, i) => (
              <li key={i} className="text-xs text-slate-400 flex gap-1.5">
                <span className={clsx('mt-0.5 shrink-0', theme.iconColor)}>•</span>
                {v}
              </li>
            ))}
          </ul>
        </div>
      )}

      {scenario.ai_narrative && (
        <div>
          <p className={clsx('text-xs leading-relaxed', expanded ? 'text-slate-300' : 'text-slate-400 line-clamp-3')}>
            {scenario.ai_narrative}
          </p>
          {scenario.ai_narrative.length > 200 && (
            <button
              className="text-xs text-amber-400 hover:text-amber-300 mt-1"
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? 'Ver menos' : 'Ver más'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ScenariosPanel({ bpId, bp }) {
  const qc = useQueryClient()

  const { data: scenarios, isLoading } = useQuery({
    queryKey: ['aria-scenarios', bpId],
    queryFn: () => ariaAPI.getScenarios(bpId).then((r) => r.data),
    enabled: !!bpId,
  })

  const generateMutation = useMutation({
    mutationFn: () => ariaAPI.generateScenarios(bpId, {}),
    onSuccess: () => {
      qc.invalidateQueries(['aria-scenarios', bpId])
      toast.success('Escenarios generados por ARIA')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al generar escenarios'),
  })

  const sorted = (scenarios || []).slice().sort((a, b) => {
    const order = { pesimista: 0, base: 1, optimista: 2 }
    return (order[a.scenario_type] ?? 1) - (order[b.scenario_type] ?? 1)
  })

  return (
    <SectionCard title="Escenarios Financieros" icon={BarChart3} defaultOpen={true}>
      {isLoading ? (
        <div className="flex items-center gap-2 py-2 text-slate-400 text-sm">
          <Loader2 size={14} className="animate-spin" /> Cargando...
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-6 space-y-3">
          <p className="text-slate-400 text-sm">No hay escenarios generados para este BP.</p>
          <button
            className="btn-secondary text-sm flex items-center gap-1.5 mx-auto border-amber-500/40 text-amber-400 hover:text-amber-300"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Generar con ARIA
          </button>
        </div>
      ) : (
        <div className="space-y-3 mt-1">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {sorted.map((s) => <ScenarioCard key={s.id} scenario={s} />)}
          </div>
          <button
            className="btn-secondary text-xs flex items-center gap-1.5 border-amber-500/30 text-amber-400 hover:text-amber-300"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Regenerar escenarios
          </button>
        </div>
      )}
    </SectionCard>
  )
}

// ─── Sensitivity Matrix ───────────────────────────────────────────────────────

const SENSITIVITY_VARS = [
  { key: 'client_growth_pct', label: 'Crec. Clientes' },
  { key: 'ipc_pct', label: 'IPC / Inflación' },
  { key: 'tariff_adjustment_pct', label: 'Ajuste Tarifario' },
  { key: 'arpu_monthly', label: 'ARPU Mensual' },
  { key: 'churn_rate_pct', label: 'Tasa Churn' },
  { key: 'salary_increase_pct', label: 'Increm. Salarial' },
  { key: 'energy_cost_change_pct', label: 'Costo Gas/Energía' },
]

function SensitivityMatrix({ bpId }) {
  const [selected, setSelected] = useState(['client_growth_pct', 'ipc_pct', 'tariff_adjustment_pct'])
  const [result, setResult] = useState(null)

  const analysisMutation = useMutation({
    mutationFn: () => ariaAPI.sensitivity(bpId, { variables: selected }),
    onSuccess: (res) => {
      setResult(res.data)
      toast.success('Análisis de sensibilidad completado')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error en sensibilidad'),
  })

  const toggleVar = (key) => {
    setSelected((s) => s.includes(key) ? s.filter((k) => k !== key) : [...s, key])
  }

  const ranges = result?.ranges || ['-20%', '-10%', '0%', '+10%', '+20%']

  function cellColor(val, base, higherIsBetter = true) {
    if (!base || !val) return ''
    const diff = val - base
    const threshold = Math.abs(base) * 0.03
    if (Math.abs(diff) < threshold) return 'bg-slate-700/30'
    const positive = higherIsBetter ? diff > 0 : diff < 0
    return positive ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'
  }

  return (
    <SectionCard title="Análisis de Sensibilidad" icon={Zap} defaultOpen={false}>
      <div className="space-y-3 mt-1">
        <div>
          <p className="text-xs text-slate-400 mb-2">Variables a analizar:</p>
          <div className="flex flex-wrap gap-1.5">
            {SENSITIVITY_VARS.map(({ key, label }) => (
              <button
                key={key}
                className={clsx(
                  'text-xs px-2.5 py-1 rounded-full border transition-colors',
                  selected.includes(key)
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-700/40 text-slate-400 border-slate-600/40 hover:border-slate-500',
                )}
                onClick={() => toggleVar(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn-secondary text-sm flex items-center gap-1.5 border-amber-500/40 text-amber-400 hover:text-amber-300"
          onClick={() => analysisMutation.mutate()}
          disabled={analysisMutation.isPending || selected.length === 0}
        >
          {analysisMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          Analizar
        </button>

        {result && (
          <div className="space-y-4 mt-2">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-slate-400 py-2 pr-3 font-medium">Variable</th>
                    {ranges.map((r) => (
                      <th key={r} className="text-center text-slate-400 py-2 px-2 font-medium whitespace-nowrap">{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.matrix || {}).map(([varKey, rowData]) => {
                    const varLabel = SENSITIVITY_VARS.find((v) => v.key === varKey)?.label || varKey
                    const baseVal = rowData['0%']?.margen_pct
                    return (
                      <tr key={varKey} className="border-t border-slate-700/30">
                        <td className="text-slate-300 py-2 pr-3 font-medium whitespace-nowrap">{varLabel}</td>
                        {ranges.map((r) => {
                          const cell = rowData[r]
                          const pct = cell?.margen_pct
                          return (
                            <td
                              key={r}
                              className={clsx(
                                'text-center py-2 px-2 rounded font-mono',
                                r === '0%' ? 'bg-slate-700/50 text-slate-200' : cellColor(pct, baseVal),
                              )}
                            >
                              {pct != null ? `${pct.toFixed(1)}%` : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-xs text-slate-500 mt-1">Valores = % margen bruto bajo cada escenario</p>
            </div>

            {result.narration && (
              <div className="bg-amber-950/20 border border-amber-700/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-400 mb-1.5 flex items-center gap-1.5">
                  <Brain size={12} />
                  Narrativa ARIA
                </p>
                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{result.narration}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

// ─── ARIA Chat ────────────────────────────────────────────────────────────────

function ARIAChat({ bpId }) {
  const [message, setMessage] = useState('')
  const [localMessages, setLocalMessages] = useState([])
  const chatEndRef = useRef(null)

  const { data: history } = useQuery({
    queryKey: ['aria-history', bpId],
    queryFn: () => ariaAPI.history(bpId).then((r) => r.data),
    enabled: !!bpId,
  })

  const qc = useQueryClient()

  const chatMutation = useMutation({
    mutationFn: (msg) => ariaAPI.chat(bpId, { message: msg, context_type: 'general' }),
    onSuccess: (res, msg) => {
      setLocalMessages((prev) => [
        ...prev,
        { role: 'user', text: msg, id: Date.now() + '_u' },
        { role: 'aria', text: res.data.response, id: Date.now() + '_a' },
      ])
      setMessage('')
      qc.invalidateQueries(['aria-history', bpId])
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al contactar ARIA'),
  })

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages])

  const handleSend = () => {
    const msg = message.trim()
    if (!msg) return
    chatMutation.mutate(msg)
  }

  // Build combined message list: recent history (oldest first, max 5) + local session
  const historyMessages = (history || [])
    .filter((h) => h.audit_type === 'chat')
    .slice(0, 5)
    .reverse()
    .map((h) => ({
      role: 'aria',
      text: h.ai_response || '',
      id: `hist_${h.id}`,
      timestamp: h.created_at,
      isHistory: true,
    }))

  const allMessages = localMessages.length > 0 ? localMessages : historyMessages

  return (
    <SectionCard title="Chat con ARIA" icon={Brain} defaultOpen={true}>
      <div className="space-y-3 mt-1">
        {/* Message area */}
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {allMessages.length === 0 && (
            <div className="text-center py-6">
              <Brain size={24} className="text-amber-400/50 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">Pregúntale a ARIA sobre este BP</p>
              <p className="text-slate-500 text-xs mt-1">Análisis de varianzas, riesgos, proyecciones, benchmarks...</p>
            </div>
          )}
          {allMessages.map((msg) => (
            <div
              key={msg.id}
              className={clsx('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {msg.role === 'aria' && (
                <div className="shrink-0 w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mt-0.5">
                  <Brain size={12} className="text-amber-400" />
                </div>
              )}
              <div
                className={clsx(
                  'rounded-xl px-3 py-2 max-w-[85%] text-xs leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-brand-600/20 border border-brand-500/30 text-slate-200'
                    : 'bg-slate-800 border border-slate-700/50 text-slate-300',
                )}
              >
                {msg.isHistory && (
                  <p className="text-amber-400/60 text-xs mb-1 font-medium">ARIA (historial)</p>
                )}
                <p className="whitespace-pre-line">{msg.text}</p>
              </div>
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex gap-2 justify-start">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mt-0.5 shrink-0">
                <Brain size={12} className="text-amber-400" />
              </div>
              <div className="bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2">
                <div className="flex gap-1 items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            className="input flex-1 text-sm py-2"
            placeholder="Pregúntale a ARIA sobre este BP..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={chatMutation.isPending}
          />
          <button
            className="btn-primary px-3 py-2 flex items-center gap-1.5"
            onClick={handleSend}
            disabled={chatMutation.isPending || !message.trim()}
          >
            {chatMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── Quick Actions ────────────────────────────────────────────────────────────

function QuickActions({ bpId, bp }) {
  const qc = useQueryClient()
  const [auditResult, setAuditResult] = useState(null)

  const auditMutation = useMutation({
    mutationFn: () => ariaAPI.audit(bpId),
    onSuccess: (res) => {
      setAuditResult(res.data)
      qc.invalidateQueries(['aria-history', bpId])
      toast.success('Auditoría completada')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error en auditoría'),
  })

  const scenariosMutation = useMutation({
    mutationFn: () => ariaAPI.generateScenarios(bpId, {}),
    onSuccess: () => {
      qc.invalidateQueries(['aria-scenarios', bpId])
      toast.success('Escenarios generados')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error'),
  })

  return (
    <div className="space-y-3">
      {/* Quick action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          className="btn-secondary text-sm flex items-center gap-1.5 border-amber-500/40 text-amber-400 hover:text-amber-300"
          onClick={() => auditMutation.mutate()}
          disabled={auditMutation.isPending}
        >
          {auditMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
          Auditoría Completa
        </button>
        <button
          className="btn-secondary text-sm flex items-center gap-1.5 border-blue-500/40 text-blue-400 hover:text-blue-300"
          onClick={() => scenariosMutation.mutate()}
          disabled={scenariosMutation.isPending}
        >
          {scenariosMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
          Generar Escenarios
        </button>
      </div>

      {/* Audit result display */}
      {auditResult && (
        <div className="bg-slate-800/60 border border-amber-700/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Brain size={14} className="text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">Resultado de Auditoría ARIA</span>
          </div>

          {auditResult.sections?.executive_summary && (
            <div>
              <p className="text-xs font-semibold text-slate-400 mb-1">Resumen Ejecutivo</p>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                {auditResult.sections.executive_summary}
              </p>
            </div>
          )}

          {auditResult.sections?.action_items && (
            <div>
              <p className="text-xs font-semibold text-red-400 mb-1 flex items-center gap-1">
                <AlertTriangle size={11} />
                Puntos Críticos de Atención
              </p>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                {auditResult.sections.action_items}
              </p>
            </div>
          )}

          {!auditResult.sections?.executive_summary && (
            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line line-clamp-10">
              {auditResult.ai_response}
            </p>
          )}

          {auditResult.snapshot_metrics && (
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[
                { label: 'Ingresos', value: formatCOP(auditResult.snapshot_metrics.ingresos), color: 'text-emerald-400' },
                { label: 'Costos', value: formatCOP(auditResult.snapshot_metrics.costos_total), color: 'text-red-400' },
                { label: 'Margen', value: `${(auditResult.snapshot_metrics.margen_pct || 0).toFixed(1)}%`, color: 'text-blue-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-900/50 rounded-lg p-2 text-center">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={clsx('text-sm font-bold', color)}>{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ARIAPanel ───────────────────────────────────────────────────────────

export default function ARIAPanel({ bpId, bp }) {
  const geminiUnavailable = false // We show error from API if key not configured

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-950/40 to-slate-800/60 border border-amber-700/30 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Brain size={20} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-100 text-base">ARIA</h2>
                <span className="text-xs text-amber-400/80 font-medium">— Analista Financiero IA</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Analista de Rentabilidad e Inteligencia Accionable</p>
            </div>
          </div>
          <ARIABadge />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wide">Acciones Rápidas</p>
        <QuickActions bpId={bpId} bp={bp} />
      </div>

      {/* Assumptions Form */}
      <AssumptionsForm bp={bp} />

      {/* Scenarios */}
      <ScenariosPanel bpId={bpId} bp={bp} />

      {/* Sensitivity */}
      <SensitivityMatrix bpId={bpId} />

      {/* Chat */}
      <ARIAChat bpId={bpId} />
    </div>
  )
}
