# 🔊 ElevenLabs Expert Skill — SmartFlow ARIA Voice
> Actualizado: 2026-04-10 | Versión evaluada: ElevenLabs API v1/v2

---

## 📊 Estado actual del sistema

| Componente | Estado actual | Recomendado |
|---|---|---|
| Modelo TTS principal | `eleven_multilingual_v2` | `eleven_flash_v2_5` (real-time) |
| Modelo TTS largo | — | `eleven_multilingual_v2` (conservar) |
| Voz ARIA | Sarah `EXAVITQu4vr4xnSDxMaL` (americana) | Clau `SplyIQAjgy4DKGAnOrHi` (bogotana) |
| Delivery | Non-streaming (full audio wait) | HTTP Streaming + WebSocket |
| Latencia actual | ~2-4s TTFB | ~75ms TTFB con flash+WS |
| Archivo de servicio | `backend/app/services/elevenlabs_service.py` | ✅ Ya actualizado |

---

## 🆕 Modelos disponibles 2024-2026 (recomendaciones por caso de uso)

### `eleven_flash_v2_5` ⭐ PRINCIPAL PARA ARIA
- **Latencia:** ~75 ms tiempo-al-primer-byte
- **Idiomas:** 32 incluyendo español
- **Costo:** 50% más económico que multilingual_v2
- **Uso:** Conversaciones en tiempo real con ARIA (respuestas cortas < 200 chars)
- **Parámetro optimize_streaming_latency:** usar valor 3 o 4

### `eleven_multilingual_v2` — CONTENIDO LARGO
- **Calidad:** Máxima calidad, 29 idiomas
- **Uso:** Transcripciones largas, narración de resúmenes, documentos > 200 chars
- **Latencia:** ~1-3s, aceptable para contenido no-conversacional

### `eleven_v3` — CONTENIDO EXPRESIVO (experimental)
- **Idiomas:** 70+ idiomas
- **Novedad:** Soporta **audio tags** en texto para dirección emocional:
  ```
  [excited] ¡Buenos resultados! [whispers] Esto es confidencial.
  [laughs] Interesante pregunta. [serious] Atención al dato siguiente.
  ```
- **Uso:** Demos, anuncios internos, contenido de capacitación
- **NO usar** para conversación en tiempo real (latencia alta)

### `eleven_multilingual_sts_v2` — SPEECH-TO-SPEECH
- Convierte voz del usuario → voz de ARIA manteniendo emoción y timing
- **Caso de uso:** Reuniones donde ARIA repite o confirma lo que dijo el usuario

---

## 🎙️ Mejores voces colombianas profesionales para ARIA

| Nombre | Voice ID | Perfil | Uso recomendado |
|---|---|---|---|
| **Clau** ⭐ | `SplyIQAjgy4DKGAnOrHi` | Bogotá, profesional, educativa | ARIA principal — acento neutro bogotano |
| **Natalia** | `oK6mHoBJSrcLlTyeOykK` | Elegante, cálida, narración | Resúmenes ejecutivos |
| **Sofía** | `b2htR0pMe28pYwCY9gnP` | Medellín, conversacional, warm | Chat casual |
| **Lina** | `VmejBeYhbrcTPwDniox7` | Joven, natural, colombiana | Notificaciones |
| **Alisson** | `SmgKjOvC1aIujLWcMzqq` | Acento cálido, tono neutro | Reuniones formales |

> **Cambiar desde admin panel:** Configuración → Integraciones → ElevenLabs → Voice ID

---

## ⚡ Mejoras implementadas en `elevenlabs_service.py`

### 1. `aria_speak()` — Auto-selección de modelo
```python
# Automáticamente usa flash para respuestas cortas (< 200 chars, ~75ms)
# y multilingual_v2 para contenido largo (> 200 chars, mejor calidad)
audio = await aria_speak(text="¿En qué te ayudo?", api_key=key, voice_id=voice_id)
```

