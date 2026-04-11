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
 */
import { useState, useRef, useCallback } from 'react'
import { Mic, Square } from 'lucide-react'
import clsx from 'clsx'

export default function VoiceInputButton({
  onText,           // (text: string) => void — called on each final phrase
  className = '',
  size = 16,
  tooltip = true,
}) {
  const [state, setState] = useState('idle')  // idle | listening | error
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
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setState('error'); return }

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
        setState('error')
        return
      }
      if (activeRef.current) {
        setTimeout(() => { try { sr.start() } catch {} }, 300)
      }
    }

    try { sr.start(); setState('listening') } catch { setState('error') }
  }, [onText])

  const toggle = () => (state === 'listening' ? stop() : start())

  const titles = {
    idle: 'Dictar por voz',
    listening: 'Detener dictado',
    error: 'Dictado no disponible en este navegador (usa Chrome o Edge)',
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === 'error'}
      title={tooltip ? titles[state] : undefined}
      className={clsx(
        'flex items-center justify-center rounded-lg p-1.5 transition-all select-none',
        state === 'listening'
          ? 'text-red-400 bg-red-500/15 ring-1 ring-red-500/30'
          : state === 'error'
            ? 'text-slate-600 cursor-not-allowed opacity-50'
            : 'text-slate-400 hover:text-brand-400 hover:bg-brand-500/10',
        className,
      )}
    >
      {state === 'listening'
        ? <Square size={size} className="animate-pulse" />
        : <Mic size={size} />}
    </button>
  )
}
