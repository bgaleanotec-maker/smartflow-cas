"""
Scheduled task reminder service.

Runs twice a day via APScheduler (configured in main.py):
  - 9:00 AM  (America/Bogota)  →  ALL active users with phone + pending tasks
  - 3:00 PM  (America/Bogota)  →  ONLY lider_sr users (second daily reminder)

Each user only receives a reminder about THEIR OWN tasks
(tasks they created OR tasks assigned to them) that are due today or overdue.
"""
import logging
from datetime import date
from sqlalchemy import select, or_

from app.core.database import AsyncSessionLocal
from app.models.quick_task import QuickTask
from app.models.user import User
from app.services.whatsapp import send_whatsapp

logger = logging.getLogger(__name__)


# ─── Message formatter ────────────────────────────────────────────────────────

_PRIORITY_ICON = {
    "urgente": "🔴",
    "alta":    "🟠",
    "media":   "🟡",
    "baja":    "🟢",
}


def _format_message(user_name: str, tasks: list, is_afternoon: bool) -> str:
    """Build the WhatsApp reminder message in Spanish."""
    first_name = user_name.split()[0]
    greeting = "🌅 *Buenos días*" if not is_afternoon else "☀️ *Buenas tardes*"
    today = date.today()

    overdue  = [t for t in tasks if t.due_date and t.due_date < today]
    due_today = [t for t in tasks if t.due_date and t.due_date == today]
    no_date  = [t for t in tasks if not t.due_date]

    lines = [
        f"{greeting}, {first_name}! 👋",
        "",
        "📋 *SmartFlow — Recordatorio de tareas pendientes*",
        "",
    ]

    if overdue:
        lines.append(f"⚠️ *VENCIDAS ({len(overdue)}):*")
        for t in overdue[:5]:
            days = (today - t.due_date).days
            icon = _PRIORITY_ICON.get(t.priority, "⚪")
            label = f"hace {days} día{'s' if days != 1 else ''}"
            lines.append(f"  {icon} {t.title}  _{label}_")
        if len(overdue) > 5:
            lines.append(f"  … y {len(overdue) - 5} más vencidas")
        lines.append("")

    if due_today:
        lines.append(f"📅 *VENCEN HOY ({len(due_today)}):*")
        for t in due_today[:5]:
            icon = _PRIORITY_ICON.get(t.priority, "⚪")
            lines.append(f"  {icon} {t.title}")
        if len(due_today) > 5:
            lines.append(f"  … y {len(due_today) - 5} más para hoy")
        lines.append("")

    # If nothing due/overdue but still has undated tasks, show them briefly
    if not overdue and not due_today and no_date:
        lines.append(f"📝 *SIN FECHA LÍMITE ({len(no_date)}):*")
        for t in no_date[:4]:
            icon = _PRIORITY_ICON.get(t.priority, "⚪")
            lines.append(f"  {icon} {t.title}")
        if len(no_date) > 4:
            lines.append(f"  … y {len(no_date) - 4} más")
        lines.append("")

    total = len(tasks)
    lines.append(f"_Total pendientes: {total} tarea{'s' if total != 1 else ''}_")
    lines.append("")
    lines.append("🔗 Ingresa a *SmartFlow* para gestionarlas.")

    return "\n".join(lines)


# ─── Core job ─────────────────────────────────────────────────────────────────

async def send_daily_reminders(is_afternoon: bool = False) -> dict:
    """
    Query pending tasks per user and dispatch WhatsApp reminders.

    Args:
        is_afternoon: If True, only process lider_sr users (afternoon run).
                      If False, process all active users (morning run).

    Returns:
        dict with counters: {users_notified, users_skipped, errors}
    """
    run_label = "tarde (lider_sr)" if is_afternoon else "mañana (todos)"
    logger.info("Task reminders START — %s", run_label)

    stats = {"users_notified": 0, "users_skipped": 0, "errors": 0}
    today = date.today()

    async with AsyncSessionLocal() as db:
        # Fetch active users that have a phone number configured
        user_q = select(User).where(
            User.is_active == True,
            User.phone.isnot(None),
            User.phone != "",
        )
        result = await db.execute(user_q)
        all_users: list[User] = result.scalars().all()

        if is_afternoon:
            # Afternoon run: only lider_sr
            users = [
                u for u in all_users
                if str(getattr(u.role, "value", u.role)) == "lider_sr"
            ]
        else:
            users = all_users

        logger.info("Task reminders — %d user(s) to process", len(users))

        for user in users:
            try:
                # Tasks created by OR assigned to this user that are pending
                task_q = (
                    select(QuickTask)
                    .where(
                        QuickTask.is_done == False,
                        or_(
                            QuickTask.user_id == user.id,
                            QuickTask.assigned_to_id == user.id,
                        ),
                        QuickTask.due_date <= today,      # today or overdue
                    )
                    .order_by(QuickTask.due_date.asc())
                )
                tasks_result = await db.execute(task_q)
                tasks = tasks_result.scalars().all()

                if not tasks:
                    stats["users_skipped"] += 1
                    continue

                message = _format_message(user.full_name, tasks, is_afternoon)
                sent = await send_whatsapp(user.phone, message)

                if sent:
                    stats["users_notified"] += 1
                    logger.info(
                        "Reminder sent to %s (%s) — %d tasks",
                        user.full_name, user.phone, len(tasks),
                    )
                else:
                    stats["errors"] += 1

            except Exception as exc:
                logger.error("Reminder error for user %s: %s", user.id, exc)
                stats["errors"] += 1

    logger.info(
        "Task reminders DONE — notified=%d skipped=%d errors=%d",
        stats["users_notified"], stats["users_skipped"], stats["errors"],
    )
    return stats
