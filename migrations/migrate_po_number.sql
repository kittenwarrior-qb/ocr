-- Migrate: chuyển order_number cũ (thực chất là số PO từ PDF) sang po_number
-- Sau đó reset order_number để auto-generate lại

-- Bước 1: Thêm cột po_number nếu chưa có
ALTER TABLE processed_orders ADD COLUMN IF NOT EXISTS po_number VARCHAR(100);

-- Bước 2: Chuyển order_number hiện tại sang po_number (vì trước đây OCR gán nhầm)
UPDATE processed_orders
SET po_number = order_number,
    order_number = NULL
WHERE po_number IS NULL AND order_number IS NOT NULL;
