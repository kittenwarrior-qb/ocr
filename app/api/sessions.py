from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import io

from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.session import SessionCreate, SessionOut
from app.services import session_service

router = APIRouter(prefix="/sessions", tags=["Sessions"])


def _to_out(s, db: Session) -> dict:
    stats = session_service.session_stats(db, s)
    return {
        "id": s.id,
        "name": s.name,
        "note": s.note,
        "status": s.status,
        "created_at": s.created_at,
        "closed_at": s.closed_at,
        **stats,
    }


@router.get("", response_model=list[SessionOut])
def list_sessions(db: Session = Depends(get_db)):
    sessions = session_service.list_sessions(db)
    return [_to_out(s, db) for s in sessions]


@router.post("", response_model=SessionOut)
def create_session(body: SessionCreate, db: Session = Depends(get_db)):
    s = session_service.create_session(db, body.name, body.note)
    return _to_out(s, db)


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: UUID, db: Session = Depends(get_db)):
    s = session_service.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return _to_out(s, db)


@router.post("/{session_id}/close", response_model=SessionOut)
def close_session(session_id: UUID, db: Session = Depends(get_db)):
    s = session_service.close_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return _to_out(s, db)


@router.post("/{session_id}/reopen", response_model=SessionOut)
def reopen_session(session_id: UUID, db: Session = Depends(get_db)):
    s = session_service.reopen_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    return _to_out(s, db)


@router.get("/{session_id}/export")
def export_session(session_id: UUID, db: Session = Depends(get_db)):
    s = session_service.get_session(db, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")
    xlsx_bytes = session_service.export_session_excel(db, session_id)
    from urllib.parse import quote
    safe_name = s.name.replace("/", "-")
    filename_utf8 = quote(f"phien_{safe_name}.xlsx", safe="")
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_utf8}"},
    )
