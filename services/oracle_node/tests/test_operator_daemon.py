"""Operator daemon: a run completes before the next starts; deploys restart it between runs."""

from __future__ import annotations

import argparse
from typing import Any

import nti_oracle.__main__ as main_mod


def _args(loop: int = 300) -> argparse.Namespace:
    return argparse.Namespace(role="operator", loop=loop, epoch=None, chain_id=46630, dry_run=False)


def test_parser_accepts_loop() -> None:
    args = main_mod.build_parser().parse_args(["--role", "operator", "--loop", "120"])
    assert args.loop == 120
    assert main_mod.build_parser().parse_args(["--role", "operator"]).loop == 0


def test_daemon_exits_after_the_run_when_the_checkout_moves(monkeypatch: Any) -> None:
    heads = iter(["aaa", "bbb"])  # at start, then after the first run
    calls: list[int] = []

    async def fake_run(args: argparse.Namespace, cfg: Any) -> dict[str, Any]:
        calls.append(1)
        return {"role": "operator", "status": "up_to_date"}

    monkeypatch.setattr(main_mod, "_repo_head", lambda: next(heads))
    monkeypatch.setattr(main_mod, "_run_operator", fake_run)
    monkeypatch.setattr("time.sleep", lambda s: (_ for _ in ()).throw(AssertionError("slept")))

    assert main_mod._run_operator_forever(_args(), object()) == 0
    assert calls == [1]  # the run finished, then the daemon exited for a restart on new code


def test_daemon_survives_a_failed_run_and_keeps_looping(monkeypatch: Any) -> None:
    state = {"runs": 0, "sleeps": 0}

    async def flaky_run(args: argparse.Namespace, cfg: Any) -> dict[str, Any]:
        state["runs"] += 1
        if state["runs"] == 1:
            raise RuntimeError("transient")
        return {"role": "operator", "status": "up_to_date"}

    def fake_sleep(seconds: float) -> None:
        state["sleeps"] += 1
        assert seconds >= 30
        if state["sleeps"] >= 2:
            raise KeyboardInterrupt

    monkeypatch.setattr(main_mod, "_repo_head", lambda: "same")
    monkeypatch.setattr(main_mod, "_run_operator", flaky_run)
    monkeypatch.setattr("time.sleep", fake_sleep)

    try:
        main_mod._run_operator_forever(_args(), object())
    except KeyboardInterrupt:
        pass
    assert state["runs"] == 2


def test_a_fresh_chain_scans_only_the_newest_mature_epoch() -> None:
    assert list(main_mod._epochs_to_scan(0, 124700)) == [124700]
    assert list(main_mod._epochs_to_scan(124690, 124693)) == [124691, 124692, 124693]
    assert list(main_mod._epochs_to_scan(124693, 124693)) == []
