import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Mic, MicOff, X, Users, Radio, Square, Copy, Check,
  Play, Loader2, ChevronDown, Volume2, VolumeX,
} from 'lucide-react'
import { voiceAPI } from '../../services/api'
import SoundVisualizer from './SoundVisualizer'
import clsx from 'clsx'

// ─── Status labels ────────────────────────────────────────────────────────────
const STATUS = {
  idle: 'Toca el micrófono para hablar',
  listening: 'Escuchando...',
  processing: 'Procesando...',
  speaking: 'ARIA está hablando...',
  error: 'Error al procesar',
}

// ─── Speaker colors for transcript ───────────────────────────────────────────
const SPEAKER_COLORS = [
  'bg-brand-600',
  'bg-purple-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-cyan-600',
]

function getSpeakerColor(name) {
  if (!name) return SPEAKER_COLORS[0]
  if (name === 'ARIA') return 'bg-purple-600'
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return SPEAKER_COLORS[Math.abs(hash) % SPEAKER_COLORS.length]
}

// ─── ARIA Logo with animated rings ───────────────────────────────────────────
function ARIALogo({ speaking = false }) {
  return (
    <div className="relative flex items-center justify-center w-24 h-24 mx-auto mb-2">
      {/* Outer ring */}
      <div
        className={clsx(
          'absolute inset-0 rounded-full border-2 border-purple-500/40',
          speaking ? 'animate-spin-slow' : 'animate-spin-slower',
        )}
        style={{ animationDuration: speaking ? '3s' : '8s' }}
      />
      {/* Inner ring */}
      <div
        className={clsx(
          'absolute inset-2 rounded-full border border-brand-400/30',
          speaking ? 'animate-spin-slow' : '',
        )}
        style={{ animationDirection: 'reverse', animationDuration: '5s' }}
      />
      {/* Glow */}
      <div
        className={clsx(
          'absolute inset-4 rounded-full transition-all duration-500',
          speaking
            ? 'bg-purple-600/30 shadow-lg shadow-purple-500/40'
            : 'bg-brand-600/20',
        )}
      />
      {/* Text */}
      <span
        className={clsx(
          'relative z-10 text-2xl font-black tracking-widest bg-clip-text text-transparent',
          speaking
            ? 'bg-gradient-to-r from-purple-300 to-purple-500'
            : 'bg-gradient-to-r from-brand-300 to-purple-400',
        )}
      >
        ARIA
      </span>
    </div>
  )
}

// ─── Big mic button ───────────────────────────────────────────────────────────
function MicButton({ state, onClick }) {
  const base = 'relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer select-none'
  const styles = {
    idle: `${base} bg-slate-700 hover:bg-slate-600 shadow-lg`,
    listening: `${base} bg-red-500 shadow-xl shadow-red-500/40 scale-105`,
    processing: `${base} bg-brand-600 shadow-lg shadow-brand-500/40`,
    speaking: `${base} bg-purple-600 shadow-lg shadow-purple-500/40`,
    error: `${base} bg-red-700 hover:bg-red-600`,
  }

  return (
    <button
      onClick={onClick}
      className={styles[state] || styles.idle}
      aria-label="Micrófono"
    >
      {/* Pulse ring when recording */}
      {state === 'listening' && (
        <>
          <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
          <span className="absolute -inset-2 rounded-full border border-red-400/40 animate-ping opacity-20" style={{ animationDelay: '0.3s' }} />
        </>
      )}
      {state === 'processing' ? (
        <Loader2 size={32} className="text-white animate-spin" />
      ) : state === 'speaking' ? (
        <Volume2 size={32} className="text-white" />
      ) : state === 'listening' ? (
        <MicOff size={32} className="text-white" />
      ) : (
        <Mic size={32} className="text-white" />
      )}
    </button>
  )
}

