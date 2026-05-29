"""Visual OCR Service - Generate annotated images"""
import io
import logging
import re
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont
from thefuzz import fuzz

logger = logging.getLogger(__name__)

_ocr_engine = None


def _get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from paddleocr import PaddleOCR
            _ocr_engine = PaddleOCR(
                use_angle_cls=True,
                lang='vi',
                use_gpu=False,
                show_log=False
            )
            logger.info("PaddleOCR initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize PaddleOCR: {e}")
            _ocr_engine = None
    return _ocr_engine


def extract_text_with_bbox(image_path: str) -> list[dict]:
    """Extract text + bbox tu anh bang PaddleOCR"""
    ocr = _get_ocr_engine()
    if not ocr:
        return []

    try:
        path = Path(image_path)
        if path.suffix.lower() == '.pdf':
            from pdf2image import convert_from_path
            images = convert_from_path(str(path), first_page=1, last_page=1, dpi=150)
            if not images:
                return []
            temp_path = path.parent / f"{path.stem}_temp.jpg"
            images[0].save(temp_path, 'JPEG')
            image_path = str(temp_path)

        result = ocr.ocr(image_path, cls=True)
        if not result or not result[0]:
            return []

        extracted = []
        for idx, line in enumerate(result[0]):
            extracted.append({
                "index": idx,
                "text": line[1][0],
                "bbox": line[0],
                "confidence": float(line[1][1])
            })
        logger.info(f"Extracted {len(extracted)} text blocks")
        return extracted
    except Exception as e:
        logger.error(f"PaddleOCR error: {e}", exc_info=True)
        return []


# ============================================================================
# ANNOTATION - Ve khung len anh
# Approach: Tim LABEL tren anh, roi khoanh VALUE ke ben/phia duoi label
# ============================================================================

# Label patterns: tim label tren anh, value se o ke ben phai hoac dong ke tiep
LABEL_PATTERNS = {
    "order_date": [
        r"order by.*?date",
        r"ngay dat hang",
        r"ngay dat",
        r"po date",
        r"order date",
        r"ngay chung tu",
    ],
    "delivery_date": [
        r"delivery date",
        r"ngay giao hang",
        r"ngay giao",
        r"expected delivery",
    ],
    "total_amount": [
        r"total amount$",
        r"^total$",
        r"tong cong$",
        r"thanh tien.*?\+.*?vat",
        r"grand total",
    ],
    "order_number": [
        r"po no",
        r"po number",
        r"so po",
        r"so thu tu don",
        r"so don dat hang",
    ],
}


def _remove_diacritics(text: str) -> str:
    """Bo dau tieng Viet de match"""
    import unicodedata
    nfkd = unicodedata.normalize('NFKD', text)
    return ''.join(c for c in nfkd if not unicodedata.combining(c))


def _find_label_then_value(field: str, ocr_results: list[dict]) -> dict | None:
    """
    Tim label tren anh, roi lay bbox cua VALUE ke ben phai hoac dong ke tiep.
    """
    patterns = LABEL_PATTERNS.get(field, [])
    if not patterns:
        return None

    for item in ocr_results:
        text_lower = _remove_diacritics(item["text"].lower().strip())

        for pat in patterns:
            if re.search(pat, text_lower):
                # Tim thay label! Bay gio tim value ke ben phai (cung dong Y)
                label_bbox = item["bbox"]
                label_right_x = max(p[0] for p in label_bbox)
                label_y_center = sum(p[1] for p in label_bbox) / 4

                # Tim item ke ben phai, cung dong (y gan nhau)
                best_value = None
                best_dist = float('inf')

                for other in ocr_results:
                    if other["index"] == item["index"]:
                        continue
                    other_left_x = min(p[0] for p in other["bbox"])
                    other_y_center = sum(p[1] for p in other["bbox"]) / 4

                    # Phai nam ben phai label
                    if other_left_x <= label_right_x - 10:
                        continue

                    # Cung dong: y_diff < 20px
                    y_diff = abs(other_y_center - label_y_center)
                    if y_diff > 25:
                        continue

                    # Khoang cach X
                    x_dist = other_left_x - label_right_x
                    if 0 < x_dist < best_dist:
                        # Skip neu value la 1 label khac
                        other_text = _remove_diacritics(other["text"].lower().strip())
                        is_another_label = False
                        for _, pats in LABEL_PATTERNS.items():
                            for p in pats:
                                if re.search(p, other_text):
                                    is_another_label = True
                                    break
                            if is_another_label:
                                break
                        if is_another_label:
                            continue

                        best_dist = x_dist
                        best_value = other

                if best_value:
                    return {"bbox": best_value["bbox"], "text": best_value["text"]}

    return None


