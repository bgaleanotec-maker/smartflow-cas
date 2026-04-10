"""
Business Plan (BP) router — CAS team
"""
from typing import Optional, Annotated
from datetime import date
import io

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import DB, CurrentUser, LeaderOrAdmin, get_current_user
from app.models.user import User
from app.models.business_plan import (
    BusinessPlan, BPLine, BPActivity, BPExcelAnalysis,
    BPLineCategory, BPActivityStatus,
)
from app.models.business import Business
from app.schemas.business_plan import (
    BusinessPlanCreate, BusinessPlanUpdate,
    BPLineCreate, BPLineUpdate,
    BPActivityCreate, BPActivityUpdate,
)

router = APIRouter(prefix="/bp", tags=["Business Plan"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _compute_annual_plan(monthly_plan: Optional[dict]) -> Optional[float]:
    """Sum all monthly values to get annual plan total."""
    if not monthly_plan:
        return None
    try:
        return sum(float(v) for v in monthly_plan.values() if v is not None)
    except (TypeError, ValueError):
        return None


def _is_overdue(activity: BPActivity) -> bool:
    if activity.status in (BPActivityStatus.COMPLETADA, BPActivityStatus.CANCELADA):
        return False
    if activity.due_date and activity.due_date < date.today():
        return True
    return False


def _bp_to_dict(bp: BusinessPlan, activities_stats: Optional[dict] = None) -> dict:
    stats = activities_stats or {}
    return {
        "id": bp.id,
        "business_id": bp.business_id,
        "business_name": bp.business.name if bp.business else None,
        "year": bp.year,
        "status": bp.status.value if hasattr(bp.status, "value") else bp.status,
        "version": bp.version,
        "name": bp.name,
        "description": bp.description,
        "scope": bp.scope,
        "total_ingresos_plan": bp.total_ingresos_plan,
        "total_costos_plan": bp.total_costos_plan,
        "margen_bruto_plan": bp.margen_bruto_plan,
        "created_by_id": bp.created_by_id,
        "created_by_name": bp.created_by.full_name if bp.created_by else None,
        "created_at": bp.created_at,
        "updated_at": bp.updated_at,
        "activities_total": stats.get("total", 0),
        "activities_completed": stats.get("completed", 0),
        "activities_overdue": stats.get("overdue", 0),
    }


def _line_to_dict(line: BPLine) -> dict:
    return {
        "id": line.id,
        "bp_id": line.bp_id,
        "category": line.category.value if hasattr(line.category, "value") else line.category,
        "subcategory": line.subcategory,
        "name": line.name,
        "unit": line.unit,
        "monthly_plan": line.monthly_plan,
        "monthly_actual": line.monthly_actual,
        "annual_plan": line.annual_plan,
        "annual_actual": line.annual_actual,
        "notes": line.notes,
        "order_index": line.order_index,
    }


def _activity_to_dict(act: BPActivity) -> dict:
    overdue = _is_overdue(act)
    displayed_status = act.status.value if hasattr(act.status, "value") else act.status
    if overdue and act.status == BPActivityStatus.PENDIENTE:
        displayed_status = BPActivityStatus.VENCIDA.value
    return {
        "id": act.id,
        "bp_id": act.bp_id,
        "title": act.title,
        "description": act.description,
        "category": act.category.value if hasattr(act.category, "value") else act.category,
        "priority": act.priority.value if hasattr(act.priority, "value") else act.priority,
        "status": displayed_status,
        "owner_id": act.owner_id,
        "owner_name": act.owner.full_name if act.owner else None,
        "due_date": str(act.due_date) if act.due_date else None,
        "completion_date": str(act.completion_date) if act.completion_date else None,
        "progress": act.progress,
        "premisa_id": act.premisa_id,
        "notes": act.notes,
        "evidence": act.evidence,
        "order_index": act.order_index,
        "is_overdue": overdue,
        "created_at": act.created_at,
        "updated_at": act.updated_at,
    }


def _analysis_to_dict(a: BPExcelAnalysis) -> dict:
    return {
        "id": a.id,
        "bp_id": a.bp_id,
        "filename": a.filename,
        "file_size": a.file_size,
        "parsed_data": a.parsed_data,
        "ai_summary": a.ai_summary,
        "ai_insights": a.ai_insights,
        "uploaded_by_id": a.uploaded_by_id,
        "uploaded_by_name": a.uploaded_by.full_name if a.uploaded_by else None,
        "uploaded_at": a.uploaded_at,
    }


async def _get_activity_stats(db: AsyncSession, bp_id: int) -> dict:
    result = await db.execute(
        select(BPActivity).where(
            BPActivity.bp_id == bp_id,
            BPActivity.is_deleted == False,
        )
    )
    activities = result.scalars().all()
    total = len(activities)
    completed = sum(1 for a in activities if a.status == BPActivityStatus.COMPLETADA)
    overdue = sum(1 for a in activities if _is_overdue(a))
    return {"total": total, "completed": completed, "overdue": overdue}


# ─── Dashboard ────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def bp_dashboard(db: DB, user: CurrentUser, year: Optional[int] = None):
    """Summary stats: all businesses, completion %, overdue activities."""
    biz_result = await db.execute(select(Business))
    businesses = biz_result.scalars().all()

    bp_query = (
        select(BusinessPlan)
        .where(BusinessPlan.is_deleted == False)
        .options(selectinload(BusinessPlan.business), selectinload(BusinessPlan.created_by))
        .order_by(BusinessPlan.year.desc())
    )
    if year:
        bp_query = bp_query.where(BusinessPlan.year == year)
    bp_result = await db.execute(bp_query)
    all_bps = bp_result.scalars().all()

    # Latest BP per business
    bp_by_business: dict[int, BusinessPlan] = {}
    for bp in all_bps:
        if bp.business_id not in bp_by_business:
            bp_by_business[bp.business_id] = bp

    status_counts: dict[str, int] = {}
    for bp in all_bps:
        s = bp.status.value if hasattr(bp.status, "value") else str(bp.status)
        status_counts[s] = status_counts.get(s, 0) + 1

    # Fetch activities for all BPs
    bp_ids = [bp.id for bp in bp_by_business.values()]
    acts_by_bp: dict[int, list] = {}
    if bp_ids:
        act_result = await db.execute(
            select(BPActivity).where(
                BPActivity.bp_id.in_(bp_ids),
                BPActivity.is_deleted == False,
            )
        )
        for a in act_result.scalars().all():
            acts_by_bp.setdefault(a.bp_id, []).append(a)

    summaries = []
    for biz in businesses:
        bp = bp_by_business.get(biz.id)
        if bp:
            acts = acts_by_bp.get(bp.id, [])
            total_acts = len(acts)
            completed = sum(1 for a in acts if a.status == BPActivityStatus.COMPLETADA)
            overdue = sum(1 for a in acts if _is_overdue(a))
            completion_pct = round((completed / total_acts * 100) if total_acts > 0 else 0.0, 1)
            summaries.append({
                "business_id": biz.id,
                "business_name": biz.name,
                "business_color": getattr(biz, "color", None),
                "latest_bp_id": bp.id,
                "year": bp.year,
                "status": bp.status.value if hasattr(bp.status, "value") else bp.status,
                "total_ingresos_plan": bp.total_ingresos_plan,
                "total_costos_plan": bp.total_costos_plan,
                "margen_bruto_plan": bp.margen_bruto_plan,
                "activities_total": total_acts,
                "activities_completed": completed,
                "activities_overdue": overdue,
                "completion_pct": completion_pct,
            })
        else:
            summaries.append({
                "business_id": biz.id,
                "business_name": biz.name,
                "business_color": getattr(biz, "color", None),
                "latest_bp_id": None,
                "year": None,
                "status": None,
                "total_ingresos_plan": None,
                "total_costos_plan": None,
                "margen_bruto_plan": None,
                "activities_total": 0,
                "activities_completed": 0,
                "activities_overdue": 0,
                "completion_pct": 0.0,
            })

    all_acts_flat = [a for acts in acts_by_bp.values() for a in acts]
    return {
        "total_bps": len(all_bps),
        "total_businesses_with_bp": len(bp_by_business),
        "total_activities": len(all_acts_flat),
        "total_overdue": sum(1 for a in all_acts_flat if _is_overdue(a)),
        "by_status": status_counts,
        "businesses": summaries,
    }


# ─── BusinessPlan CRUD ────────────────────────────────────────────────────────

@router.get("")
async def list_bps(
    db: DB, user: CurrentUser,
    year: Optional[int] = None,
    business_id: Optional[int] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    query = (
        select(BusinessPlan)
        .where(BusinessPlan.is_deleted == False)
        .options(selectinload(BusinessPlan.business), selectinload(BusinessPlan.created_by))
    )
    if year:
        query = query.where(BusinessPlan.year == year)
    if business_id:
        query = query.where(BusinessPlan.business_id == business_id)
    if status:
        query = query.where(BusinessPlan.status == status)
    query = query.order_by(BusinessPlan.year.desc(), BusinessPlan.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    bps = result.scalars().all()
    out = []
    for bp in bps:
        stats = await _get_activity_stats(db, bp.id)
        out.append(_bp_to_dict(bp, stats))
    return out


@router.post("", status_code=201)
async def create_bp(payload: BusinessPlanCreate, db: DB, user: LeaderOrAdmin):
    existing = await db.execute(
        select(BusinessPlan).where(
            BusinessPlan.business_id == payload.business_id,
            BusinessPlan.year == payload.year,
            BusinessPlan.is_deleted == False,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Ya existe un BP para este negocio en {payload.year}")
    bp = BusinessPlan(created_by_id=user.id, **payload.model_dump())
    db.add(bp)
    await db.flush()
    result = await db.execute(
        select(BusinessPlan)
        .where(BusinessPlan.id == bp.id)
        .options(selectinload(BusinessPlan.business), selectinload(BusinessPlan.created_by))
    )
    bp = result.scalar_one()
    return _bp_to_dict(bp)


@router.get("/{bp_id}")
async def get_bp(bp_id: int, db: DB, user: CurrentUser):
    result = await db.execute(
        select(BusinessPlan)
        .where(BusinessPlan.id == bp_id, BusinessPlan.is_deleted == False)
        .options(
            selectinload(BusinessPlan.business),
            selectinload(BusinessPlan.created_by),
            selectinload(BusinessPlan.lines),
            selectinload(BusinessPlan.activities).selectinload(BPActivity.owner),
            selectinload(BusinessPlan.excel_analyses).selectinload(BPExcelAnalysis.uploaded_by),
        )
    )
    bp = result.scalar_one_or_none()
    if not bp:
        raise HTTPException(status_code=404, detail="Business Plan no encontrado")

    data = _bp_to_dict(bp)
    data["lines"] = [_line_to_dict(l) for l in bp.lines if not l.is_deleted]
    data["activities"] = [_activity_to_dict(a) for a in bp.activities if not a.is_deleted]
    data["excel_analyses"] = [_analysis_to_dict(a) for a in bp.excel_analyses]

    # Recompute totals from lines
    ingreso_lines = [l for l in bp.lines if not l.is_deleted and l.category == BPLineCategory.INGRESO]
    costo_lines = [l for l in bp.lines if not l.is_deleted and l.category in (BPLineCategory.COSTO_FIJO, BPLineCategory.COSTO_VARIABLE)]
    total_ing = sum((l.annual_plan or 0) for l in ingreso_lines)
    total_cos = sum((l.annual_plan or 0) for l in costo_lines)
    data["computed_ingresos"] = total_ing
    data["computed_costos"] = total_cos
    data["computed_margen_pct"] = round(((total_ing - total_cos) / total_ing * 100) if total_ing > 0 else 0, 2)
    return data


@router.patch("/{bp_id}")
async def update_bp(bp_id: int, payload: BusinessPlanUpdate, db: DB, user: LeaderOrAdmin):
    result = await db.execute(
        select(BusinessPlan).where(BusinessPlan.id == bp_id, BusinessPlan.is_deleted == False)
    )
    bp = result.scalar_one_or_none()
    if not bp:
        raise HTTPException(status_code=404, detail="Business Plan no encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(bp, field, value)
    await db.flush()
    return {"id": bp.id}


@router.delete("/{bp_id}", status_code=204)
async def delete_bp(bp_id: int, db: DB, user: LeaderOrAdmin):
    result = await db.execute(
        select(BusinessPlan).where(BusinessPlan.id == bp_id, BusinessPlan.is_deleted == False)
    )
    bp = result.scalar_one_or_none()
    if not bp:
        raise HTTPException(status_code=404, detail="Business Plan no encontrado")
    bp.is_deleted = True
    await db.flush()


# ─── BPLine CRUD ──────────────────────────────────────────────────────────────

@router.get("/{bp_id}/lines")
async def list_lines(bp_id: int, db: DB, user: CurrentUser):
    result = await db.execute(
        select(BPLine)
        .where(BPLine.bp_id == bp_id, BPLine.is_deleted == False)
        .order_by(BPLine.order_index, BPLine.id)
    )
    return [_line_to_dict(l) for l in result.scalars().all()]


@router.post("/{bp_id}/lines", status_code=201)
async def create_line(bp_id: int, payload: BPLineCreate, db: DB, user: LeaderOrAdmin):
    bp_check = await db.execute(
        select(BusinessPlan).where(BusinessPlan.id == bp_id, BusinessPlan.is_deleted == False)
    )
    if not bp_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Business Plan no encontrado")
    data = payload.model_dump()
    if data.get("monthly_plan") and not data.get("annual_plan"):
        data["annual_plan"] = _compute_annual_plan(data["monthly_plan"])
    line = BPLine(bp_id=bp_id, **data)
    db.add(line)
    await db.flush()
    return _line_to_dict(line)


@router.patch("/{bp_id}/lines/{line_id}")
async def update_line(bp_id: int, line_id: int, payload: BPLineUpdate, db: DB, user: LeaderOrAdmin):
    result = await db.execute(
        select(BPLine).where(BPLine.id == line_id, BPLine.bp_id == bp_id, BPLine.is_deleted == False)
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    update_data = payload.model_dump(exclude_unset=True)
    if "monthly_plan" in update_data and "annual_plan" not in update_data:
        update_data["annual_plan"] = _compute_annual_plan(update_data["monthly_plan"])
    for field, value in update_data.items():
        setattr(line, field, value)
    await db.flush()
    return _line_to_dict(line)


@router.delete("/{bp_id}/lines/{line_id}", status_code=204)
async def delete_line(bp_id: int, line_id: int, db: DB, user: LeaderOrAdmin):
    result = await db.execute(
        select(BPLine).where(BPLine.id == line_id, BPLine.bp_id == bp_id, BPLine.is_deleted == False)
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Línea no encontrada")
    line.is_deleted = True
    await db.flush()


# ─── BPActivity CRUD ──────────────────────────────────────────────────────────

@router.get("/{bp_id}/activities")
async def list_activities(
    bp_id: int, db: DB, user: CurrentUser,
    status: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
):
    query = (
        select(BPActivity)
        .where(BPActivity.bp_id == bp_id, BPActivity.is_deleted == False)
        .options(selectinload(BPActivity.owner))
        .order_by(BPActivity.order_index, BPActivity.created_at)
    )
    if category:
        query = query.where(BPActivity.category == category)
    if priority:
        query = query.where(BPActivity.priority == priority)
    result = await db.execute(query)
    activities = result.scalars().all()
    out = [_activity_to_dict(a) for a in activities]
    if status:
        out = [a for a in out if a["status"] == status]
    return out


@router.post("/{bp_id}/activities", status_code=201)
async def create_activity(bp_id: int, payload: BPActivityCreate, db: DB, user: LeaderOrAdmin):
    bp_check = await db.execute(
        select(BusinessPlan).where(BusinessPlan.id == bp_id, BusinessPlan.is_deleted == False)
    )
    if not bp_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Business Plan no encontrado")
    act = BPActivity(bp_id=bp_id, **payload.model_dump())
    db.add(act)
    await db.flush()
    result = await db.execute(
        select(BPActivity).where(BPActivity.id == act.id).options(selectinload(BPActivity.owner))
    )
    act = result.scalar_one()
    return _activity_to_dict(act)


@router.patch("/{bp_id}/activities/{activity_id}")
async def update_activity(bp_id: int, activity_id: int, payload: BPActivityUpdate, db: DB, user: LeaderOrAdmin):
    result = await db.execute(
        select(BPActivity)
        .where(BPActivity.id == activity_id, BPActivity.bp_id == bp_id, BPActivity.is_deleted == False)
    )
    act = result.scalar_one_or_none()
    if not act:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(act, field, value)
    # Auto-set VENCIDA if past due and not closed
    if act.due_date and act.due_date < date.today():
        if act.status in (BPActivityStatus.PENDIENTE, BPActivityStatus.EN_PROGRESO):
            act.status = BPActivityStatus.VENCIDA
    await db.flush()
    result2 = await db.execute(
        select(BPActivity).where(BPActivity.id == act.id).options(selectinload(BPActivity.owner))
    )
    act = result2.scalar_one()
    return _activity_to_dict(act)


@router.delete("/{bp_id}/activities/{activity_id}", status_code=204)
async def delete_activity(bp_id: int, activity_id: int, db: DB, user: LeaderOrAdmin):
    result = await db.execute(
        select(BPActivity)
        .where(BPActivity.id == activity_id, BPActivity.bp_id == bp_id, BPActivity.is_deleted == False)
    )
    act = result.scalar_one_or_none()
    if not act:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    act.is_deleted = True
    await db.flush()


# ─── Excel Analysis ───────────────────────────────────────────────────────────

@router.post("/{bp_id}/analyze-excel", status_code=201)
async def analyze_excel(
    bp_id: int,
    file: UploadFile,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    """Upload Excel file, parse with openpyxl, generate AI summary via Gemini."""
    bp_check = await db.execute(
        select(BusinessPlan).where(BusinessPlan.id == bp_id, BusinessPlan.is_deleted == False)
    )
    if not bp_check.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Business Plan no encontrado")

    fname = file.filename or ""
    if not any(fname.endswith(ext) for ext in (".xlsx", ".xls", ".xlsm")):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos Excel (.xlsx, .xls, .xlsm)")

    contents = await file.read()
    file_size = len(contents)

    parsed_data: dict = {}
    basic_stats: dict = {}
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
        sheets_data: dict = {}
        for sheet_name in wb.sheetnames[:3]:
            ws = wb[sheet_name]
            rows = []
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i >= 50:
                    break
                rows.append([str(cell) if cell is not None else "" for cell in row])
            sheets_data[sheet_name] = rows
        parsed_data = {"sheets": sheets_data}
        basic_stats = {
            "total_sheets": len(wb.sheetnames),
            "sheet_names": list(wb.sheetnames),
            "rows_parsed": sum(len(v) for v in sheets_data.values()),
        }
        wb.close()
    except ImportError:
        parsed_data = {"error": "openpyxl no instalado", "filename": fname}
    except Exception as e:
        parsed_data = {"error": str(e), "filename": fname}

    ai_summary = None
    ai_insights = None
    try:
        from app.core.config import get_service_config_value
        import httpx
        api_key = await get_service_config_value(db, "gemini", "api_key")
        model_name = await get_service_config_value(db, "gemini", "model") or "gemini-pro"

        if api_key and parsed_data.get("sheets"):
            preview_lines = []
            for sname, rows in list(parsed_data["sheets"].items())[:2]:
                preview_lines.append(f"Hoja: {sname}")
                for row in rows[:15]:
                    line = " | ".join(r for r in row if r)
                    if line.strip():
                        preview_lines.append(line)
            preview_text = "\n".join(preview_lines[:80])
            prompt = (
                "Eres un analista financiero experto en planes de negocio para CAS en Vanti.\n"
                "Analiza este extracto de Excel de plan de negocio y responde en español:\n"
                "1. Resumen breve del contenido (2-3 oraciones)\n"
                "2. Principales categorías de datos identificadas\n"
                "3. Tres hallazgos o puntos de atención importantes\n"
                "4. Sugerencias para mapear los datos al módulo BP de SmartFlow\n\n"
                f"Extracto:\n{preview_text}"
            )
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"https://generativelanguage.googleapis.com/v1/models/{model_name}:generateContent?key={api_key}",
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.5, "maxOutputTokens": 1024},
                    },
                )
                if resp.status_code == 200:
                    rdata = resp.json()
                    ai_summary = (
                        rdata.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                    )
                    ai_insights = basic_stats
    except Exception:
        pass

    if not ai_summary:
        sheets_info = ", ".join(basic_stats.get("sheet_names", []))
        ai_summary = (
            f"Archivo '{fname}' procesado correctamente.\n"
            f"Hojas encontradas: {sheets_info or 'N/A'}. "
            f"Filas analizadas: {basic_stats.get('rows_parsed', 0)}.\n"
            "Para análisis IA detallado, configure Gemini en Configuración > Integraciones."
        )
        ai_insights = basic_stats

    analysis = BPExcelAnalysis(
        bp_id=bp_id,
        filename=fname,
        file_size=file_size,
        parsed_data=parsed_data,
        ai_summary=ai_summary,
        ai_insights=ai_insights,
        uploaded_by_id=user.id,
    )
    db.add(analysis)
    await db.flush()
    result = await db.execute(
        select(BPExcelAnalysis)
        .where(BPExcelAnalysis.id == analysis.id)
        .options(selectinload(BPExcelAnalysis.uploaded_by))
    )
    analysis = result.scalar_one()
    return _analysis_to_dict(analysis)


@router.get("/{bp_id}/analyses")
async def list_analyses(bp_id: int, db: DB, user: CurrentUser):
    result = await db.execute(
        select(BPExcelAnalysis)
        .where(BPExcelAnalysis.bp_id == bp_id)
        .options(selectinload(BPExcelAnalysis.uploaded_by))
        .order_by(BPExcelAnalysis.uploaded_at.desc())
    )
    return [_analysis_to_dict(a) for a in result.scalars().all()]
