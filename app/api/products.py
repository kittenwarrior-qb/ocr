import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductImportRow, ProductOut, ProductUpdate
from app.services.code_generator import generate_product_code

router = APIRouter(prefix="/products", tags=["Products"])


@router.get("", response_model=list[ProductOut])
def list_products(
    active_only: bool = True,
    search: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(Product)
    if active_only:
        q = q.filter(Product.is_active == True)
    if search:
        q = q.filter(Product.display_name.ilike(f"%{search}%"))
    return q.order_by(Product.display_name).offset(skip).limit(limit).all()


@router.get("/all")
def list_all_products(db: Session = Depends(get_db)):
    """Return all active products (for frontend catalog matching)."""
    rows = db.query(Product).filter(Product.is_active == True).order_by(Product.code).all()
    return [
        {"code": p.code, "name": p.display_name, "uom": p.uom}
        for p in rows
    ]


@router.post("", response_model=ProductOut)
def create_product(body: ProductCreate, db: Session = Depends(get_db)):
    code = generate_product_code(db)
    product = Product(
        code=code,
        display_name=body.display_name,
        uom=body.uom,
        conversion_factor=body.conversion_factor,
        account_code=body.account_code,
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: UUID, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    return p


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(product_id: UUID, body: ProductUpdate, db: Session = Depends(get_db)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Product not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return p


@router.post("/import/csv")
def import_products_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = file.file.read().decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(content))
    created = 0
    skipped = 0

    for row in reader:
        display_name = (row.get("display_name") or row.get("Tên hàng") or "").strip()
        uom = (row.get("uom") or row.get("ĐVT") or "").strip()
        if not display_name or not uom:
            skipped += 1
            continue

        existing_code = (row.get("code") or row.get("Mã hàng") or "").strip()
        if existing_code:
            exists = db.query(Product).filter(Product.code == existing_code).first()
            if exists:
                skipped += 1
                continue
            code = existing_code
        else:
            code = generate_product_code(db)

        product = Product(
            code=code,
            display_name=display_name,
            uom=uom,
            account_code=(row.get("account_code") or row.get("Tài khoản") or "").strip() or None,
        )
        db.add(product)
        created += 1

    db.commit()
    return {"created": created, "skipped": skipped}
