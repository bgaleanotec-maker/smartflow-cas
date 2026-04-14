"""
Manual database backup endpoint — admin only.
Uses SQLAlchemy to export all tables as compressed JSON.
Does NOT require pg_dump binary (compatible with Render web services).
"""

import io
import json
import gzip
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, JSONResponse
from sqlalchemy import text, inspect

from app.core.deps import DB, AdminUser
from app.core.database import engine

router = APIRouter(prefix="/admin/backup", tags=["Admin - Backup"])
log = logging.getLogger(__name__)


async def _get_all_tables() -> List[str]:
    """Return list of all table names in the public schema."""
    async with engine.connect() as conn:
        result = await conn.execute(text("""
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename
        """))
        return [row[0] for row in result.fetchall()]


async def _export_table(conn, table_name: str) -> List[Dict[str, Any]]:
    """Export all rows of a table as list of dicts."""
    try:
        result = await conn.execute(text(f'SELECT * FROM "{table_name}"'))
        columns = list(result.keys())
        rows = []
        for row in result.fetchall():
            row_dict = {}
            for col, val in zip(columns, row):
                # Serialize non-JSON-serializable types
                if hasattr(val, 'isoformat'):
                    row_dict[col] = val.isoformat()
                elif hasattr(val, '__str__') and not isinstance(val, (str, int, float, bool, type(None))):
                    row_dict[col] = str(val)
                else:
                    row_dict[col] = val
            rows.append(row_dict)
        return rows
    except Exception as e:
        log.warning(f"Could not export table {table_name}: {e}")
        return []


@router.post("/download")
async def download_backup(admin: AdminUser, db: DB):
    """
    Genera y descarga un backup completo de la base de datos como JSON comprimido.
    Solo accesible por administradores.
    """
    try:
        tables = await _get_all_tables()
        backup_data = {
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "version": "1.0",
                "system": "SmartFlow CAS BO",
                "tables_count": len(tables),
            },
            "tables": {}
        }

        async with engine.connect() as conn:
            for table in tables:
                rows = await _export_table(conn, table)
                backup_data["tables"][table] = {
                    "row_count": len(rows),
                    "rows": rows,
                }
                log.info(f"Exported table {table}: {len(rows)} rows")

        # Serialize to JSON and compress
        json_bytes = json.dumps(backup_data, ensure_ascii=False, indent=2).encode("utf-8")
        compressed = gzip.compress(json_bytes, compresslevel=9)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"smartflow_backup_{timestamp}.json.gz"

        log.info(f"Backup created: {filename} ({len(compressed):,} bytes compressed, {len(json_bytes):,} bytes raw)")

        return Response(
            content=compressed,
            media_type="application/gzip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Backup-Tables": str(len(tables)),
                "X-Backup-Size": str(len(compressed)),
            }
        )

    except Exception as e:
        log.error(f"Backup failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error al generar backup: {str(e)}")


@router.get("/info")
async def backup_info(admin: AdminUser):
    """
    Retorna informacion del estado de la base de datos sin descargar nada.
    """
    try:
        tables = await _get_all_tables()
        table_stats = {}

        async with engine.connect() as conn:
            for table in tables:
                try:
                    result = await conn.execute(text(f'SELECT COUNT(*) FROM "{table}"'))
                    count = result.scalar()
                    table_stats[table] = count
                except Exception:
                    table_stats[table] = -1

        total_rows = sum(v for v in table_stats.values() if v >= 0)

        return JSONResponse({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tables_count": len(tables),
            "total_rows": total_rows,
            "tables": table_stats,
            "backup_note": (
                "Backup automatico: diario via GitHub Actions (rama 'backups' del repositorio). "
                "Backup manual: POST /admin/backup/download"
            ),
        })

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
