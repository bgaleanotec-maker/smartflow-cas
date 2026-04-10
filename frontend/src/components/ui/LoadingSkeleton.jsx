// Reusable loading skeleton components using pulse animation

export function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
  return (
    <div className={`animate-pulse bg-slate-800 rounded ${width} ${height}`} />
  )
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card space-y-3">
      <div className="animate-pulse bg-slate-800 rounded h-5 w-2/3" />
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse bg-slate-800 rounded h-3"
          style={{ width: `${85 - i * 12}%` }}
        />
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="card overflow-hidden p-0">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 border-b border-slate-800 bg-slate-800/40">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="animate-pulse bg-slate-700 rounded h-3 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex gap-4 px-4 py-3 border-b border-slate-800/60 last:border-0">
          {Array.from({ length: cols }).map((_, ci) => (
            <div
              key={ci}
              className="animate-pulse bg-slate-800 rounded h-3 flex-1"
              style={{ opacity: 1 - ci * 0.1 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="card flex items-center gap-3">
      <div className="animate-pulse bg-slate-800 rounded-xl w-10 h-10 flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="animate-pulse bg-slate-800 rounded h-5 w-16" />
        <div className="animate-pulse bg-slate-800 rounded h-3 w-28" />
      </div>
    </div>
  )
}

export function SkeletonList({ items = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="card flex items-start gap-3">
          <div className="animate-pulse bg-slate-800 rounded-lg w-9 h-9 flex-shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="animate-pulse bg-slate-800 rounded h-4 w-3/4" />
            <div className="animate-pulse bg-slate-800 rounded h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}
