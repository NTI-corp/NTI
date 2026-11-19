"""CLI entrypoint: python -m nti_oracle --role operator|validator|keeper."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from nti_core.config import load_config


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="nti_oracle", description="NTI Oracle Node CLI")
    parser.add_argument(
        "--role",
        choices=("operator", "validator", "keeper"),
        required=True,
        help="Execution role for this oracle process",
    )
    parser.add_argument("--epoch", type=int, default=None, help="Optional target epoch ID")
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(os.environ.get("NTI_CONFIG_PATH", "config/nti.v1.json")),
        help="Path to NTI protocol config JSON",
    )
    parser.add_argument(
        "--chain-id",
        type=int,
        default=int(os.environ.get("CHAIN_ID", "46630")),
        help="Target EVM chain ID (46630 testnet, 4663 mainnet)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    cfg = load_config(args.config)
    print(
        json.dumps(
            {
                "role": args.role,
                "epoch": args.epoch,
                "chain_id": args.chain_id,
                "config_version": cfg.version,
                "config_hash": cfg.config_hash(),
                "status": "ready",
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