### 2. `text_to_speech_stream()` — HTTP Streaming
```python
# Para FastAPI StreamingResponse — audio llega en chunks mientras se genera
from fastapi.responses import StreamingResponse
from app.services.elevenlabs_service import text_to_speech_stream

@router.post("/tts/stream")
async def tts_stream(body: TTSBody, db: DB, user: CurrentUser):
    api_key = await get_service_config_value(db, "elevenlabs", "api_key")
    return StreamingResponse(
        text_to_speech_stream(body.text, api_key),
        media_type="audio/mpeg",
        headers={"X-Accel-Buffering": "no"},
    )
```

### 3. `text_to_speech_websocket()` — WebSocket ultra-low latency
```python
# ~75ms TTFB — ideal para respuestas ARIA en tiempo real
audio = await text_to_speech_websocket(
    text="Analicé el presupuesto. Los ingresos bajaron 3% vs proyección.",
    api_key=key,
    voice_id="SplyIQAjgy4DKGAnOrHi",
    model_id="eleven_flash_v2_5",
)
```

### 4. `speech_to_speech()` — Conversión de voz
```python
# Usuario habla → se convierte a voz de ARIA manteniendo emoción
aria_audio = await speech_to_speech(
    audio_bytes=user_recording,
    api_key=key,
    target_voice_id="SplyIQAjgy4DKGAnOrHi",
    model_id="eleven_multilingual_sts_v2",
)
```

### 5. `generate_sound_effect()` — Efectos de sonido
```python
# Para notificaciones, alertas UI
click_sound = await generate_sound_effect(
    prompt="Soft UI button click, clean modern notification",
    api_key=key,
    duration_seconds=0.5,
)
```

### 6. `create_instant_voice_clone()` — Clon de voz
```python
# Clonar voz del gerente para presentaciones automatizadas
voice_id = await create_instant_voice_clone(
    name="Voz-Director-CAS",
    audio_bytes=open("muestra_voz.mp3", "rb").read(),
    api_key=key,
    description="Voz director CAS para SmartFlow",
)
```

---

## 📈 Roadmap de mejoras pendientes

### Prioridad ALTA
- [ ] **Activar `/voice/tts/stream`** endpoint en el router — entregar audio en streaming al frontend para reducir latencia percibida
- [ ] **Cambiar voz a Clau** `SplyIQAjgy4DKGAnOrHi` por defecto (ya en código, configurar desde admin)
- [ ] **Regenerar API key** — la clave actual `sk_71ce592cc133a27802d3b22ee6c6fd89499cd6c3f3b3efb4` retorna 401

### Prioridad MEDIA
- [ ] **WebSocket TTS para ARIA chat** — reducir latencia de 2-4s a ~75ms en conversaciones
- [ ] **eleven_v3 para resúmenes de reuniones** — usar audio tags para dirección emocional en contenido largo
- [ ] **Selector de voces en frontend** — listar voces disponibles desde admin panel y vista de usuario

### Prioridad BAJA
- [ ] **Speech-to-Speech** para reuniones — convertir audio del miembro al equipo a voz ARIA
- [ ] **Instant Voice Clone** — clonar voz del director para announcements automatizados
- [ ] **Sound effects** para notificaciones de UI (click, success, alert)

---

## 🔑 Cómo actualizar la API key desde el admin panel

1. Ir a **Configuración → Integraciones → ElevenLabs**
2. Pegar la nueva API key (formato: `sk_XXXXXXXX...`)
3. Ajustar **Voice ID** si se desea cambiar de voz
4. Ajustar **Modelo TTS** (recomendado: `eleven_flash_v2_5` o dejar vacío para auto-selección)
5. Clic **Probar** para validar la key antes de guardar
6. Clic **Guardar**

---

## 💡 Voice Settings óptimas para ARIA (español colombiano)

```python
ARIA_VOICE_SETTINGS = {
    "stability": 0.55,         # 0.4-0.6: variación natural, no robótica
    "similarity_boost": 0.80,  # 0.75-0.85: fidelidad alta a la voz
    "style": 0.25,             # 0.2-0.35: expresividad moderada (profesional)
    "use_speaker_boost": True, # siempre True para claridad
    "speed": 1.0,              # 0.85-1.1 para español (habla natural)
}
```

**Tip para español colombiano:** `speed: 0.95` suena más natural que 1.0 porque el español colombiano tiene un ritmo ligeramente más pausado que el americano.
