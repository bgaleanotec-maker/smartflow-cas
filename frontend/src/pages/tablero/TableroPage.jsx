import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable, DragOverlay,
} from '@dnd-kit/core'
import {
  SquareKanban, Loader2, Repeat, ListTodo, FolderKanban,
  AlertTriangle, Flame, Users2, CheckCircle2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { dashboardAPI, usersAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import { celebrate } from '../mi-espacio/MiEspacioPage'

const PRIVILEGED = ['admin', 'leader', 'lider_sr', 'directivo']

const SOURCE_META = {
  recurrente: { icon: Repeat, label: 'Recurrente', cls: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
  rapida: { icon: ListTodo, label: 'Rápida', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  proyecto: { icon: FolderKanban, label: 'Proyecto', cls: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
}

// Criticidad → borde izquierdo (Scrum: lo urgente se ve sin leer)
const PRIORITY_BORDER = {
  critica: 'border-l-red-500', urgente: 'border-l-red-500',
  alta: 'border-l-orange-400', media: 'border-l-sky-500', baja: 'border-l-slate-600',
}

function Card({ item, dragging }) {
  const meta = SOURCE_META[item.source] || SOURCE_META.rapida
  const overdue = item.days_overdue > 0
  const pb = PRIORITY_BORDER[String(item.priority || 'media').toLowerCase()] || PRIORITY_BORDER.media

  return (
    <div className={`bg-slate-900 border border-slate-800 border-l-4 ${pb} rounded-xl p-3 select-none
      ${dragging ? 'shadow-2xl shadow-black/50 rotate-2 scale-105' : 'hover:border-slate-700'}
      ${overdue ? 'ring-1 ring-red-900/60' : ''}`}
    >
      <p className="text-xs text-slate-200 leading-snug">{item.title}</p>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className={`text-[9px] px-1.5 py-0 rounded border ${meta.cls}`}>{meta.label}</span>
        {item.project && (
          <span className="text-[9px] text-indigo-300/80 truncate max-w-[110px]">📁 {item.project}</span>
        )}
        {overdue ? (
          <span className="text-[9px] font-bold text-red-400 flex items-center gap-0.5">
            <AlertTriangle size={9} /> {item.days_overdue}d
          </span>
        ) : item.due_date ? (
          <span className="text-[9px] text-slate-500 font-mono">{item.due_date.slice(5)}</span>
        ) : null}
      </div>
    </div>
  )
}

function DraggableCard({ item }) {
  const id = `${item.source}:${item.id}`
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data: item })
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      className={`cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'opacity-30' : ''}`}
    >
      <Card item={item} />
    </div>
  )
}

function Column({ id, title, icon, items, accent, hint, children }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div className="flex-1 min-w-[260px] flex flex-col">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-b-2 ${accent}`}>
        {icon}
        <span className="text-sm font-semibold text-white">{title}</span>
        <span className="text-xs text-slate-500 ml-auto bg-slate-800 rounded-full px-2 py-0.5">{items.length}</span>
      </div>
      {hint}
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 p-2.5 rounded-b-xl min-h-[200px] transition-colors ${
          isOver ? 'bg-slate-800/60 ring-2 ring-brand-500/40' : 'bg-slate-900/40'
        }`}
      >
        {children}
        {items.length === 0 && (
          <p className="text-[11px] text-slate-600 text-center py-8">Arrastra tarjetas aquí</p>
        )}
      </div>
    </div>
  )
}

