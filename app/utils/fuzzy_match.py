from thefuzz import fuzz


def fuzzy_match(query: str, candidates: list[dict], key: str, threshold: int = 75) -> dict | None:
    best_score = 0
    best_match = None
    q = query.lower().strip()
    for candidate in candidates:
        target = (candidate.get(key) or "").lower().strip()
        # Use token_sort_ratio (order-independent but requires all tokens to match)
        score = fuzz.token_sort_ratio(q, target)
        # Penalize if lengths are very different (avoid short names matching long queries)
        len_ratio = min(len(q), len(target)) / max(len(q), len(target)) if q and target else 0
        adjusted = int(score * (0.5 + 0.5 * len_ratio))
        if adjusted > best_score:
            best_score = adjusted
            best_match = candidate
    return best_match if best_score >= threshold else None


def fuzzy_score(a: str, b: str) -> int:
    return fuzz.token_set_ratio(a.lower().strip(), b.lower().strip())
