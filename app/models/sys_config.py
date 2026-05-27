from sqlalchemy import Column, Integer, String
from app.models.base import Base

DEFAULT_CONFIGS = [
    ("partner_customer_prefix", "CUST_"),
    ("partner_vendor_prefix", "VEND_"),
    ("product_prefix", "PROD_"),
    ("address_prefix", "ADDR_"),
    ("template_prefix", "TPL_"),
]


class SysConfig(Base):
    __tablename__ = "sys_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    config_key = Column(String(100), unique=True, nullable=False)
    config_value = Column(String(50), nullable=False)
    last_number = Column(Integer, default=0, nullable=False)