export default function TableroPage() {
  const { user } = useAuthStore()
  const isPrivileged = PRIVILEGED.includes(user?.role)
  const queryClient = useQueryClient()
  const [viewUserId, setViewUserId] = useState('')
  const [activeItem, setActiveItem] = useState(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const { data, isLoading } = useQuery({
    queryKey: ['board', viewUserId],
    queryFn: () => dashboardAPI.board(viewUserId || undefined).then(r => r.data),
    refetchInterval: 90_000,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users-mini'],
    queryFn: () => usersAPI.list({ is_active: true, limit: 100 }).then(r =>
      Array.isArray(r.data) ? r.data : r.data?.items || []),
    enabled: isPrivileged,
  })

  const moveMut = useMutation({
    mutationFn: ({ item, column }) => dashboardAPI.boardMove({ source: item.source, id: item.id, column }),
    onError: () => {
      toast.error('No se pudo mover la tarjeta')
      queryClient.invalidateQueries({ queryKey: ['board'] })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['board'] })
      queryClient.invalidateQueries({ queryKey: ['mi-espacio'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-gerencial'] })
    },
  })

  const board = useMemo(() => ({
    todo: data?.todo || [],
    doing: data?.doing || [],
    done: data?.done || [],
  }), [data])

  const handleDragEnd = (event) => {
    setActiveItem(null)
    const { active, over } = event
    if (!over) return
    const item = active.data.current
    const column = over.id
    if (!['todo', 'doing', 'done'].includes(column)) return
    // ¿ya está en esa columna?
    const currentCol = board.doing.some(i => i.source === item.source && i.id === item.id)
      ? 'doing'
      : board.done.some(i => i.source === item.source && i.id === item.id) ? 'done' : 'todo'
    if (currentCol === column) return

    // Optimista: mover en caché
    queryClient.setQueryData(['board', viewUserId], (old) => {
      if (!old) return old
      const strip = (arr) => arr.filter(i => !(i.source === item.source && i.id === item.id))
      const next = { ...old, todo: strip(old.todo), doing: strip(old.doing), done: strip(old.done) }
      next[column] = [item, ...next[column]]
      return next
    })

    if (column === 'done') {
      celebrate()
      const msgs = ['🎉 ¡Terminada!', '💪 ¡Una menos!', '🚀 ¡Imparable!', '⭐ +XP']
      toast.success(msgs[Math.floor(Math.random() * msgs.length)])
    }
    moveMut.mutate({ item, column })
  }

  const wipExceeded = board.doing.length > 3

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <SquareKanban size={22} className="text-brand-400" /> Mi Tablero
          </h1>
          <p className="text-sm text-slate-400">
            Arrastra hasta terminar el día · {board.todo.length + board.doing.length} pendientes · <span className="text-emerald-400">{board.done.length} hechas hoy</span>
          </p>
        </div>

        {isPrivileged && (
          <div className="flex items-center gap-2">
            <Users2 size={15} className="text-slate-500" />
            <select
              value={viewUserId}
              onChange={e => setViewUserId(e.target.value)}
              className="input py-1.5 text-xs w-48"
              title="Ver el tablero de otra persona"
            >
              <option value="">Mi tablero</option>
              {users.filter(u => u.id !== user?.id).map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={26} className="animate-spin text-brand-400" />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={e => setActiveItem(e.active.data.current)}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveItem(null)}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            <Column
              id="todo" title="Por Hacer" items={board.todo}
              icon={<span className="w-2.5 h-2.5 rounded-full bg-slate-500" />}
              accent="border-slate-600 bg-slate-900"
            >
              {board.todo.map(i => <DraggableCard key={`${i.source}:${i.id}`} item={i} />)}
            </Column>

            <Column
              id="doing" title="En Progreso" items={board.doing}
              icon={<span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />}
              accent="border-blue-600 bg-slate-900"
              hint={wipExceeded && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-950/40 border-x border-amber-900/40 px-3 py-1.5">
                  <Flame size={11} /> WIP alto ({board.doing.length}): en Scrum, termina antes de empezar otra
                </div>
              )}
            >
              {board.doing.map(i => <DraggableCard key={`${i.source}:${i.id}`} item={i} />)}
            </Column>

            <Column
              id="done" title="Hecho hoy" items={board.done}
              icon={<CheckCircle2 size={14} className="text-emerald-400" />}
              accent="border-emerald-600 bg-slate-900"
            >
              {board.done.map((i, idx) => (
                <div key={`d-${idx}`} className="bg-slate-900/70 border border-emerald-900/30 rounded-xl p-3 opacity-75">
                  <p className="text-xs text-slate-400 line-through decoration-emerald-500/60">{i.title}</p>
                  <span className={`text-[9px] px-1.5 rounded border mt-1.5 inline-block ${(SOURCE_META[i.source] || SOURCE_META.rapida).cls}`}>
                    {(SOURCE_META[i.source] || SOURCE_META.rapida).label}
                  </span>
                </div>
              ))}
            </Column>
          </div>

          <DragOverlay>
            {activeItem && <Card item={activeItem} dragging />}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
