/**
 * VoiceInputButton — botón de micrófono para dictar texto en cualquier campo.
 *
 * Uso básico:
 *   <VoiceInputButton onText={(t) => setComment(prev => prev ? prev + ' ' + t : t)} />
 *
 * Con reemplazo total:
 *   <VoiceInputButton onText={setText} replace />
 *
 * Ejemplo en un textarea:
 *   <div className="relative">
 *     <textarea value={text} onChange={e => setText(e.target.value)} />
 *     <VoiceInputButton
 *       onText={(t) => setText(prev => prev ? prev + ' ' + t : t)}
 *       className="absolute bottom-2 right-2"
 *     />
 *   </div>
 *
 * REQUISITO: La Web Speech API requiere HTTPS (o localhost).
 * Navegadores soportados: Chrome, Edge (Chromium). Firefox y Safari no lo soportan.
 */
import { useState, useRef, useCallback } from 'react'
import { Mic, Square, MicOff } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'

// Detect if we're in a context where Web Speech API might work
function checkSpeechAvailable() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) {
    // Check if it could be an HTTPS issue or browser issue
    const isInsecure = (
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    )
    return {
      available: false,
      reason: isInsecure
        ? 'El dictado por voz requiere HTTPS. Accede al sistema desde una conexión segura (https://).'
        : 'Tu navegador no soporta dictado por voz. Usa Chrome o Edge (Chromium).',
    }
  }
  return { available: true, reason: null }
}

export default function VoiceInputButton({
  onText,           // (text: string) => void — called on each final phrase
  className = '',
  size = 16,
  tooltip = true,
}) {
  const [state, setState] = useState('idle')  // idle | listening | error
  const [errorMsg, setErrorMsg] = useState('')
  const srRef = useRef(null)
  const activeRef = useRef(false)

  const stop = useCallback(() => {
    activeRef.current = false
    setState('idle')
    if (srRef.current) {
      try { srRef.current.stop() } catch {}
      srRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    const { available, reason } = checkSpeechAvailable()
    if (!available) {
      setErrorMsg(reason)
      setState('error')
      toast.error(reason, { duration: 5000, id: 'stt-unavailable' })
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const sr = new SR()
    sr.lang = 'es-CO'
    sr.continuous = true
    sr.interimResults = false
    srRef.current = sr
    activeRef.current = true

    sr.onresult = (event) => {
      const finals = Array.from(event.results)
        .slice(event.resultIndex)
        .filter(r => r.isFinal)
        .map(r => r[0].transcript.trim())
        .filter(Boolean)
        .join(' ')
      if (finals) onText(finals)
    }

    sr.onend = () => {
      if (activeRef.current) {
        try { sr.start() } catch {
          activeRef.current = false
          setState('idle')
        }
      }
    }

    sr.onerror = (e) => {
      if (e.error === 'not-allowed') {
        activeRef.current = false
        const msg = 'Permiso de micrófono denegado. Habilítalo en la configuración del navegador.'
        setErrorMsg(msg)
        setState('error')
        toast.error(msg, { duration: 5000, id: 'stt-denied' })
        return
      }
      if (e.error === 'network') {
        activeRef.current = false
        const msg = 'Error de red en el reconocimiento de voz. Verifica tu conexión.'
        setErrorMsg(msg)
        setState('error')
        toast.error(msg, { duration: 4000, id: 'stt-network' })
        return
      }
      if (e.error === 'aborted' || e.error === 'no-speech') {
        // Non-fatal: restart
        if (activeRef.current) {
          setTimeout(() => { try { sr.start() } catch {} }, 300)
        }
        return
      }
      if (activeRef.current) {
        setTimeout(() => { try { sr.start() } catch {} }, 300)
      }
    }

    try {
      sr.start()
      setState('listening')
    } catch (err) {
      const msg = 'No se pudo iniciar el reconocimiento de voz.'
      setErrorMsg(msg)
      setState('error')
      toast.error(msg, { duration: 4000, id: 'stt-start-err' })
    }
  }, [onText])

  const handleClick = () => {
    if (state === 'listening') {
      stop()
    } else if (state === 'error') {
      // Reset and try again
      setErrorMsg('')
      setState('idle')
    } else {
      start()
    }
  }

  const getTitle = () => {
    if (!tooltip) return undefined
    if (state === 'listening') return 'Detener dictado'
    if (state === 'error') return errorMsg || 'Error — toca para reintentar'
    return 'Dictar por voz (Chrome/Edge + HTTPS)'
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={getTitle()}
      className={clsx(
        'flex items-center justify-center rounded-lg p-1.5 transition-all select-none',
        state === 'listening'
          ? 'text-red-400 bg-red-500/15 ring-1 ring-red-500/30'
          : state === 'error'
            ? 'text-amber-500 hover:text-amber-400 hover:bg-amber-900/20 cursor-pointer'
            : 'text-slate-400 hover:text-brand-400 hover:bg-brand-500/10',
        className,
      )}
    >
      {state === 'listening'
        ? <Square size={size} className="animate-pulse" />
        : state === 'error'
          ? <MicOff size={size} />
          : <Mic size={size} />}
    </button>
  )
}
