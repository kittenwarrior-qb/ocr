from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.export_service import export_bill_to_excel, export_order_to_excel, export_orders_bulk

router = APIRouter(prefix="/exports", tags=["Exports"])

VALID_FORMATS = ("misa", "bravo", "misa_template")


class BulkExportRequest(BaseModel):
    order_ids: List[UUID]
    fmt: str = "misa_template"


@router.post("/orders/bulk")
def export_orders_bulk_endpoint(body: BulkExportRequest, db: Session = Depends(get_db)):
    if body.fmt not in VALID_FORMATS:
        raise HTTPException(status_code=400, detail=f"fmt must be one of {VALID_FORMATS}")
    if not body.order_ids:
        raise HTTPException(status_code=400, detail="order_ids is required")
    try:
        data = export_orders_bulk(db, body.order_ids, body.fmt)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="orders_bulk_export.xlsx"'},
    )


@router.get("/orders/{order_id}")
def export_order(order_id: UUID, fmt: str = "misa", db: Session = Depends(get_db)):
    if fmt not in VALID_FORMATS:
        raise HTTPException(status_code=400, detail=f"fmt must be one of {VALID_FORMATS}")
    try:
        data = export_order_to_excel(db, order_id, fmt)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    filename = f"order_{order_id}_{fmt}.xlsx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/bills/{bill_id}")
def export_bill(bill_id: UUID, fmt: str = "misa", db: Session = Depends(get_db)):
    if fmt not in VALID_FORMATS:
        raise HTTPException(status_code=400, detail=f"fmt must be one of {VALID_FORMATS}")
    try:
        data = export_bill_to_excel(db, bill_id, fmt)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    filename = f"bill_{bill_id}_{fmt}.xlsx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
