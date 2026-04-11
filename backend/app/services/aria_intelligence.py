"""
ARIA Intelligence Service — intent-aware query engine for SmartFlow.

Flow per question:
  1. detect_intents(question) → set of module names to query
  2. get_context(db, user, question) → formatted context string (cached)
  3. Gemini receives: system_prompt + role + context + history + question

Role access matrix:
  admin / leader / directivo → ALL data, ALL users
  member / negocio / herramientas → own data only (filtered by user.id)

Cache strategy:
  - Leaders share one cache entry per intent-set (TTL 3min)
  - Members get user-specific cache entry (TTL 2min)
  - Cache is invalidated via invalidate_user(user) after data changes
"""
import time
import logging
from datetime import date as date_type, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ── Intent keyword map ─────────────────────────────────────────────────────────
# Maps module names to keywords that suggest the user is asking about that module
INTENT_MAP = {
    'bp_activities': [
        'actividad', 'tarea', 'pendiente', 'vence', 'atrasada', 'progreso',
        'bp', 'business plan', 'plan de negocio', 'grupo', 'subgrupo',
        'margen', 'opex', 'magnitud', 'juntas', 'brookfield', 'vicepresidencia',
        'asignada', 'asignado', 'prioridad',
    ],
    'projects': ['proyecto', 'project', 'iniciativa', 'sprint', 'entregable'],
    'incidents': [
        'incidente', 'falla', 'error', 'crítico', 'critico', 'problema',
        'caída', 'caida', 'inc-', 'alerta', 'interrupción',
    ],
    'demands': [
        'demanda', 'solicitud', 'requerimiento', 'request', 'jira',
        'radicado', 'ti ', 'tecnología',
    ],
    'meetings': [
        'reunión', 'reunion', 'meeting', 'transcripción', 'transcripcion',
        'grabación', 'grabacion', 'discutió', 'discutio', 'acordó', 'acuerdo',
        'última reunión', 'ultima reunion', 'se habló', 'se hablo',
    ],
    'team': [
        'equipo', 'quién', 'quien', 'miembro', 'asignado a', 'responsable de',
        'persona', 'usuario', 'dueño', 'dueno', 'integrante',
    ],
    'businesses': [
        'negocio', 'business', 'empresa', 'vanti', 'negocios activos',
        'portafolio',
    ],
    'recurring': [
        'recurrente', 'frecuencia', 'semanal', 'mensual', 'diaria',
        'trimestral', 'quincenal', 'calendario', 'próxima actividad',
    ],
    'summary': [
        'resumen', 'cómo va', 'como va', 'estado', 'dashboard',
        'qué hay', 'que hay', 'novedades', 'actualización', 'actualizacion',
        'overview', 'todo', 'general',
    ],
}

# ── Cache ──────────────────────────────────────────────────────────────────────
_cache: dict = {}
_TTL_LEADER = 180   # 3 min — leaders share one snapshot
_TTL_MEMBER = 120   # 2 min — members get personal snapshot


def detect_intents(question: str) -> set:
    """
    Parse question and return set of module names to query.
    Falls back to full summary if nothing specific matched.
    """
    if not question or question.strip() == 'saludo_inicial':
        return {'summary'}

    q = question.lower()
    intents = set()
    for module, keywords in INTENT_MAP.items():
        if any(kw in q for kw in keywords):
            intents.add(module)

    # summary = load everything
    if 'summary' in intents or not intents:
        return {'bp_activities', 'projects', 'incidents', 'demands',
                'meetings', 'businesses', 'recurring'}
    return intents


def _cache_key(user, intents: frozenset) -> str:
    from app.models.user import UserRole
    is_leader = user.role in (UserRole.ADMIN, UserRole.LEADER, UserRole.DIRECTIVO)
    role_key = "leader" if is_leader else f"user_{user.id}"
    intent_str = '_'.join(sorted(intents))
    return f"{role_key}:{intent_str}"


