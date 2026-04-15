"""
Registro de servicios/integraciones disponibles.
Para agregar un nuevo servicio, solo agrega una entrada al diccionario.
"""

SERVICE_REGISTRY = {
    "resend": {
        "display_name": "Resend (Email)",
        "description": "Servicio de envío de correos electrónicos transaccionales",
        "icon": "Mail",
        "fields": [
            {
                "key_name": "api_key",
                "label": "API Key",
                "field_type": "password",
                "required": True,
                "placeholder": "re_xxxxxxxxxxxxxxxx",
            },
            {
                "key_name": "from_email",
                "label": "Email remitente",
                "field_type": "email",
                "required": True,
                "placeholder": "noreply@tudominio.com",
            },
            {
                "key_name": "from_name",
                "label": "Nombre remitente",
                "field_type": "text",
                "required": False,
                "placeholder": "SmartFlow",
            },
        ],
    },
    "ultra": {
        "display_name": "Ultra MSG (WhatsApp)",
        "description": "API de WhatsApp Business para notificaciones y alertas",
        "icon": "MessageCircle",
        "fields": [
            {
                "key_name": "api_key",
                "label": "API Key",
                "field_type": "password",
                "required": True,
                "placeholder": "Tu API key de Ultra MSG",
            },
            {
                "key_name": "instance_id",
                "label": "Instance ID",
                "field_type": "text",
                "required": True,
                "placeholder": "instanceXXXX",
            },
        ],
    },
    "sendgrid": {
        "display_name": "SendGrid (Email)",
        "description": "Plataforma de email marketing y correos transaccionales",
        "icon": "Send",
        "fields": [
            {
                "key_name": "api_key",
                "label": "API Key",
                "field_type": "password",
                "required": True,
                "placeholder": "SG.xxxxxxxxxxxxxxxx",
            },
            {
                "key_name": "from_email",
                "label": "Email remitente",
                "field_type": "email",
                "required": True,
                "placeholder": "noreply@tudominio.com",
            },
        ],
    },
    "gemini": {
        "display_name": "Google Gemini (IA)",
        "description": "Inteligencia artificial de Google para análisis y resúmenes",
        "icon": "Brain",
        "fields": [
            {
                "key_name": "api_key",
                "label": "API Key",
                "field_type": "password",
                "required": True,
                "placeholder": "AIzaSyXXXXXXXXXXXXX",
            },
            {
                "key_name": "model",
                "label": "Modelo",
                "field_type": "text",
                "required": False,
                "placeholder": "gemini-pro",
                "default": "gemini-pro",
            },
        ],
    },
    "lite": {
        "display_name": "Lite API (Mensajería)",
        "description": "Servicio de mensajería ligera para notificaciones",
        "icon": "Smartphone",
        "fields": [
            {
                "key_name": "api_key",
                "label": "API Key",
                "field_type": "password",
                "required": True,
                "placeholder": "Tu API key de Lite",
            },
        ],
    },
    "elevenlabs": {
        "display_name": "ElevenLabs (Voz IA)",
        "description": "Síntesis de voz ultra-realista para ARIA. Cambia la API key o la voz en cualquier momento.",
        "icon": "Volume2",
        "fields": [
            {
                "key_name": "api_key",
                "label": "API Key",
                "field_type": "password",
                "required": True,
                "placeholder": "sk_xxxxxxxxxxxxxxxxxxxxxxxx",
            },
            {
                "key_name": "voice_id",
                "label": "Voice ID",
                "field_type": "text",
                "required": False,
                "placeholder": "EXAVITQu4vr4xnSDxMaL",
                "default": "EXAVITQu4vr4xnSDxMaL",
                "help": "ID de voz ElevenLabs. Puedes obtener IDs en elevenlabs.io/voice-lab",
            },
            {
                "key_name": "model",
                "label": "Modelo TTS",
                "field_type": "text",
                "required": False,
                "placeholder": "eleven_multilingual_v2",
                "default": "eleven_multilingual_v2",
                "help": "eleven_multilingual_v2 = mejor para español. eleven_turbo_v2 = más rápido.",
            },
        ],
    },
    "whisper": {
        "display_name": "Whisper (Transcripción)",
        "description": "Modelo de transcripción de voz. base=rápido/liviano, medium=mejor precisión, large-v3=máxima calidad.",
        "icon": "Mic",
        "fields": [
            {
                "key_name": "model",
                "label": "Tamaño de modelo",
                "field_type": "text",
                "required": False,
                "placeholder": "base",
                "default": "base",
                "help": "Opciones: tiny, base, medium, large-v3. Más grande = más preciso pero más RAM.",
            },
        ],
    },
    "deepgram": {
        "display_name": "Deepgram Nova-3 (Transcripción Premium ⭐)",
        "description": "Transcripción con identificación de hablantes (quién habla), español colombiano, resistente a ruido. $200 créditos gratis sin vencimiento.",
        "icon": "Mic",
        "fields": [
            {
                "key_name": "api_key",
                "label": "API Key",
                "field_type": "password",
                "required": True,
                "placeholder": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                "help": "Obtén tu key gratis en deepgram.com → Console → API Keys ($200 créditos gratis)",
            },
            {
                "key_name": "model",
                "label": "Modelo",
                "field_type": "text",
                "required": False,
                "placeholder": "nova-3",
                "default": "nova-3",
                "help": "nova-3 = mejor para español/ruido. nova-2 = más barato.",
            },
        ],
    },
    "groq": {
        "display_name": "Groq (Transcripción en nube ⚡)",
        "description": "Whisper en la nube de Groq. Gratis, rapidísimo (1-2s), y no usa RAM del servidor. Recomendado para Render free tier.",
        "icon": "Zap",
        "fields": [
            {
                "key_name": "api_key",
                "label": "API Key",
                "field_type": "password",
                "required": True,
                "placeholder": "gsk_xxxxxxxxxxxxxxxxxxxxxxxx",
                "help": "Obtén tu key gratis en console.groq.com → API Keys",
            },
            {
                "key_name": "model",
                "label": "Modelo Whisper",
                "field_type": "text",
                "required": False,
                "placeholder": "whisper-large-v3-turbo",
                "default": "whisper-large-v3-turbo",
                "help": "whisper-large-v3-turbo = más rápido. whisper-large-v3 = más preciso.",
            },
        ],
    },
    "openai": {
        "display_name": "OpenAI Whisper (Transcripción Premium 🎙️)",
        "description": "Whisper-1 de OpenAI. La opción más confiable: $0.006/min, ~4000 min con $25 USD. Prioridad 1 en la cadena de transcripción.",
        "icon": "Mic",
        "fields": [
            {
                "key_name": "api_key",
                "label": "API Key de OpenAI",
                "field_type": "password",
                "required": True,
                "placeholder": "sk-svcacct-xxxxxxxxxxxxxxxx",
                "help": "Obtén tu key en platform.openai.com → API Keys. Formato: sk-svcacct-... o sk-proj-...",
            },
        ],
    },
}
