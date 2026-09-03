"""Notas — mini Obsidian personal.
Espacios + notas markdown (solo texto), nota de voz → texto, e IA (Gemini)
para resumir, analizar y recordar. Cada usuario accede SOLO a sus notas."""
from typing import Optional
from datetime import date

from fastapi import APIRouter, HTTPException, File, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, or_, func as sa_func
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser
from app.models.note import Note, NoteSpace

router = APIRouter(prefix="/notes", tags=["Notas"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class SpaceCreate(BaseModel):
    name: str
    emoji: str = "📓"
    project_id: Optional[int] = None


class SpaceUpdate(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    project_id: Optional[int] = None
    order_index: Optional[int] = None


class NoteCreate(BaseModel):
    title: str = "Nota sin título"
    content: Optional[str] = ""
    space_id: Optional[int] = None
    from_voice: bool = False


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    space_id: Optional[int] = None
    is_pinned: Optional[bool] = None


class AskRequest(BaseModel):
    question: str
    note_id: Optional[int] = None     # contexto: una nota
    space_id: Optional[int] = None    # contexto: un espacio completo
    history: Optional[list] = None


def _space_dict(s: NoteSpace, count: int = 0) -> dict:
    return {
        "id": s.id, "name": s.name, "emoji": s.emoji,
        "project_id": s.project_id,
        "project_name": s.project.name if s.project else None,
        "notes_count": count,
    }


def _note_dict(n: Note, full: bool = True) -> dict:
    d = {
        "id": n.id,
        "title": n.title,
        "space_id": n.space_id,
        "is_pinned": n.is_pinned,
        "from_voice": n.from_voice,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
        "snippet": (n.content or "")[:150],
    }
    if full:
        d["content"] = n.content
    return d


async def _own_note(db, note_id: int, user_id: int) -> Note:
    n = (await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user_id)
    )).scalar_one_or_none()
    if not n:
        raise HTTPException(404, "Nota no encontrada")
    return n


# ─── Espacios ────────────────────────────────────────────────────────────────

@router.get("/spaces")
async def list_spaces(db: DB, current_user: CurrentUser):
    spaces = (await db.execute(
        select(NoteSpace).options(selectinload(NoteSpace.project))
        .where(NoteSpace.user_id == current_user.id)
        .order_by(NoteSpace.order_index, NoteSpace.id)
    )).scalars().all()
    counts = dict((await db.execute(
        select(Note.space_id, sa_func.count(Note.id))
        .where(Note.user_id == current_user.id)
        .group_by(Note.space_id)
    )).all())
    return [_space_dict(s, counts.get(s.id, 0)) for s in spaces]


@router.post("/spaces", status_code=201)
async def create_space(payload: SpaceCreate, db: DB, current_user: CurrentUser):
    s = NoteSpace(**payload.model_dump(), user_id=current_user.id)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    row = (await db.execute(
        select(NoteSpace).options(selectinload(NoteSpace.project)).where(NoteSpace.id == s.id)
    )).scalar_one()
    return _space_dict(row)


@router.patch("/spaces/{space_id}")
async def update_space(space_id: int, payload: SpaceUpdate, db: DB, current_user: CurrentUser):
    s = (await db.execute(
        select(NoteSpace).options(selectinload(NoteSpace.project))
        .where(NoteSpace.id == space_id, NoteSpace.user_id == current_user.id)
    )).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Espacio no encontrado")
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(s, f, v)
    await db.commit()
    await db.refresh(s)
    return _space_dict(s)


@router.delete("/spaces/{space_id}")
async def delete_space(space_id: int, db: DB, current_user: CurrentUser):
    s = (await db.execute(
        select(NoteSpace).where(NoteSpace.id == space_id, NoteSpace.user_id == current_user.id)
    )).scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Espacio no encontrado")
    # Las notas del espacio pasan a "sin espacio" (no se pierden)
    notes = (await db.execute(
        select(Note).where(Note.space_id == space_id, Note.user_id == current_user.id)
    )).scalars().all()
    for n in notes:
        n.space_id = None
    await db.delete(s)
    await db.commit()
    return {"ok": True, "notas_movidas": len(notes)}


# ─── Grafo (estilo Obsidian): [[wiki-links]] + #tags ─────────────────────────

@router.get("/graph")
async def notes_graph(db: DB, current_user: CurrentUser, space_id: Optional[int] = None):
    """Grafo de conocimiento del usuario: nodos = notas y #tags;
    aristas = [[enlaces]] entre notas y pertenencia a tags."""
    import re

    q = select(Note).where(Note.user_id == current_user.id)
    if space_id:
        q = q.where(Note.space_id == space_id)
    notes = (await db.execute(q)).scalars().all()

    by_title = {n.title.strip().lower(): n.id for n in notes}
    nodes = [
        {"id": f"n{n.id}", "note_id": n.id, "label": n.title, "type": "note", "space_id": n.space_id}
        for n in notes
    ]
    edges = []
    tags = {}

    link_re = re.compile(r"\[\[([^\[\]|#]+?)(?:\|[^\[\]]*)?\]\]")
    tag_re = re.compile(r"(?:^|\s)#([\wáéíóúñÁÉÍÓÚÑ][\w\-áéíóúñÁÉÍÓÚÑ]{1,40})")

    for n in notes:
        content = n.content or ""
        # [[Wiki-links]] → arista nota→nota (si el destino existe)
        for m in link_re.finditer(content):
            target = m.group(1).strip().lower()
            tid = by_title.get(target)
            if tid and tid != n.id:
                edges.append({"from": f"n{n.id}", "to": f"n{tid}", "type": "link"})
        # #tags → nodo tag + arista
        for m in tag_re.finditer(content):
            tag = m.group(1).lower()
            key = f"t_{tag}"
            if key not in tags:
                tags[key] = {"id": key, "label": f"#{tag}", "type": "tag"}
            edges.append({"from": f"n{n.id}", "to": key, "type": "tag"})

    nodes.extend(tags.values())
    return {"nodes": nodes, "edges": edges, "notes_count": len(notes), "tags_count": len(tags)}


@router.get("/resolve")
async def resolve_wikilink(title: str, db: DB, current_user: CurrentUser):
    """Resuelve un [[wiki-link]] por título (case-insensitive). 404 si no existe."""
    n = (await db.execute(
        select(Note).where(
            Note.user_id == current_user.id,
            sa_func.lower(Note.title) == title.strip().lower(),
        )
    )).scalar_one_or_none()
    if not n:
        raise HTTPException(404, "No existe una nota con ese título")
    return {"id": n.id, "title": n.title}


# ─── Notas ───────────────────────────────────────────────────────────────────

@router.get("")
async def list_notes(
    db: DB, current_user: CurrentUser,
    space_id: Optional[int] = None,
    search: Optional[str] = None,
):
    q = select(Note).where(Note.user_id == current_user.id)
    if space_id:
        q = q.where(Note.space_id == space_id)
    if search:
        like = f"%{search}%"
        q = q.where(or_(Note.title.ilike(like), Note.content.ilike(like)))
    q = q.order_by(Note.is_pinned.desc(), Note.updated_at.desc())
    notes = (await db.execute(q)).scalars().all()
    return [_note_dict(n, full=False) for n in notes]


@router.post("", status_code=201)
async def create_note(payload: NoteCreate, db: DB, current_user: CurrentUser):
    n = Note(**payload.model_dump(), user_id=current_user.id)
    db.add(n)
    await db.commit()
    await db.refresh(n)
    return _note_dict(n)


@router.get("/{note_id}")
async def get_note(note_id: int, db: DB, current_user: CurrentUser):
    return _note_dict(await _own_note(db, note_id, current_user.id))


@router.patch("/{note_id}")
async def update_note(note_id: int, payload: NoteUpdate, db: DB, current_user: CurrentUser):
    n = await _own_note(db, note_id, current_user.id)
    for f, v in payload.model_dump(exclude_unset=True).items():
        setattr(n, f, v)
    await db.commit()
    await db.refresh(n)
    return _note_dict(n)


@router.delete("/{note_id}")
async def delete_note(note_id: int, db: DB, current_user: CurrentUser):
    n = await _own_note(db, note_id, current_user.id)
    await db.delete(n)
    await db.commit()
    return {"ok": True}


# ─── Nota de voz → texto ─────────────────────────────────────────────────────

async def _gemini_model(client, api_key: str, need_audio: bool = False) -> str:
    """Autodescubre el modelo Gemini vigente (flash preferido)."""
    ml = await client.get(
        f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}&pageSize=100"
    )
    if ml.status_code == 403:
        raise HTTPException(
            400,
            "La API key de Gemini es inválida o venció. Genera una gratis en "
            "https://ai.google.dev y actualízala en Admin → Configuración → Gemini.",
        )
    if ml.status_code != 200:
        raise HTTPException(502, f"Gemini ListModels error {ml.status_code}")
    candidates = [
        m["name"].split("/")[-1]
        for m in ml.json().get("models", [])
        if "generateContent" in m.get("supportedGenerationMethods", [])
    ]
    flash = sorted([c for c in candidates if "flash" in c and "image" not in c and "tts" not in c], reverse=True)
    model = flash[0] if flash else (candidates[0] if candidates else None)
    if not model:
        raise HTTPException(502, "No hay modelos Gemini disponibles con esta API key")
    return model


