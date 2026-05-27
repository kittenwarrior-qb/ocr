import hashlib
import re
import unicodedata


def generate_temp_code(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text.lower().strip())
    normalized = re.sub(r"\s+", " ", normalized)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:8]
