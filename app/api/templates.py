from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.template import Template
from app.schemas.template import TemplateCreate, TemplateOut, TemplateSuggestion, TemplateUpdate
from app.services import document_service
from app.services.template_service import (
    build_prompt_with_aliases,
    build_system_prompt_from_schema,
    create_template,
    suggest_template_from_file,
)
from app.config import settings
from pathlib import Path
from datetime import datetime

router = APIRouter(prefix="/templates", tags=["Templates"])


def _enrich(t: Template) -> dict:
    d = {c.name: getattr(t, c.name) for c in t.__table__.columns}
    d["partner_name"] = t.partner.legal_name if t.partner else None
    return d


@router.get("", response_model=list[TemplateOut])
def list_templates(db: Session = Depends(get_db)):
    templates = db.query(Template).filter(Template.is_active == True).order_by(Template.created_at.desc()).all()
    return [_enrich(t) for t in templates]


@router.post("", response_model=TemplateOut)
def create_template_endpoint(body: TemplateCreate, db: Session = Depends(get_db)):
    # Ưu tiên: system_prompt thủ công > build từ aliases > build từ output_schema
    if body.system_prompt:
        system_prompt = body.system_prompt
    elif body.field_aliases:
        system_prompt = build_prompt_with_aliases(body.field_aliases)
    else:
        system_prompt = build_system_prompt_from_schema(body.output_schema)
    return create_template(
        db,
        partner_id=body.partner_id,
        document_type=body.document_type,
        name=body.name,
        system_prompt=system_prompt,
        output_schema=body.output_schema,
        field_aliases=body.field_aliases,
    )


@router.post("/suggest", response_model=TemplateSuggestion)
def suggest_from_sample(file: UploadFile = File(...)):
    content = file.file.read()
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    tmp_path = upload_dir / f"tmp_{ts}_{file.filename}"
    tmp_path.write_bytes(content)
    try:
        result = suggest_template_from_file(str(tmp_path))
    finally:
        tmp_path.unlink(missing_ok=True)
    return result


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: UUID, db: Session = Depends(get_db)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    return _enrich(t)


@router.post("/{template_id}/test")
def test_template(template_id: UUID, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Chạy OCR với prompt của template trên file mẫu, trả về JSON trích xuất được."""
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")

    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")
    tmp_path = upload_dir / f"tmp_test_{ts}_{file.filename}"
    tmp_path.write_bytes(file.file.read())

    from app.services.ocr_service import extract_full_document
    from app.services.template_service import build_prompt_with_aliases
    try:
        if t.field_aliases:
            prompt = build_prompt_with_aliases(t.field_aliases)
        else:
            prompt = t.system_prompt
        result = extract_full_document(str(tmp_path), prompt)
    finally:
        tmp_path.unlink(missing_ok=True)
    return result


@router.patch("/{template_id}", response_model=TemplateOut)
def update_template(template_id: UUID, body: TemplateUpdate, db: Session = Depends(get_db)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    data = body.model_dump(exclude_none=True)
    # Tự sinh lại prompt khi aliases thay đổi (trừ khi user cũng gửi system_prompt thủ công)
    if "field_aliases" in data and "system_prompt" not in data:
        data["system_prompt"] = build_prompt_with_aliases(data["field_aliases"])
    elif "output_schema" in data and "system_prompt" not in data and "field_aliases" not in data:
        data["system_prompt"] = build_system_prompt_from_schema(data["output_schema"])
    for field, value in data.items():
        setattr(t, field, value)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/{template_id}")
def deactivate_template(template_id: UUID, db: Session = Depends(get_db)):
    t = db.query(Template).filter(Template.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")
    t.is_active = False
    db.commit()
    return {"message": "Template deactivated"}
