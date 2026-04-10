import { useEffect, useRef } from 'react'

/**
 * SoundVisualizer — 20-bar animated frequency visualizer.
 * Props:
 *   isRecording  — bool: user is speaking/recording
 *   isPlaying    — bool: ARIA is speaking (audio playback)
 *   analyserNode — Web Audio AnalyserNode (optional)
 *   barCount     — number of bars (default 20)
 */
export default function SoundVisualizer({
  isRecording = false,
  isPlaying = false,
  analyserNode = null,
  barCount = 20,
}) {
  const barsRef = useRef([])
  const rafRef = useRef(null)
  const dataArrayRef = useRef(null)

  useEffect(() => {
    if (analyserNode) {
      analyserNode.fftSize = 64
      const bufLen = analyserNode.frequencyBinCount
      dataArrayRef.current = new Uint8Array(bufLen)
    }
  }, [analyserNode])

  useEffect(() => {
    const active = isRecording || isPlaying

    const animate = () => {
      if (!active) return

      if (analyserNode && dataArrayRef.current) {
        analyserNode.getByteFrequencyData(dataArrayRef.current)
        const data = dataArrayRef.current
        barsRef.current.forEach((bar, i) => {
          if (!bar) return
          const idx = Math.floor((i / barCount) * data.length)
          const value = data[idx] / 255
          const minH = 4
          const maxH = 48
          const height = minH + value * (maxH - minH)
          bar.style.height = `${height}px`
          bar.style.opacity = 0.5 + value * 0.5
        })
      } else {
        // Idle animation fallback: sine wave
        const now = Date.now() / 300
        barsRef.current.forEach((bar, i) => {
          if (!bar) return
          const phase = (i / barCount) * Math.PI * 2
          const value = (Math.sin(now + phase) + 1) / 2
          const minH = 4
          const maxH = active ? 40 : 12
          const height = minH + value * (maxH - minH)
          bar.style.height = `${height}px`
          bar.style.opacity = active ? 0.5 + value * 0.5 : 0.2 + value * 0.3
        })
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    if (active) {
      rafRef.current = requestAnimationFrame(animate)
    } else {
      // Idle: use CSS breathing animation only
      barsRef.current.forEach((bar, i) => {
        if (!bar) return
        bar.style.height = ''
        bar.style.opacity = ''
      })
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isRecording, isPlaying, analyserNode, barCount])

  const barColor = isPlaying
    ? 'bg-purple-500'
    : isRecording
    ? 'bg-green-400'
    : 'bg-brand-500'

  return (
    <div className="flex items-end justify-center gap-[3px] h-14 px-2">
      {Array.from({ length: barCount }).map((_, i) => (
        <div
          key={i}
          ref={(el) => (barsRef.current[i] = el)}
          className={`w-1.5 rounded-full transition-all ${barColor} ${
            !isRecording && !isPlaying ? 'animate-breathe' : ''
          }`}
          style={{
            height: isRecording || isPlaying ? '4px' : `${6 + Math.sin((i / barCount) * Math.PI) * 10}px`,
            opacity: isRecording || isPlaying ? 0.5 : 0.25,
            animationDelay: `${(i / barCount) * 1.5}s`,
            animationDuration: '2s',
          }}
        />
      ))}
    </div>
  )
}
