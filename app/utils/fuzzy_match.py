from thefuzz import fuzz


def fuzzy_match(query: str, candidates: list[dict], key: str, threshold: int = 75) -> dict | None:
    best_score = 0
    best_match = None
    q = query.lower().strip()
    for candidate in candidates:
        score = fuzz.token_set_ratio(q, (candidate.get(key) or "").lower().strip())
        if score > best_score:
            best_score = score
            best_match = candidate
    return best_match if best_score >= threshold else None


def fuzzy_score(a: str, b: str) -> int:
    return fuzz.token_set_ratio(a.lower().strip(), b.lower().strip())
