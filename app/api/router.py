from fastapi import APIRouter
from app.api import documents, products, partners, templates, mappings, settings, exports, sessions, vouchers, sku_aliases, company_aliases, misa, po_history, contact_aliases, email_orders

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(sessions.router)
api_router.include_router(documents.router)
api_router.include_router(products.router)
api_router.include_router(partners.router)
api_router.include_router(templates.router)
api_router.include_router(mappings.router)
api_router.include_router(settings.router)
api_router.include_router(exports.router)
api_router.include_router(vouchers.router)
api_router.include_router(sku_aliases.router)
api_router.include_router(company_aliases.router)
api_router.include_router(misa.router)
api_router.include_router(po_history.router)
api_router.include_router(contact_aliases.router)
api_router.include_router(email_orders.router)
