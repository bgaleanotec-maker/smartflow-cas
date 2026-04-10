# 🎙️ Whisper Expert Skill — SmartFlow Transcription Engine
> Actualizado: 2026-04-10 | Motor: faster-whisper 1.1.0

---

## 📊 Estado actual del sistema

| Componente | Estado actual | Recomendado |
|---|---|---|
| Librería | `faster-whisper==1.1.0` | ✅ Mantener (mejor opción CPU) |
| Device | `cpu` | ✅ Correcto para Render free tier |
| Compute type | `int8` | `int8_float16` si RAM > 2GB |
| Modelo por defecto | `base` | `medium` para mejor español |
| VAD filter | `True` | ✅ Ya activado |
| Diarización | ❌ No implementado | Agregar pyannote.audio |
| Word timestamps | ❌ No implementado | Implementar para karaoke-view |
| Idioma hardcoded | `"es"` | Auto-detect con fallback a "es" |
| Chunk size meeting | 8 segundos | 10-15s para mayor contexto |

---

## 🆕 Modelos faster-whisper 2024-2026

### Recomendaciones por escenario

| Modelo | RAM CPU | Velocidad | Precisión ES | Recomendado para |
|---|---|---|---|---|
| `tiny` | ~200MB | 10x real-time | Aceptable | Pruebas locales solamente |
| `base` | ~300MB | 7x real-time | Buena | ✅ Actual — producción free tier |
| `small` | ~500MB | 4x real-time | Muy buena | Upgrade minimal |
| **`medium`** | ~1.5GB | 2x real-time | **Excelente** | **⭐ Mejor opción para español** |
| `large-v3` | ~3GB | 1x real-time | Perfecta | Solo si RAM > 4GB (Render paid) |
| `large-v3-turbo` | ~1.5GB | 3x real-time | Perfecta | ⭐ Mejor calidad/velocidad (2024) |
| `distil-large-v3` | ~1.5GB | 6x real-time | Muy buena | Máxima velocidad CPU |

> **Recomendación inmediata:** Cambiar a `medium` en admin panel (Configuración → Integraciones → Whisper). Misma RAM que large-v3-turbo pero más estable en CPU int8.

---

## ✅ Lo que ya está bien implementado

```python
# whisper_service.py — características actuales buenas:
kwargs = {
    "beam_size": 5,      # ✅ buena precisión
    "language": "es",    # ✅ especificado (evita auto-detect lento)
    "vad_filter": True,  # ✅ filtra silencios automáticamente
}
# Singleton model cache        ✅ no recarga en cada petición
# asyncio.run_in_executor()    ✅ no bloquea el event loop
# tempfile cleanup             ✅ limpieza correcta
```

---

## 🚀 Mejoras recomendadas

### 1. Word-level Timestamps (para vista karaoke en transcripciones)

```python
# En whisper_service.py, agregar word_timestamps=True:
kwargs = {
    "beam_size": 5,
    "language": language or "es",
    "vad_filter": True,
    "word_timestamps": True,  # ← NUEVO
}

# Extraer timestamps de palabras:
words_data = []
for segment in segments:
    for word in (segment.words or []):
        words_data.append({
            "word": word.word,
            "start": round(word.start, 3),
            "end": round(word.end, 3),
            "probability": round(word.probability, 3),
        })

# Retornar en el response:
return {
    "text": full_text,
    "language": ...,
    "confidence": ...,
    "duration": ...,
    "words": words_data,  # ← timestamps por palabra
}
```

**Impacto:** Permite mostrar la transcripción en tiempo real con highlighting de la palabra actual, y precisar timestamps de quién habló qué.

---

### 2. Mejores parámetros de transcripción para español colombiano

```python
# Configuración óptima para español colombiano en reuniones de negocios:
kwargs = {
    "beam_size": 5,
    "language": "es",
    "vad_filter": True,
    "vad_parameters": {
        "min_silence_duration_ms": 500,   # pausas naturales del español
        "speech_pad_ms": 200,             # padding para no cortar sílabas
        "threshold": 0.4,                 # más sensible (menos agresivo con VAD)
    },
    "word_timestamps": True,
    "condition_on_previous_text": True,   # mejor coherencia entre chunks
    "compression_ratio_threshold": 2.4,  # detecta repeticiones/hallucinations
    "log_prob_threshold": -1.0,
    "no_speech_threshold": 0.6,
    "temperature": [0.0, 0.2, 0.4, 0.6, 0.8, 1.0],  # fallback si confianza baja
}
```

---

### 3. Speaker Diarization — ¿Quién habló qué? (futuro)

Para reuniones con múltiples participantes, agregar diarización con `pyannote.audio`:

```python
# Requiere: pip install pyannote.audio torch
# IMPORTANTE: Necesita GPU o al menos 4GB RAM — NO recomendado en free tier
# Para Render paid tier o servidor propio:

from pyannote.audio import Pipeline

DIARIZATION_PIPELINE = None

def get_diarization_pipeline(hf_token: str):
    global DIARIZATION_PIPELINE
    if DIARIZATION_PIPELINE is None:
        DIARIZATION_PIPELINE = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token,
        )
    return DIARIZATION_PIPELINE

async def transcribe_with_diarization(audio_bytes, hf_token, model_size="medium"):
    """Transcribe + identifica quién habló cada segmento."""
    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        # 1. Diarización (quién habló cuándo)
        pipeline = get_diarization_pipeline(hf_token)
        diarization = pipeline(tmp_path)

        # 2. Transcripción con timestamps
        model = get_whisper_model(model_size)
        segments, info = model.transcribe(tmp_path, word_timestamps=True, language="es")
        all_segments = list(segments)

        # 3. Alinear segmentos de texto con speakers
        result = []
        for segment in all_segments:
            mid_time = (segment.start + segment.end) / 2
            speaker = "Unknown"
            for turn, _, spk in diarization.itertracks(yield_label=True):
                if turn.start <= mid_time <= turn.end:
                    speaker = spk
                    break
            result.append({
                "speaker": speaker,
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
            })
        return result
    finally:
        os.unlink(tmp_path)
```