// ─── Chat bubble ─────────────────────────────────────────────────────────────
function ChatBubble({ role, text, audioB64, onReplay }) {
  const isARIA = role === 'aria'
  return (
    <div className={clsx('flex gap-2 animate-fade-in', isARIA ? 'flex-row' : 'flex-row-reverse')}>
      {isARIA && (
        <div className="w-7 h-7 rounded-full bg-purple-700 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-1">
          AI
        </div>
      )}
      <div
        className={clsx(
          'max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed',
          isARIA
            ? 'bg-gradient-to-br from-indigo-900/80 to-purple-900/80 border border-purple-700/40 text-slate-100 rounded-tl-sm'
            : 'bg-slate-700 text-slate-100 rounded-tr-sm',
        )}
      >
        <p>{text}</p>
        {isARIA && audioB64 && (
          <button
            onClick={() => onReplay(audioB64)}
            className="mt-1.5 flex items-center gap-1 text-[11px] text-purple-300 hover:text-purple-200 transition-colors"
          >
            <Play size={11} />
            Reproducir
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Recording timer ─────────────────────────────────────────────────────────
function RecordingTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [startedAt])

  const h = Math.floor(elapsed / 3600)
  const m = Math.floor((elapsed % 3600) / 60)
  const s = elapsed % 60
  return (
    <span className="font-mono text-2xl font-bold text-red-400">
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
    </span>
  )
}

// ─── Main VoiceAIPanel ────────────────────────────────────────────────────────
export default function VoiceAIPanel({ currentUser }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('aria') // 'aria' | 'meeting'
  const [ariaStatus, setAriaStatus] = useState('idle')
  const [chat, setChat] = useState([])
  const [meeting, setMeeting] = useState(null)
  const [meetingTitle, setMeetingTitle] = useState('')
  const [transcript, setTranscript] = useState([]) // [{speaker, text, seq}]
  const [isRecordingMeeting, setIsRecordingMeeting] = useState(false)
  const [recordingStart, setRecordingStart] = useState(null)
  const [finalizing, setFinalizing] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [analyserNode, setAnalyserNode] = useState(null)
  const [isARIASpeaking, setIsARIASpeaking] = useState(false)
  const [hasNotif] = useState(false)

  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const chunksRef = useRef([])
  const chunkIntervalRef = useRef(null)
  const transcriptEndRef = useRef(null)
  const chatEndRef = useRef(null)

  // Auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  // Greet on panel open (ARIA mode)
  useEffect(() => {
    if (open && mode === 'aria' && chat.length === 0 && currentUser) {
      sendAriaMessage('saludo_inicial')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const cleanupAudio = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current)
      chunkIntervalRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    setAnalyserNode(null)
    analyserRef.current = null
  }, [])

  // ── ARIA Chat ──────────────────────────────────────────────────────────────

  const sendAriaMessage = async (text) => {
    if (ariaStatus === 'processing') return
    setAriaStatus('processing')
    try {
      const res = await voiceAPI.ariaChat({
        text,
        user_name: currentUser?.full_name || 'Usuario',
        meeting_id: null,
      })
      const data = res.data
      if (text !== 'saludo_inicial') {
        setChat((prev) => [...prev, { role: 'user', text }])
      }
      setChat((prev) => [...prev, { role: 'aria', text: data.response_text, audioB64: data.audio_base64 }])

      if (data.audio_base64) {
        playAudio(data.audio_base64)
      } else {
        setAriaStatus('idle')
      }
    } catch {
      setAriaStatus('error')
      setTimeout(() => setAriaStatus('idle'), 2000)
    }
  }

  const playAudio = (b64) => {
    setAriaStatus('speaking')
    setIsARIASpeaking(true)
    const audio = new Audio(`data:audio/mpeg;base64,${b64}`)
    audio.play().catch(() => {})
    audio.onended = () => {
      setAriaStatus('idle')
      setIsARIASpeaking(false)
    }
    audio.onerror = () => {
      setAriaStatus('idle')
      setIsARIASpeaking(false)
    }
  }

  // Start ARIA mic recording → transcribe → send to ARIA
  const startAriaRecording = async () => {
    if (ariaStatus !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Audio analyser
      const ctx = new AudioContext()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser
      setAnalyserNode(analyser)

      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mr.onstop = async () => {
        cleanupAudio()
        if (chunksRef.current.length === 0) {
          setAriaStatus('idle')
          return
        }
        setAriaStatus('processing')

        // Transcribe locally (via chunk endpoint — we use a temp meeting or direct transcribe)
        // For ARIA chat we transcribe inline then send text to aria-chat
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        chunksRef.current = []

        try {
          // Use a temporary meeting or just send audio to transcribe-chunk with a dummy approach
          // Instead, we create a temporary aria_chat meeting, transcribe, then delete
          let tempMeetingId = null
          try {
            const mRes = await voiceAPI.createMeeting({ title: 'ARIA Chat', meeting_type: 'aria_chat' })
            tempMeetingId = mRes.data.id
          } catch {
            // If meeting creation fails, just use empty text
          }

          let userText = ''
          if (tempMeetingId) {
            try {
              const tRes = await voiceAPI.transcribeChunk(tempMeetingId, blob)
              userText = tRes.data.text || ''
              // Clean up temp meeting silently
              voiceAPI.deleteMeeting(tempMeetingId).catch(() => {})
            } catch {
              voiceAPI.deleteMeeting(tempMeetingId).catch(() => {})
            }
          }

          if (!userText.trim()) {
            setAriaStatus('idle')
            return
          }

          await sendAriaMessage(userText)
        } catch {
          setAriaStatus('error')
          setTimeout(() => setAriaStatus('idle'), 2000)
        }
      }

      mr.start()
      setAriaStatus('listening')
    } catch {
      setAriaStatus('error')
      setTimeout(() => setAriaStatus('idle'), 2000)
    }
  }

  const stopAriaRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }

  const handleAriaMicClick = () => {
    if (ariaStatus === 'listening') {
      stopAriaRecording()
    } else if (ariaStatus === 'idle') {
      startAriaRecording()
    }
  }

  // ── Meeting Recording ──────────────────────────────────────────────────────

  const startMeeting = async () => {
    if (!meetingTitle.trim()) return
    try {
      const res = await voiceAPI.createMeeting({
        title: meetingTitle,
        meeting_type: 'meeting',
      })
      setMeeting(res.data)
      setTranscript([])
      setAnalysis(null)
      await startMeetingRecording(res.data.id)
    } catch {
      alert('Error al crear la reunión. Inténtalo de nuevo.')
    }
  }

  const startMeetingRecording = async (meetingId) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const ctx = new AudioContext()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser
      setAnalyserNode(analyser)

      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mr
      chunksRef.current = []

      mr.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const blob = new Blob([e.data], { type: 'audio/webm' })
          try {
            const res = await voiceAPI.transcribeChunk(meetingId, blob)
            const { text, sequence_num } = res.data
            if (text && text.trim()) {
              setTranscript((prev) => [
                ...prev,
                {
                  speaker: currentUser?.full_name || 'Yo',
                  text,
                  seq: sequence_num,
                },
              ])
            }
          } catch {
            // Silently ignore chunk transcription errors
          }
        }
      }

      mr.start()
      setIsRecordingMeeting(true)
      setRecordingStart(Date.now())

      // Request data every 8 seconds
      chunkIntervalRef.current = setInterval(() => {
        if (mr.state === 'recording') {
          mr.requestData()
        }
      }, 8000)
    } catch {
      alert('No se pudo acceder al micrófono.')
    }
  }

  const stopMeetingRecording = () => {
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current)
      chunkIntervalRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.requestData()
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    setAnalyserNode(null)
    setIsRecordingMeeting(false)
  }

  const finalizeMeeting = async () => {
    if (!meeting) return
    stopMeetingRecording()
    setFinalizing(true)
    try {
      const res = await voiceAPI.finalizeMeeting(meeting.id)
      setMeeting(res.data)
      setAnalysis(res.data)
    } catch {
      alert('Error al finalizar la reunión.')
    } finally {
      setFinalizing(false)
    }
  }

  const copyCode = () => {
    if (!meeting) return
    navigator.clipboard.writeText(meeting.session_code).then(() => {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    })
  }

  // Cleanup on unmount
  useEffect(() => () => cleanupAudio(), [cleanupAudio])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-[60px] h-[60px] rounded-full bg-gradient-to-br from-brand-600 to-purple-600 shadow-2xl shadow-brand-600/40 flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
        aria-label="Abrir ARIA Voice AI"
      >
        {/* Pulsing ring */}
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 animate-ping opacity-20" />
        <Mic size={24} className="text-white relative z-10" />
        {hasNotif && (
          <span className="absolute top-0.5 right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-slate-950 z-20" />
        )}
      </button>

      {/* Panel overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div
            className="relative z-10 flex flex-col w-full max-w-[420px] h-full bg-slate-950/95 backdrop-blur-xl border-l border-slate-700/50 shadow-2xl shadow-brand-500/20"
            style={{ animation: 'slideInRight 300ms ease-out' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex gap-1 p-1 bg-slate-900 rounded-lg">
                <button
                  onClick={() => setMode('aria')}
                  className={clsx(
                    'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
                    mode === 'aria'
                      ? 'bg-gradient-to-r from-brand-600 to-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200',
                  )}
                >
                  ARIA Chat
                </button>
                <button
                  onClick={() => setMode('meeting')}
                  className={clsx(
                    'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
                    mode === 'meeting'
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200',
                  )}
                >
                  Grabar Reunión
                </button>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* ── ARIA MODE ────────────────────────────────────────────── */}
            {mode === 'aria' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* ARIA Logo */}
                <div className="pt-4 pb-2 flex flex-col items-center">
                  <ARIALogo speaking={isARIASpeaking} />
                  <p className="text-xs text-slate-400 mt-1">Asistente de Voz IA</p>
                </div>

                {/* Visualizer */}
                <div className="px-4">
                  <SoundVisualizer
                    isRecording={ariaStatus === 'listening'}
                    isPlaying={isARIASpeaking}
                    analyserNode={analyserNode}
                  />
                </div>

                {/* Status */}
                <p className="text-center text-xs text-slate-400 mt-1 mb-3 px-4">
                  {STATUS[ariaStatus] || STATUS.idle}
                </p>

                {/* Big mic */}
                <div className="flex justify-center mb-4">
                  <MicButton state={ariaStatus} onClick={handleAriaMicClick} />
                </div>

                {/* Chat history */}
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
                  {chat.map((msg, i) => (
                    <ChatBubble
                      key={i}
                      role={msg.role}
                      text={msg.text}
                      audioB64={msg.audioB64}
                      onReplay={playAudio}
                    />
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </div>
            )}

            {/* ── MEETING MODE ─────────────────────────────────────────── */}
            {mode === 'meeting' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {!meeting ? (
                  /* Setup screen */
                  <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
                    <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-700/40 flex items-center justify-center mb-2">
                      <Users size={28} className="text-red-400" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-100 text-center">
                      Nueva Reunión
                    </h2>
                    <p className="text-sm text-slate-400 text-center">
                      Graba y transcribe tu reunión en tiempo real con análisis de IA.
                    </p>
                    <input
                      type="text"
                      value={meetingTitle}
                      onChange={(e) => setMeetingTitle(e.target.value)}
                      placeholder="¿Cuál es el tema de la reunión?"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
                      onKeyDown={(e) => e.key === 'Enter' && startMeeting()}
                    />
                    <button
                      onClick={startMeeting}
                      disabled={!meetingTitle.trim()}
                      className="w-full py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 disabled:opacity-40 text-white font-semibold rounded-lg text-sm transition-all"
                    >
                      Iniciar Grabación
                    </button>
                  </div>
                ) : analysis?.status === 'completed' ? (
                  /* Analysis result */
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                    <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4">
                      <h3 className="font-semibold text-slate-100 mb-2 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center text-[10px]">✓</span>
                        Reunión completada
                      </h3>
                      <p className="text-xs text-slate-400 mb-3">{meeting.title}</p>
                      {analysis.ai_summary && (
                        <p className="text-sm text-slate-300 leading-relaxed">{analysis.ai_summary}</p>
                      )}
                    </div>

                    {analysis.ai_action_items?.length > 0 && (
                      <div className="bg-slate-900/80 border border-amber-700/30 rounded-xl p-4">
                        <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
                          Acciones ({analysis.ai_action_items.length})
                        </h4>
                        <ul className="space-y-1.5">
                          {analysis.ai_action_items.map((item, i) => (
                            <li key={i} className="text-sm text-slate-300 flex gap-2">
                              <span className="text-amber-500 flex-shrink-0">→</span>
                              <span>
                                {item.text}
                                {item.owner_mentioned && (
                                  <span className="text-slate-500 ml-1">({item.owner_mentioned})</span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysis.ai_decisions?.length > 0 && (
                      <div className="bg-slate-900/80 border border-brand-700/30 rounded-xl p-4">
                        <h4 className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-2">
                          Decisiones ({analysis.ai_decisions.length})
                        </h4>
                        <ul className="space-y-1.5">
                          {analysis.ai_decisions.map((d, i) => (
                            <li key={i} className="text-sm text-slate-300 flex gap-2">
                              <span className="text-brand-500 flex-shrink-0">•</span>
                              {d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysis.ai_key_topics?.length > 0 && (
                      <div className="flex flex-wrap gap-2 px-1">
                        {analysis.ai_key_topics.map((t, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-400">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => { setMeeting(null); setTranscript([]); setAnalysis(null); setMeetingTitle('') }}
                      className="w-full py-2 text-sm text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg transition-colors"
                    >
                      Nueva Reunión
                    </button>
                  </div>
                ) : (
                  /* Active recording */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Session code */}
                    <div className="mx-4 mt-3 bg-slate-900/80 border border-slate-700/50 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Código de sesión</p>
                        <p className="text-xl font-black tracking-[0.2em] text-brand-400 font-mono">
                          {meeting.session_code}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Otros usuarios pueden unirse con este código</p>
                      </div>
                      <button
                        onClick={copyCode}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors"
                      >
                        {codeCopied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        {codeCopied ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>

                    {/* Timer + stop button */}
                    <div className="flex flex-col items-center py-4 gap-3">
                      {isRecordingMeeting && (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                            <RecordingTimer startedAt={recordingStart} />
                          </div>
                          <SoundVisualizer
                            isRecording={true}
                            analyserNode={analyserNode}
                          />
                        </>
                      )}

                      {finalizing ? (
                        <div className="flex items-center gap-2 text-sm text-slate-400">
                          <Loader2 size={16} className="animate-spin" />
                          Finalizando análisis con IA...
                        </div>
                      ) : (
                        <button
                          onClick={finalizeMeeting}
                          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-red-600/30"
                        >
                          <Square size={14} />
                          Detener y Analizar
                        </button>
                      )}
                    </div>

                    {/* Live transcript */}
                    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 border-t border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider py-1">Transcripción en vivo</p>
                      {transcript.length === 0 && (
                        <p className="text-xs text-slate-600 text-center mt-4">
                          {isRecordingMeeting ? 'Grabando... las transcripciones aparecerán aquí cada 8 segundos.' : 'Sin transcripciones aún.'}
                        </p>
                      )}
                      {transcript.map((item, i) => (
                        <div key={i} className="flex gap-2 items-start animate-fade-in">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white flex-shrink-0 mt-0.5 ${getSpeakerColor(item.speaker)}`}
                          >
                            {(item.speaker || 'U').split(' ')[0].slice(0, 8)}
                          </span>
                          <p className="text-sm text-slate-300 leading-relaxed">{item.text}</p>
                        </div>
                      ))}
                      <div ref={transcriptEndRef} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline styles for animations not in Tailwind */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes breathe {
          0%, 100% { transform: scaleY(1); opacity: 0.25; }
          50% { transform: scaleY(1.8); opacity: 0.45; }
        }
        .animate-breathe {
          animation: breathe 2s ease-in-out infinite;
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }
        .animate-spin-slower { animation: spin-slow 12s linear infinite; }
      `}</style>
    </>
  )
}