@router.post("/transcribe")
async def transcribe_voice(db: DB, current_user: CurrentUser, file: UploadFile = File(...)):
    """Transcribe audio a texto con Gemini (100% gratis con tu key).
    Devuelve el texto para insertarlo/editarlo en la nota — no guarda audio.
    Nota: el dictado en vivo del navegador es la vía principal; esto es respaldo."""
    import base64
    import httpx
    from app.core.config import get_service_config_value

    api_key = await get_service_config_value(db, "gemini", "api_key")
    if not api_key:
        raise HTTPException(400, "Configura la API key de Gemini en Admin → Configuración → Gemini")

    audio_bytes = await file.read()
    if len(audio_bytes) > 12 * 1024 * 1024:
        raise HTTPException(400, "Audio muy largo (máx 12 MB, ~10 minutos)")

    mime = file.content_type or "audio/webm"
    if not mime.startswith("audio/"):
        mime = "audio/webm"

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            model = await _gemini_model(client, api_key)
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                json={
                    "contents": [{
                        "role": "user",
                        "parts": [
                            {"text": "Transcribe este audio EXACTAMENTE en español. Devuelve SOLO el texto transcrito, sin comentarios ni etiquetas. Usa puntuación natural."},
                            {"inline_data": {"mime_type": mime, "data": base64.b64encode(audio_bytes).decode()}},
                        ],
                    }],
                    "generationConfig": {"temperature": 0.1, "maxOutputTokens": 4096},
                },
            )
            data = resp.json()
            if resp.status_code != 200:
                raise HTTPException(502, f"Gemini error: {data.get('error', {}).get('message', resp.status_code)}")
            text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error transcribiendo: {e}")

    if not text:
        raise HTTPException(400, "No se detectó voz en el audio")
    return {"text": text, "source": f"gemini/{model}"}


