import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Crown, TrendingUp, AlertTriangle, BarChart2, Users,
  RefreshCw, Send, CheckCircle, ChevronRight, Clock,
  Activity, Briefcase, ShieldAlert, Brain,
} from 'lucide-react'
import { executiveAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import clsx from 'clsx'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt_m(value) {
  if (!value || value === 0) return '$0'
  if (Math.abs(value) >= 1_000_000_000)
    return `$${(value / 1_000_000_000).toFixed(1)}B`
  return `$${(value / 1_000_000).toFixed(1)}M`
}

function minutesAgo(isoString) {
  if (!isoString) return null
  const diff = (Date.now() - new Date(isoString + 'Z').getTime()) / 1000 / 60
  if (diff < 1) return 'ahora mismo'
  if (diff < 60) return `hace ${Math.floor(diff)} min`
  return `hace ${Math.floor(diff / 60)}h`
}

const SEVERITY_CONFIG = {
  critico: {
    dot: 'bg-red-500',
    border: 'border-red-700/40',
    bg: 'bg-red-950/40',
    text: 'text-red-400',
    label: 'CRÍTICO',
    icon: '🔴',
  },
  atencion: {
    dot: 'bg-amber-400',
    border: 'border-amber-700/40',
    bg: 'bg-amber-950/30',
    text: 'text-amber-400',
    label: 'ATENCIÓN',
    icon: '🟡',
  },
  info: {
    dot: 'bg-blue-400',
    border: 'border-blue-700/40',
    bg: 'bg-blue-950/30',
    text: 'text-blue-400',
    label: 'INFO',
    icon: '🔵',
  },
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, subtext, color = 'default', pulse = false }) {
  const colorMap = {
    default: 'from-slate-800/60 to-slate-900/60 border-slate-700/40',
    red: 'from-red-950/60 to-slate-900/60 border-red-800/40',
    green: 'from-emerald-950/60 to-slate-900/60 border-emerald-800/40',
    amber: 'from-amber-950/40 to-slate-900/60 border-amber-800/30',
    blue: 'from-blue-950/40 to-slate-900/60 border-blue-800/30',
  }
  const iconColorMap = {
    default: 'text-slate-400',
    red: 'text-red-400',
    green: 'text-emerald-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400',
  }
  return (
    <div className={clsx(
      'relative rounded-xl border bg-gradient-to-br p-4 flex flex-col gap-2',
      colorMap[color] || colorMap.default
    )}>
      {pulse && (
        <span className="absolute top-3 right-3 flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
      )}
      <div className="flex items-center gap-2">
        <Icon size={16} className={iconColorMap[color] || iconColorMap.default} />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white leading-none">{value}</p>
      {subtext && <p className="text-xs text-slate-500">{subtext}</p>}
    </div>
  )
}

// ─── Business Card ────────────────────────────────────────────────────────────

