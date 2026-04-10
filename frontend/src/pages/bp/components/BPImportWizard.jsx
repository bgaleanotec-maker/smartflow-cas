/**
 * BPImportWizard — Full-screen wizard for importing BP data from Excel or image files.
 * Steps: 1) Upload & Analyze → 2) Preview → 3) Done
 */
import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  X, Upload, FileSpreadsheet, Image, Loader2, Brain, Check,
  ChevronRight, TrendingUp, Target, Lightbulb, AlertTriangle,
  ArrowLeft,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { bpAPI } from '../../../services/api'

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_EXTENSIONS = '.xlsx,.xls,.xlsm,.png,.jpg,.jpeg,.gif,.webp'

const CATEGORY_COLORS = {
  ingreso: 'text-green-400 bg-green-500/10 border-green-500/30',
  costo_fijo: 'text-red-400 bg-red-500/10 border-red-500/30',
  costo_variable: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  magnitud: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  margen: 'text-brand-400 bg-brand-500/10 border-brand-500/30',
}

const CATEGORY_LABELS = {
  ingreso: 'Ingreso',
  costo_fijo: 'Costo Fijo',
  costo_variable: 'Costo Variable',
  magnitud: 'Magnitud',
  margen: 'Margen',
}

const REC_CATEGORY_COLORS = {
  comercial: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  financiero: 'text-green-400 bg-green-500/10 border-green-500/30',
  operativo: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  estrategico: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  riesgo: 'text-red-400 bg-red-500/10 border-red-500/30',
  oportunidad: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
}

const PRIORITY_COLORS = {
  critica: 'text-red-400 bg-red-500/10',
  alta: 'text-orange-400 bg-orange-500/10',
  media: 'text-yellow-400 bg-yellow-500/10',
  baja: 'text-slate-400 bg-slate-500/10',
}

const PRIORITY_LABELS = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function annualTotal(monthly_plan) {
  if (!monthly_plan) return 0
  return Object.values(monthly_plan).reduce((s, v) => s + (parseFloat(v) || 0), 0)
}

