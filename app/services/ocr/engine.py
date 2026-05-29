"""
OCR Engine - Orchestrator
Flow:
1. PaddleOCR extract raw text + bbox
2. Rule-based extract header + items
3. AI (Gemini) extract (song song hoac fallback)
4. Doublecheck: so sanh rule vs AI, flag conflicts
"""
import logging
from typing import Any

logger = logging.getLogger(__name__)


def process_document(file_path: str, db=None) -> dict:
    """
    Main pipeline:
    1. Extract text (PaddleOCR)
    2. Rule-based extraction
    3. AI extraction (Gemini)
    4. Merge + doublecheck
    
    Returns:
        {
            "order_number": ...,
            "order_date": ...,
            "delivery_date": ...,
            "total_amount": ...,
            "items": [...],
            "confidence": {...},
            "warnings": [...],
            "_rule_result": {...},
            "_ai_result": {...},
        }
    """
    from app.services.ocr.po_rules import extract_from_text
    from app.services.ocr_service import extract_full_document
    from app.services.visual_ocr_service import extract_text_with_bbox
    
    warnings = []
    
    # Step 1: PaddleOCR - extract text + bbox
    ocr_results = extract_text_with_bbox(file_path)
    raw_text = " ".join([r["text"] for r in ocr_results]) if ocr_results else ""
    
    # Step 2: Rule-based extraction
    rule_result = None
    if raw_text:
        try:
            rule_result = extract_from_text(raw_text)
            logger.info(f"Rule-based: order_number={rule_result.get('order_number')}, "
                       f"order_date={rule_result.get('order_date')}, "
                       f"items={len(rule_result.get('items', []))}")
        except Exception as e:
            logger.warning(f"Rule-based extraction failed: {e}")
    
    # Step 3: AI extraction (Gemini)
    ai_result = None
    try:
        ai_result = extract_full_document(file_path)
        logger.info(f"AI: order_number={ai_result.get('order_number')}, "
                   f"order_date={ai_result.get('order_date')}, "
                   f"items={len(ai_result.get('items', []))}")
    except Exception as e:
        logger.error(f"AI extraction failed: {e}")
    
    # Step 4: Merge + Doublecheck
    final = _merge_results(rule_result, ai_result, warnings)
    final["_ocr_results"] = ocr_results
    final["_rule_result"] = rule_result
    final["_ai_result"] = ai_result
    final["warnings"] = warnings
    
    return final


def _merge_results(rule_result: dict | None, ai_result: dict | None, warnings: list) -> dict:
    """
    Merge rule-based va AI results.
    Uu tien: AI cho structured data, Rule cho validation.
    Neu conflict -> flag warning.
    """
    # Neu chi co 1 source
    if not rule_result and not ai_result:
        warnings.append("Khong extract duoc du lieu tu ca rule va AI")
        return {"order_number": None, "order_date": None, "delivery_date": None,
                "total_amount": None, "items": [], "confidence": {}}
    
    if not rule_result:
        return {**ai_result, "confidence": {"source": "ai_only"}}
    
    if not ai_result:
        return {**rule_result, "confidence": {"source": "rule_only"}}
    
    # Co ca 2 -> merge va doublecheck
    final = dict(ai_result)  # AI lam base
    confidence = {}
    
    # Doublecheck 3 field chinh
    for field in ["order_date", "delivery_date", "total_amount", "order_number"]:
        rule_val = rule_result.get(field)
        ai_val = ai_result.get(field)
        
        if rule_val and ai_val:
            # So sanh
            if _values_match(field, rule_val, ai_val):
                confidence[field] = "high"
            else:
                confidence[field] = "conflict"
                warnings.append(
                    f"{field}: Rule='{rule_val}' vs AI='{ai_val}' - KHONG KHOP"
                )
                # Uu tien rule cho date (regex chinh xac hon)
                # Uu tien AI cho amount (AI hieu context tot hon)
                if "date" in field and rule_val:
                    final[field] = rule_val
        elif rule_val and not ai_val:
            final[field] = rule_val
            confidence[field] = "rule_only"
        elif ai_val and not rule_val:
            confidence[field] = "ai_only"
        else:
            confidence[field] = "missing"
            warnings.append(f"{field}: THIEU - khong tim thay")
    
    # Doublecheck items
    rule_items = rule_result.get("items", [])
    ai_items = ai_result.get("items", [])
    
    if rule_items and ai_items:
        if len(rule_items) != len(ai_items):
            warnings.append(
                f"items: Rule co {len(rule_items)} dong, AI co {len(ai_items)} dong - KHONG KHOP SO DONG"
            )
        confidence["items"] = "high" if len(rule_items) == len(ai_items) else "conflict"
    elif ai_items:
        confidence["items"] = "ai_only"
    elif rule_items:
        final["items"] = rule_items
        confidence["items"] = "rule_only"
    else:
        confidence["items"] = "missing"
        warnings.append("items: THIEU - khong co dong san pham nao")
    
    final["confidence"] = confidence
    return final


def _values_match(field: str, val1, val2) -> bool:
    """So sanh 2 gia tri co tuong duong khong"""
    if val1 is None or val2 is None:
        return False
    
    s1 = str(val1).strip().replace(' ', '')
    s2 = str(val2).strip().replace(' ', '')
    
    # Exact match
    if s1 == s2:
        return True
    
    # Date: normalize roi so sanh
    if "date" in field:
        from app.services.ocr.po_rules import normalize_date
        d1 = normalize_date(s1)
        d2 = normalize_date(s2)
        if d1 and d2:
            return d1 == d2
    
    # Amount: so sanh so
    if "amount" in field:
        from app.services.ocr.po_rules import parse_number
        n1 = parse_number(val1)
        n2 = parse_number(val2)
        if n1 is not None and n2 is not None:
            return abs(n1 - n2) < 1  # Sai so < 1 dong
    
    return False
