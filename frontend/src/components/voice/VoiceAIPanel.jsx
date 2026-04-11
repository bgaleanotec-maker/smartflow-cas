import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Mic, MicOff, X, Users, Radio, Square, Copy, Check,
  Play, Loader2, ChevronDown, Volume2, VolumeX, Monitor, Headphones,
} from 'lucide-react'
import { voiceAPI, adminAPI, bpAPI } from '../../services/api'
import SoundVisualizer from './SoundVisualizer'
import clsx from 'clsx'

// ─── Audio source options ─────────────────────────────────────────────────────
// SYSTEM AUDIO CAPTURE: Works when user shares screen/tab with audio enabled.
// This captures Teams calls, meetings, etc. even with earphones connected.
// getUserMedia alone cannot capture what's playing through earphones.
// getDisplayMedia with audio:true can capture system audio (Chrome/Edge only).
async function getAudioStream(source) {
  if (source === 'system') {
    // Capture system audio (e.g., Teams call playing through earphones)
    // User will see a screen-share prompt — they should select the Teams window or "Entire screen"
    // and ENABLE the "Share audio" checkbox
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1, height: 1, frameRate: 1 }, // minimal video — we just want audio
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 44100,
        },
      })
      // Also get mic so we capture the user's own voice
      let micStream = null
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      } catch { /* mic optional for system capture */ }

      if (micStream) {
        // Mix display audio + microphone together
        const ctx = new AudioContext()
        const dest = ctx.createMediaStreamDestination()
        const displaySource = ctx.createMediaStreamSource(displayStream)
        const micSource = ctx.createMediaStreamSource(micStream)
        displaySource.connect(dest)
        micSource.connect(dest)
        // Stop original tracks when combined stream ends
        dest.stream._originalStreams = [displayStream, micStream]
        dest.stream._audioContext = ctx
        return { stream: dest.stream, audioContext: ctx }
      }
      return { stream: displayStream, audioContext: null }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        throw new Error('Permiso denegado. Debes compartir la pantalla y activar "Compartir audio".')
      }
      throw err
    }
  }
  // Default: microphone only
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  return { stream, audioContext: null }
}

// ─── Status labels ────────────────────────────────────────────────────────────
const STATUS = {
  idle: 'Toca el micrófono para hablar',
  listening: 'Escuchando...',
  processing: 'Procesando...',
  speaking: 'ARIA está hablando...',
  error: 'Error al procesar',
}

// ─── VAD constants ────────────────────────────────────────────────────────────
const VAD_THRESHOLD = 14       // RMS amplitude level (0–128) to detect speech
const VAD_ONSET_MS = 180       // ms of continuous speech before recording starts
const VAD_SILENCE_MS = 1100    // ms of silence after speech before sending
const VAD_MIN_RECORD_MS = 400  // minimum recording duration to bother sending

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
function MicButton({ state, onClick, conversationListening = false }) {
  const base = 'relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer select-none'
  const styles = {
    idle: `${base} bg-slate-700 hover:bg-slate-600 shadow-lg`,
    listening: `${base} bg-red-500 shadow-xl shadow-red-500/40 scale-105`,
    processing: `${base} bg-brand-600 shadow-lg shadow-brand-500/40 opacity-70 cursor-not-allowed`,
    speaking: `${base} bg-purple-600 shadow-lg shadow-purple-500/40 opacity-70 cursor-not-allowed`,
    error: `${base} bg-red-700 hover:bg-red-600`,
  }

  const isDisabled = state === 'processing' || state === 'speaking'

  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      className={styles[state] || styles.idle}
      aria-label="Micrófono"
      disabled={isDisabled}
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
        // In conversation mode → show send icon; otherwise mic-off
        conversationListening
          ? <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          : <MicOff size={32} className="text-white" />
      ) : (
        <Mic size={32} className="text-white" />
      )}
    </button>
  )
}

