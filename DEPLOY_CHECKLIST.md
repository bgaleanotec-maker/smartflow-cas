# SmartFlow — Deploy Checklist (Render)

## Variables de entorno requeridas en Render

Configura estas variables en **Render → tu servicio backend → Environment**:

| Variable | Requerida | Ejemplo / Notas |
|----------|-----------|-----------------|
| `DATABASE_URL` | SI | Render la inyecta automáticamente desde el DB vinculado (`fromDatabase`). Si no, usa `postgresql+asyncpg://user:pass@host:5432/dbname` |
| `SECRET_KEY` | SI | Genera con `python -c "import secrets; print(secrets.token_urlsafe(32))"`. **No cambiar una vez en producción** — invalida todos los tokens. |
| `ENVIRONMENT` | SI | `production` |
| `DEBUG` | SI | `false` |
| `FRONTEND_URL` | SI | `https://smartflow-casbo.onrender.com` |
| `RESEND_API_KEY` | NO | API key de Resend para emails de bienvenida / reset de contraseña |
| `ULTRA_API_KEY` | NO | API key de Ultra para WhatsApp |
| `ULTRA_INSTANCE_ID` | NO | ID de instancia Ultra |

> El `render.yaml` usa `generateValue: true` para `SECRET_KEY`, lo cual genera un valor
> aleatorio **una sola vez** al primer deploy y lo persiste. Es equivalente a setearlo manualmente.
> **No hagas re-deploy desde cero si tienes usuarios activos**, ya que se generaría una nueva clave.

---

## Pasos para deploy en Render

### Primera vez (nuevo servicio)

1. Conecta el repo en Render (`New → Blueprint` y selecciona `render.yaml`)
2. Render creará automáticamente:
   - Servicio backend `smartflow-api` (Docker)
   - Servicio frontend `smartflow-casbo` (Static)
   - Base de datos PostgreSQL `smartflow-db`
3. Espera a que el backend pase el health check en `/health`
4. El seed inicial crea el admin `admin@smartflow.app` con contraseña `SmartFlow2026!`

### Re-deploy (actualizar código)

1. Hace push al branch conectado (main/master)
2. Render detecta el cambio y rebuilds automáticamente
3. El seed en startup sincroniza la contraseña del admin en cada deploy
4. Verifica en los logs que el health check pase: `GET /health → 200`

### Deploy manual desde dashboard

1. Render → servicio `smartflow-api` → **Manual Deploy → Deploy latest commit**
2. Render → servicio `smartflow-casbo` → **Manual Deploy → Deploy latest commit**

---

## Verificar que el servicio está vivo

```bash
# Health check del backend
curl https://smartflow-api-0ric.onrender.com/health
# Respuesta esperada: {"status":"ok","app":"SmartFlow","version":"1.0.0"}

# Si el servicio está en cold start (free tier), puede tardar 30-60 segundos
# en responder la primera vez. Reintenta si hay timeout.

# Probar login desde terminal
curl -X POST https://smartflow-api-0ric.onrender.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smartflow.app","password":"SmartFlow2026!"}'
# Respuesta esperada: {"access_token":"...","refresh_token":"...","token_type":"bearer"}
```

---

## Reset de contraseña del admin (si ya existe en DB)

### Opción A — Via deploy (recomendado)
El seed en `main.py` hace upsert en cada startup: simplemente **re-deployar** el backend
actualiza la contraseña del admin a `SmartFlow2026!` automáticamente.

### Opción B — Via Render Shell (acceso directo a DB)
```bash
# En Render → smartflow-api → Shell
python -c "
import asyncio
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User
from sqlalchemy import select, update

async def reset():
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(User).where(User.email == 'admin@smartflow.app')
            .values(hashed_password=get_password_hash('SmartFlow2026!'), is_active=True)
        )
        await db.commit()
        print('Password reset OK')

asyncio.run(reset())
"
```

### Opción C — Via endpoint de reset (requiere estar logueado como admin)
```bash
# Primero obtén un token con las credenciales actuales, luego:
curl -X POST https://smartflow-api-0ric.onrender.com/api/v1/users/{user_id}/reset-password \
  -H "Authorization: Bearer {access_token}"
```

---

## Problemas comunes y soluciones

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| 502 Bad Gateway | Backend en cold start o caído | Espera 60s y reintenta; revisa logs en Render |
| 502 en `/api/*` | URL del backend incorrecta en rewrite | Verifica que `smartflow-api-0ric.onrender.com` sea la URL correcta del backend |
| 401 en login | Contraseña incorrecta o SECRET_KEY cambió | Re-deploy para sincronizar contraseña; verificar SECRET_KEY en env vars |
| 403 en login | Cuenta desactivada (`is_active=False`) | Re-deploy sincroniza `is_active=True` para el admin |
| CORS error en browser | Origen no está en `ALLOWED_ORIGINS` | Agregar URL del frontend a la lista en `config.py` |
| DB connection error | `DATABASE_URL` no configurada | Verificar variable en Render env vars; comprobar que DB esté running |
| Tokens inválidos tras restart | `SECRET_KEY` cambió | Configurar `SECRET_KEY` fija en env vars (no `generateValue`) |

---

## Arquitectura del deploy

```
Browser → https://smartflow-casbo.onrender.com
            │
            ├── /admin, /, /login  →  index.html (React SPA)
            │
            └── /api/*  →  rewrite  →  https://smartflow-api-0ric.onrender.com/api/*
                                              │
                                        FastAPI backend
                                              │
                                        PostgreSQL DB (smartflow-db)
```

---

## Notas de seguridad para producción

- [ ] `DEBUG=false` — desactiva Swagger UI y logs SQL
- [ ] `SECRET_KEY` configurada y estable (no `generateValue` si quieres control total)
- [ ] `ENVIRONMENT=production` — activa headers HSTS
- [ ] Cambiar contraseña del admin en el primer login (`must_change_password=True`)
- [ ] Configurar `RESEND_API_KEY` para que las contraseñas temporales lleguen por email
