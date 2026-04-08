# SmartFlow — Sistema Integrado de Gestión

## Stack
- **Backend**: Python 3.12 + FastAPI + PostgreSQL 16 + Redis
- **Frontend**: React 18 + Vite + TailwindCSS (PWA)
- **Deploy**: Render.com

## Inicio Rápido (Local)

### Prerrequisitos
- Docker + Docker Compose
- Node.js 20+ (opcional si usas Docker)
- Python 3.12+ (opcional si usas Docker)

### Con Docker (recomendado)
```bash
cd smartflow
docker-compose up --build
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Swagger Docs: http://localhost:8000/api/docs

### Sin Docker

**Backend:**
```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales de DB
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Credenciales iniciales
- **Email**: admin@smartflow.app
- **Password**: SmartFlow2024!
- ⚠️ Cambiar contraseña en el primer login

## Estructura del proyecto
```
smartflow/
├── backend/              # FastAPI API
│   ├── app/
│   │   ├── core/         # Config, DB, Security, Deps
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   └── routers/      # API endpoints
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/             # React PWA
│   ├── src/
│   │   ├── pages/        # Páginas de la app
│   │   ├── components/   # Componentes reutilizables
│   │   ├── stores/       # Zustand state
│   │   └── services/     # API calls
│   └── vite.config.js
├── docker-compose.yml
└── README.md
```

## Deploy en Render

1. Push el código a GitHub
2. En Render: New Blueprint → conectar repo
3. Render leerá `render.yaml` automáticamente
4. Configurar variables de entorno adicionales (RESEND_API_KEY, etc.)

## Módulos implementados
- ✅ Autenticación JWT (login, refresh, cambio de contraseña)
- ✅ Gestión de usuarios (solo admin: crear, editar, desactivar, reset password)
- ✅ Proyectos con tablero Kanban
- ✅ Tareas con sub-tareas, estimación, horas logueadas
- ✅ Incidentes con timeline completo e impacto económico
- ✅ Timer Pomodoro con registro automático de tiempo
- ✅ Dashboard personalizado por rol
- ✅ Admin panel: negocios, categorías, prioridades
- ✅ PWA instalable en móvil
- ✅ Dark mode completo

## Próximas funcionalidades
- [ ] Vista Timeline/Gantt
- [ ] Sprint management
- [ ] Notificaciones real-time (WebSockets)
- [ ] Email transaccional (Resend)
- [ ] WhatsApp alerts (Ultra)
- [ ] IA: resumen de incidentes, estimación de story points
