/**
 * QuickChatPanel — Chat rápido con IA + voz para móvil
 *
 * Features:
 *  - Mantén presionado el mic para grabar, suelta para transcribir (Web Speech API)
 *  - Texto editable antes de enviar
 *  - ARIA responde con Gemini
 *  - Acciones rápidas: Copiar, Guardar como recordatorio, Crear incidente, Compartir
 *  - Historial de conversación en la sesión
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Mic, MicOff, Send, X, Copy, Bell, AlertTriangle,
  CheckCheck, Loader2, Sparkles, ChevronDown, Trash2,
  Volume2
} from 'lucide-react'
import { voiceAPI, remindersAPI } from '../../services/api'
import { useAuthStore } from '../../stores/authStore'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

export default function QuickChatPanel({ onClose }) {
  const { user } = useAuthStore()
  const firstName = user?.full_name?.split(' ')[0] || 'tú'

  const [messages, setMessages] = useState([
    {
      id: 0,
      role: 'assistant',
      text: `Hola ${firstName} 👋 Habla o escribe — te ayudo al instante.`,
    }
  ])
  const [inputText, setInputText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [interimText, setInterimText] = useState('')
  const srRef = useRef(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  // Scroll al fondo cuando llegan nuevos mensajes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, interimText])

  // ── Voice input (tap/hold to speak) ──────────────────────────────────────
  const startListening = useCallback(() => {
    if (!SpeechRecognition) {
      toast.error('Tu navegador no soporta reconocimiento de voz')
      return
    }
    if (srRef.current) srRef.current.stop()

    const sr = new SpeechRecognition()
    sr.continuous = false
    sr.interimResults = true
    sr.lang = 'es-CO'
    srRef.current = sr

    sr.onstart = () => setIsListening(true)
    sr.onend = () => {
      setIsListening(false)
      setInterimText('')
    }
    sr.onresult = (e) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) final += t
        else interim += t
      }
      setInterimText(interim)
      if (final.trim()) {
        setInputText(prev => (prev ? prev + ' ' : '') + final.trim())
        setInterimText('')
      }
    }
    sr.onerror = (e) => {
      if (e.error !== 'no-speech') toast.error('Error de micrófono: ' + e.error)
      setIsListening(false)
      setInterimText('')
    }
    sr.start()
  }, [])

  const stopListening = useCallback(() => {
    srRef.current?.stop()
    setIsListening(false)
  }, [])

  const toggleListening = () => {
    if (isListening) stopListening()
    else startListening()
  }

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    const text = inputText.trim()
    if (!text || isSending) return

    const userMsg = { id: Date.now(), role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setInputText('')
    setIsSending(true)

    try {
      // Build history for ARIA (last 6 turns)
      const history = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.text,
      }))

      const res = await voiceAPI.ariaChat({
        text,
        user_name: user?.full_name || firstName,
        history,
      })

      const aiText = res.data?.response_text || 'Sin respuesta.'
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        text: aiText,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        text: '⚠️ No pude conectar con ARIA. Intenta de nuevo.',
      }])
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Quick actions on AI messages ─────────────────────────────────────────
  const copyMessage = (text) => {
    navigator.clipboard.writeText(text)
    toast.success('Copiado')
  }

  const saveAsReminder = async (text) => {
    try {
      await remindersAPI.create({ title: text.slice(0, 280), priority: 'media' })
      toast.success('Guardado como recordatorio ✓')
    } catch {
      toast.error('Error al guardar recordatorio')
    }
  }

  const clearChat = () => {
    setMessages([{
      id: 0,
      role: 'assistant',
      text: `Hola ${firstName} 👋 Habla o escribe — te ayudo al instante.`,
    }])
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-950 lg:inset-auto lg:bottom-4 lg:right-4 lg:w-[420px] lg:h-[600px] lg:rounded-2xl lg:shadow-2xl lg:border lg:border-slate-700">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-brand-900/60 to-purple-900/60 border-b border-slate-800 lg:rounded-t-2xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">ARIA</p>
            <p className="text-[10px] text-brand-300">Chat rápido con IA</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={clearChat}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="Limpiar chat"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div className={clsx(
              'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
              msg.role === 'user'
                ? 'bg-brand-600 text-white rounded-br-md'
                : 'bg-slate-800 text-slate-100 rounded-bl-md'
            )}>
              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* Actions on AI messages */}
              {msg.role === 'assistant' && msg.id !== 0 && (
                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-slate-700/50">
                  <button
                    onClick={() => copyMessage(msg.text)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
                  >
                    <Copy size={11} /> Copiar
                  </button>
                  <button
                    onClick={() => saveAsReminder(msg.text)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
                  >
                    <Bell size={11} /> Recordatorio
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Interim text bubble */}
        {interimText && (
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 bg-brand-700/60 text-white text-sm italic opacity-80">
              {interimText}▌
            </div>
          </div>
        )}

        {/* ARIA typing indicator */}
        {isSending && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
              <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/80 lg:rounded-b-2xl">
        {/* Listening indicator */}
        {isListening && (
          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-red-900/30 border border-red-700/40 rounded-xl">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-red-300 font-medium">Escuchando... habla ahora</span>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe o usa el mic..."
            rows={1}
            className="flex-1 bg-slate-800 text-white placeholder-slate-500 text-sm rounded-xl px-3 py-2.5 resize-none border border-slate-700 focus:border-brand-500 focus:outline-none transition-colors min-h-[44px] max-h-[120px]"
            style={{ height: 'auto' }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
          />

          {/* Mic button */}
          <button
            onPointerDown={startListening}
            onPointerUp={stopListening}
            onPointerLeave={stopListening}
            onClick={toggleListening}
            className={clsx(
              'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
              isListening
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/40 scale-110'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            )}
            title="Mantén presionado para hablar"
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {/* Send button */}
          <button
            onClick={sendMessage}
            disabled={!inputText.trim() || isSending}
            className={clsx(
              'w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all',
              inputText.trim() && !isSending
                ? 'bg-brand-600 text-white hover:bg-brand-500 shadow-lg shadow-brand-600/30'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            )}
          >
            {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>

        <p className="text-[10px] text-slate-600 text-center mt-2">
          Enter para enviar · Shift+Enter para nueva línea · Toca el mic para hablar
        </p>
      </div>
    </div>
  )
}