// ─── Chat bubble with streaming text effect ──────────────────────────────────
function ChatBubble({ role, text, audioB64, onReplay, stream = false }) {
  const isARIA = role === 'aria'
  const [displayed, setDisplayed] = useState(stream ? '' : text)
  const [typing, setTyping] = useState(stream)

  useEffect(() => {
    if (!stream || !isARIA) { setDisplayed(text); setTyping(false); return }
    setDisplayed(''); setTyping(true)
    let i = 0
    const iv = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) { clearInterval(iv); setTyping(false) }
    }, 14)
    return () => clearInterval(iv)
  }, [text, stream, isARIA])

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
        <p>{displayed}{typing && <span className="animate-pulse text-purple-400 ml-0.5">▌</span>}</p>
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
export default function VoiceAIPanel({ currentUser, externalOpen, onExternalClose }) {
  const [open, setOpen] = useState(false)

  // Sync with external open state (e.g. from mobile bottom nav ARIA button)
  const isOpen = open || !!externalOpen
  const handleClose = () => {
    setOpen(false)
    onExternalClose?.()
  }
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
  // Audio source: 'mic' = solo micrófono | 'system' = sistema + mic (para Teams/auriculares)
  const [audioSource, setAudioSource] = useState('mic')
  // Context linking: business / BP / activity
  const [businesses, setBusinesses] = useState([])
  const [bpList, setBpList] = useState([])
  const [activityList, setActivityList] = useState([])
  const [selectedBusinessId, setSelectedBusinessId] = useState('')
  const [selectedBpId, setSelectedBpId] = useState('')
  const [selectedActivityId, setSelectedActivityId] = useState('')

  const [isConversationActive, setIsConversationActive] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [slowWarning, setSlowWarning] = useState(false)
  const [transcribingChunk, setTranscribingChunk] = useState(false)  // meeting: processing chunk

  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const chunksRef = useRef([])
  const chunkIntervalRef = useRef(null)
  const transcriptEndRef = useRef(null)
  const chatEndRef = useRef(null)
  const conversationActiveRef = useRef(false)
  const chatRef = useRef([])  // mirrors chat state — avoids stale closures inside VAD interval

  // VAD system
  const ariaStatusRef = useRef('idle')      // mirrors ariaStatus for VAD loop (no stale closures)
  const isARIASpeakingRef = useRef(false)   // mirrors isARIASpeaking
  const vadStreamRef = useRef(null)         // persistent mic stream for VAD
  const vadContextRef = useRef(null)        // AudioContext for VAD
  const vadAnalyserRef = useRef(null)       // AnalyserNode
  const vadIntervalRef = useRef(null)       // setInterval handle
  const vadRecorderRef = useRef(null)       // MediaRecorder for current speech segment (Whisper fallback)
  const vadChunksRef = useRef([])           // audio chunks for current segment
  const speechActiveRef = useRef(false)     // currently recording a speech segment
  const speechOnsetRef = useRef(null)       // timestamp when speech onset first detected (debounce)
  const silenceStartRef = useRef(null)      // timestamp when silence started after speech
  const recordingStartRef = useRef(null)    // timestamp when current recording started
  const ariaAudioRef = useRef(null)         // current ARIA HTML Audio element (for interruption)
  // Web Speech API — primary transcription (browser-native, free, instant)
  const srRef = useRef(null)                // SpeechRecognition instance
  const webSpeechActiveRef = useRef(false)  // whether Web Speech API is in use

  // Wrapper: keeps ariaStatusRef in sync with ariaStatus state (defined after all refs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const setStatus = useCallback((s) => { ariaStatusRef.current = s; setAriaStatus(s) }, [])

  // Keep chatRef in sync so VAD interval closures always read latest chat
  useEffect(() => { chatRef.current = chat }, [chat])

  // Auto-scroll
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  // Load businesses when panel opens
  useEffect(() => {
    if (isOpen && businesses.length === 0) {
      adminAPI.businesses().then(r => setBusinesses(r.data || [])).catch(() => {})
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load BPs when business changes
  useEffect(() => {
    if (selectedBusinessId) {
      bpAPI.list({ business_id: selectedBusinessId, limit: 100 }).then(r => {
        setBpList(r.data || [])
        setSelectedBpId('')
        setSelectedActivityId('')
        setActivityList([])
      }).catch(() => {})
    } else {
      setBpList([])
      setSelectedBpId('')
      setSelectedActivityId('')
      setActivityList([])
    }
  }, [selectedBusinessId])

  // Load activities when BP changes
  useEffect(() => {
    if (selectedBpId) {
      bpAPI.listActivities(selectedBpId, { limit: 100 }).then(r => {
        setActivityList(r.data || [])
        setSelectedActivityId('')
      }).catch(() => {})
    } else {
      setActivityList([])
      setSelectedActivityId('')
    }
  }, [selectedBpId])

  // Greet on panel open (ARIA mode)
  useEffect(() => {
    if (isOpen && mode === 'aria' && chat.length === 0 && currentUser) {
      sendAriaMessage('saludo_inicial')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

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
    if (ariaStatusRef.current === 'processing') return
    setStatus('processing')
    setSlowWarning(false)

    // Show "server waking up" warning after 5s (Render free tier cold start)
    const slowTimer = setTimeout(() => setSlowWarning(true), 5000)

    // Safety timeout — only reset if STILL processing (don't interrupt speaking)
    const safetyTimer = setTimeout(() => {
      setSlowWarning(false)
      if (ariaStatusRef.current === 'processing') setStatus('idle')
    }, 25000)

    // Use chatRef to always have the latest history (avoids stale closures in VAD interval)
    const history = chatRef.current.slice(-6).map(m => ({ role: m.role === 'aria' ? 'assistant' : 'user', content: m.text }))

    try {
      const res = await voiceAPI.ariaChat(
        { text, user_name: currentUser?.full_name || 'Usuario', meeting_id: null, history },
        { timeout: 22000 },   // axios timeout: 22s
      )
      clearTimeout(slowTimer)
      clearTimeout(safetyTimer)
      setSlowWarning(false)
      const data = res.data
      if (text !== 'saludo_inicial') {
        setChat((prev) => [...prev, { role: 'user', text }])
      }
      setChat((prev) => [...prev, { role: 'aria', text: data.response_text, audioB64: data.audio_base64, isNew: true }])

      if (data.audio_base64) {
        playAudio(data.audio_base64)
      } else {
        // No ElevenLabs audio → use browser TTS (free, always available)
        speakWithBrowser(data.response_text)
      }
    } catch {
      clearTimeout(slowTimer)
      clearTimeout(safetyTimer)
      setSlowWarning(false)
      setStatus('idle')
    }
  }

  const playAudio = (b64) => {
    setStatus('speaking')
    isARIASpeakingRef.current = true
    setIsARIASpeaking(true)
    pauseWebSpeech()   // don't transcribe ARIA's own voice
    const audio = new Audio(`data:audio/mpeg;base64,${b64}`)
    ariaAudioRef.current = audio
    audio.play().catch(() => {})
    audio.onended = () => {
      ariaAudioRef.current = null
      isARIASpeakingRef.current = false
      setIsARIASpeaking(false)
      setStatus('idle')
      resumeWebSpeech()  // start listening again after ARIA finishes
    }
    audio.onerror = () => {
      ariaAudioRef.current = null
      isARIASpeakingRef.current = false
      setIsARIASpeaking(false)
      setStatus('idle')
      resumeWebSpeech()
    }
  }

  // Browser TTS fallback — free, no ElevenLabs key needed
  // Uses sentence-chunking to avoid Chrome's known onend bug with long strings
  const speakWithBrowser = useCallback((text) => {
    const done = () => {
      isARIASpeakingRef.current = false
      setIsARIASpeaking(false)
      setStatus('idle')
      resumeWebSpeech()  // restart listening after ARIA speaks
    }

    if (!window.speechSynthesis) { done(); return }

    pauseWebSpeech()   // don't transcribe ARIA's own voice
    window.speechSynthesis.cancel()

    // Split into sentences so Chrome's onend fires reliably
    const sentences = text.match(/[^.!?¡¿]+[.!?]*/g)?.map(s => s.trim()).filter(Boolean) || [text]
    let idx = 0

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices()
      return voices.find(v => v.lang === 'es-CO')
        || voices.find(v => v.lang === 'es-US')
        || voices.find(v => v.lang.startsWith('es'))
        || null
    }

    const speakNext = () => {
      if (idx >= sentences.length) { done(); return }
      const utt = new SpeechSynthesisUtterance(sentences[idx])
      utt.lang = 'es-CO'
      utt.rate = 1.0
      utt.pitch = 1.05
      const voice = pickVoice()
      if (voice) utt.voice = voice
      utt.onend = () => { idx++; speakNext() }
      utt.onerror = () => { idx++; speakNext() }  // skip bad chunk, keep going
      window.speechSynthesis.speak(utt)
    }

    // Trigger voice list load (async in Chrome) then start
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null
        speakNext()
      }
    } else {
      speakNext()
    }

    setStatus('speaking')
    isARIASpeakingRef.current = true
    setIsARIASpeaking(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Web Speech API helpers ────────────────────────────────────────────────
  // Primary transcription path: browser-native, no Whisper, no cold start, free.
  // Whisper path kept as fallback for browsers without SpeechRecognition (Firefox).

  const stopWebSpeech = useCallback(() => {
    if (srRef.current) {
      try { srRef.current.abort() } catch {}
      srRef.current = null
    }
    webSpeechActiveRef.current = false
  }, [])

  const pauseWebSpeech = useCallback(() => {
    if (srRef.current) { try { srRef.current.stop() } catch {} }
  }, [])

  const resumeWebSpeech = useCallback(() => {
    if (!webSpeechActiveRef.current || !conversationActiveRef.current) return
    // Double-check status before resuming — called after ARIA finishes speaking
    setTimeout(() => {
      if (
        srRef.current &&
        conversationActiveRef.current &&
        ariaStatusRef.current === 'idle' &&
        !isARIASpeakingRef.current
      ) {
        try { srRef.current.start() } catch {}
      }
    }, 400)
  }, []) // eslint-disable-line

  const startWebSpeech = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return false   // not available — use Whisper fallback

    stopWebSpeech()
    const sr = new SR()
    sr.lang = 'es-CO'
    sr.continuous = true
    sr.interimResults = true
    sr.maxAlternatives = 1
    srRef.current = sr
    webSpeechActiveRef.current = true

    sr.onresult = (event) => {
      const results = Array.from(event.results).slice(event.resultIndex)
      // Show interim results as "listening"
      if (results.some(r => !r.isFinal) && ariaStatusRef.current === 'idle') {
        setStatus('listening')
      }
      // Send final transcripts to ARIA — only when idle (not processing or speaking)
      const finalText = results
        .filter(r => r.isFinal)
        .map(r => r[0].transcript.trim())
        .filter(Boolean)
        .join(' ')
      if (finalText && conversationActiveRef.current && ariaStatusRef.current === 'idle') {
        sendAriaMessage(finalText)
      }
    }

    sr.onspeechend = () => {
      if (ariaStatusRef.current === 'listening') setStatus('idle')
    }

    sr.onend = () => {
      // Only auto-restart when truly idle — never during processing or speaking
      // (pauseWebSpeech calls sr.stop() which also fires onend — guard against that)
      if (conversationActiveRef.current && ariaStatusRef.current === 'idle') {
        setTimeout(() => {
          if (conversationActiveRef.current && ariaStatusRef.current === 'idle') {
            try { sr.start() } catch {}
          }
        }, 300)
      }
    }

    sr.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        webSpeechActiveRef.current = false
        return  // will fall through to Whisper path
      }
      // 'no-speech' is normal — just restart quietly
      if (ariaStatusRef.current === 'listening') setStatus('idle')
      if (conversationActiveRef.current && ariaStatusRef.current === 'idle') {
        setTimeout(() => {
          if (conversationActiveRef.current && ariaStatusRef.current === 'idle') {
            try { sr.start() } catch {}
          }
        }, 600)
      }
    }

    try { sr.start(); return true } catch { webSpeechActiveRef.current = false; return false }
  }, []) // eslint-disable-line

  // ── VAD: Interrupt ARIA if currently speaking ─────────────────────────────
  const interruptARIA = () => {
    if (ariaAudioRef.current) {
      try { ariaAudioRef.current.pause() } catch {}
      ariaAudioRef.current = null
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    isARIASpeakingRef.current = false
    setIsARIASpeaking(false)
  }

  // ── VAD: Start a new speech segment recording ─────────────────────────────
  const startVADRecording = () => {
    if (!vadStreamRef.current || speechActiveRef.current) return
    speechActiveRef.current = true
    recordingStartRef.current = Date.now()
    vadChunksRef.current = []

    try {
      const mr = new MediaRecorder(vadStreamRef.current, { mimeType: 'audio/webm' })
      vadRecorderRef.current = mr

      mr.ondataavailable = (e) => { if (e.data.size > 0) vadChunksRef.current.push(e.data) }

      mr.onstop = async () => {
        const duration = Date.now() - (recordingStartRef.current || 0)
        speechActiveRef.current = false
        silenceStartRef.current = null

        if (vadChunksRef.current.length === 0 || duration < VAD_MIN_RECORD_MS) {
          setStatus('idle')
          return
        }

        setStatus('processing')
        const blob = new Blob(vadChunksRef.current, { type: 'audio/webm' })
        vadChunksRef.current = []

        try {
          let userText = ''
          try {
            const mRes = await voiceAPI.createMeeting({ title: 'ARIA Chat', meeting_type: 'aria_chat' })
            const tempId = mRes.data.id
            try {
              const tRes = await voiceAPI.transcribeChunk(tempId, blob)
              userText = tRes.data.text || ''
            } finally {
              voiceAPI.deleteMeeting(tempId).catch(() => {})
            }
          } catch { /* transcription failed — silent */ }

          const isWhisperError = !userText.trim() || userText.startsWith('[')
          if (isWhisperError) { setStatus('idle'); return }

          await sendAriaMessage(userText)
        } catch {
          setStatus('idle')
        }
      }

      mr.start()
      setStatus('listening')
    } catch {
      speechActiveRef.current = false
      setStatus('idle')
    }
  }

  // ── VAD: Stop current speech segment recording ────────────────────────────
  const stopVADRecording = () => {
    if (vadRecorderRef.current?.state === 'recording') {
      vadRecorderRef.current.stop()
    }
  }

  // ── VAD: Start continuous listening loop ──────────────────────────────────
  const startVAD = async () => {
    if (vadStreamRef.current) return  // already running

    // Try Web Speech API first (Chrome/Edge) — no Whisper needed
    const webSpeechOK = startWebSpeech()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      vadStreamRef.current = stream

      const ctx = new AudioContext()
      vadContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.4
      source.connect(analyser)
      vadAnalyserRef.current = analyser
      setAnalyserNode(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      vadIntervalRef.current = setInterval(() => {
        if (!conversationActiveRef.current) return

        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i]
        const rms = Math.sqrt(sum / dataArray.length)
        const isSpeaking = rms > VAD_THRESHOLD
        const now = Date.now()

        if (isSpeaking) {
          silenceStartRef.current = null

          // Always handle ARIA interruption regardless of transcription path
          if (isARIASpeakingRef.current) {
            interruptARIA()
            setStatus('idle')
            speechOnsetRef.current = null
            if (webSpeechActiveRef.current) resumeWebSpeech()
            return
          }

          // If Web Speech handles transcription, VAD only does visualizer + interruption
          if (webSpeechActiveRef.current) return

          // ── Whisper fallback path (Firefox / no Web Speech API) ──
          if (speechActiveRef.current) return
          if (!speechOnsetRef.current) {
            speechOnsetRef.current = now
          } else if (now - speechOnsetRef.current >= VAD_ONSET_MS) {
            speechOnsetRef.current = null
            if (ariaStatusRef.current === 'idle') startVADRecording()
          }
        } else {
          speechOnsetRef.current = null

          // Whisper fallback silence detection
          if (!webSpeechActiveRef.current && speechActiveRef.current) {
            if (!silenceStartRef.current) {
              silenceStartRef.current = now
            } else if (now - silenceStartRef.current >= VAD_SILENCE_MS) {
              stopVADRecording()
            }
          }
        }
      }, 50)
    } catch (err) {
      console.error('VAD failed to start:', err)
    }
  }

  // ── VAD: Stop everything ──────────────────────────────────────────────────
  const stopVAD = () => {
    stopWebSpeech()
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null }
    if (vadRecorderRef.current?.state !== 'inactive') {
      try { vadRecorderRef.current?.stop() } catch {}
    }
    vadRecorderRef.current = null
    if (vadStreamRef.current) { vadStreamRef.current.getTracks().forEach(t => t.stop()); vadStreamRef.current = null }
    if (vadContextRef.current) { try { vadContextRef.current.close() } catch {} vadContextRef.current = null }
    vadAnalyserRef.current = null
    speechActiveRef.current = false
    speechOnsetRef.current = null
    silenceStartRef.current = null
    setAnalyserNode(null)
  }

  const endConversation = () => {
    conversationActiveRef.current = false
    setIsConversationActive(false)
    interruptARIA()
    stopVAD()
    cleanupAudio()  // for meeting recording cleanup
    setStatus('idle')
  }

  const handleAriaMicClick = () => {
    if (isConversationActive) {
      // In conversation: tap mic to send current segment early (don't wait for silence)
      if (speechActiveRef.current) {
        stopVADRecording()
      }
    } else {
      // Start conversation mode — VAD opens mic and listens continuously
      // Greeting already sent by the useEffect on panel open (no double greeting)
      conversationActiveRef.current = true
      setIsConversationActive(true)
      startVAD()
    }
  }

  // ── Meeting Recording ──────────────────────────────────────────────────────

  const startMeeting = async () => {
    if (!meetingTitle.trim()) return
    try {
      const payload = {
        title: meetingTitle,
        meeting_type: 'meeting',
      }
      if (selectedBusinessId) payload.business_id = parseInt(selectedBusinessId)
      if (selectedBpId) payload.bp_id = parseInt(selectedBpId)
      if (selectedActivityId) payload.bp_activity_id = parseInt(selectedActivityId)
      const res = await voiceAPI.createMeeting(payload)
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
      const { stream, audioContext: mixedCtx } = await getAudioStream(audioSource)
      streamRef.current = stream

      const ctx = mixedCtx || new AudioContext()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser
      setAnalyserNode(analyser)

      // Prefer webm, fallback to mp4 (Safari)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr
      chunksRef.current = []

      // ── COLLECT all chunks — send complete audio on finalize ────────────
      // Reason: webm format only includes the header in chunk[0].
      // Chunks 2..N are continuation segments — not valid standalone webm files.
      // Sending individual chunks to Whisper produces empty transcriptions.
      // Solution: accumulate everything, send the full valid webm on finalize.
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mr.start(3000)  // collect data every 3s — ensures data is available when stopped
      setIsRecordingMeeting(true)
      setRecordingStart(Date.now())

    } catch (err) {
      alert(err.message || 'No se pudo acceder al audio. Verifica los permisos del navegador.')
    }
  }

  // Stop recording and return a Promise<Blob> with the complete audio
  const stopAndGetAudio = () => new Promise((resolve) => {
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current)
      chunkIntervalRef.current = null
    }

    const cleanup = () => {
      if (streamRef.current) {
        if (streamRef.current._originalStreams) {
          streamRef.current._originalStreams.forEach(s => s.getTracks().forEach(t => t.stop()))
        }
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      setAnalyserNode(null)
      setIsRecordingMeeting(false)
    }

    const mr = mediaRecorderRef.current
    if (!mr || mr.state === 'inactive') {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      cleanup()
      resolve(blob)
      return
    }

    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      cleanup()
      resolve(blob)
    }

    if (mr.state === 'recording') {
      mr.requestData()
      mr.stop()
    } else {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      cleanup()
      resolve(blob)
    }
  })

  const stopMeetingRecording = () => {
    // Lightweight stop for unmount/cancel — doesn't return blob
    if (chunkIntervalRef.current) { clearInterval(chunkIntervalRef.current); chunkIntervalRef.current = null }
    if (mediaRecorderRef.current?.state !== 'inactive') {
      try { mediaRecorderRef.current?.stop() } catch {}
    }
    if (streamRef.current) {
      if (streamRef.current._originalStreams) {
        streamRef.current._originalStreams.forEach(s => s.getTracks().forEach(t => t.stop()))
      }
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null }
    setAnalyserNode(null)
    setIsRecordingMeeting(false)
  }

  const finalizeMeeting = async () => {
    if (!meeting) return
    setFinalizing(true)
    setTranscribingChunk(true)

    try {
      // 1. Stop recording → get complete valid webm blob
      const completeBlob = await stopAndGetAudio()

      // 2. Send complete audio to backend for transcription (one shot, full context)
      if (completeBlob && completeBlob.size > 2000) {
        try {
          const tRes = await voiceAPI.transcribeComplete(meeting.id, completeBlob)
          if (tRes.data?.chunks?.length > 0) {
            setTranscript(tRes.data.chunks.map(c => ({
              speaker: c.speaker_name || 'Usuario',
              text: c.text,
              seq: c.sequence_num,
            })))
          }
        } catch (tErr) {
          console.warn('Transcripción falló:', tErr)
          // Continue to finalize — meeting saved even without transcript
        }
      }
      setTranscribingChunk(false)

      // 3. Finalize: timestamps + Gemini AI analysis
      const res = await voiceAPI.finalizeMeeting(meeting.id)
      setMeeting(res.data)
      setAnalysis(res.data)
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || 'Error al finalizar'
      setMeeting(prev => prev ? { ...prev, _finalizeError: msg } : prev)
    } finally {
      setFinalizing(false)
      setTranscribingChunk(false)
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
      {/* Floating trigger button — hidden on mobile (ARIA is in bottom nav center) */}
      <button
        onClick={() => setOpen(true)}
        className="hidden lg:flex fixed bottom-[88px] right-4 lg:bottom-6 lg:right-6 z-50 w-[60px] h-[60px] rounded-full bg-gradient-to-br from-brand-600 to-purple-600 shadow-2xl shadow-brand-600/40 items-center justify-center transition-transform hover:scale-110 active:scale-95"
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
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Panel — full screen on mobile, 420px panel on desktop */}
          <div
            className="relative z-10 flex flex-col w-full sm:max-w-[420px] h-full bg-slate-950/95 backdrop-blur-xl border-l border-slate-700/50 shadow-2xl shadow-brand-500/20"
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
                onClick={handleClose}
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

                {/* Conversation active indicator */}
                {isConversationActive && (
                  <div className="flex items-center justify-center gap-2 mx-4 mb-1 px-3 py-1.5 rounded-full bg-emerald-900/30 border border-emerald-700/40">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    <span className="text-xs text-emerald-400 font-medium">Conversación activa</span>
                  </div>
                )}

                {/* Slow warning — server cold start */}
                {slowWarning && ariaStatus === 'processing' && (
                  <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-amber-900/30 border border-amber-700/40 flex items-start gap-2">
                    <span className="text-amber-400 text-base flex-shrink-0">⏳</span>
                    <p className="text-[11px] text-amber-300 leading-relaxed">
                      El servidor se está despertando… puede tardar hasta 60s la primera vez.
                    </p>
                  </div>
                )}

                {/* Status */}
                <p className="text-center text-xs text-slate-400 mt-1 mb-3 px-4">
                  {isConversationActive && ariaStatus === 'idle'
                    ? '👂 Escuchando... habla cuando quieras'
                    : isConversationActive && ariaStatus === 'listening'
                    ? '🎙️ Captando tu voz...'
                    : isConversationActive && ariaStatus === 'speaking'
                    ? '🔊 ARIA está hablando... (habla para interrumpir)'
                    : isConversationActive && ariaStatus === 'processing'
                    ? '⏳ Procesando...'
                    : STATUS[ariaStatus] || STATUS.idle}
                </p>

                {/* Big mic */}
                <div className="flex flex-col items-center gap-3 mb-4">
                  {!isConversationActive ? (
                    <div className="flex flex-col items-center gap-1">
                      <MicButton state={ariaStatus} onClick={handleAriaMicClick} />
                      {ariaStatus === 'idle' && <p className="text-[10px] text-slate-600 mt-1">Toca para conversar</p>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      {/* In conversation mode: mic just sends early if speaking, else disabled */}
                      <MicButton
                        state={ariaStatus}
                        onClick={handleAriaMicClick}
                        conversationListening={ariaStatus === 'listening'}
                      />
                      <button onClick={endConversation} className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl bg-red-900/40 border border-red-700/50 text-red-400 hover:bg-red-900/60 transition-colors text-xs font-medium">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        Terminar
                      </button>
                    </div>
                  )}
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
                      stream={!!msg.isNew && msg.role === 'aria' && i === chat.length - 1}
                    />
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Quick link to Meetings page */}
                <div className="flex-shrink-0 px-4 py-1.5 flex items-center justify-end">
                  <a
                    href="/meetings"
                    onClick={handleClose}
                    className="text-[11px] text-slate-500 hover:text-brand-400 transition-colors flex items-center gap-1"
                  >
                    <Radio size={11} />
                    Ver mis reuniones
                  </a>
                </div>

                {/* Text input — always available as fallback when mic/Whisper doesn't work */}
                <div className="flex-shrink-0 border-t border-slate-800 px-3 py-2">
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && textInput.trim() && ariaStatus !== 'processing') {
                          const msg = textInput.trim()
                          setTextInput('')
                          sendAriaMessage(msg)
                        }
                      }}
                      placeholder="Escribe tu mensaje..."
                      disabled={ariaStatus === 'processing' || ariaStatus === 'speaking'}
                      className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 disabled:opacity-40"
                    />
                    <button
                      onClick={() => {
                        if (textInput.trim() && ariaStatus !== 'processing') {
                          const msg = textInput.trim()
                          setTextInput('')
                          sendAriaMessage(msg)
                        }
                      }}
                      disabled={!textInput.trim() || ariaStatus === 'processing' || ariaStatus === 'speaking'}
                      className="p-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </button>
                  </div>
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

                    {/* Audio source selector */}
                    <div className="w-full space-y-2">
                      <p className="text-xs text-slate-500 font-medium">Fuente de audio</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setAudioSource('mic')}
                          className={clsx(
                            'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all',
                            audioSource === 'mic'
                              ? 'bg-brand-900/50 border-brand-500 text-brand-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600',
                          )}
                        >
                          <Mic size={20} />
                          <span>Solo micrófono</span>
                          <span className="text-[10px] font-normal opacity-70">Voz del usuario</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAudioSource('system')}
                          className={clsx(
                            'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all',
                            audioSource === 'system'
                              ? 'bg-purple-900/50 border-purple-500 text-purple-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600',
                          )}
                        >
                          <Headphones size={20} />
                          <span>Sistema + Mic</span>
                          <span className="text-[10px] font-normal opacity-70">Teams/Meet + voz</span>
                        </button>
                      </div>
                      {audioSource === 'system' && (
                        <p className="text-[11px] text-purple-400/80 bg-purple-900/20 border border-purple-800/30 rounded-lg px-3 py-2 leading-relaxed">
                          💡 Se abrirá una ventana para compartir pantalla. Selecciona la ventana de Teams/Meet y <strong>activa "Compartir audio"</strong>. Esto captura todo el audio incluso con auriculares.
                        </p>
                      )}
                    </div>

                    {/* Context linking */}
                    {businesses.length > 0 && (
                      <div className="w-full space-y-2">
                        <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                          Vincular a negocio (opcional)
                        </p>
                        <select
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-brand-500"
                          value={selectedBusinessId}
                          onChange={(e) => setSelectedBusinessId(e.target.value)}
                        >
                          <option value="">— Sin negocio —</option>
                          {businesses.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>

                        {selectedBusinessId && bpList.length > 0 && (
                          <select
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-brand-500"
                            value={selectedBpId}
                            onChange={(e) => setSelectedBpId(e.target.value)}
                          >
                            <option value="">— Sin plan de negocio —</option>
                            {bpList.map(bp => (
                              <option key={bp.id} value={bp.id}>{bp.name} ({bp.year})</option>
                            ))}
                          </select>
                        )}

                        {selectedBpId && activityList.length > 0 && (
                          <select
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-brand-500"
                            value={selectedActivityId}
                            onChange={(e) => setSelectedActivityId(e.target.value)}
                          >
                            <option value="">— Sin actividad —</option>
                            {activityList.map(a => (
                              <option key={a.id} value={a.id}>{a.title}</option>
                            ))}
                          </select>
                        )}

                        {selectedActivityId && (
                          <p className="text-[11px] text-emerald-400/80 bg-emerald-900/20 border border-emerald-800/30 rounded-lg px-3 py-1.5">
                            ✓ La transcripción se vinculará automáticamente a esa actividad y quedará como comentario al finalizar.
                          </p>
                        )}
                      </div>
                    )}

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
                      onClick={() => { setMeeting(null); setTranscript([]); setAnalysis(null); setMeetingTitle(''); setSelectedBusinessId(''); setSelectedBpId(''); setSelectedActivityId('') }}
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
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-[10px] text-slate-500 uppercase tracking-wider">Código de sesión</p>
                          <span className={clsx(
                            'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium',
                            audioSource === 'system'
                              ? 'bg-purple-900/40 text-purple-400'
                              : 'bg-slate-800 text-slate-500'
                          )}>
                            {audioSource === 'system' ? <><Headphones size={9} /> Sistema+Mic</> : <><Mic size={9} /> Micrófono</>}
                          </span>
                        </div>
                        <p className="text-xl font-black tracking-[0.2em] text-brand-400 font-mono">
                          {meeting.session_code}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Otros usuarios pueden unirse con este código</p>
                        {/* Context badges */}
                        {(meeting.business_name || meeting.bp_activity_id) && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {meeting.business_name && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-900/40 text-brand-400 border border-brand-700/30 font-medium">
                                🏢 {meeting.business_name}
                              </span>
                            )}
                            {meeting.bp_activity_id && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 border border-emerald-700/30 font-medium">
                                ✓ Vinculado a tarea
                              </span>
                            )}
                          </div>
                        )}
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
                      {transcribingChunk && (
                        <div className="flex items-center gap-2 text-xs text-amber-400/80 mb-1">
                          <Loader2 size={11} className="animate-spin flex-shrink-0" />
                          Transcribiendo fragmento...
                        </div>
                      )}
                      {transcript.length === 0 && (
                        <p className="text-xs text-slate-600 text-center mt-4">
                          {isRecordingMeeting
                            ? transcribingChunk
                              ? '⏳ Procesando audio con Whisper (puede tardar en el arranque)...'
                              : '🎙️ Grabando... texto aparece cada ~7s cuando hay voz.'
                            : 'Sin transcripciones aún.'}
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
