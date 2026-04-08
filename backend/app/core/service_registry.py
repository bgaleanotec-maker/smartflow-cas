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
}
