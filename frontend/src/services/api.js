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
}

// ─── Incidents ────────────────────────────────────────────────────────────
export const incidentsAPI = {
  list: (params) => api.get('/incidents', { params }),
  create: (data) => api.post('/incidents', data),
  get: (id) => api.get(`/incidents/${id}`),
  update: (id, data) => api.patch(`/incidents/${id}`, data),
  addComment: (id, comment) =>
    api.post(`/incidents/${id}/comment`, null, { params: { comment } }),
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
}

// ─── Activities (Torre de Control) ───────────────────────────────────────
export const activitiesAPI = {
  list: (params) => api.get('/activities', { params }),
  create: (data) => api.post('/activities', data),
  update: (id, data) => api.patch(`/activities/${id}`, data),
  delete: (id) => api.delete(`/activities/${id}`),
  instances: (params) => api.get('/activities/instances', { params }),
  updateInstance: (id, data) => api.patch(`/activities/instances/${id}`, data),
  torreControl: (params) => api.get('/activities/torre-control', { params }),
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
