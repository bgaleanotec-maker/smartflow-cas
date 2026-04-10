// Reusable empty state component for lists/tables with no data

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center px-4 ${className}`}>
      {Icon && (
        <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-4">
          <Icon size={26} className="text-slate-500" />
        </div>
      )}
      {title && (
        <h3 className="text-slate-300 font-medium text-base mb-1">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-slate-500 max-w-xs leading-relaxed">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  )
}
