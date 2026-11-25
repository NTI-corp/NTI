"""Fill every *_ADDRESS in .env.mainnet from the private keys you pasted, so the two can never disagree.

Usage (from the repo root, after pasting the six private keys):
    uv run --directory services python ../infra/scripts/fill_addresses.py ../.env.mainnet

Derives DEPLOYER, OPERATOR, KEEPER and VALIDATOR_1..3 addresses from their keys. PAUSER_ADDRESS is set to the
deployer and ATTESTER_ADDRESS (and ATTESTER_PRIVATE_KEY) to the keeper unless you already filled them. It prints
addresses only, never a key.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from eth_account import Account

PAIRS = {
    "DEPLOYER_ADDRESS": "DEPLOYER_PRIVATE_KEY",
    "OPERATOR_ADDRESS": "OPERATOR_PRIVATE_KEY",
    "KEEPER_ADDRESS": "KEEPER_PRIVATE_KEY",
    "VALIDATOR_1_ADDRESS": "VALIDATOR_PRIVATE_KEY_1",
    "VALIDATOR_2_ADDRESS": "VALIDATOR_PRIVATE_KEY_2",
    "VALIDATOR_3_ADDRESS": "VALIDATOR_PRIVATE_KEY_3",
}


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".env.mainnet")
    text = path.read_text(encoding="utf-8")
    env = {m.group(1): m.group(2).strip() for m in re.finditer(r"^([A-Z0-9_]+)=(.*)$", text, re.M)}

    updates: dict[str, str] = {}
    for addr_name, key_name in PAIRS.items():
        key = env.get(key_name, "")
        if not key:
            print(f"{key_name} is empty: paste it first", file=sys.stderr)
            return 1
        try:
            updates[addr_name] = Account.from_key(key).address
        except ValueError:
            print(f"{key_name} is not a valid private key", file=sys.stderr)
            return 1

    if not env.get("PAUSER_ADDRESS"):
        updates["PAUSER_ADDRESS"] = updates["DEPLOYER_ADDRESS"]
    if not env.get("ATTESTER_ADDRESS"):
        updates["ATTESTER_ADDRESS"] = updates["KEEPER_ADDRESS"]
    if not env.get("ATTESTER_PRIVATE_KEY"):
        updates["ATTESTER_PRIVATE_KEY"] = env["KEEPER_PRIVATE_KEY"]

    if len({updates[n] for n in PAIRS}) != len(PAIRS):
        print("two of the six wallets are the same key: every wallet needs its own key", file=sys.stderr)
        return 1

    for name, value in updates.items():
        text = re.sub(rf"^{name}=.*$", f"{name}={value}", text, flags=re.M)
    path.write_text(text, encoding="utf-8")
    for name in PAIRS:
        print(f"{name}={updates[name]}")
    print(f"PAUSER_ADDRESS={updates.get('PAUSER_ADDRESS', env.get('PAUSER_ADDRESS'))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