async def get_context(db, user, question: str) -> str:
    """
    Main entry point. Returns formatted context string for Gemini.
    Uses cache to avoid hitting DB on every message.
    """
    intents = frozenset(detect_intents(question))
    key = _cache_key(user, intents)
    now = time.time()

    from app.models.user import UserRole
    is_leader = user.role in (UserRole.ADMIN, UserRole.LEADER, UserRole.DIRECTIVO)
    ttl = _TTL_LEADER if is_leader else _TTL_MEMBER

    if key in _cache:
        ctx, ts = _cache[key]
        if now - ts < ttl:
            return ctx

    ctx = await _build_context(db, user, set(intents))
    _cache[key] = (ctx, now)
    return ctx


def invalidate_user(user):
    """
    Invalidate all cache entries for this user's role group.
    Call after the user creates/updates data so ARIA sees fresh state.
    """
    from app.models.user import UserRole
    is_leader = user.role in (UserRole.ADMIN, UserRole.LEADER, UserRole.DIRECTIVO)
    prefix = "leader:" if is_leader else f"user_{user.id}:"
    for key in list(_cache.keys()):
        if key.startswith(prefix):
            del _cache[key]


async def _build_context(db, user, intents: set) -> str:
    """
    Build a context string from the requested modules, respecting role permissions.
    Each section is only fetched if it matches the detected intent.
    """
    from app.models.user import UserRole
    is_leader = user.role in (UserRole.ADMIN, UserRole.LEADER, UserRole.DIRECTIVO)
    today = date_type.today()
    sections = []

    try:
        from sqlalchemy import select

        # ── Businesses + BPs ────────────────────────────────────────────────
        if 'businesses' in intents or 'bp_activities' in intents:
            from app.models.business import Business
            from app.models.business_plan import BusinessPlan

            bizs = (await db.execute(
                select(Business).where(Business.is_active == True).order_by(Business.name)
            )).scalars().all()
            if bizs:
                sections.append(f"NEGOCIOS ACTIVOS ({len(bizs)}): {', '.join(b.name for b in bizs)}")

            bp_q = (
                select(BusinessPlan, Business.name.label('biz'))
                .join(Business, BusinessPlan.business_id == Business.id)
                .where(BusinessPlan.is_deleted == False)
                .order_by(BusinessPlan.year.desc())
                .limit(20)
            )
            bp_rows = (await db.execute(bp_q)).all()
            if bp_rows:
                lines = ["PLANES DE NEGOCIO:"]
                for bp, biz in bp_rows:
                    lines.append(f"  • [{biz}] {bp.name or f'BP {bp.year}'} — {bp.status.value} ({bp.year})")
                sections.append('\n'.join(lines))

        # ── BP Activities ────────────────────────────────────────────────────
        if 'bp_activities' in intents:
            from app.models.business_plan import BPActivity, BPActivityStatus, BusinessPlan
            from app.models.business import Business
            from app.models.user import User as UserModel

            acts_q = (
                select(
                    BPActivity,
                    BusinessPlan.name.label('bp_name'),
                    Business.name.label('biz_name'),
                    UserModel.full_name.label('owner_name'),
                )
                .join(BusinessPlan, BPActivity.bp_id == BusinessPlan.id)
                .join(Business, BusinessPlan.business_id == Business.id)
                .outerjoin(UserModel, BPActivity.owner_id == UserModel.id)
                .where(
                    BPActivity.is_deleted == False,
                    BPActivity.status.in_([BPActivityStatus.PENDIENTE, BPActivityStatus.EN_PROGRESO]),
                )
            )
            if not is_leader:
                acts_q = acts_q.where(BPActivity.owner_id == user.id)
            acts_q = acts_q.order_by(BPActivity.due_date.asc().nullslast()).limit(25)
            act_rows = (await db.execute(acts_q)).all()

            if act_rows:
                lines = [f"ACTIVIDADES BP ACTIVAS ({len(act_rows)}):"]
                for act, bp_name, biz_name, owner_name in act_rows:
                    due = ""
                    if act.due_date:
                        days = (act.due_date - today).days
                        due = f" · vence {act.due_date}"
                        if days < 0:
                            due += f" \u26a0\ufe0fVENCIDA {abs(days)}d"
                        elif days == 0:
                            due += " \u26a0\ufe0fHOY"
                        elif days <= 5:
                            due += f" ({days}d)"
                    grupo = f" [{act.grupo}]" if getattr(act, 'grupo', None) else ""
                    pct = f" {act.progress}%" if getattr(act, 'progress', None) else ""
                    owner_str = f" \u2192 {owner_name}" if owner_name and is_leader else ""
                    lines.append(
                        f"  \u2022 {act.title}{grupo} \u2014 {act.status.value} \u00b7 "
                        f"{act.priority.value} \u00b7 {biz_name}{pct}{due}{owner_str}"
                    )
                sections.append('\n'.join(lines))
            else:
                sections.append("ACTIVIDADES BP: Sin actividades pendientes.")

        # ── Team members ────────────────────────────────────────────────────
        if 'team' in intents and is_leader:
            from app.models.user import User as UserModel
            users = (await db.execute(
                select(UserModel)
                .where(UserModel.is_active == True)
                .order_by(UserModel.full_name)
                .limit(30)
            )).scalars().all()
            if users:
                lines = [f"EQUIPO ({len(users)} miembros activos):"]
                for u in users:
                    team_str = f" \u00b7 equipo {u.team.value}" if u.team else ""
                    lines.append(f"  \u2022 {u.full_name} \u2014 {u.role.value}{team_str}")
                sections.append('\n'.join(lines))

        # ── Projects ────────────────────────────────────────────────────────
        if 'projects' in intents:
            from app.models.project import Project, ProjectStatus
            proj_q = (
                select(Project)
                .where(Project.status.in_([ProjectStatus.ACTIVE, ProjectStatus.PLANNING]))
                .order_by(Project.due_date.asc().nullslast())
                .limit(15)
            )
            if not is_leader:
                proj_q = proj_q.where(Project.is_private == False)
            projs = (await db.execute(proj_q)).scalars().all()
            if projs:
                lines = [f"PROYECTOS ({len(projs)}):"]
                for p in projs:
                    due = f" \u00b7 vence {p.due_date}" if p.due_date else ""
                    lines.append(f"  \u2022 {p.name} \u2014 {p.status.value} {p.progress}%{due}")
                sections.append('\n'.join(lines))
            else:
                sections.append("PROYECTOS: Sin proyectos activos.")

        # ── Incidents ────────────────────────────────────────────────────────
        if 'incidents' in intents:
            from app.models.incident import Incident, IncidentStatus
            incs = (await db.execute(
                select(Incident)
                .where(Incident.status.in_([IncidentStatus.OPEN, IncidentStatus.INVESTIGATING]))
                .order_by(Incident.created_at.desc())
                .limit(10)
            )).scalars().all()
            if incs:
                lines = [f"INCIDENTES ABIERTOS ({len(incs)}):"]
                for inc in incs:
                    lines.append(f"  \u2022 [{inc.incident_number}] {inc.title} \u2014 {inc.status.value} ({inc.severity.value})")
                sections.append('\n'.join(lines))
            else:
                sections.append("INCIDENTES: Sin incidentes abiertos.")

        # ── Demands ─────────────────────────────────────────────────────────
        if 'demands' in intents:
            from app.models.demand import DemandRequest, DemandStatus
            dem_q = (
                select(DemandRequest)
                .where(DemandRequest.status.in_([
                    DemandStatus.ENVIADA, DemandStatus.EN_EVALUACION,
                    DemandStatus.APROBADA, DemandStatus.EN_EJECUCION,
                ]))
                .order_by(DemandRequest.created_at.desc())
                .limit(10)
            )
            dems = (await db.execute(dem_q)).scalars().all()
            if dems:
                lines = [f"DEMANDAS ACTIVAS ({len(dems)}):"]
                for d in dems:
                    deadline = f" \u00b7 deadline {d.fecha_deadline}" if getattr(d, 'fecha_deadline', None) else ""
                    lines.append(f"  \u2022 [{d.demand_number}] {d.title} \u2014 {d.status.value}{deadline}")
                sections.append('\n'.join(lines))
            else:
                sections.append("DEMANDAS: Sin demandas activas.")

        # ── Meetings + Transcripts ─────────────────────────────────────────
        if 'meetings' in intents:
            from app.models.voice_meeting import VoiceMeeting, MeetingStatus, MeetingType
            mtg_q = (
                select(VoiceMeeting)
                .where(
                    VoiceMeeting.is_deleted == False,
                    VoiceMeeting.status == MeetingStatus.COMPLETED,
                    VoiceMeeting.meeting_type == MeetingType.MEETING,
                )
                .order_by(VoiceMeeting.started_at.desc())
                .limit(8)
            )
            if not is_leader:
                mtg_q = mtg_q.where(VoiceMeeting.created_by_id == user.id)
            mtgs = (await db.execute(mtg_q)).scalars().all()
            if mtgs:
                lines = [f"REUNIONES RECIENTES ({len(mtgs)}):"]
                for m in mtgs:
                    date_str = m.started_at.strftime('%Y-%m-%d') if m.started_at else '?'
                    dur = f" {m.duration_seconds // 60}min" if m.duration_seconds else ""
                    n_actions = f" | {len(m.ai_action_items)} acciones" if m.ai_action_items else ""
                    summary = f"\n    \u2192 Resumen: {m.ai_summary[:250]}" if m.ai_summary else ""
                    topics = f"\n    \u2192 Temas: {', '.join(m.ai_key_topics[:5])}" if m.ai_key_topics else ""
                    # Include transcript snippet for context
                    transcript_snip = ""
                    if m.full_transcript and len(m.full_transcript) > 20:
                        snip = m.full_transcript[:400].replace('\n', ' ')
                        transcript_snip = f"\n    \u2192 Fragmento transcripci\u00f3n: {snip}..."
                    lines.append(f"  \u2022 {m.title} ({date_str}{dur}){n_actions}{summary}{topics}{transcript_snip}")
                sections.append('\n'.join(lines))
            else:
                sections.append("REUNIONES: Sin reuniones completadas.")

        # ── Recurring activity instances ─────────────────────────────────────
        if 'recurring' in intents:
            from app.models.activities import ActivityInstance, ActivityStatus, RecurringActivity
            ai_q = (
                select(ActivityInstance, RecurringActivity.title.label('act_title'))
                .join(RecurringActivity, ActivityInstance.activity_id == RecurringActivity.id)
                .where(
                    ActivityInstance.status.in_([
                        ActivityStatus.SIN_INICIAR,
                        ActivityStatus.EN_PROCESO,
                        ActivityStatus.VENCIDA,
                    ]),
                    ActivityInstance.due_date <= today + timedelta(days=7),
                )
            )
            if not is_leader:
                ai_q = ai_q.where(ActivityInstance.assigned_to_id == user.id)
            ai_q = ai_q.order_by(ActivityInstance.due_date.asc()).limit(15)
            ai_rows = (await db.execute(ai_q)).all()
            if ai_rows:
                lines = [f"ACTIVIDADES RECURRENTES PR\u00d3XIMAS/VENCIDAS ({len(ai_rows)}):"]
                for inst, act_title in ai_rows:
                    days = (inst.due_date - today).days
                    urgency = f" \u26a0\ufe0fVENCIDA {abs(days)}d" if days < 0 else " HOY" if days == 0 else f" en {days}d"
                    lines.append(f"  \u2022 {inst.title or act_title} \u2014 {inst.status.value} \u00b7 {inst.due_date}{urgency}")
                sections.append('\n'.join(lines))

    except Exception as exc:
        logger.warning(f"aria_intelligence._build_context error: {exc}", exc_info=True)

    if not sections:
        return ""

    header = (
        f"=== CONTEXTO SmartFlow \u00b7 {user.full_name} \u00b7 ROL: {user.role.value} \u00b7 {today} ===\n"
        f"VISIBILIDAD: {'datos de todo el equipo' if is_leader else 'solo sus datos personales'}"
    )
    return header + "\n\n" + "\n\n".join(sections)
