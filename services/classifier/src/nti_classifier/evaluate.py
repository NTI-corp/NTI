"""Manual-label agreement and JSON validity gate evaluator for prompt/model releases."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from nti_classifier.protocol import ClassResult


@dataclass(frozen=True, slots=True)
class EvaluationReport:
    total_samples: int
    matched_samples: int
    agreement: float
    json_validity: float
    min_agreement: float
    min_json_validity: float
    passed: bool


def _top_narrative(q: Mapping[int, float], threshold: float) -> int | None:
    candidates = [(prob, -nid, nid) for nid, prob in q.items() if prob >= threshold]
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][2]


def evaluate_agreement(
    predictions: Sequence[ClassResult],
    ground_truth: Mapping[int, int | None],
    *,
    threshold: float = 0.5,
    min_agreement: float = 0.85,
    min_json_validity: float = 0.99,
    valid_responses: int | None = None,
    total_responses: int | None = None,
) -> EvaluationReport:
    """Evaluate manual-label primary narrative agreement (>= 85%) & JSON validity (>= 99%)."""
    pred_map = {r.tweet_id: r for r in predictions}
    total = len(ground_truth)
    matched = 0
    for tid, expected_nid in ground_truth.items():
        pred = pred_map.get(tid)
        predicted_nid = None if pred is None else _top_narrative(pred.q, threshold)
        if predicted_nid == expected_nid:
            matched += 1

    agreement = (matched / total) if total > 0 else 1.0
    if valid_responses is not None and total_responses is not None and total_responses > 0:
        json_validity = valid_responses / total_responses
    else:
        json_validity = 1.0

    passed = (agreement >= min_agreement) and (json_validity >= min_json_validity)
    return EvaluationReport(
        total_samples=total,
        matched_samples=matched,
        agreement=agreement,
        json_validity=json_validity,
        min_agreement=min_agreement,
        min_json_validity=min_json_validity,
        passed=passed,
    )
