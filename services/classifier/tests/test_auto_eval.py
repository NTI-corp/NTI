"""Automatic evaluation: agreement maths and the run with fake models."""

from __future__ import annotations

import asyncio
from pathlib import Path

from nti_classifier.auto_eval import build_report, compare, run_eval, top_map
from nti_classifier.protocol import ClassResult, PostIn, PromptSpec

PROMPTS = Path(__file__).resolve().parents[1] / "prompts"


class FakeModel:
    def __init__(self, version: str, answers: dict[int, dict[int, float]]) -> None:
        self.version = version
        self._answers = answers

    async def classify(self, batch: list[PostIn], spec: PromptSpec) -> list[ClassResult]:
        return [
            ClassResult(tweet_id=p.tweet_id, q=self._answers.get(p.tweet_id, {})) for p in batch
        ]


def test_compare_counts_top_narrative_and_ignores_double_unlabeled_in_the_labeled_figure() -> None:
    a = {1: 3, 2: 9, 3: None, 4: None}
    b = {1: 3, 2: 8, 3: None, 4: 5}
    report = compare("x", a, b)
    assert (report.compared, report.agree) == (4, 2)
    assert report.agreement == 0.5
    assert (
        report.agreement_on_labeled == 0.3333
    )  # posts 1, 2, 4 count; post 3 has no label in either
    assert not report.passed


def test_top_map_uses_the_half_probability_threshold() -> None:
    results = [ClassResult(tweet_id=1, q={3: 0.9}), ClassResult(tweet_id=2, q={3: 0.4, 4: 0.3})]
    assert top_map(results) == {1: 3, 2: None}


def test_report_passes_only_when_every_pair_and_json_validity_clear_the_bar() -> None:
    good = compare("g", {1: 3, 2: 4}, {1: 3, 2: 4})
    bad = compare("b", {1: 3, 2: 4}, {1: 3, 2: 5})
    assert build_report("v2", 2, 1.0, [good]).passed
    assert not build_report("v2", 2, 1.0, [good, bad]).passed
    assert not build_report("v2", 2, 0.9, [good]).passed
    assert not build_report("v2", 2, 1.0, []).passed


def test_run_with_two_fake_models_reports_both_pairs() -> None:
    posts = [PostIn(i, "h", f"post {i}") for i in range(1, 21)]
    truth = {i: {3 if i % 2 else 9: 0.9} for i in range(1, 21)}
    flipped = {**truth, 1: {4: 0.9}}  # the second model disagrees on one post of 20
    report = asyncio.run(
        run_eval(
            posts,
            FakeModel("a", truth),
            FakeModel("b", flipped),
            PROMPTS,
            "v2",
            tuple(range(1, 11)),
        )
    )
    names = {p.name: p for p in report.pairs}
    assert names["same model, run twice"].agreement == 1.0
    assert names["two different models"].agreement == 0.95
    assert report.samples == 20 and report.passed
