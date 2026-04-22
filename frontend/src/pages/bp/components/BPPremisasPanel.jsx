/**
 * BPPremisasPanel — Premisas centralizadas vinculadas al BP
 *
 * Features:
 *  - Lists all premisas for this BP's business (fetched from GET /bp/{id}/premisas)
 *  - Shows which BP lines are already linked to each premisa
 *  - Manual link/unlink: each line row has a premisa selector
 *  - "Procesar con ARIA" button: calls POST /bp/{id}/aria/link-premisas
 *    and streams back AI-suggested associations
 *  - Client volume display pulled from BPAssumptions
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Brain, Link, Link2Off, Loader2, Sparkles, AlertCircle,
  CheckCircle2, ChevronDown, ChevronRight, Tag, Users,
  TrendingUp, DollarSign, Building2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { bpAPI, ariaAPI, adminAPI } from '../../../services/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_STYLES = {
  presupuesto: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  ingresos: 'bg-green-500/10 text-green-400 border-green-500/20',
  costos: 'bg-red-500/10 text-red-400 border-red-500/20',
  mercado: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  regulatorio: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
}

const STATUS_STYLES = {
  activa: 'text-green-400',
  en_revision: 'text-yellow-400',
  aprobada: 'text-blue-400',
  descartada: 'text-slate-500',
  vencida: 'text-red-400',
}

const STATUS_ICONS = {
  activa: '●',
  en_revision: '◐',
  aprobada: '✓',
  descartada: '✕',
  vencida: '!',
}

const LINE_CATEGORY_LABEL = {
  ingreso: 'Ingreso',
  costo_fijo: 'C. Fijo',
  costo_variable: 'C. Variable',
  magnitud: 'Magnitud',
  margen: 'Margen',
}

function formatCOP(v) {
  if (v == null) return '—'
  if (Math.abs(v) >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  return `$${v.toLocaleString('es-CO')}`
}

// ─── ClientVolumeCard ──────────────────────────────────────────────────────────

function ClientVolumeCard({ assumptions }) {
  if (!assumptions) return null
  const { client_volume_current, client_volume_projected, client_volume_actual,
    client_growth_pct, churn_rate_pct, arpu_monthly } = assumptions

  const hasVolume = client_volume_current != null || client_volume_projected != null
  const hasRates = client_growth_pct != null || churn_rate_pct != null || arpu_monthly != null
  if (!hasVolume && !hasRates) return null

  const growth = client_volume_current && client_volume_projected
    ? Math.round(((client_volume_projected - client_volume_current) / client_volume_current) * 100)
    : null

  return (
    <div className="card border border-blue-500/20 bg-blue-950/5 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Users size={14} className="text-blue-400" />
        <h3 className="text-sm font-semibold text-blue-400">Volumen de Clientes</h3>
        <span className="text-xs text-slate-500">— año {assumptions.year}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {client_volume_current != null && (
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">Inicio</p>
            <p className="text-base font-bold text-slate-200">{client_volume_current.toLocaleString('es-CO')}</p>
          </div>
        )}
        {client_volume_projected != null && (
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">Proyectado</p>
            <p className="text-base font-bold text-blue-400">{client_volume_projected.toLocaleString('es-CO')}</p>
          </div>
        )}
        {client_volume_actual != null && (
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">Real YTD</p>
            <p className="text-base font-bold text-green-400">{client_volume_actual.toLocaleString('es-CO')}</p>
          </div>
        )}
        {growth != null && (
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">Crecim. est.</p>
            <p className={clsx('text-base font-bold', growth >= 0 ? 'text-green-400' : 'text-red-400')}>
              {growth >= 0 ? '+' : ''}{growth}%
            </p>
          </div>
        )}
        {arpu_monthly != null && (
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">ARPU/mes</p>
            <p className="text-base font-bold text-brand-400">{formatCOP(arpu_monthly)}</p>
          </div>
        )}
        {client_growth_pct != null && (
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">Crec. clientes</p>
            <p className="text-base font-bold text-slate-200">{client_growth_pct}%</p>
          </div>
        )}
        {churn_rate_pct != null && (
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-0.5">Churn</p>
            <p className="text-base font-bold text-orange-400">{churn_rate_pct}%</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PremisaCard ──────────────────────────────────────────────────────────────

function PremisaCard({ premisa, lines, onLink, isLinking }) {
  const [expanded, setExpanded] = useState(false)
  const linked = premisa.linked_lines || []

  return (
    <div className={clsx(
      'rounded-xl border transition-all',
      linked.length > 0 ? 'border-brand-500/30 bg-brand-950/5' : 'border-slate-700/50 bg-slate-800/30',
    )}>
      <button
        className="w-full flex items-start justify-between p-4 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={clsx(
              'badge text-xs border',
              CATEGORY_STYLES[premisa.category] || 'bg-slate-700/50 text-slate-400 border-slate-600/30',
            )}>
              {premisa.category}
            </span>
            <span className={clsx('text-xs font-semibold', STATUS_STYLES[premisa.status] || 'text-slate-400')}>
              {STATUS_ICONS[premisa.status]} {premisa.status}
            </span>
            {premisa.budget_year && (
              <span className="text-xs text-slate-500">Año {premisa.budget_year}</span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-200 truncate">{premisa.title}</p>
          {premisa.assumption_basis && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{premisa.assumption_basis}</p>
          )}
        </div>
        <div className="flex items-center gap-3 ml-3 flex-shrink-0">
          {premisa.estimated_amount != null && (
            <span className="text-xs font-semibold text-brand-400 flex items-center gap-1">
              <DollarSign size={10} />{formatCOP(premisa.estimated_amount)}
            </span>
          )}
          {linked.length > 0 && (
            <span className="badge text-xs bg-brand-500/15 text-brand-400 border border-brand-500/30 flex items-center gap-1">
              <Link size={9} /> {linked.length} línea{linked.length !== 1 ? 's' : ''}
            </span>
          )}
          {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/30 pt-3">
          {/* Premisa details */}
          {premisa.assumption_basis && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Base del supuesto</p>
              <p className="text-sm text-slate-300">{premisa.assumption_basis}</p>
            </div>
          )}
          {premisa.risk_if_wrong && (
            <div className="flex items-start gap-2 bg-red-950/20 rounded-lg p-2.5 border border-red-500/10">
              <AlertCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{premisa.risk_if_wrong}</p>
            </div>
          )}
          {premisa.ai_recommendation && (
            <div className="flex items-start gap-2 bg-purple-950/20 rounded-lg p-2.5 border border-purple-500/10">
              <Brain size={13} className="text-purple-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-purple-300">{premisa.ai_recommendation}</p>
            </div>
          )}

          {/* Linked lines */}
          {linked.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-2 flex items-center gap-1">
                <Link size={10} /> Líneas vinculadas
              </p>
              <div className="flex flex-wrap gap-1.5">
                {linked.map((l) => (
                  <span key={l.id} className="badge text-xs bg-brand-500/10 text-brand-300 border border-brand-500/20">
                    {LINE_CATEGORY_LABEL[l.category] || l.category} · {l.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Link lines manually */}
          {lines.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-2 flex items-center gap-1">
                <Tag size={10} /> Vincular línea manualmente
              </p>
              <select
                className="input text-xs py-1.5"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    onLink(parseInt(e.target.value), premisa.id)
                    e.target.value = ''
                  }
                }}
                disabled={isLinking}
              >
                <option value="">— Selecciona una línea —</option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    [{LINE_CATEGORY_LABEL[l.category] || l.category}] {l.name}
                    {l.premisa_id === premisa.id ? ' ✓ (ya vinculada)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BPPremisasPanel({ bpId, bp }) {
  const qc = useQueryClient()
  const [ariaResult, setAriaResult] = useState(null)
  const [processingAria, setProcessingAria] = useState(false)

  // Fetch premisas for this BP
  const { data: premisas = [], isLoading, refetch } = useQuery({
    queryKey: ['bp-premisas', bpId],
    queryFn: () => bpAPI.getPremisas(bpId).then((r) => r.data),
    enabled: !!bpId,
  })

  // Fetch assumptions for client volume
  const { data: assumptions } = useQuery({
    queryKey: ['bp-assumptions', bp?.business_id, bp?.year],
    queryFn: () => ariaAPI.getAssumptions(bp.business_id, bp.year).then((r) => r.data),
    enabled: !!(bp?.business_id && bp?.year),
  })

  // Manual link mutation
  const linkMutation = useMutation({
    mutationFn: ({ lineId, premisaId }) => bpAPI.linkLinePremisa(bpId, lineId, premisaId),
    onSuccess: () => {
      qc.invalidateQueries(['bp-premisas', bpId])
      qc.invalidateQueries(['bp', bpId])
      toast.success('Línea vinculada a la premisa')
    },
    onError: (err) => toast.error(err.response?.data?.detail || 'Error al vincular'),
  })

  // ARIA link-premisas
  const handleProcesarAria = async () => {
    setProcessingAria(true)
    setAriaResult(null)
    try {
      const res = await ariaAPI.linkPremisas(bpId)
      setAriaResult(res.data)
      qc.invalidateQueries(['bp-premisas', bpId])
      qc.invalidateQueries(['bp', bpId])
      toast.success(`ARIA procesó el análisis — ${res.data.applied_line_ids?.length || 0} asociaciones aplicadas`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al procesar con ARIA')
    } finally {
      setProcessingAria(false)
    }
  }

  const lines = (bp?.lines || []).filter((l) => !l.is_deleted)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-brand-400" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Client volume card */}
      <ClientVolumeCard assumptions={assumptions} />

      {/* Header + Procesar button */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Building2 size={14} className="text-brand-400" />
            Premisas del negocio
            {premisas.length > 0 && (
              <span className="badge text-xs bg-slate-700/50 text-slate-400">{premisas.length}</span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Supuestos y bases que sustentan las líneas presupuestales de {bp?.business_name}
          </p>
        </div>
        <button
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            processingAria
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 cursor-not-allowed'
              : 'bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25',
          )}
          onClick={handleProcesarAria}
          disabled={processingAria || premisas.length === 0 || lines.length === 0}
          title={premisas.length === 0 ? 'Crea premisas primero' : lines.length === 0 ? 'Agrega líneas al BP primero' : 'ARIA analizará y vinculará líneas ↔ premisas'}
        >
          {processingAria ? (
            <><Loader2 size={14} className="animate-spin" /> Procesando con ARIA...</>
          ) : (
            <><Sparkles size={14} /> Procesar con ARIA</>
          )}
        </button>
      </div>

      {/* ARIA result banner */}
      {ariaResult && (
        <div className="card border border-amber-500/25 bg-amber-950/5 space-y-3">
          <div className="flex items-center gap-2">
            <Brain size={14} className="text-amber-400" />
            <p className="text-sm font-semibold text-amber-400">Resultado de ARIA</p>
            {ariaResult.applied_line_ids?.length > 0 && (
              <span className="badge text-xs bg-green-500/10 text-green-400 border border-green-500/20">
                <CheckCircle2 size={9} className="inline mr-1" />
                {ariaResult.applied_line_ids.length} asociación{ariaResult.applied_line_ids.length !== 1 ? 'es' : ''} aplicada{ariaResult.applied_line_ids.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {ariaResult.summary && (
            <p className="text-sm text-slate-300 leading-relaxed">{ariaResult.summary}</p>
          )}
          {ariaResult.associations?.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500 font-medium">Asociaciones sugeridas</p>
              {ariaResult.associations.map((a, i) => {
                const line = lines.find((l) => l.id === a.line_id)
                const premisa = premisas.find((p) => p.id === a.premisa_id)
                if (!line) return null
                return (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded font-mono',
                      a.confidence >= 80 ? 'bg-green-500/15 text-green-400' :
                      a.confidence >= 60 ? 'bg-yellow-500/15 text-yellow-400' :
                      'bg-slate-700/50 text-slate-500',
                    )}>
                      {a.confidence}%
                    </span>
                    <span className="text-slate-300">
                      <span className="font-medium">{line.name}</span>
                      {premisa
                        ? <> → <span className="text-brand-400">{premisa.title}</span></>
                        : <span className="text-slate-500"> → sin premisa</span>
                      }
                    </span>
                    {a.rationale && <span className="text-slate-600 italic">— {a.rationale}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {premisas.length === 0 ? (
        <div className="card border border-slate-700/50 text-center py-12">
          <Building2 size={32} className="text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 text-sm font-medium">Sin premisas registradas</p>
          <p className="text-slate-600 text-xs mt-1">
            Ve al módulo <span className="text-brand-400">Premisas de Negocio</span> y crea premisas
            para el negocio <span className="text-slate-300">{bp?.business_name}</span>.
          </p>
        </div>
      ) : (
        /* Premisas list */
        <div className="space-y-3">
          {premisas.map((premisa) => (
            <PremisaCard
              key={premisa.id}
              premisa={premisa}
              lines={lines}
              onLink={(lineId, premisaId) => linkMutation.mutate({ lineId, premisaId })}
              isLinking={linkMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Lines without premisa — summary */}
      {lines.length > 0 && premisas.length > 0 && (() => {
        const unlinked = lines.filter((l) => !l.premisa_id)
        if (unlinked.length === 0) return null
        return (
          <div className="card border border-yellow-500/20 bg-yellow-950/5 p-3">
            <div className="flex items-center gap-2">
              <AlertCircle size={13} className="text-yellow-400 flex-shrink-0" />
              <p className="text-xs text-yellow-300">
                <span className="font-semibold">{unlinked.length} línea{unlinked.length !== 1 ? 's' : ''}</span> sin premisa vinculada:{' '}
                {unlinked.slice(0, 4).map((l) => l.name).join(', ')}
                {unlinked.length > 4 && ` y ${unlinked.length - 4} más`}.
                Usa <span className="font-medium">Procesar con ARIA</span> para sugerencias automáticas.
              </p>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