def _find_table_bbox(ocr_results: list[dict]) -> list | None:
    """
    Tim bbox cua toan bo table san pham.
    Strategy: Tim header row (co "STT" hoac "Article" hoac "Ma hang"),
    roi lay tu do den dong cuoi cung cua table.
    """
    table_headers = [
        r"^stt$", r"article", r"ma hang", r"barcode", r"ten hang",
        r"unit barcode", r"ma vach", r"ten san pham", r"description"
    ]

    header_item = None
    for item in ocr_results:
        text_lower = _remove_diacritics(item["text"].lower().strip())
        for pat in table_headers:
            if re.search(pat, text_lower):
                header_item = item
                break
        if header_item:
            break

    if not header_item:
        return None

    # Tim tat ca items nam DUOI header (y > header_y) va co so/barcode
    header_y = min(p[1] for p in header_item["bbox"])
    header_x_min = min(p[0] for p in header_item["bbox"])

    table_items = []
    for item in ocr_results:
        item_y = min(p[1] for p in item["bbox"])
        if item_y > header_y:
            # Chi lay items co so hoac text dai (san pham)
            text = item["text"].strip()
            if re.search(r'\d', text) or len(text) > 5:
                table_items.append(item)

    if not table_items:
        return None

    # Tim boundary: dung khi gap "Total" hoac "Tong"
    stop_y = float('inf')
    for item in ocr_results:
        text_lower = _remove_diacritics(item["text"].lower().strip())
        if re.search(r'^(total|tong cong|tong)', text_lower):
            item_y = min(p[1] for p in item["bbox"])
            if item_y > header_y and item_y < stop_y:
                stop_y = item_y

    # Filter items truoc stop_y
    table_items = [i for i in table_items if min(p[1] for p in i["bbox"]) < stop_y]

    if not table_items:
        return None

    # Gom bbox
    all_items = [header_item] + table_items
    all_xs = []
    all_ys = []
    for item in all_items:
        for p in item["bbox"]:
            all_xs.append(p[0])
            all_ys.append(p[1])

    return [
        [min(all_xs), min(all_ys)],
        [max(all_xs), min(all_ys)],
        [max(all_xs), max(all_ys)],
        [min(all_xs), max(all_ys)]
    ]


# Field config
FIELD_CONFIG = {
    "order_number": {"label": "Ma PO", "color": "#3b82f6"},
    "order_date": {"label": "Ngay Dat Hang", "color": "#10b981"},
    "delivery_date": {"label": "Ngay Giao Hang", "color": "#f59e0b"},
    "total_amount": {"label": "Tong Tien", "color": "#ef4444"},
}


def generate_annotated_image(
    image_path: str,
    extracted_data: dict,
    ocr_results: list[dict]
) -> bytes:
    """Ve khung mau len anh"""
    path = Path(image_path)
    if path.suffix.lower() == '.pdf':
        from pdf2image import convert_from_path
        images = convert_from_path(str(path), first_page=1, last_page=1, dpi=150)
        if not images:
            raise ValueError("Cannot convert PDF")
        img = images[0]
    else:
        img = Image.open(image_path)

    if img.mode != 'RGB':
        img = img.convert('RGB')

    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 18)
    except Exception:
        font = ImageFont.load_default()

    drawn = 0

    # 1. Khoanh cac field header
    for field, config in FIELD_CONFIG.items():
        value = extracted_data.get(field)
        if not value:
            continue

        result = _find_label_then_value(field, ocr_results)
        if not result:
            continue

        bbox = result["bbox"]
        color = config["color"]
        label = config["label"]

        # Expand bbox
        xs = [p[0] for p in bbox]
        ys = [p[1] for p in bbox]
        padding = 8
        points = [
            (min(xs) - padding, min(ys) - padding),
            (max(xs) + padding, min(ys) - padding),
            (max(xs) + padding, max(ys) + padding),
            (min(xs) - padding, max(ys) + padding),
        ]
        draw.polygon(points, outline=color, width=4)

        # Label
        lx, ly = int(min(xs) - padding), int(min(ys) - padding - 25)
        if ly < 5:
            ly = int(max(ys) + padding + 5)
        try:
            tb = draw.textbbox((lx, ly), label, font=font)
            draw.rectangle([tb[0]-3, tb[1]-2, tb[2]+3, tb[3]+2], fill=color)
            draw.text((lx, ly), label, fill="white", font=font)
        except Exception:
            draw.text((lx, ly), label, fill=color)

        drawn += 1

    # 2. Khoanh table san pham (nguyen block)
    table_bbox = _find_table_bbox(ocr_results)
    if table_bbox:
        color = "#8b5cf6"
        padding = 10
        xs = [p[0] for p in table_bbox]
        ys = [p[1] for p in table_bbox]
        points = [
            (min(xs) - padding, min(ys) - padding),
            (max(xs) + padding, min(ys) - padding),
            (max(xs) + padding, max(ys) + padding),
            (min(xs) - padding, max(ys) + padding),
        ]
        draw.polygon(points, outline=color, width=4)

        lx, ly = int(min(xs) - padding), int(min(ys) - padding - 25)
        if ly < 5:
            ly = int(min(ys) + 5)
        try:
            tb = draw.textbbox((lx, ly), "San Pham", font=font)
            draw.rectangle([tb[0]-3, tb[1]-2, tb[2]+3, tb[3]+2], fill=color)
            draw.text((lx, ly), "San Pham", fill="white", font=font)
        except Exception:
            draw.text((lx, ly), "San Pham", fill=color)
        drawn += 1

    logger.info(f"Drew {drawn} annotations")

    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=90)
    buf.seek(0)
    return buf.getvalue()


def process_document_with_bbox(image_path: str) -> tuple[list[dict], dict]:
    """Process document: extract bbox"""
    ocr_results = extract_text_with_bbox(image_path)
    return ocr_results, {}
