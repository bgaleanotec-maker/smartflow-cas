import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Send, Megaphone, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuthStore } from '../stores/authStore'

const PUSH_ROLES = ['admin', 'leader', 'lider_sr', 'directivo']

function timeAgo(iso) {
  if (!iso) return ''
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 3600) return `hace ${Math.max(1, Math.round(diff / 60))}m`
  if (diff < 86400) return `hace ${Math.round(diff / 3600)}h`
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

/** Comentarios en una tarea (taskId) o proyecto (projectId), con push 📣 para líderes. */
export default function CommentsBox({ taskId, projectId }) {
  const { user } = useAuthStore()
  const canPush = PUSH_ROLES.includes(user?.role)
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const key = ['comments', taskId || `p${projectId}`]

  const { data: comments = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.get('/comments', {
      params: taskId ? { task_id: taskId } : { project_id: projectId },
    }).then(r => r.data),
  })

  const sendMut = useMutation({
    mutationFn: (push) => api.post('/comments', {
      content: text.trim(),
      task_id: taskId || null,
      project_id: projectId || null,
      push,
    }),
    onSuccess: (res, push) => {
      setText('')
      qc.invalidateQueries({ queryKey: key })
      if (push) {
        const pr = res.data.push_result
        if (pr?.notified) {
          toast.success(`📣 Notificado a ${pr.target}${pr.whatsapp ? ' (WhatsApp ✓)' : ''}`)
        } else {
          toast(`Comentario guardado — ${pr?.reason || 'sin notificación'}`, { icon: '💬' })
        }
      } else {
        toast.success('💬 Comentario agregado')
      }
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Error al comentar'),
  })

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  return (
    <div className="space-y-2">
      <label className="label text-xs mb-1 flex items-center gap-1.5">
        <MessageSquare className="w-3 h-3" /> Comentarios {comments.length > 0 && `(${comments.length})`}
      </label>

      {isLoading ? (
        <p className="text-[11px] text-slate-600">Cargando…</p>
      ) : (
        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
          {comments.map(c => (
            <div key={c.id} className={`group rounded-xl px-3 py-2 border ${
              c.is_push ? 'bg-amber-950/25 border-amber-900/40' : 'bg-slate-800/50 border-slate-700/50'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-300">{c.author}</span>
                {c.is_push && <span className="text-[9px] text-amber-400 flex items-center gap-0.5"><Megaphone size={9} /> notificado</span>}
                <span className="text-[9px] text-slate-600 ml-auto">{timeAgo(c.created_at)}</span>
                {(c.author_id === user?.id || canPush) && (
                  <button onClick={() => delMut.mutate(c.id)}
                    className="text-slate-700 hover:text-red-400 opacity-0 group-hover:opacity-100">
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="text-[11px] text-slate-600 py-1">Sin comentarios aún</p>
          )}
        </div>
      )}

      {/* Input */}
      <div className="space-y-1.5">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          className="input text-xs w-full h-14 resize-none"
          placeholder={canPush ? 'Deja indicaciones para el responsable…' : 'Escribe un comentario…'}
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => text.trim() && sendMut.mutate(false)}
            disabled={sendMut.isPending || !text.trim()}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs disabled:opacity-40 transition-colors"
          >
            {sendMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Comentar
          </button>
          {canPush && (
            <button
              onClick={() => text.trim() && sendMut.mutate(true)}
              disabled={sendMut.isPending || !text.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-medium disabled:opacity-40 transition-colors"
              title="Guarda el comentario y notifica al responsable (in-app + WhatsApp)"
            >
              <Megaphone size={12} /> Notificar 📣
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
