"""Shared text matching utilities.

Fuzzy text comparison helpers used by Story Bank matching, propagation
preview, and other services that need approximate string comparison.
"""

import re


def normalize(text: str) -> set[str]:
    """Normalize text to a set of lowercase alphanumeric words."""
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def word_overlap_ratio(a: str, b: str) -> float:
    """Compute word overlap ratio between two strings (Jaccard-like).

    Returns a float between 0.0 and 1.0 where 1.0 is a perfect match.
    """
    words_a = normalize(a)
    words_b = normalize(b)
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    union = words_a | words_b
    return len(intersection) / len(union)


MATCH_THRESHOLD = 0.55
"""Default threshold for considering two strings a fuzzy match."""
