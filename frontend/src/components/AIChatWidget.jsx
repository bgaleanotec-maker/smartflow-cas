import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, X, Send, Loader2, Bot, User, CheckCircle, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { aiAPI } from '../services/api'

export default function AIChatWidget() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([
    { role: 'ai', content: 'Hola, soy **SmartFlow AI**. Puedo ayudarte a crear tareas, demandas, registrar tu standup, y mas. Escribe **ayuda** para ver que puedo hacer.' },
  ])
  const [loading, setLoading] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isOpen) inputRef.current?.focus()
  }, [isOpen])

  const sendMessage = async () => {
    if (!message.trim() || loading) return
    const userMsg = message.trim()
    setMessage('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setLoading(true)

    // Handle confirmation of pending action
    if (pendingAction && ['si', 'sí', 'confirmo', 'ok', 'dale', 'yes', 'confirmar'].includes(userMsg.toLowerCase())) {
      try {
        const res = await aiAPI.executeAction({
          action_type: pendingAction.action.replace('create_', 'create_'),
          data: pendingAction.data,
        })
        setMessages(prev => [...prev, { role: 'ai', content: res.data.message, type: 'success' }])
        if (res.data.redirect) {
          setTimeout(() => navigate(res.data.redirect), 1500)
        }
      } catch (err) {
        setMessages(prev => [...prev, { role: 'ai', content: 'Error al ejecutar la accion. Intenta de nuevo.' }])
      }
      setPendingAction(null)
      setLoading(false)
      return
    }

    if (pendingAction && ['no', 'cancelar', 'cancel'].includes(userMsg.toLowerCase())) {
      setMessages(prev => [...prev, { role: 'ai', content: 'Accion cancelada. ¿En que mas puedo ayudarte?' }])
      setPendingAction(null)
      setLoading(false)
      return
    }

    try {
      const res = await aiAPI.chat({ message: userMsg })
      const data = res.data

      if (data.action && data.action !== 'message') {
        setPendingAction({ action: data.action, data: data.data })
      }

      setMessages(prev => [...prev, {
        role: 'ai',
        content: data.message,
        type: data.action !== 'message' ? 'action' : undefined,
      }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', content: 'Error de conexion. Verifica tu sesion.' }])
    }
    setLoading(false)
  }

  const formatMessage = (text) => {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <>
      {/* Float button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-[88px] left-4 lg:bottom-6 lg:left-6 z-50 w-14 h-14 bg-gradient-to-br from-brand-500 to-purple-600 rounded-full shadow-lg shadow-brand-500/30 flex items-center justify-center text-white hover:scale-110 transition-transform"
          aria-label="Abrir asistente IA"
        >
          <Sparkles size={24} />
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <div className="fixed bottom-[88px] left-4 right-4 lg:bottom-6 lg:left-auto lg:right-6 z-50 w-auto lg:w-[380px] max-w-[calc(100vw-2rem)] lg:max-w-[380px] h-[480px] lg:h-[520px] max-h-[calc(100vh-6rem)] bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl shadow-black/50 flex flex-col overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-600 to-purple-600 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Bot size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">SmartFlow AI</p>
                <p className="text-[10px] text-white/70">Asistente de gestion</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white" aria-label="Cerrar chat">
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3" role="log" aria-live="polite">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white rounded-br-md'
                    : msg.type === 'success'
                    ? 'bg-green-500/10 border border-green-500/20 text-green-300 rounded-bl-md'
                    : msg.type === 'action'
                    ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 rounded-bl-md'
                    : 'bg-slate-800 text-slate-300 rounded-bl-md'
                }`}>
                  {msg.type === 'success' && <CheckCircle size={14} className="inline mr-1 text-green-400" />}
                  <span dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }} />
                  {msg.type === 'action' && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-yellow-500/20">
                      <button onClick={() => { setMessage('si'); setTimeout(sendMessage, 100) }}
                        className="text-xs px-3 py-1 rounded-full bg-green-500/20 text-green-400 hover:bg-green-500/30">
                        Confirmar
                      </button>
                      <button onClick={() => { setMessage('no'); setTimeout(sendMessage, 100) }}
                        className="text-xs px-3 py-1 rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30">
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3">
                  <Loader2 size={16} className="animate-spin text-brand-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 p-3 border-t border-slate-800">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Escribe un mensaje..."
                className="flex-1 bg-slate-800 text-white text-sm rounded-full px-4 py-2.5 border border-slate-700 focus:border-brand-500 focus:outline-none placeholder-slate-500"
                aria-label="Mensaje para el asistente IA"
              />
              <button
                onClick={sendMessage}
                disabled={!message.trim() || loading}
                className="w-10 h-10 bg-brand-600 rounded-full flex items-center justify-center text-white hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                aria-label="Enviar mensaje"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