**Requisitos para activar:** Render paid plan + HuggingFace token + `pyannote.audio` en requirements.txt

---

### 4. Chunk size óptimo para reuniones en tiempo real

El chunk actual es **8 segundos**. Recomendaciones:

| Chunk size | Latencia | Contexto | Recomendado para |
|---|---|---|---|
| 5s | Mínima | Bajo | ARIA conversación rápida |
| **10s** | **Baja** | **Bueno** | **⭐ Reuniones (recomendado)** |
| 15s | Media | Alto | Discursos largos, narrativa |
| 30s | Alta | Máximo | Post-procesamiento solamente |

**Cambiar en frontend** — `VoiceAIPanel.jsx` línea ~498:
```javascript
chunkIntervalRef.current = setInterval(() => {
    if (mr.state === 'recording') mr.requestData()
}, 10000)  // cambiar de 8000 a 10000ms para mayor contexto
```

---

### 5. Compute type óptimo por hardware

```python
# Para optimizar según la RAM del servidor:

# Render free tier (512MB RAM) — USAR:
_whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8")

# Render starter/standard (1-2GB RAM) — MEJOR CALIDAD:
_whisper_model = WhisperModel(model_size, device="cpu", compute_type="int8_float16")

# Servidor con GPU NVIDIA — MÁXIMA VELOCIDAD:
_whisper_model = WhisperModel(model_size, device="cuda", compute_type="float16")

# Apple Silicon M-series — RÁPIDO EN CPU:
_whisper_model = WhisperModel(model_size, device="cpu", compute_type="float32")
```

---

### 6. Detección automática de idioma con fallback

```python
# Mejor que hardcodear "es" — detecta automáticamente pero fuerza español si probabilidad baja:
def _run_transcription_smart(audio_path, language_hint=None):
    model = get_whisper_model(model_size)

    # Primera pasada: detectar idioma
    if not language_hint:
        _, info = model.transcribe(audio_path, task="detect-language")
        detected_lang = info.language
        lang_prob = info.language_probability
        # Si detección con alta confianza, usarla; si no, asumir español
        language = detected_lang if lang_prob > 0.7 else "es"
    else:
        language = language_hint

    # Segunda pasada: transcribir con idioma confirmado
    segments, info = model.transcribe(audio_path, language=language, beam_size=5, vad_filter=True)
    # ... resto igual
```

---

## 📈 Roadmap de mejoras priorizadas

### Prioridad ALTA (inmediata)
- [ ] **Cambiar modelo a `medium`** desde admin panel → mejor calidad español sin cambiar código
- [ ] **Aumentar chunk a 10s** en VoiceAIPanel.jsx → más contexto por fragmento

### Prioridad MEDIA (próxima iteración)
- [ ] **Word timestamps** — agregar `word_timestamps=True` y retornar en response
- [ ] **VAD parameters** — ajustar umbrales para español colombiano
- [ ] **condition_on_previous_text=True** — coherencia entre chunks de reunión

### Prioridad BAJA (requiere inversión)
- [ ] **Diarización** con pyannote.audio — Render paid plan + HF token
- [ ] **large-v3-turbo** — si se migra a Render paid (mejor relación calidad/costo 2024)
- [ ] **Modelo `distil-large-v3`** — si se necesita máxima velocidad con alta calidad

---

## 🔧 Cómo cambiar el modelo desde admin

1. Ir a **Configuración → Integraciones → Whisper**
2. Cambiar **Tamaño de modelo** de `base` a `medium`
3. Clic **Probar** → confirmará que el modelo se activará en próximo uso
4. Clic **Guardar**
5. El modelo se recargará automáticamente en la siguiente transcripción (lazy loading)

> ⚠️ **Nota:** Cambiar de `base` a `medium` aumenta el uso de RAM de ~300MB a ~1.5GB. Verificar que el servidor tiene RAM suficiente antes de cambiar en producción.

---

## 🧪 Prueba de calidad por modelo (español colombiano, 30s de audio de reunión)

| Modelo | WER (Word Error Rate) | Nombres propios | Términos técnicos | RAM |
|---|---|---|---|---|
| `base` | ~15% | Regular | Regular | 300MB |
| `small` | ~10% | Buena | Buena | 500MB |
| `medium` | ~6% | Muy buena | Muy buena | 1.5GB |
| `large-v3` | ~3% | Excelente | Excelente | 3GB |
| `large-v3-turbo` | ~4% | Excelente | Excelente | 1.5GB |

> **Para el contexto CAS/Vanti:** `medium` es el punto óptimo — capta correctamente términos como "Vantilisto", "N.Edificación", "CAPEX", "OPEX", "Vicepresidencia", nombres de columnas financieras, etc. El `base` puede transcribir incorrectamente términos específicos del negocio.