function BusinessCard({ biz }) {
  const navigate = useNavigate()
  const acts = biz.activities
  const completionPct = acts.completion_pct || 0
  const barColor =
    completionPct >= 70 ? 'bg-emerald-500' :
    completionPct >= 40 ? 'bg-amber-400' : 'bg-red-500'

  const statusColors = {
    vigente: 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/40',
    aprobado: 'bg-blue-900/50 text-blue-400 border border-blue-700/40',
    en_revision: 'bg-amber-900/50 text-amber-400 border border-amber-700/40',
    borrador: 'bg-slate-800 text-slate-400 border border-slate-600/40',
    cerrado: 'bg-slate-900 text-slate-500 border border-slate-700/40',
  }

  return (
    <div
      onClick={() => navigate(`/bp/${biz.bp_id}`)}
      className="relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden cursor-pointer
                 hover:border-slate-600 hover:bg-slate-800/80 transition-all duration-200 group"
      style={{ borderLeftColor: biz.business_color, borderLeftWidth: '4px' }}
    >
      {/* Alert dot */}
      {acts.overdue > 0 && (
        <div className="absolute top-3 right-3 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-400 font-semibold">{acts.overdue} vencida{acts.overdue > 1 ? 's' : ''}</span>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Header */}
        <div>
          <h3 className="font-bold text-white text-sm leading-tight group-hover:text-slate-100">{biz.business_name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-500">BP {biz.year}</span>
            <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded', statusColors[biz.status] || statusColors.borrador)}>
              {biz.status.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Financials */}
        {biz.has_financial_lines ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Ingresos plan</p>
              <p className="text-sm font-bold text-white">{fmt_m(biz.plan_ingresos)}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Margen</p>
              <p className={clsx(
                'text-sm font-bold',
                biz.margen_pct >= 20 ? 'text-emerald-400' :
                biz.margen_pct >= 10 ? 'text-amber-400' : 'text-red-400'
              )}>
                {biz.margen_pct}%
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">Sin líneas financieras</p>
        )}

        {/* Activity progress bar */}
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] text-slate-500">
              {acts.completed}/{acts.total} actividades
            </span>
            <span className={clsx('text-[10px] font-semibold',
              completionPct >= 70 ? 'text-emerald-400' :
              completionPct >= 40 ? 'text-amber-400' : 'text-red-400'
            )}>
              {completionPct}%
            </span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', barColor)}
              style={{ width: `${Math.min(completionPct, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <span className="text-[10px] text-slate-600">
            {biz.incident_count_open !== undefined
              ? `${biz.incident_count_open} incidente${biz.incident_count_open !== 1 ? 's' : ''} abierto${biz.incident_count_open !== 1 ? 's' : ''}`
              : ''}
          </span>
          <ChevronRight size={12} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
        </div>
      </div>
    </div>
  )
}

// ─── Alert Item ───────────────────────────────────────────────────────────────

function AlertItem({ alert }) {
  const navigate = useNavigate()
  const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info

  return (
    <div className={clsx(
      'flex items-start gap-3 p-3 rounded-lg border',
      cfg.bg, cfg.border
    )}>
      <div className={clsx('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', cfg.dot)} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-200 leading-snug">{alert.message}</p>
        {alert.detail && <p className="text-[10px] text-slate-500 mt-0.5">{alert.detail}</p>}
      </div>
      {alert.link && (
        <button
          onClick={() => navigate(alert.link)}
          className="text-[10px] text-slate-500 hover:text-slate-300 flex-shrink-0 flex items-center gap-0.5"
        >
          Ver <ChevronRight size={10} />
        </button>
      )}
    </div>
  )
}

// ─── ARIA Chat ────────────────────────────────────────────────────────────────

const QUICK_QUESTIONS = [
  '¿Estado del BP?',
  '¿Actividades en riesgo?',
  '¿Incidentes críticos?',
  '¿Margen por negocio?',
]

function ARIAChat() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const messagesEndRef = useRef(null)

  const ariaMutation = useMutation({
    mutationFn: (question) => executiveAPI.aria({ question, context_type: 'general' }),
    onSuccess: (res) => {
      setMessages(prev => [
        ...prev,
        {
          type: 'response',
          text: res.data.response,
          is_ai: res.data.is_ai,
          sources: res.data.sources_used,
          ts: new Date(),
        },
      ])
    },
    onError: (err) => {
      setMessages(prev => [
        ...prev,
        {
          type: 'error',
          text: err.response?.data?.detail || 'Error al consultar ARIA',
          ts: new Date(),
        },
      ])
    },
  })

  const sendQuestion = (question) => {
    const q = question || input.trim()
    if (!q) return
    setMessages(prev => [...prev, { type: 'question', text: q, ts: new Date() }])
    setInput('')
    ariaMutation.mutate(q)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-amber-400" />
          <span className="font-bold text-sm text-white">ARIA Directiva</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40">
          <CheckCircle size={10} className="text-emerald-400" />
          <span className="text-[10px] text-emerald-400 font-semibold">Solo datos verificados</span>
        </div>
      </div>

      {/* Quick questions */}
      <div className="px-3 py-2 border-b border-slate-800/60 flex flex-wrap gap-1.5 flex-shrink-0">
        {QUICK_QUESTIONS.map(q => (
          <button
            key={q}
            onClick={() => sendQuestion(q)}
            disabled={ariaMutation.isPending}
            className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700
                       text-slate-400 hover:text-white border border-slate-700/50 transition-colors
                       disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <Brain size={32} className="text-amber-500/30 mb-3" />
            <p className="text-xs text-slate-600 max-w-48 leading-relaxed">
              Consulta sobre el estado financiero, actividades, incidentes o proyectos del negocio CAS.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.type === 'question') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] bg-brand-700/30 border border-brand-700/30 rounded-xl rounded-tr-sm px-3 py-2">
                  <p className="text-sm text-slate-200">{msg.text}</p>
                </div>
              </div>
            )
          }
          if (msg.type === 'error') {
            return (
              <div key={i} className="bg-red-950/40 border border-red-800/40 rounded-xl px-3 py-2">
                <p className="text-xs text-red-400">{msg.text}</p>
              </div>
            )
          }
          return (
            <div key={i} className="space-y-1.5">
              <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl rounded-tl-sm px-3 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Brain size={12} className="text-amber-400 flex-shrink-0" />
                  <span className="text-[10px] font-semibold text-amber-400">
                    {msg.is_ai ? 'ARIA Directiva' : 'Reporte de datos verificados'}
                  </span>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40 ml-auto">
                    <CheckCircle size={9} className="text-emerald-400" />
                    <span className="text-[9px] text-emerald-400">Datos verificados</span>
                  </div>
                </div>
                <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {/* Render citations in amber */}
                  {msg.text.split(/(\[.*?\])/).map((part, j) =>
                    part.startsWith('[') && part.endsWith(']') ? (
                      <span key={j} className="text-amber-400 font-medium">{part}</span>
                    ) : (
                      <span key={j}>{part}</span>
                    )
                  )}
                </div>
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="px-1 flex flex-wrap gap-1">
                  {msg.sources.slice(0, 4).map((s, j) => (
                    <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700/40">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {ariaMutation.isPending && (
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/40 rounded-xl w-fit">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-[10px] text-slate-500">Consultando datos del sistema...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-800 flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendQuestion()}
            placeholder="Consulta a ARIA Directiva..."
            disabled={ariaMutation.isPending}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white
                       placeholder-slate-500 focus:outline-none focus:border-amber-600 transition-colors
                       disabled:opacity-50"
          />
          <button
            onClick={() => sendQuestion()}
            disabled={ariaMutation.isPending || !input.trim()}
            className="w-8 h-8 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700
                       rounded-lg flex items-center justify-center transition-colors flex-shrink-0"
          >
            <Send size={13} className="text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function ExecutiveDashboard() {
  const { user } = useAuthStore()
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['executive-summary'],
    queryFn: () => executiveAPI.summary().then(r => r.data),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })

  const {
    data: businessesData,
    isLoading: bizLoading,
    refetch: refetchBiz,
  } = useQuery({
    queryKey: ['executive-businesses'],
    queryFn: () => executiveAPI.businesses().then(r => r.data),
    staleTime: 2 * 60 * 1000,
  })

  const handleRefresh = () => {
    refetchSummary()
    refetchBiz()
    setLastRefresh(new Date())
  }

  const kpis = summary?.kpis || {}
  const alerts = summary?.alerts || []
  const incidents = summary?.incidents || {}
  const projects = summary?.projects || {}
  const businesses = businessesData?.businesses || []

  const criticalAlerts = alerts.filter(a => a.severity === 'critico')
  const attentionAlerts = alerts.filter(a => a.severity === 'atencion')
  const infoAlerts = alerts.filter(a => a.severity === 'info')
  const sortedAlerts = [...criticalAlerts, ...attentionAlerts, ...infoAlerts]

  const isLoading = summaryLoading || bizLoading

  return (
    <div className="min-h-full space-y-5 pb-8">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Crown size={16} className="text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Vista Directiva</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-700/30 uppercase tracking-widest">
              VP
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 ml-10.5">
            Datos verificados del sistema · SmartFlow ·{' '}
            {new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider">Actualizado</p>
            <p className="text-xs text-slate-400">{minutesAgo(summary?.generated_at) || '—'}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg">
            <div className="w-6 h-6 rounded-full bg-amber-600/20 border border-amber-600/30 flex items-center justify-center text-[10px] font-bold text-amber-400">
              {user?.full_name?.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-xs text-slate-400">{user?.full_name}</span>
          </div>
        </div>
      </div>

      {/* ── Alert strip ── */}
      {alerts.length > 0 && (
        <div className={clsx(
          'flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm',
          criticalAlerts.length > 0
            ? 'bg-red-950/40 border-red-800/50 text-red-300'
            : 'bg-amber-950/30 border-amber-800/40 text-amber-300'
        )}>
          <AlertTriangle size={15} className="flex-shrink-0" />
          <span className="font-semibold">
            {alerts.length} alerta{alerts.length > 1 ? 's' : ''} activa{alerts.length > 1 ? 's' : ''}
          </span>
          {criticalAlerts.length > 0 && (
            <span className="text-red-400 text-xs">· {criticalAlerts.length} crítica{criticalAlerts.length > 1 ? 's' : ''}</span>
          )}
          <span className="text-xs opacity-60 ml-auto">Revisa el panel de alertas</span>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={TrendingUp}
          label="BPs Activos"
          value={isLoading ? '—' : (kpis.total_bps ?? '—')}
          subtext="Planes de negocio"
          color="blue"
        />
        <KpiCard
          icon={Activity}
          label="Cumplimiento"
          value={isLoading ? '—' : `${kpis.overall_completion_pct ?? 0}%`}
          subtext="Promedio actividades"
          color={
            !kpis.overall_completion_pct ? 'default' :
            kpis.overall_completion_pct >= 70 ? 'green' :
            kpis.overall_completion_pct >= 40 ? 'amber' : 'red'
          }
        />
        <KpiCard
          icon={Clock}
          label="Act. Vencidas"
          value={isLoading ? '—' : (kpis.total_overdue_activities ?? 0)}
          subtext="Requieren atención"
          color={kpis.total_overdue_activities > 0 ? 'red' : 'default'}
          pulse={kpis.total_overdue_activities > 0}
        />
        <KpiCard
          icon={ShieldAlert}
          label="Incidentes Crit."
          value={isLoading ? '—' : (incidents.critical ?? 0)}
          subtext={incidents.total_active ? `${incidents.total_active} activos total` : 'Sin incidentes activos'}
          color={incidents.critical > 0 ? 'red' : 'default'}
          pulse={incidents.critical > 0}
        />
        <KpiCard
          icon={Briefcase}
          label="Proyectos Activos"
          value={isLoading ? '—' : (projects.total_active ?? '—')}
          subtext={projects.overdue_count > 0 ? `${projects.overdue_count} vencidos` : 'Sin proyectos vencidos'}
          color={projects.overdue_count > 0 ? 'amber' : 'default'}
        />
      </div>

      {/* ── Business Matrix ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 size={15} className="text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Matriz de Negocios</h2>
          <span className="text-xs text-slate-600">· Clic para abrir BP</span>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-44 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : businesses.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {businesses.map(biz => (
              <BusinessCard key={biz.bp_id} biz={biz} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-600 text-sm">
            No hay planes de negocio registrados
          </div>
        )}
      </div>

      {/* ── Bottom: ARIA + Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ height: '520px' }}>
        {/* ARIA Chat — 3 cols */}
        <div className="lg:col-span-3 h-full">
          <ARIAChat />
        </div>

        {/* Alerts panel — 2 cols */}
        <div className="lg:col-span-2 flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-400" />
              <span className="font-bold text-sm text-white">Alertas Activas</span>
            </div>
            {alerts.length > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-950/60 text-red-400 border border-red-800/40">
                {alerts.length}
              </span>
            )}
          </div>

          {/* Legend */}
          {alerts.length > 0 && (
            <div className="px-3 pt-2 flex gap-3 flex-shrink-0">
              {criticalAlerts.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-red-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                  {criticalAlerts.length} crítico{criticalAlerts.length > 1 ? 's' : ''}
                </span>
              )}
              {attentionAlerts.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  {attentionAlerts.length} atención
                </span>
              )}
              {infoAlerts.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-blue-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                  {infoAlerts.length} info
                </span>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-14 bg-slate-900 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : sortedAlerts.length > 0 ? (
              sortedAlerts.map((alert, i) => (
                <AlertItem key={i} alert={alert} />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <CheckCircle size={28} className="text-emerald-500/30 mb-3" />
                <p className="text-xs text-slate-600">Sin alertas activas</p>
                <p className="text-[10px] text-slate-700 mt-1">Todos los indicadores en orden</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-slate-800/60 pt-4 flex items-center justify-between">
        <p className="text-[10px] text-slate-700 uppercase tracking-widest font-semibold">
          CONFIDENCIAL · Solo para uso interno · Vicepresidencia Vanti
        </p>
        <p className="text-[10px] text-slate-700">SmartFlow · {new Date().getFullYear()}</p>
      </div>
    </div>
  )
}
