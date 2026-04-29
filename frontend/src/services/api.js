import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://smartflow-api-0ric.onrender.com/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor: attach access token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor: handle 401 with refresh
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refreshToken = useAuthStore.getState().refreshToken
        const res = await axios.post('/api/v1/auth/refresh', { refresh_token: refreshToken })
        const { access_token, refresh_token } = res.data
        useAuthStore.getState().setTokens(access_token, refresh_token)
        original.headers.Authorization = `Bearer ${access_token}`
        return api(original)
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

// ─── Auth ──────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  refresh: (data) => api.post('/auth/refresh', data),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
}

// ─── Users ────────────────────────────────────────────────────────────────
export const usersAPI = {
  list: (params) => api.get('/users', { params }),
  create: (data) => api.post('/users', data),
  get: (id) => api.get(`/users/${id}`),
  update: (id, data) => api.patch(`/users/${id}`, data),
  resetPassword: (id) => api.post(`/users/${id}/reset-password`),
  deactivate: (id) => api.delete(`/users/${id}`),
}

// ─── Projects ─────────────────────────────────────────────────────────────
export const projectsAPI = {
  list: (params) => api.get('/projects', { params }),
  create: (data) => api.post('/projects', data),
  get: (id) => api.get(`/projects/${id}`),
  update: (id, data) => api.patch(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
}

// ─── Tasks ────────────────────────────────────────────────────────────────
export const tasksAPI = {
  list: (params) => api.get('/tasks', { params }),
  myTasks: (params) => api.get('/tasks/my', { params }),
  create: (data) => api.post('/tasks', data),
  get: (id) => api.get(`/tasks/${id}`),
  update: (id, data) => api.patch(`/tasks/${id}`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
  addSubtask: (taskId, data) => api.post(`/tasks/${taskId}/subtasks`, data),
  toggleSubtask: (taskId, subtaskId) => api.patch(`/tasks/${taskId}/subtasks/${subtaskId}`),
  logTime: (taskId, data) => api.post(`/tasks/${taskId}/log-time`, data),
  addWatcher: (taskId, userId) => api.post(`/tasks/${taskId}/watchers`, { user_id: userId }),
  removeWatcher: (taskId, userId) => api.delete(`/tasks/${taskId}/watchers/${userId}`),
}

// ─── Sprints ──────────────────────────────────────────────────────────────
export const sprintsAPI = {
  list: (projectId) => api.get('/sprints', { params: { project_id: projectId } }),
  create: (data) => api.post('/sprints', data),
  update: (id, data) => api.patch(`/sprints/${id}`, data),
  delete: (id) => api.delete(`/sprints/${id}`),
}

// ─── Incidents ────────────────────────────────────────────────────────────
export const incidentsAPI = {
  list: (params) => api.get('/incidents', { params }),
  create: (data) => api.post('/incidents', data),
  get: (id) => api.get(`/incidents/${id}`),
  update: (id, data) => api.patch(`/incidents/${id}`, data),
  delete: (id) => api.delete(`/incidents/${id}`),
  addComment: (id, comment) =>
    api.post(`/incidents/${id}/comment`, { comment }),
}

// ─── Admin ────────────────────────────────────────────────────────────────
export const adminAPI = {
  stats: () => api.get('/admin/stats'),
  businesses: () => api.get('/admin/businesses'),
  createBusiness: (data) => api.post('/admin/businesses', data),
  updateBusiness: (id, data) => api.patch(`/admin/businesses/${id}`, data),
  priorities: () => api.get('/admin/priorities'),
  taskStatuses: (params) => api.get('/admin/task-statuses', { params }),
  incidentCategories: () => api.get('/admin/incident-categories'),
  integrations: () => api.get('/admin/integrations'),
  updateIntegration: (service, data) => api.put(`/admin/integrations/${service}`, data),
  deleteIntegration: (service) => api.delete(`/admin/integrations/${service}`),
  testIntegration: (service) => api.post(`/admin/integrations/${service}/test`),
}

// ─── Demands ─────────────────────────────────────────────────────────────
export const demandsAPI = {
  list: (params) => api.get('/demands', { params }),
  create: (data) => api.post('/demands', data),
  get: (id) => api.get(`/demands/${id}`),
  update: (id, data) => api.patch(`/demands/${id}`, data),
  delete: (id) => api.delete(`/demands/${id}`),
  dashboard: () => api.get('/demands/dashboard'),
  children: (id) => api.get(`/demands/${id}/children`),
  addTimeline: (id, data) => api.post(`/demands/${id}/timeline`, data),
  addRequirement: (id, data) => api.post(`/demands/${id}/requirements`, data),
  updateRequirement: (id, reqId, data) => api.patch(`/demands/${id}/requirements/${reqId}`, data),
  addMeetingNote: (id, data) => api.post(`/demands/${id}/meeting-notes`, data),
  updateMeetingNote: (id, noteId, data) => api.patch(`/demands/${id}/meeting-notes/${noteId}`, data),
}

// ─── Demand Admin ────────────────────────────────────────────────────────
export const demandAdminAPI = {
  catalogs: (params) => api.get('/admin/demand/catalogs', { params }),
  createCatalog: (data) => api.post('/admin/demand/catalogs', data),
  updateCatalog: (id, data) => api.patch(`/admin/demand/catalogs/${id}`, data),
  deleteCatalog: (id) => api.delete(`/admin/demand/catalogs/${id}`),
  customFields: () => api.get('/admin/demand/custom-fields'),
  createCustomField: (data) => api.post('/admin/demand/custom-fields', data),
  updateCustomField: (id, data) => api.patch(`/admin/demand/custom-fields/${id}`, data),
  deleteCustomField: (id) => api.delete(`/admin/demand/custom-fields/${id}`),
}

// ─── Hechos Relevantes ───────────────────────────────────────────────────
export const hechosAPI = {
  list: (params) => api.get('/hechos', { params }),
  create: (data) => api.post('/hechos', data),
  get: (id) => api.get(`/hechos/${id}`),
  update: (id, data) => api.patch(`/hechos/${id}`, data),
  delete: (id) => api.delete(`/hechos/${id}`),
  dashboard: () => api.get('/hechos/dashboard/stats'),
}

// ─── Novedades Operativas ────────────────────────────────────────────────
export const novedadesAPI = {
  list: (params) => api.get('/novedades', { params }),
  create: (data) => api.post('/novedades', data),
  get: (id) => api.get(`/novedades/${id}`),
  update: (id, data) => api.patch(`/novedades/${id}`, data),
  delete: (id) => api.delete(`/novedades/${id}`),
}

// ─── Premisas de Negocio ─────────────────────────────────────────────────
export const premisasAPI = {
  list: (params) => api.get('/premisas', { params }),
  create: (data) => api.post('/premisas', data),
  get: (id) => api.get(`/premisas/${id}`),
  update: (id, data) => api.patch(`/premisas/${id}`, data),
  delete: (id) => api.delete(`/premisas/${id}`),
  addTimeline: (id, data) => api.post(`/premisas/${id}/timeline`, data),
  dashboard: () => api.get('/premisas/dashboard/stats'),
}

// ─── AI Assistant ────────────────────────────────────────────────────────
export const aiAPI = {
  assist: (data) => api.post('/ai/assist', data),
  chat: (data) => api.post('/ai/chat', data),
  executeAction: (data) => api.post('/ai/chat/execute', data),
}

// ─── Activities (Torre de Control) ───────────────────────────────────────
export const activitiesAPI = {
  list: (params) => api.get('/activities', { params }),
  create: (data) => api.post('/activities', data),
  update: (id, data) => api.patch(`/activities/${id}`, data),
  delete: (id) => api.delete(`/activities/${id}`),
  // New compliance endpoints
  complete: (id, data) => api.post(`/activities/${id}/complete`, data || {}),
  start: (id) => api.post(`/activities/${id}/start`),
  log: (id, limit) => api.get(`/activities/${id}/log`, { params: { limit } }),
  torreControl: (params) => api.get('/activities/torre-control', { params }),
  // Legacy compat
  instances: (params) => api.get('/activities/instances', { params }),
  updateInstance: (id, data) => api.patch(`/activities/instances/${id}`, data),
}

// ─── Lean Pro ────────────────────────────────────────────────────────────
export const leanProAPI = {
  createStandup: (data) => api.post('/lean-pro/standup', data),
  listStandups: (params) => api.get('/lean-pro/standup', { params }),
  myStandup: () => api.get('/lean-pro/standup/my'),
  createRetro: (data) => api.post('/lean-pro/retro', data),
  listRetros: (params) => api.get('/lean-pro/retro', { params }),
  createKaizen: (data) => api.post('/lean-pro/kaizen', data),
  listKaizen: (params) => api.get('/lean-pro/kaizen', { params }),
  updateKaizen: (id, data) => api.patch(`/lean-pro/kaizen/${id}`, data),
  dashboard: () => api.get('/lean-pro/dashboard'),
}

// ─── Dashboard Builder ───────────────────────────────────────────────────
export const dashboardBuilderAPI = {
  list: (params) => api.get('/dashboard-builder', { params }),
  create: (data) => api.post('/dashboard-builder', data),
  update: (id, data) => api.patch(`/dashboard-builder/${id}`, data),
  delete: (id) => api.delete(`/dashboard-builder/${id}`),
  getData: (source, params) => api.get(`/dashboard-builder/data/${source}`, { params }),
}

// ─── Pomodoro ─────────────────────────────────────────────────────────────
export const pomodoroAPI = {
  start: (data) => api.post('/pomodoro/start', data),
  complete: (id, notes) =>
    api.post(`/pomodoro/${id}/complete`, null, { params: { notes } }),
  interrupt: (id) => api.post(`/pomodoro/${id}/interrupt`),
  sessions: (params) => api.get('/pomodoro/my-sessions', { params }),
  stats: () => api.get('/pomodoro/stats'),
}

// ─── Business Plan (BP) ───────────────────────────────────────────────────
export const bpAPI = {
  // Business Plans
  list: (params) => api.get('/bp', { params }),
  create: (data) => api.post('/bp', data),
  get: (id) => api.get(`/bp/${id}`),
  update: (id, data) => api.patch(`/bp/${id}`, data),
  delete: (id) => api.delete(`/bp/${id}`),
  dashboard: (params) => api.get('/bp/dashboard', { params }),

  // Lines
  listLines: (bpId) => api.get(`/bp/${bpId}/lines`),
  createLine: (bpId, data) => api.post(`/bp/${bpId}/lines`, data),
  updateLine: (bpId, lineId, data) => api.patch(`/bp/${bpId}/lines/${lineId}`, data),
  deleteLine: (bpId, lineId) => api.delete(`/bp/${bpId}/lines/${lineId}`),

  // Activities
  listActivities: (bpId, params) => api.get(`/bp/${bpId}/activities`, { params }),
  createActivity: (bpId, data) => api.post(`/bp/${bpId}/activities`, data),
  updateActivity: (bpId, actId, data) => api.patch(`/bp/${bpId}/activities/${actId}`, data),
  deleteActivity: (bpId, actId) => api.delete(`/bp/${bpId}/activities/${actId}`),

  // Excel analysis (legacy)
  analyzeExcel: (bpId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/bp/${bpId}/analyze-excel`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  listAnalyses: (bpId) => api.get(`/bp/${bpId}/analyses`),

  // File analysis (Excel or image) — new enhanced endpoint
  analyzeFile: (bpId, file) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post(`/bp/${bpId}/analyze-file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  applyAnalysis: (bpId, analysisId) => api.post(`/bp/${bpId}/apply-analysis/${analysisId}`),

  // Recommendations
  listRecommendations: (bpId, params) => api.get(`/bp/${bpId}/recommendations`, { params }),
  createRecommendation: (bpId, data) => api.post(`/bp/${bpId}/recommendations`, data),
  updateRecommendation: (bpId, recId, data) => api.patch(`/bp/${bpId}/recommendations/${recId}`, data),
  deleteRecommendation: (bpId, recId) => api.delete(`/bp/${bpId}/recommendations/${recId}`),

  // Timeline
  getTimeline: (bpId) => api.get(`/bp/${bpId}/timeline`),
  checkReminders: (bpId) => api.post(`/bp/${bpId}/check-reminders`),

  // Checklist
  getChecklist: (bpId, actId) => api.get(`/bp/${bpId}/activities/${actId}/checklist`),
  addChecklistItem: (bpId, actId, data) => api.post(`/bp/${bpId}/activities/${actId}/checklist`, data),
  updateChecklistItem: (bpId, actId, itemId, data) => api.patch(`/bp/${bpId}/activities/${actId}/checklist/${itemId}`, data),
  deleteChecklistItem: (bpId, actId, itemId) => api.delete(`/bp/${bpId}/activities/${actId}/checklist/${itemId}`),

  // Comments
  getComments: (bpId, actId) => api.get(`/bp/${bpId}/activities/${actId}/comments`),
  addComment: (bpId, actId, data) => api.post(`/bp/${bpId}/activities/${actId}/comments`, data),
  deleteComment: (bpId, actId, commentId) => api.delete(`/bp/${bpId}/activities/${actId}/comments/${commentId}`),

  // Milestones
  getMilestones: (bpId) => api.get(`/bp/${bpId}/milestones`),
  createMilestone: (bpId, data) => api.post(`/bp/${bpId}/milestones`, data),
  updateMilestone: (bpId, msId, data) => api.patch(`/bp/${bpId}/milestones/${msId}`, data),
  deleteMilestone: (bpId, msId) => api.delete(`/bp/${bpId}/milestones/${msId}`),

  // Premisas centralizadas del BP (por negocio+año)
  getPremisas: (bpId) => api.get(`/bp/${bpId}/premisas`),

  // Link individual line → premisa (manual)
  linkLinePremisa: (bpId, lineId, premisaId) =>
    api.patch(`/bp/${bpId}/lines/${lineId}/link-premisa`, { premisa_id: premisaId }),
}

// ─── Executive Dashboard ──────────────────────────────────────────────────────
export const executiveAPI = {
  summary: () => api.get('/executive/summary'),
  aria: (data) => api.post('/executive/aria', data),
  alerts: () => api.get('/executive/alerts'),
  businesses: () => api.get('/executive/businesses'),
}

// ─── Voice AI ────────────────────────────────────────────────────────────────
export const voiceAPI = {
  createMeeting: (data) => api.post('/voice/meetings', data),
  listMeetings: (params) => api.get('/voice/meetings', { params }),
  getMeeting: (id) => api.get(`/voice/meetings/${id}`),
  deleteMeeting: (id) => api.delete(`/voice/meetings/${id}`),
  joinMeeting: (data) => api.post('/voice/meetings/join', data),
  transcribeChunk: (meetingId, audioBlob) => {
    const formData = new FormData()
    formData.append('file', audioBlob, 'chunk.webm')
    return api.post(`/voice/meetings/${meetingId}/transcribe-chunk`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  addTextChunk: (meetingId, text, speakerName) =>
    api.post(`/voice/meetings/${meetingId}/add-text-chunk`, { text, speaker_name: speakerName }),
  transcribeComplete: (meetingId, audioBlob) => {
    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.webm')
    return api.post(`/voice/meetings/${meetingId}/transcribe-complete`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,  // 2 min para grabaciones largas
    })
  },
  finalizeMeeting: (meetingId) => api.post(`/voice/meetings/${meetingId}/finalize`, {}, { timeout: 90000 }),
  tts: (data) => api.post('/voice/tts', data, { responseType: 'arraybuffer' }),
  ttsStream: (data) => api.post('/voice/tts/stream', data, { responseType: 'blob' }),
  ariaChat: (data, config) => api.post('/voice/aria-chat', data, { timeout: 22000, ...config }),
  getVoices: () => api.get('/voice/voices'),
  teamMeetings: (params) => api.get('/voice/team-meetings', { params }),
  meetingsByActivity: (actId) => api.get(`/voice/meetings/by-activity/${actId}`),
  meetingsByBusiness: (bizId) => api.get(`/voice/meetings/by-business/${bizId}`),
}

// ─── Reminders ───────────────────────────────────────────────────────────────
export const remindersAPI = {
  list: (includeDone = false) => api.get('/reminders', { params: { include_done: includeDone } }),
  create: (data) => api.post('/reminders', data),
  update: (id, data) => api.patch(`/reminders/${id}`, data),
  done: (id) => api.patch(`/reminders/${id}`, { is_done: true }),
  delete: (id) => api.delete(`/reminders/${id}`),
}

// ─── ARIA Financial Intelligence ─────────────────────────────────────────────
export const ariaAPI = {
  getAssumptions: (businessId, year) => api.get('/bp-ai/assumptions', { params: { business_id: businessId, year } }),
  saveAssumptions: (data) => api.put('/bp-ai/assumptions', data),
  generateAssumptions: (data) => api.post('/bp-ai/assumptions/generate', data),

  audit: (bpId) => api.post(`/bp/${bpId}/aria/audit`),
  generateScenarios: (bpId, data) => api.post(`/bp/${bpId}/aria/scenarios`, data),
  getScenarios: (bpId) => api.get(`/bp/${bpId}/aria/scenarios`),
  updateScenario: (bpId, scenarioId, data) => api.patch(`/bp/${bpId}/aria/scenarios/${scenarioId}`, data),
  sensitivity: (bpId, data) => api.post(`/bp/${bpId}/aria/sensitivity`, data),
  chat: (bpId, data) => api.post(`/bp/${bpId}/aria/chat`, data),
  history: (bpId) => api.get(`/bp/${bpId}/aria/history`),
  // AI: associate BP lines ↔ premisas
  linkPremisas: (bpId) => api.post(`/bp/${bpId}/aria/link-premisas`),
}

// ─── Épicas e Historias ───────────────────────────────────────────────────────
export const epicsAPI = {
  list: (params) => api.get('/epics', { params }),
  create: (data) => api.post('/epics', data),
  get: (id) => api.get(`/epics/${id}`),
  update: (id, data) => api.patch(`/epics/${id}`, data),
  delete: (id) => api.delete(`/epics/${id}`),
  createStory: (epicId, data) => api.post(`/epics/${epicId}/stories`, data),
}

export const storiesAPI = {
  list: (params) => api.get('/stories', { params }),
  update: (id, data) => api.patch(`/stories/${id}`, data),
  delete: (id) => api.delete(`/stories/${id}`),
  addUpdate: (id, data) => api.post(`/stories/${id}/updates`, data),
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardAPI = {
  attention: () => api.get('/dashboard/attention'),
}

// ─── Voice Notes ──────────────────────────────────────────────────────────────
export const voiceNotesAPI = {
  list: (params = {}) => api.get('/voice-notes', { params }),
  create: (data) => api.post('/voice-notes', data),
  update: (id, data) => api.patch(`/voice-notes/${id}`, data),
  done: (id) => api.patch(`/voice-notes/${id}`, { is_done: true }),
  delete: (id) => api.delete(`/voice-notes/${id}`),
}

// ─── Quick Tasks ──────────────────────────────────────────────────────────────
export const quickTasksAPI = {
  list: (params) => api.get('/quick-tasks', { params }),
  create: (data) => api.post('/quick-tasks', data),
  get: (id) => api.get(`/quick-tasks/${id}`),
  update: (id, data) => api.patch(`/quick-tasks/${id}`, data),
  delete: (id) => api.delete(`/quick-tasks/${id}`),
  done: (id) => api.patch(`/quick-tasks/${id}`, { is_done: true }),
  logTime: (id, minutes) => api.post(`/quick-tasks/${id}/log-time?minutes=${minutes}`),
  dashboard: () => api.get('/quick-tasks/dashboard'),
  listSubtasks: (parentId) => api.get(`/quick-tasks/${parentId}/subtasks`),
  createSubtask: (parentId, data) => api.post(`/quick-tasks/${parentId}/subtasks`, data),
}