# ─── IA (Gemini): resumir, analizar, recordar ───────────────────────────────

@router.post("/ask")
async def ask_notes_ai(payload: AskRequest, db: DB, current_user: CurrentUser):
    """Pregunta a la IA sobre tus notas (una nota o un espacio completo)."""
    import httpx
    from app.core.config import get_service_config_value

    api_key = await get_service_config_value(db, "gemini", "api_key")
    if not api_key:
        raise HTTPException(400, "Configura la API key de Gemini en Admin → Configuración → Gemini")

    # Contexto: nota puntual o espacio completo (siempre solo notas propias)
    parts = []
    if payload.note_id:
        n = await _own_note(db, payload.note_id, current_user.id)
        parts.append(f"## {n.title}\n\n{n.content or ''}")
        scope = f"la nota '{n.title}'"
    else:
        q = select(Note).where(Note.user_id == current_user.id)
        if payload.space_id:
            q = q.where(Note.space_id == payload.space_id)
        notes = (await db.execute(q.order_by(Note.updated_at.desc()).limit(80))).scalars().all()
        for n in notes:
            parts.append(f"## {n.title} (actualizada {str(n.updated_at)[:10]})\n\n{n.content or ''}")
        scope = "el espacio de notas" if payload.space_id else "todas tus notas"
    context = "\n\n---\n\n".join(parts)[:60000] or "(sin notas aún)"

    system = (
        f"Eres el asistente personal de notas de {current_user.full_name} en SmartFlow. "
        f"Trabajas sobre {scope}. Responde SIEMPRE en español, claro y accionable. "
        f"Puedes resumir, analizar, encontrar pendientes/acuerdos, y recordar datos que "
        f"estén en las notas citando el título de la nota de donde salen. Si algo no está "
        f"en las notas, dilo. Usa markdown."
    )

    model = await get_service_config_value(db, "gemini", "model")
    if model in ("gemini-pro", "gemini-1.0-pro", "gemini-1.5-flash", "gemini-1.5-pro"):
        model = None

    contents = []
    for h in (payload.history or [])[-6:]:
        role = "model" if h.get("role") == "model" else "user"
        contents.append({"role": role, "parts": [{"text": str(h.get("content", ""))[:4000]}]})
    contents.append({
        "role": "user",
        "parts": [{"text": f"MIS NOTAS:\n{context}\n\n---\nSOLICITUD: {payload.question}"}],
    })

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            if not model:
                ml = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}&pageSize=100"
                )
                if ml.status_code == 403:
                    raise HTTPException(
                        400,
                        "La API key de Gemini es inválida o venció. Genera una gratis en "
                        "https://ai.google.dev y actualízala en Admin → Configuración → Gemini.",
                    )
                if ml.status_code != 200:
                    raise HTTPException(502, f"Gemini ListModels error {ml.status_code}")
                candidates = [
                    m["name"].split("/")[-1]
                    for m in ml.json().get("models", [])
                    if "generateContent" in m.get("supportedGenerationMethods", [])
                ]
                flash = sorted([c for c in candidates if "flash" in c and "image" not in c and "tts" not in c], reverse=True)
                model = flash[0] if flash else (candidates[0] if candidates else None)
                if not model:
                    raise HTTPException(502, "No hay modelos Gemini disponibles con esta API key")

            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
                json={
                    "system_instruction": {"parts": [{"text": system}]},
                    "contents": contents,
                    "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2048},
                },
            )
            data = resp.json()
            if resp.status_code != 200:
                raise HTTPException(502, f"Gemini error: {data.get('error', {}).get('message', resp.status_code)}")
            answer = data["candidates"][0]["content"]["parts"][0]["text"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Error consultando la IA: {e}")

    return {"answer": answer, "model": model}