function formatNumber(val) {
  if (val == null) return '—'
  if (Math.abs(val) >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(val) >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`
  if (Math.abs(val) >= 1_000) return `${(val / 1_000).toFixed(1)}K`
  return val.toLocaleString('es-CO')
}

function isExcelFile(name) {
  return /\.(xlsx|xls|xlsm)$/i.test(name)
}

function isImageFile(name) {
  return /\.(png|jpg|jpeg|gif|webp)$/i.test(name)
}

// ─── Step 1: Upload ───────────────────────────────────────────────────────────

function StepUpload({ bpId, onAnalyzed }) {
  const fileInputRef = useRef(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  const analyzeMutation = useMutation({
    mutationFn: (file) => bpAPI.analyzeFile(bpId, file),
    onSuccess: (res) => {
      toast.success('Análisis completado')
      onAnalyzed(res.data)
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || 'Error al analizar el archivo')
    },
  })

  const handleFile = (file) => {
    if (!file) return
    if (!isExcelFile(file.name) && !isImageFile(file.name)) {
      toast.error('Formato no soportado. Use .xlsx, .xls, .xlsm, .png, .jpg, .jpeg, .gif o .webp')
      return
    }
    setSelectedFile(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleAnalyze = () => {
    if (!selectedFile) return
    analyzeMutation.mutate(selectedFile)
  }

  const isLoading = analyzeMutation.isPending

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {/* Drop zone */}
      <div
        className={clsx(
          'w-full max-w-xl border-2 border-dashed rounded-xl p-10 text-center transition-all duration-150 cursor-pointer',
          isDragOver ? 'border-brand-500 bg-brand-500/10' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/30',
          isLoading && 'opacity-60 pointer-events-none',
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !selectedFile && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Brain size={40} className="text-brand-400" />
              <Loader2 size={20} className="animate-spin text-brand-300 absolute -bottom-1 -right-1" />
            </div>
            <p className="text-slate-300 font-medium">Analizando con IA...</p>
            <p className="text-xs text-slate-500">Gemini está procesando el archivo y generando el BP proyectado</p>
          </div>
        ) : selectedFile ? (
          <div className="flex flex-col items-center gap-3">
            {isExcelFile(selectedFile.name) ? (
              <FileSpreadsheet size={40} className="text-green-400" />
            ) : (
              <Image size={40} className="text-blue-400" />
            )}
            <div>
              <p className="text-slate-200 font-medium">{selectedFile.name}</p>
              <p className="text-xs text-slate-500 mt-0.5">{formatBytes(selectedFile.size)}</p>
            </div>
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-200 underline"
              onClick={(e) => { e.stopPropagation(); setSelectedFile(null); fileInputRef.current?.click() }}
            >
              Cambiar archivo
            </button>
          </div>
        ) : (
          <>
            <Upload size={40} className="text-slate-500 mx-auto mb-3" />
            <p className="text-slate-300 font-medium mb-1">Arrastra tu archivo aquí o haz clic para cargar</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Excel: .xlsx, .xls, .xlsm<br />
              Imágenes: .png, .jpg, .gif, .webp
            </p>
            <p className="text-xs text-brand-400 mt-2 flex items-center justify-center gap-1">
              <Brain size={12} /> Análisis IA con Gemini
            </p>
          </>
        )}
      </div>

      {selectedFile && !isLoading && (
        <button
          className="btn-primary flex items-center gap-2 px-8 py-2.5"
          onClick={handleAnalyze}
        >
          <Brain size={16} />
          Analizar con IA
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}

// ─── Step 2: Preview ──────────────────────────────────────────────────────────

function ConfidenceBar({ value }) {
  const pct = Math.max(0, Math.min(100, value || 0))
  const color = pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-orange-500'
  return (
    <div className="flex items-center gap-1.5" title={`Confianza IA: ${pct}%`}>
      <div className="h-1.5 w-16 bg-slate-700 rounded-full overflow-hidden">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-500">{pct}%</span>
    </div>
  )
}

function PreviewLines({ lines }) {
  if (!lines || lines.length === 0) {
    return <p className="text-center text-slate-500 text-sm py-6">No se detectaron líneas financieras.</p>
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700/50">
      <table className="w-full text-xs min-w-[600px]">
        <thead>
          <tr className="bg-slate-800/60">
            <th className="text-left px-3 py-2 text-slate-400 font-semibold">Categoría</th>
            <th className="text-left px-3 py-2 text-slate-400 font-semibold">Nombre</th>
            <th className="text-left px-3 py-2 text-slate-400 font-semibold w-16">Unidad</th>
            <th className="text-right px-3 py-2 text-slate-400 font-semibold">Total Anual</th>
            <th className="text-left px-3 py-2 text-slate-400 font-semibold w-28">Confianza IA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/40">
          {lines.map((line, i) => {
            const total = annualTotal(line.monthly_plan)
            return (
              <tr key={i} className="hover:bg-slate-800/20">
                <td className="px-3 py-2">
                  <span className={clsx('badge text-xs border', CATEGORY_COLORS[line.category] || 'text-slate-400 bg-slate-500/10')}>
                    {CATEGORY_LABELS[line.category] || line.category}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <p className="text-slate-200 font-medium">{line.name}</p>
                  {line.subcategory && <p className="text-slate-500 text-xs">{line.subcategory}</p>}
                  {line.ai_rationale && (
                    <p className="text-slate-600 text-xs italic mt-0.5 truncate max-w-[200px]" title={line.ai_rationale}>
                      {line.ai_rationale}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-400">{line.unit}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-200">
                  {formatNumber(total)} {line.unit}
                </td>
                <td className="px-3 py-2">
                  <ConfidenceBar value={line.ai_confidence} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PreviewActivities({ activities }) {
  if (!activities || activities.length === 0) {
    return <p className="text-center text-slate-500 text-sm py-6">No se detectaron actividades.</p>
  }
  return (
    <div className="space-y-2">
      {activities.map((act, i) => (
        <div key={i} className="bg-slate-800/40 rounded-lg px-3 py-2.5 border border-slate-700/40 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-slate-200 text-sm font-medium">{act.title}</p>
            {act.description && <p className="text-slate-500 text-xs mt-0.5 line-clamp-2">{act.description}</p>}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="badge text-xs bg-slate-700/50 text-slate-400">{act.category}</span>
              {act.due_date && act.due_date !== 'null' && (
                <span className="text-xs text-slate-500">{act.due_date}</span>
              )}
            </div>
          </div>
          <span className={clsx('badge text-xs flex-shrink-0', PRIORITY_COLORS[act.priority] || 'text-slate-400 bg-slate-500/10')}>
            {PRIORITY_LABELS[act.priority] || act.priority}
          </span>
        </div>
      ))}
    </div>
  )
}

function PreviewRecommendations({ recommendations }) {
  if (!recommendations || recommendations.length === 0) {
    return <p className="text-center text-slate-500 text-sm py-6">No se generaron recomendaciones.</p>
  }
  return (
    <div className="space-y-2">
      {recommendations.map((rec, i) => (
        <div key={i} className="bg-slate-800/40 rounded-lg px-3 py-3 border border-slate-700/40">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={clsx('badge text-xs border', REC_CATEGORY_COLORS[rec.category] || 'text-slate-400 bg-slate-500/10')}>
                {rec.category}
              </span>
              <span className={clsx('badge text-xs', PRIORITY_COLORS[rec.priority] || 'text-slate-400 bg-slate-500/10')}>
                {PRIORITY_LABELS[rec.priority] || rec.priority}
              </span>
              {rec.impact_level && (
                <span className="badge text-xs bg-slate-700/50 text-slate-400">
                  Impacto: {rec.impact_level}
                </span>
              )}
            </div>
          </div>
          <p className="text-slate-200 text-sm font-medium">{rec.title}</p>
          {rec.description && <p className="text-slate-400 text-xs mt-1 leading-relaxed">{rec.description}</p>}
        </div>
      ))}
    </div>
  )
}

function StepPreview({ analysis, bpId, onApplied, onBack }) {
  const [activeSubTab, setActiveSubTab] = useState('lines')

  const extraction = analysis?.structured_extraction || {}
  const lines = extraction.financial_lines || []
  const activities = extraction.activities || []
  const recommendations = extraction.recommendations || []

  const applyMutation = useMutation({
    mutationFn: () => bpAPI.applyAnalysis(bpId, analysis.id),
    onSuccess: (res) => {
      toast.success('BP importado correctamente')
      onApplied(res.data)
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || 'Error al aplicar el análisis')
    },
  })

  const SUB_TABS = [
    { id: 'lines', label: `Líneas Financieras (${lines.length})`, icon: TrendingUp },
    { id: 'activities', label: `Actividades (${activities.length})`, icon: Target },
    { id: 'recommendations', label: `Recomendaciones (${recommendations.length})`, icon: Lightbulb },
  ]

  return (
    <div className="space-y-4">
      {/* Summary */}
      {extraction.summary && (
        <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain size={14} className="text-brand-400" />
            <p className="text-xs font-semibold text-brand-400">Resumen Ejecutivo IA</p>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">{extraction.summary}</p>
          {extraction.year_suggested && (
            <p className="text-xs text-slate-500 mt-2">Año proyectado: {extraction.year_suggested}</p>
          )}
        </div>
      )}

      {/* Risks & Opportunities */}
      {((extraction.risks?.length > 0) || (extraction.opportunities?.length > 0)) && (
        <div className="grid grid-cols-2 gap-3">
          {extraction.risks?.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1">
                <AlertTriangle size={12} /> Riesgos ({extraction.risks.length})
              </p>
              <ul className="space-y-1">
                {extraction.risks.map((r, i) => (
                  <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                    <span className="text-red-500 mt-0.5">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {extraction.opportunities?.length > 0 && (
            <div className="bg-teal-500/5 border border-teal-500/20 rounded-lg p-3">
              <p className="text-xs font-semibold text-teal-400 mb-2 flex items-center gap-1">
                <Lightbulb size={12} /> Oportunidades ({extraction.opportunities.length})
              </p>
              <ul className="space-y-1">
                {extraction.opportunities.map((o, i) => (
                  <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                    <span className="text-teal-500 mt-0.5">•</span>
                    {o}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="border-b border-slate-700/50">
        <div className="flex gap-1">
          {SUB_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSubTab(id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                activeSubTab === id
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200',
              )}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        {activeSubTab === 'lines' && <PreviewLines lines={lines} />}
        {activeSubTab === 'activities' && <PreviewActivities activities={activities} />}
        {activeSubTab === 'recommendations' && <PreviewRecommendations recommendations={recommendations} />}
      </div>

      {/* Action */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
        <button type="button" className="btn-secondary flex items-center gap-1.5 text-sm" onClick={onBack}>
          <ArrowLeft size={14} /> Volver
        </button>
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-500">
            {lines.length} líneas · {activities.length} actividades · {recommendations.length} recomendaciones
          </p>
          <button
            className="btn-primary flex items-center gap-2 text-sm"
            onClick={() => applyMutation.mutate()}
            disabled={applyMutation.isPending}
          >
            {applyMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            Aplicar todo al BP
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Step 3: Done ─────────────────────────────────────────────────────────────

function StepDone({ result, onClose }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center">
        <Check size={32} className="text-green-400" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-slate-100 mb-1">¡Importación exitosa!</h3>
        <p className="text-sm text-slate-400">El BP ha sido actualizado con los datos del análisis IA.</p>
      </div>
      <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
          <p className="text-2xl font-bold text-green-400">{result?.lines_created ?? 0}</p>
          <p className="text-xs text-slate-500 mt-0.5">Líneas</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
          <p className="text-2xl font-bold text-blue-400">{result?.activities_created ?? 0}</p>
          <p className="text-xs text-slate-500 mt-0.5">Actividades</p>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
          <p className="text-2xl font-bold text-purple-400">{result?.recommendations_created ?? 0}</p>
          <p className="text-xs text-slate-500 mt-0.5">Recomendaciones</p>
        </div>
      </div>
      <button className="btn-primary px-8" onClick={onClose}>
        Ver BP actualizado
      </button>
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function BPImportWizard({ bpId, onClose, onDone }) {
  const [step, setStep] = useState(1) // 1 | 2 | 3
  const [analysis, setAnalysis] = useState(null)
  const [applyResult, setApplyResult] = useState(null)

  const STEP_LABELS = ['Cargar archivo', 'Revisar con IA', 'Importar']

  const handleAnalyzed = (analysisData) => {
    setAnalysis(analysisData)
    setStep(2)
  }

  const handleApplied = (result) => {
    setApplyResult(result)
    setStep(3)
  }

  const handleClose = () => {
    if (step === 3) onDone?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-500/15 flex items-center justify-center">
              <Brain size={16} className="text-brand-400" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100">Importar BP con IA</h2>
              <p className="text-xs text-slate-500">Paso {step} de 3 — {STEP_LABELS[step - 1]}</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        {/* Step indicators */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2">
            {STEP_LABELS.map((label, i) => {
              const stepNum = i + 1
              const isActive = step === stepNum
              const isDone = step > stepNum
              return (
                <div key={i} className="flex items-center gap-2 flex-1">
                  <div className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                    isDone ? 'bg-green-500 text-white' : isActive ? 'bg-brand-500 text-white' : 'bg-slate-700 text-slate-400',
                  )}>
                    {isDone ? <Check size={12} /> : stepNum}
                  </div>
                  <span className={clsx('text-xs', isActive ? 'text-slate-200 font-medium' : 'text-slate-500')}>
                    {label}
                  </span>
                  {i < STEP_LABELS.length - 1 && (
                    <div className={clsx('flex-1 h-px mx-1', step > stepNum ? 'bg-green-500/40' : 'bg-slate-700')} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {step === 1 && (
            <StepUpload bpId={bpId} onAnalyzed={handleAnalyzed} />
          )}
          {step === 2 && analysis && (
            <StepPreview
              analysis={analysis}
              bpId={bpId}
              onApplied={handleApplied}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepDone result={applyResult} onClose={handleClose} />
          )}
        </div>
      </div>
    </div>
  )
}
