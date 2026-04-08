import { create } from 'zustand'

export const usePomodoroStore = create((set, get) => ({
  // Timer state
  isRunning: false,
  isPaused: false,
  sessionType: 'trabajo', // trabajo | descanso_corto | descanso_largo
  timeLeft: 25 * 60, // seconds
  totalTime: 25 * 60,
  currentSessionId: null,
  activeTaskId: null,
  activeTaskTitle: null,
  pomodoroCount: 0,

  // Config
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakAfter: 4,

  // Timer interval ref
  _intervalId: null,

  setConfig: (config) => set(config),

  setActiveTask: (taskId, taskTitle) =>
    set({ activeTaskId: taskId, activeTaskTitle: taskTitle }),

  startTimer: (sessionId, sessionType = 'trabajo') => {
    const state = get()
    const duration =
      sessionType === 'trabajo'
        ? state.workDuration
        : sessionType === 'descanso_corto'
        ? state.shortBreakDuration
        : state.longBreakDuration

    const totalSecs = duration * 60
    set({
      isRunning: true,
      isPaused: false,
      currentSessionId: sessionId,
      sessionType,
      timeLeft: totalSecs,
      totalTime: totalSecs,
    })

    const intervalId = setInterval(() => {
      const { timeLeft, isRunning } = get()
      if (!isRunning) return
      if (timeLeft <= 1) {
        clearInterval(intervalId)
        set({
          isRunning: false,
          timeLeft: 0,
          _intervalId: null,
          pomodoroCount: sessionType === 'trabajo' ? get().pomodoroCount + 1 : get().pomodoroCount,
        })
      } else {
        set({ timeLeft: timeLeft - 1 })
      }
    }, 1000)

    set({ _intervalId: intervalId })
  },

  pauseTimer: () => {
    const { _intervalId } = get()
    if (_intervalId) clearInterval(_intervalId)
    set({ isRunning: false, isPaused: true, _intervalId: null })
  },

  resumeTimer: () => {
    const state = get()
    if (!state.isPaused) return
    set({ isRunning: true, isPaused: false })

    const intervalId = setInterval(() => {
      const { timeLeft, isRunning } = get()
      if (!isRunning) return
      if (timeLeft <= 1) {
        clearInterval(intervalId)
        set({ isRunning: false, timeLeft: 0, _intervalId: null })
      } else {
        set({ timeLeft: timeLeft - 1 })
      }
    }, 1000)
    set({ _intervalId: intervalId })
  },

  stopTimer: () => {
    const { _intervalId } = get()
    if (_intervalId) clearInterval(_intervalId)
    set({
      isRunning: false,
      isPaused: false,
      currentSessionId: null,
      _intervalId: null,
      timeLeft: get().workDuration * 60,
      totalTime: get().workDuration * 60,
    })
  },

  formatTime: () => {
    const { timeLeft } = get()
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0')
    const s = (timeLeft % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  },

  getProgress: () => {
    const { timeLeft, totalTime } = get()
    return totalTime > 0 ? ((totalTime - timeLeft) / totalTime) * 100 : 0
  },
}))
